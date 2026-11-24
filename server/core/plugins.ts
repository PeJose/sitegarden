import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { z } from 'zod'
import type { Db } from './db'
import type { NodeTypes } from './graph'
import { createHttp } from './http'
import { log } from './log'
import { parseEvery } from './scheduler'
import { createSecrets } from './secrets'
import { SDK_VERSION, type CheckDef, type Disposer, type Plugin, type PluginContext } from './sdk'

const list = z.array(z.string()).optional()
export const Manifest = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  apiVersion: z.string(),
  dependsOn: z.record(z.string(), z.string()).optional(),
  server: z.string().optional(),
  contributes: z.looseObject({ themes: list, buildingPacks: list, edgeTypes: list, nodeTypes: z.array(z.object({ id: z.string(), extends: z.string().optional() })).optional() }).default({}),
  permissions: z.object({ network: z.array(z.string()).default([]), secrets: z.array(z.string()).default([]), actions: z.array(z.string()).default([]) }).default({ network: [], secrets: [], actions: [] }), // network and secrets are enforced by ctx.http; actions are stored only
  tier: z.literal('trusted').default('trusted'),
})
export type Manifest = z.output<typeof Manifest>

// Caret, tilde and exact ranges only: a plugin ecosystem this small does not need the rest of semver.
const parse = (v: string) => { const m = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?$/.exec(v); return m ? [Number(m[1]), Number(m[2] ?? 0), Number(m[3] ?? 0)] : null }
const cmp = (a: number[], b: number[]) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]
export function satisfies(version: string, range: string): boolean {
  const v = parse(version), m = /^([\^~]?)(\d.*)$/.exec(range), r = m && parse(m[2])
  if (!v || !m || !r || (!m[1] && m[2].split('.').length < 3)) throw new Error(`unsupported version range "${range}" (use ^1.2.3, ~1.2.3 or 1.2.3)`)
  if (!m[1]) return cmp(v, r) === 0
  const top = m[1] === '~' ? [r[0], r[1] + 1, 0] : r[0] > 0 ? [r[0] + 1, 0, 0] : r[1] > 0 ? [0, r[1] + 1, 0] : [0, 0, r[2] + 1]
  return cmp(v, r) >= 0 && cmp(v, top) < 0
}

export interface PluginRecord { id: string; dir: string; version: string; manifest?: Manifest; status: 'loaded' | 'failed'; error?: string }
interface Entry extends PluginRecord { manifest: Manifest }
export interface HostOptions { baseDir: string; db?: Db; http?: ReturnType<typeof createHttp>; emit?: (type: string, data: unknown) => void; importModule?: (file: string) => Promise<{ default?: Plugin }> }

