import os from 'node:os'
import sharp, { type OutputInfo, type OverlayOptions } from 'sharp'
import { PAD } from '../src/gen/render'
import { loadConfig, loadPositions, savePositions } from './config'
import { cores, computePlan, estimateMs, firstWave, missing, order, SCALE, T, THEMES, type Job, type Plan, type TileSpec } from './plan'
import { art, collect, currentRelease, has, publish, writeAtomic, type Manifest } from './store'

os.setPriority(0, 10) // nice: renders yield to the owner's browser
sharp.concurrency(1) // each render job is single-threaded work; more vips threads per job would oversubscribe the cores
const png = { compressionLevel: 1 } // layers are intermediates: fast to write beats small

// Every job is sharp calls on libuv's thread pool (UV_THREADPOOL_SIZE >= cores). At most `cores` run at once, lowest priority number first.
const waiting: { prio: number; go: () => void }[] = []
let busy = 0
function pump() { while (busy < cores && waiting.length) { waiting.sort((a, b) => a.prio - b.prio); busy++; waiting.shift()!.go() } }
async function cpu<T>(prio: number, fn: () => Promise<T>): Promise<T> {
  await new Promise<void>((go) => { waiting.push({ prio, go }); pump() })
  try { return await fn() } finally { busy--; pump() }
}

const rawPng = (svg: string) => sharp(Buffer.from(svg), { density: 72 }).png(png).toBuffer()
async function render(j: Job) {
  let buf: Buffer
  if (j.kind === 'texture') buf = await sharp(await rawPng(j.svg!)).webp({ quality: 97 }).toBuffer() // the client's paper and every tile's base, so a high quality
  else if (j.kind === 'soft') buf = await rawPng(j.svg!)
  else {
    // the low-resolution watercolour layer, enlarged, then the full-resolution parts: paper grain (multiplied in) and strokes, buildings
    const s = SCALE[j.z], soft = sharp(art(j.soft!))
    const { width, height } = await soft.metadata()
    const dest = { width: Math.round(width! / j.wc! * s), height: Math.round(height! / j.wc! * s) }
    const base = width === dest.width ? soft : soft.resize({ ...dest, fit: 'fill', kernel: 'lanczos3' })
    const over: OverlayOptions[] = []
    if (j.mask) over.push({ input: await rawPng(j.mask), blend: 'dest-in' })
    if (j.svg) over.push({ input: await rawPng(j.svg) })
    if (j.kind === 'terrain') { // padded for the filters, then cropped to the tile
      const pad = PAD * s, t = T * s
      buf = await base.extract({ left: pad, top: pad, width: t, height: t }).composite(over).png(png).toBuffer()
    } else buf = await base.composite(over).png(png).toBuffer()
  }
  writeAtomic(art(j.name), buf)
}

// Renders one artifact once (with what it builds on), however many tiles ask for it.
const started = new Map<string, Promise<void>>()
function ensure(p: Plan, name: string, prio: number): Promise<void> {
  if (has(name)) return Promise.resolve()
  let pr = started.get(name)
  if (!pr) {
    const j = p.byName.get(name)!
    pr = (async () => { if (j.soft) await ensure(p, j.soft, prio); await cpu(prio, () => render(j)) })()
    started.set(name, pr)
  }
  return pr
}

type Raw = { data: Buffer; info: OutputInfo }
const quads = new Map<string, Raw>()
async function quad(texture: string, qx: number, qy: number, z: number): Promise<Raw> {
  const k = `${texture}:${qx}${qy}`, s = T * SCALE[z]
  if (quads.size > 8) quads.delete(quads.keys().next().value!) // a few quadrants cover the tiles in flight
  if (!quads.has(k)) quads.set(k, await sharp(art(texture)).extract({ left: qx * s, top: qy * s, width: s, height: s }).raw().toBuffer({ resolveWithObject: true }))
  return quads.get(k)!
}

async function flatten(t: TileSpec) {
  const base = await quad(t.texture, ...t.quad, t.z)
  const layers: OverlayOptions[] = t.terrain ? [{ input: art(t.terrain), left: 0, top: 0 }] : []
  for (const p of t.pieces) layers.push({ input: await sharp(art(p.name)).extract({ left: p.src[0], top: p.src[1], width: p.src[2], height: p.src[3] }).png(png).toBuffer(), left: p.at[0], top: p.at[1] })
  const buf = await sharp(base.data, { raw: { width: base.info.width, height: base.info.height, channels: base.info.channels } }).composite(layers).webp({ quality: 82 }).toBuffer()
  writeAtomic(art(t.name), buf)
}

// One small image of the whole map per theme (the instant loading state): the eighth-scale z0 tiles stitched together.
async function preview(p: Plan, theme: 'light' | 'night') {
  const name = p.previews[theme]
  if (has(name)) return
  const s = T * SCALE[0], { x0, y0, cols, rows } = p.grid
  const tiles = p.tiles.filter((t) => t.theme === theme && t.z === 0)
  const sheet = await sharp({ create: { width: cols * s, height: rows * s, channels: 3, background: '#000' } }).composite(tiles.map((t) => ({ input: art(t.name), left: (t.x - x0) * s, top: (t.y - y0) * s }))).png(png).toBuffer()
  writeAtomic(art(name), await sharp(sheet).webp({ quality: 70 }).toBuffer())
}

