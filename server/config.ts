import fs from 'node:fs'
import path from 'node:path'
import type { Context } from 'hono'
import YAML from 'yaml'
import type { Config, ConfigEstate, Positions } from '../src/gen/types'
import { jsonSchema, parseGraph, type Graph } from './core/graph'
import { openDb } from './core/db'
import { createBus } from './core/events'
import { createHttp } from './core/http'
import { log, sink } from './core/log'
import { createSecrets } from './core/secrets'
import { createHost, withDemo } from './core/plugins'
import { DATA, writeAtomic } from './store'

export const CONFIG_FILE = path.resolve(process.env.SITEGARDEN_CONFIG ?? path.join(import.meta.dirname, '../sitegarden.yaml'))
const POSITIONS = path.join(DATA, 'positions.json') // layout results live apart from the YAML so it stays human

// One db per process: the event bus and every plugin's store share it.
export const db = openDb(path.join(DATA, 'sitegarden.db'))
export const secrets = createSecrets()
sink.redact = secrets.redact
export const bus = createBus(db, secrets.redact)
// Declared secrets that have no value: not an error, `sg plan` and the log say so.
export const secretWarnings = (g: Graph) => secrets.missing(Object.keys(g.secrets))
const http = createHttp({ secrets })
export const host = createHost({ baseDir: path.dirname(CONFIG_FILE), db, http, emit: bus.emit })
let loaded = ''
const pluginList = (text: string) => {
  try { const l = (YAML.parse(text) as { plugins?: unknown } | null)?.plugins; return withDemo(Array.isArray(l) ? l.filter((x): x is string => typeof x === 'string') : [], path.dirname(CONFIG_FILE)) } catch { return [] } // a syntax error is reported by parseGraph
}
// The plugin list lives in the config itself, so it is read first; the set is reloaded only when the list changes.
export async function loadPlugins(text = fs.readFileSync(CONFIG_FILE, 'utf8')) {
  const list = pluginList(text)
  if (JSON.stringify(list) !== loaded) { loaded = JSON.stringify(list); await host.load(list) }
}
export async function loadGraph(text: string): Promise<Graph> {
  await loadPlugins(text)
  return parseGraph(text, CONFIG_FILE, host.nodeTypes(), host.shorthands(), host.checkTypes())
}

// Parses a candidate config with the server's plugins. A candidate that changes `plugins:` is checked in a throwaway host, so nothing it registers stays.
export async function validate(text: string): Promise<Graph> {
  const list = pluginList(text)
  if (JSON.stringify(list) === loaded) return parseGraph(text, CONFIG_FILE, host.nodeTypes(), host.shorthands(), host.checkTypes())
  const tmp = createHost({ baseDir: path.dirname(CONFIG_FILE), db, http })
  try { await tmp.load(list); return parseGraph(text, CONFIG_FILE, tmp.nodeTypes(), tmp.shorthands(), tmp.checkTypes()) } finally { await tmp.unloadAll() }
}

// The server's config state is the latest revision in the store; the file is only read once, to bootstrap rev 1.
export const latestYaml = () => db.getRev(db.latestRev())!.yaml
// Auth settings of the latest revision, re-read only when the text changes. Fails closed: a config that cannot be read, or an `auth:` that is not a map, means auth on with nobody allowed.
let authFor = '', authNow: Graph['auth']
export function authConfig(): Graph['auth'] {
  const y = latestYaml()
  if (y !== authFor) {
    authFor = y
    try {
      const raw = (YAML.parse(y) as { auth?: unknown } | null)?.auth, a = (raw && typeof raw === 'object' ? raw : { enabled: raw !== undefined }) as { enabled?: unknown; mode?: unknown; users?: unknown }
      authNow = { enabled: a.enabled !== undefined && a.enabled !== false, mode: a.mode === 'password' ? 'password' : 'tailscale', users: Array.isArray(a.users) ? a.users.filter((u): u is string => typeof u === 'string') : [] }
    } catch { authNow = { enabled: true, mode: 'tailscale', users: [] } }
  }
  return authNow
}
// The one check point for config changes: with auth on, the request must have a user (the auth middleware sets it).
export const canEditConfig = (c: Context) => !authConfig().enabled || !!c.get('user')
export function bootstrap() {
  if (!fs.existsSync(CONFIG_FILE)) return
  const rev = db.latestRev()
  if (rev) log.info(`[config] config file ignored, server is at rev ${rev}: use sg apply`)
  else { db.storeRev(0, fs.readFileSync(CONFIG_FILE, 'utf8'), 'bootstrap'); log.info(`[config] imported ${CONFIG_FILE} as rev 1`) }
}
export const schemaJson = async (text?: string) => { await loadPlugins(text); return jsonSchema(host.nodeTypes(), host.checkTypes()) }