export function createHost({ baseDir, db, http = createHttp({ secrets: createSecrets() }), emit = () => {}, importModule = (f) => import(pathToFileURL(f).href) }: HostOptions) {
  const records: PluginRecord[] = [], disposers = new Map<string, Disposer[]>()
  const types = new Map<string, { plugin: string; shape: z.ZodRawShape }>(), fragments: { plugin: string; type: string; shape: z.ZodRawShape }[] = [], checks = new Map<string, { plugin: string; def: CheckDef }>()

  function context(manifest: Manifest, own: Disposer[]): PluginContext {
    const id = manifest.id
    const reg = (undo: Disposer) => { let done = false; const d = () => { if (!done) { done = true; undo() } }; own.push(d); return d }
    return {
      id,
      registerNodeType(type, shape = {}) {
        if (types.has(type)) throw new Error(`node type "${type}" is already registered by "${types.get(type)!.plugin}"`)
        types.set(type, { plugin: id, shape })
        return reg(() => void types.delete(type))
      },
      registerSchema(type, shape) {
        if (!types.has(type)) throw new Error(`node type "${type}" is not registered`)
        const f = { plugin: id, type, shape }
        fragments.push(f)
        return reg(() => void fragments.splice(fragments.indexOf(f), 1))
      },
      registerCheck(def) {
        parseEvery(def.every)
        if (checks.has(def.id)) throw new Error(`check "${def.id}" is already registered`)
        checks.set(def.id, { plugin: id, def })
        return reg(() => void checks.delete(def.id))
      },
      store: {
        kv: db?.kv(id) ?? { get: () => undefined, set() {}, delete() {} },
        cache: { get: (k) => db?.cacheGet(`${id}:${k}`), set: (k, v) => db?.cacheSet(`${id}:${k}`, v) },
      },
      emit,
      http: http.forPlugin(manifest),
    }
  }

  function resolve(entry: string) {
    const dir = /^[./]/.test(entry) ? path.resolve(baseDir, entry) : path.dirname(fileURLToPath(import.meta.resolve(`${entry}/package.json`)))
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')) as { version?: string; sitegarden?: unknown }
    const m = Manifest.safeParse(pkg.sitegarden)
    if (!m.success) throw new Error(`invalid manifest: ${m.error.issues.map((i) => `${i.path.join('.') || 'sitegarden'}: ${i.message}`).join('; ')}`)
    return { dir, version: pkg.version ?? '0.0.0', manifest: m.data }
  }

  async function load(entries: string[]): Promise<PluginRecord[]> {
    await unloadAll()
    const ok: Entry[] = []
    const fail = (r: Partial<PluginRecord> & { dir: string }, error: string) => { records.push({ id: r.id ?? path.basename(r.dir), version: '0.0.0', ...r, status: 'failed', error }); log.error(`[plugins] ${r.id ?? r.dir} refused: ${error}`) }
    for (const e of entries) {
      let r: ReturnType<typeof resolve>
      try { r = resolve(e) } catch (err) { fail({ dir: e }, (err as Error).message); continue }
      const base = { id: r.manifest.id, dir: r.dir, version: r.version, manifest: r.manifest }
      try {
        if (ok.some((x) => x.id === base.id)) throw new Error('duplicate plugin id')
        if (!satisfies(SDK_VERSION, r.manifest.apiVersion)) throw new Error(`needs plugin API ${r.manifest.apiVersion}, this core provides ${SDK_VERSION}`)
      } catch (err) { fail(base, (err as Error).message); continue }
      ok.push({ ...base, status: 'loaded' })
    }
    // Drop plugins whose dependencies are missing, out of range or themselves dropped, until nothing changes.
    for (let changed = true; changed;) {
      changed = false
      for (const p of [...ok]) {
        const why = Object.entries(p.manifest.dependsOn ?? {}).map(([dep, range]) => {
          const d = ok.find((x) => x.id === dep)
          if (!d) return `depends on "${dep}", which is not loaded`
          try { return satisfies(d.version, range) ? '' : `needs "${dep}" ${range}, found ${d.version}` } catch (err) { return (err as Error).message }
        }).find(Boolean)
        if (why) { ok.splice(ok.indexOf(p), 1); fail(p, why); changed = true }
      }
    }
    const order: Entry[] = [], left = [...ok]
    while (left.length) {
      const i = left.findIndex((p) => Object.keys(p.manifest.dependsOn ?? {}).every((d) => order.some((x) => x.id === d)))
      if (i < 0) { left.forEach((p) => fail(p, 'dependency cycle')); break }
      order.push(...left.splice(i, 1))
    }
    for (const p of order) {
      const own: Disposer[] = []
      disposers.set(p.id, own)
      try {
        const { server } = p.manifest
        if (server) {
          const plugin = (await importModule(path.resolve(p.dir, server))).default
          if (!plugin || typeof plugin.register !== 'function') throw new Error(`${server} has no default definePlugin export`)
          if (plugin.id !== p.id) throw new Error(`${server} is plugin "${plugin.id}", manifest says "${p.id}"`)
          await plugin.register(context(p.manifest, own))
        }
        records.push(p)
      } catch (err) {
        own.reverse().forEach((d) => d())
        disposers.delete(p.id)
        fail(p, (err as Error).message)
      }
    }
    return records
  }

  async function unloadAll() {
    for (const [, own] of [...disposers].reverse()) own.reverse().forEach((d) => d())
    disposers.clear()
    records.length = 0
  }

  return {
    load, unloadAll,
    plugins: (): PluginRecord[] => records,
    // Node types with their plugin-added fields merged in.
    nodeTypes: (): NodeTypes => Object.fromEntries([...types].map(([t, { shape }]) => [t, Object.assign({}, shape, ...fragments.filter((f) => f.type === t).map((f) => f.shape))])),
    checks: () => [...checks.values()].map((c) => c.def),
  }
}
export type Host = ReturnType<typeof createHost>