function manifest(p: Plan, complete: boolean): Manifest {
  const { x0, y0, cols, rows } = p.grid
  const names = { light: [[], [], [], []], night: [[], [], [], []] } as Manifest['tiles']['names']
  for (const t of p.tiles) names[t.theme][t.z][(t.y - y0) * cols + (t.x - x0)] = has(t.name) ? t.name : null
  const rev = Object.values(names).flat(2).filter(Boolean).length + THEMES.filter((t) => has(p.previews[t])).length
  return { id: p.id, rev, complete, world: p.worldName, config: p.configName, estates: p.estates, tiles: { size: T, x0, y0, cols, rows, names }, previews: Object.fromEntries(THEMES.filter((t) => has(p.previews[t])).map((t) => [t, p.previews[t]])), textures: Object.fromEntries(THEMES.map((th) => [th, SCALE.map((_, z) => p.tiles.find((t) => t.theme === th && t.z === z)!.texture)])) as Manifest['textures'] }
}

export interface Summary { rendered: Record<string, number>; tiles: number; ms: number; first: number | null; aborted: boolean }

// Tiles a client is waiting for ("theme/z/x/y"): they jump the queue of the apply that is running.
const wanted = new Set<string>()
export const want = (keys: string[]) => { for (const k of keys.slice(0, 200)) wanted.add(k) }
const keyOf = (t: TileSpec) => `${t.theme}/${t.z}/${t.x}/${t.y}`

// Renders what is missing tile by tile in `order` (the preview, the initial view, its neighbours, the rest), `cores` renders at a time,
// and publishes a release whenever tiles have appeared so the map fills in as soon as the first ones are done. Tiles a client asked for
// come first. Stops early when `stale` says the config changed again.
export async function apply(log: (m: string) => void = () => {}, stale: () => boolean = () => false): Promise<Summary> {
  const t0 = Date.now()
  const plan = computePlan(loadConfig(), loadPositions())
  savePositions(plan.world.positions)
  for (const [n, d] of [[plan.worldName, plan.worldJson], [plan.configName, plan.configJson]]) if (!has(n)) writeAtomic(art(n), d)
  const todo = missing(plan)
  const cur = currentRelease()
  if (cur?.id === plan.id && cur.complete && !todo.jobs.length && !todo.tiles.length) return { rendered: {}, tiles: 0, ms: Date.now() - t0, first: 0, aborted: false }
  const sum: Summary = { rendered: {}, tiles: todo.tiles.length, ms: 0, first: null, aborted: false }
  log(`${todo.jobs.length} layers + ${todo.tiles.length} tiles to render (~${(estimateMs(todo.jobs, todo.tiles.length) / 1000).toFixed(1)} s on ${cores} cores)`)
  for (const j of todo.jobs) sum.rendered[j.kind] = (sum.rendered[j.kind] ?? 0) + 1
  started.clear(); wanted.clear(); quads.clear()

  const queue = order(plan).filter((t) => !has(t.name)), pending = new Map(queue.map((t) => [keyOf(t), t])), left0 = { light: 0, night: 0 }
  for (const t of queue) if (t.z === 0) left0[t.theme]++
  const next = (): [TileSpec, number] | null => {
    for (const k of wanted) { wanted.delete(k); const t = pending.get(k); if (t) { pending.delete(k); return [t, -1] } }
    while (queue.length) { const t = queue.shift()!; if (pending.delete(keyOf(t))) return [t, 0] }
    return null
  }
  const first = new Set(firstWave(plan).filter((t) => pending.has(keyOf(t))).map(keyOf))
  for (const theme of THEMES) if (!left0[theme] && !has(plan.previews[theme])) await preview(plan, theme)
  let lastPublish = 0, timer: ReturnType<typeof setTimeout> | undefined
  const kick = () => { // at most one release per 250 ms
    if (timer) return
    timer = setTimeout(() => { timer = undefined; lastPublish = Date.now(); publish(manifest(plan, false)) }, Math.max(0, 250 - (Date.now() - lastPublish)))
  }
  const worker = async () => {
    for (let n = next(); n && !stale(); n = next()) {
      const [t, prio] = n
      await Promise.all([t.texture, t.terrain, ...t.pieces.map((x) => x.name)].filter((x): x is string => !!x).map((x) => ensure(plan, x, prio)))
      await cpu(prio, () => flatten(t))
      if (t.z === 0 && !--left0[t.theme]) await preview(plan, t.theme)
      if (first.delete(keyOf(t)) && !first.size) { sum.first = Date.now() - t0; log(`first wave (preview + initial view) rendered after ${sum.first} ms`) }
      kick()
    }
  }
  await Promise.all(Array.from({ length: cores * 2 }, worker))
  if (timer) clearTimeout(timer)
  if (stale()) sum.aborted = true
  for (const theme of THEMES) if (!has(plan.previews[theme]) && !sum.aborted) await preview(plan, theme)
  if (!sum.aborted) {
    publish(manifest(plan, true))
    const keep = new Set([plan.worldName, plan.configName, ...plan.jobs.map((j) => j.name), ...plan.tiles.map((t) => t.name), ...Object.values(plan.previews)])
    log(`collected ${collect(keep)} stale files`)
  }
  sum.first ??= Date.now() - t0
  sum.ms = Date.now() - t0
  return sum
}
