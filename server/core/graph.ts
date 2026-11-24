import YAML from 'yaml'
import { z } from 'zod'
import { log } from './log'
import { parseEvery } from './scheduler'
import type { CheckTypeDef, ShorthandDef } from './sdk'

const STATUS = z.enum(['ok', 'degraded', 'down', 'working', 'paused', 'unknown'])
// The fields every node has. Mock-only fields stay under `mock:` until real checks replace them.
const nodeBase = {
  id: z.string().min(1).describe('Unique node id'),
  type: z.string().describe('Node type registered by a plugin'),
  group: z.string().describe('Id of the group this node belongs to'),
  name: z.string().optional(),
  host: z.string().optional(),
  links: z.array(z.object({ label: z.string(), url: z.string() })).optional(),
  notes: z.string().optional(),
  mock: z.object({ checks: z.array(z.string()).optional(), baseMs: z.number().optional(), initialStatus: STATUS.optional() }).optional().describe('Fake data for the mock UI'),
}
export type NodeTypes = Record<string, z.ZodRawShape> // node type -> extra fields a plugin adds to it

const every = z.string().default('5m').refine((v) => { try { return !!parseEvery(v) } catch { return false } }, 'bad interval (use 30s, 5m, 1h or 1d)')

export function buildSchema(types: NodeTypes, checkTypes: CheckTypeDef[] = []) {
  const entries = checkTypes.map((c) => z.strictObject({ ...c.schema, type: z.literal(c.type), every }))
  const checks = z.array(entries.length ? z.discriminatedUnion('type', entries as [(typeof entries)[number]]) : z.never()).default([])
  const nodes = Object.entries(types).map(([t, shape]) => z.strictObject({ ...nodeBase, checks, ...shape, type: z.literal(t) }))
  return z.strictObject({
    world: z.strictObject({ seed: z.string() }),
    plugins: z.array(z.string()).default([]),
    auth: z.strictObject({ enabled: z.boolean().default(false) }).default({ enabled: false }).describe('Real auth lands in M1 item 5; until then `enabled: true` locks config changes'),
    secrets: z.record(z.string().regex(/^[A-Z][A-Z0-9_]*$/), z.strictObject({ expires: z.string().optional() })).default({}).describe('Secret names; values come from the server environment, never from here. Reference as ${secret:NAME}'),
    groups: z.array(z.strictObject({ id: z.string().min(1), label: z.string() })).default([]),
    nodes: z.array(nodes.length ? z.discriminatedUnion('type', nodes as [(typeof nodes)[number]]) : z.never()).default([]),
    edges: z.array(z.strictObject({ from: z.string(), to: z.string(), type: z.string(), label: z.string().optional() })).default([]),
    extensions: z.record(z.string(), z.strictObject({ disabled: z.boolean().optional(), config: z.unknown().optional() })).default({}),
  })
}
export const jsonSchema = (types: NodeTypes, checkTypes: CheckTypeDef[] = []) => z.toJSONSchema(buildSchema(types, checkTypes), { target: 'draft-2020-12', io: 'input', unrepresentable: 'any' })
export type Graph = z.output<ReturnType<typeof buildSchema>>

export interface Issue { line: number; path: string; message: string }
export class ConfigError extends Error {
  issues: Issue[]
  constructor(file: string, issues: Issue[]) {
    super(issues.map((i) => `${file}:${i.line}${i.path ? ` ${i.path}` : ''}: ${i.message}`).join('\n'))
    this.issues = issues
  }
}