// What the render pipeline and the mock UI read: nodes and edges nested per group, mock fields flattened back onto the node.
export function toRenderConfig(g: Graph): Config {
  const drop = new Set(['checks', ...host.shorthands().map((s) => s.field)]) // the UI wants the final links and mock.checks, not the config that produced them
  const home = new Map(g.nodes.map((n) => [n.id, n.group]))
  return {
    accountSeed: g.world.seed,
    estates: g.groups.map((x) => ({
      id: x.id, label: x.label,
      nodes: g.nodes.filter((n) => n.group === x.id).map(({ group: _group, mock, ...n }) => { drop.forEach((k) => delete (n as Record<string, unknown>)[k]); return { ...n, ...mock } }),
      edges: g.edges.filter((e) => home.get(e.from) === x.id),
    })),
  }
}
export const loadConfig = async () => toRenderConfig(await loadGraph(latestYaml()))
export function loadPositions(): Positions {
  try { return JSON.parse(fs.readFileSync(POSITIONS, 'utf8')) } catch { return {} }
}
export const savePositions = (p: Positions) => writeAtomic(POSITIONS, JSON.stringify(p))

// Edits take and give YAML text and keep its comments and layout.
function edit<T extends object | null>(text: string, f: (doc: YAML.Document) => T): { yaml: string; out: T } {
  const doc = YAML.parseDocument(text)
  const out = f(doc)
  return { yaml: doc.toString({ lineWidth: 0 }), out }
}
const seq = (doc: YAML.Document, key: string) => (doc.get(key, true) ?? (doc.set(key, new YAML.YAMLSeq()), doc.get(key, true))) as YAML.YAMLSeq
const MOCK = ['checks', 'baseMs', 'initialStatus']
export const addEstate = (text: string, e: ConfigEstate) => edit(text, (doc) => {
  const add = (key: string, item: unknown) => seq(doc, key).add(doc.createNode(item))
  add('groups', { id: e.id, label: e.label })
  for (const n of e.nodes) {
    const mock = Object.fromEntries(MOCK.filter((k) => k in n).map((k) => [k, n[k]]))
    add('nodes', { id: n.id, type: n.type, group: e.id, ...Object.fromEntries(Object.entries(n).filter(([k]) => !['id', 'type', ...MOCK].includes(k))), mock })
  }
  for (const x of e.edges) add('edges', x)
  return {}
}).yaml
// null when only one group is left
export function removeLastEstate(text: string): { yaml: string; id: string } | null {
  const r = edit<{ id: string } | null>(text, (doc) => {
    const groups = seq(doc, 'groups'), nodes = seq(doc, 'nodes'), edges = seq(doc, 'edges')
    if (groups.items.length < 2) return null
    const id = (groups.items.pop() as YAML.YAMLMap).get('id') as string
    const gone = new Set(nodes.items.filter((n) => (n as YAML.YAMLMap).get('group') === id).map((n) => (n as YAML.YAMLMap).get('id')))
    nodes.items = nodes.items.filter((n) => !gone.has((n as YAML.YAMLMap).get('id')))
    edges.items = edges.items.filter((x) => !gone.has((x as YAML.YAMLMap).get('from')) && !gone.has((x as YAML.YAMLMap).get('to')))
    return { id }
  })
  return r.out && { yaml: r.yaml, id: r.out.id }
}
export function forgetPosition(id: string) { const p = loadPositions(); delete p[id]; savePositions(p) }
