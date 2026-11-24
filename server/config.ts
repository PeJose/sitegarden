import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'
import type { Config, ConfigEstate, Positions } from '../src/gen/types'
import { jsonSchema, parseGraph, type Graph } from './core/graph'
import { openDb } from './core/db'
import { createBus } from './core/events'
import { createHost } from './core/plugins'
import { DATA, writeAtomic } from './store'

export const CONFIG_FILE = path.resolve(process.env.SITEGARDEN_CONFIG ?? path.join(import.meta.dirname, '../sitegarden.yaml'))
const POSITIONS = path.join(DATA, 'positions.json') // layout results live apart from the YAML so it stays human

// One db per process: the event bus and every plugin's store share it.
export const db = openDb(path.join(DATA, 'sitegarden.db'))
export const bus = createBus(db)
export const host = createHost({ baseDir: path.dirname(CONFIG_FILE), db, emit: bus.emit })
let loaded = ''
// The plugin list lives in the config itself, so it is read first; the set is reloaded only when the list changes.
export async function loadPlugins(text = fs.readFileSync(CONFIG_FILE, 'utf8')) {
  const l = (YAML.parse(text) as { plugins?: unknown } | null)?.plugins, list = Array.isArray(l) ? l.filter((x): x is string => typeof x === 'string') : []
  if (JSON.stringify(list) !== loaded) { loaded = JSON.stringify(list); await host.load(list) }
}
export async function loadGraph(): Promise<Graph> {
  const text = fs.readFileSync(CONFIG_FILE, 'utf8')
  await loadPlugins(text)
  return parseGraph(text, CONFIG_FILE, host.nodeTypes())
}
export const schemaJson = async () => { await loadPlugins(); return jsonSchema(host.nodeTypes()) }

// What the render pipeline and the mock UI read: nodes and edges nested per group, mock fields flattened back onto the node.
export function toRenderConfig(g: Graph): Config {
  const home = new Map(g.nodes.map((n) => [n.id, n.group]))
  return {
    accountSeed: g.world.seed,
    estates: g.groups.map((x) => ({
      id: x.id, label: x.label,
      nodes: g.nodes.filter((n) => n.group === x.id).map(({ group: _group, mock, ...n }) => ({ ...n, ...mock })),
      edges: g.edges.filter((e) => home.get(e.from) === x.id),
    })),
  }
}
export const loadConfig = async () => toRenderConfig(await loadGraph())
export function loadPositions(): Positions {
  try { return JSON.parse(fs.readFileSync(POSITIONS, 'utf8')) } catch { return {} }
}
export const savePositions = (p: Positions) => writeAtomic(POSITIONS, JSON.stringify(p))

// Edits keep the file's comments and layout; the watcher then applies the change like any other.
function edit<T>(f: (doc: YAML.Document) => T): T {
  const doc = YAML.parseDocument(fs.readFileSync(CONFIG_FILE, 'utf8'))
  const out = f(doc)
  writeAtomic(CONFIG_FILE, doc.toString({ lineWidth: 0 }))
  return out
}
const seq = (doc: YAML.Document, key: string) => (doc.get(key, true) ?? (doc.set(key, new YAML.YAMLSeq()), doc.get(key, true))) as YAML.YAMLSeq
const MOCK = ['checks', 'baseMs', 'initialStatus']
export const addEstate = (e: ConfigEstate) => edit((doc) => {
  const add = (key: string, item: unknown) => seq(doc, key).add(doc.createNode(item))
  add('groups', { id: e.id, label: e.label })
  for (const n of e.nodes) {
    const mock = Object.fromEntries(MOCK.filter((k) => k in n).map((k) => [k, n[k]]))
    add('nodes', { id: n.id, type: n.type, group: e.id, ...Object.fromEntries(Object.entries(n).filter(([k]) => !['id', 'type', ...MOCK].includes(k))), mock })
  }
  for (const x of e.edges) add('edges', x)
})
export function removeLastEstate(): string | null {
  const last = edit((doc) => {
    const groups = seq(doc, 'groups'), nodes = seq(doc, 'nodes'), edges = seq(doc, 'edges')
    if (groups.items.length < 2) return null
    const id = (groups.items.pop() as YAML.YAMLMap).get('id') as string
    const gone = new Set(nodes.items.filter((n) => (n as YAML.YAMLMap).get('group') === id).map((n) => (n as YAML.YAMLMap).get('id')))
    nodes.items = nodes.items.filter((n) => !gone.has((n as YAML.YAMLMap).get('id')))
    edges.items = edges.items.filter((x) => !gone.has((x as YAML.YAMLMap).get('from')) && !gone.has((x as YAML.YAMLMap).get('to')))
    return id
  })
  if (last) { const p = loadPositions(); delete p[last]; savePositions(p) }
  return last
}