// Parses and validates one config text. Every problem carries the line of the offending YAML node, or of its nearest parent.
export function parseGraph(text: string, file: string, types: NodeTypes, shorthands: ShorthandDef[] = [], checkTypes: CheckTypeDef[] = []): Graph {
  const lc = new YAML.LineCounter(), doc = YAML.parseDocument(text, { lineCounter: lc })
  const lineAt = (path: (string | number)[]) => {
    for (let p = path; ; p = p.slice(0, -1)) {
      const r = (doc.getIn(p, true) as { range?: number[] } | undefined)?.range
      if (r) return lc.linePos(r[0]).line
      if (!p.length) return 1
    }
  }
  const fail = (...issues: Issue[]): never => { throw new ConfigError(file, issues) }
  if (doc.errors.length) fail(...doc.errors.map((e) => ({ line: e.linePos?.[0].line ?? 1, path: '', message: e.message })))
  if (doc.has('estates') || doc.has('accountSeed')) fail({ line: lineAt(['estates']), path: '', message: 'config uses the old `estates:` shape, see CHANGELOG 0.2.0' })

  const r = buildSchema(types, checkTypes).safeParse(doc.toJS())
  if (!r.success) fail(...r.error.issues.map((i) => {
    const path = i.path.filter((k): k is string | number => typeof k !== 'symbol')
    const unknownType = i.code === 'invalid_union' && path[0] === 'nodes' && path.at(-1) === 'type', check = path.at(-3) === 'checks'
    const known = (check ? checkTypes.map((c) => c.type) : Object.keys(types)).join(', ') || 'none'
    return { line: lineAt(path), path: path.join('.'), message: unknownType ? `unknown ${check ? 'check' : 'node'} type "${doc.getIn(path)}", known: ${known}` : i.message }
  }))
  const g = r.data!, bad: Issue[] = []
  const refs = (v: unknown, path: (string | number)[]): void => {
    if (typeof v === 'string') { for (const [, name] of v.matchAll(/\$\{secret:([^}]*)\}/g)) if (!(name in g.secrets)) bad.push({ line: lineAt(path), path: path.join('.'), message: `secret ${name} is not declared under secrets:` }) }
    else if (v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => refs(x, [...path, Array.isArray(v) ? Number(k) : k]))
  }
  refs(g, [])
  const dup = (kind: string, items: { id: string }[], key: string) => items.forEach((x, i) => { if (items.findIndex((y) => y.id === x.id) < i) bad.push({ line: lineAt([key, i, 'id']), path: `${key}.${i}.id`, message: `duplicate ${kind} id "${x.id}"` }) })
  dup('group', g.groups, 'groups'); dup('node', g.nodes, 'nodes')
  const groups = new Set(g.groups.map((x) => x.id)), nodes = new Set(g.nodes.map((x) => x.id))
  g.nodes.forEach((n, i) => { if (!groups.has(n.group)) bad.push({ line: lineAt(['nodes', i, 'group']), path: `nodes.${i}.group`, message: `node "${n.id}" is in group "${n.group}", which does not exist` }) })
  g.edges.forEach((e, i) => (['from', 'to'] as const).forEach((end) => { if (!nodes.has(e[end])) bad.push({ line: lineAt(['edges', i, end]), path: `edges.${i}.${end}`, message: `edge ${end} "${e[end]}": no node with that id` }) }))
  // shortcut: the renderer draws edges per group, so an edge must stay inside one group; lift when the map supports cross-group roads.
  const home = new Map(g.nodes.map((n) => [n.id, n.group]))
  g.edges.forEach((e, i) => { if (nodes.has(e.from) && nodes.has(e.to) && home.get(e.from) !== home.get(e.to)) bad.push({ line: lineAt(['edges', i, 'to']), path: `edges.${i}.to`, message: `edge from "${e.from}" (group "${home.get(e.from)}") to "${e.to}" (group "${home.get(e.to)}") crosses groups, which is not supported yet` }) })
  if (bad.length) fail(...bad)
  return expandLinks(g, shorthands)
}

// Generated links first (a later shorthand wins a label), then the explicit ones, which replace generated links with the same label.
export function expandLinks(g: Graph, shorthands: ShorthandDef[]): Graph {
  return { ...g, nodes: g.nodes.map((n) => {
    const gen = new Map<string, string>()
    for (const s of shorthands) {
      const v = (n as Record<string, unknown>)[s.field]
      if (s.nodeType !== n.type || v === undefined) continue
      for (const l of s.links(v, n)) { if (gen.get(l.label) !== undefined && gen.get(l.label) !== l.url) log.warn(`[config] node ${n.id}: shorthand "${s.field}" overrides the "${l.label}" link`); gen.set(l.label, l.url) }
    }
    if (!gen.size) return n
    const own = n.links ?? []
    return { ...n, links: [...[...gen].filter(([label]) => !own.some((l) => l.label === label)).map(([label, url]) => ({ label, url })), ...own] }
  }) }
}

export interface Change { kind: 'group' | 'node' | 'edge' | 'extension'; op: '+' | '~' | '-'; id: string }
export const canon = (v: unknown) => JSON.stringify(v, (_, x) => x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x)
// What a config change adds, changes and removes, by kind. `~` when the item's canonical JSON differs.
export function diffGraphs(a: Graph, b: Graph): Change[] {
  const kinds = (g: Graph): Record<Change['kind'], [string, unknown][]> => ({
    group: g.groups.map((x) => [x.id, x]), node: g.nodes.map((x) => [x.id, x]), edge: g.edges.map((e) => [`${e.from}>${e.to}:${e.type}`, e]), extension: Object.entries(g.extensions),
  })
  const [x, y] = [kinds(a), kinds(b)]
  return (Object.keys(x) as Change['kind'][]).flatMap((kind) => {
    const old = new Map(x[kind].map(([id, v]) => [id, canon(v)])), now = new Map(y[kind].map(([id, v]) => [id, canon(v)]))
    return [
      ...[...now].flatMap(([id, v]): Change[] => (!old.has(id) ? [{ kind, op: '+', id }] : old.get(id) !== v ? [{ kind, op: '~', id }] : [])),
      ...[...old.keys()].filter((id) => !now.has(id)).map((id): Change => ({ kind, op: '-', id })),
    ]
  })
}
