import os from 'node:os'
import { generateWorld } from '../src/gen/world'
import { estateGrainSvg, estateSoftSvg, estateSvg, estateView, PAD, terrainCrispSvg, terrainSoftSvg, textureSvg, type Theme } from '../src/gen/render'
import { hit } from '../src/gen/geom'
import type { Box, Config, Positions, World } from '../src/gen/types'
import { initialViewport, levelFor, REF_SIZE, SCALE, tiledBox } from '../src/lib/view'
import { has, hash, RENDERER } from './store'

export const T = 512 // tile edge in world units
export { SCALE }
// Pixels per world unit the watercolour filters (land edge, washes, trees) run at, per zoom level. Their edges are soft by nature, so they are
// rendered small and enlarged; strokes, buildings and paper grain are rendered at SCALE. Levels 2 and 3 share one render.
export const WC = [0.125, 0.25, 0.5, 0.5]
export const THEMES: Theme[] = ['light', 'night']
const TEX = 1024 // texture repeat, in units: a multiple of T, so every tile is one quadrant of it

// kinds: texture; soft (a low-resolution filtered layer, shared by the levels that use it); estate and terrain (the soft layer enlarged and
// composited with their full-resolution parts: svg is the crisp part, mask the paper grain of an estate)
export interface Job { name: string; theme: Theme; z: number; kind: 'texture' | 'soft' | 'terrain' | 'estate'; ms: number; svg?: string; mask?: string; soft?: string; wc?: number }
export interface Piece { name: string; src: [number, number, number, number]; at: [number, number] } // crop of an estate layer, and where it lands in the tile (px)
export interface TileSpec { name: string; theme: Theme; z: number; x: number; y: number; texture: string; quad: [number, number]; terrain?: string; pieces: Piece[] }
export interface Plan {
  id: string; world: World; config: Config
  worldJson: string; worldName: string; configJson: string; configName: string
  estates: Record<string, string>
  grid: { x0: number; y0: number; cols: number; rows: number }
  jobs: Job[]; byName: Map<string, Job>; tiles: TileSpec[]; previews: Record<Theme, string>
}

// Cost model, microseconds of one core per output pixel, measured on the dev Mac (aqS/aq/aqT/wash filters dominate).
const US = { texture: 1.8, soft: 4.1, estate: 1.6, terrain: 0.5 }
export const FLATTEN_MS = 40
// Leave two cores free so the machine stays usable while rendering; SG_RENDER_WORKERS overrides.
export const cores = Math.max(1, Number(process.env.SG_RENDER_WORKERS) || os.availableParallelism() - 2)
export const estimateMs = (jobs: Job[], tiles: number) => Math.round((jobs.reduce((a, j) => a + j.ms, 0) + tiles * FLATTEN_MS) / cores)

const wrap = (n: number, k: number) => ((n % k) + k) % k
export function computePlan(config: Config, positions: Positions): Plan {
  const world = generateWorld(config, positions)
  const area = tiledBox(world.bounds), x0 = Math.floor(area[0] / T), y0 = Math.floor(area[1] / T) // everything the client can pan to
  const grid = { x0, y0, cols: Math.ceil(area[2] / T) - x0, rows: Math.ceil(area[3] / T) - y0 }
  const jobs: Job[] = [], tiles: TileSpec[] = [], previews = {} as Record<Theme, string>, byName = new Map<string, Job>()
  const add = (j: Omit<Job, 'name'>, id: string, tag = `z${j.z}`) => {
    const name = `layer-${j.kind}-${j.theme}-${tag}-${hash(RENDERER + id)}.${j.kind === 'texture' ? 'webp' : 'png'}`
    if (!byName.has(name)) { const job = { ...j, name }; byName.set(name, job); jobs.push(job) } // a soft layer shared by two levels is one job
    return name
  }

  for (const theme of THEMES) {
    for (const z of SCALE.keys()) {
      const s = SCALE[z], wc = WC[z]
      const px = (a: number, k: number) => a * k * k
      const texture = add({ kind: 'texture', theme, z, ms: px(TEX * TEX, s) * US.texture / 1000 * (theme === 'night' ? 0.5 : 1), svg: textureSvg(theme, TEX, s) }, 'webp97' + textureSvg(theme, TEX, s)) // the encoder setting is part of the id
      const estateNames = new Map(world.estates.map((e) => {
        const v = estateView(e), area = (v[2] - v[0]) * (v[3] - v[1])
        const softSvg = estateSoftSvg(world, e, theme, wc), crisp = estateSvg(world, e, theme, s), mask = estateGrainSvg(e, s)
        const soft = add({ kind: 'soft', theme, z, ms: px(area, wc) * US.soft / 1000, svg: softSvg }, softSvg, `wc${wc}`)
        return [e.id, add({ kind: 'estate', theme, z, ms: px(area, s) * US.estate / 1000, svg: crisp, mask, soft, wc }, crisp + mask + soft)] as const
      }))
      for (let y = y0; y < y0 + grid.rows; y++) for (let x = x0; x < x0 + grid.cols; x++) {
        const tb: Box = [x * T, y * T, (x + 1) * T, (y + 1) * T], view: Box = [tb[0] - PAD, tb[1] - PAD, tb[2] + PAD, tb[3] + PAD]
        const softSvg = terrainSoftSvg(world, theme, view, wc)
        let terrain: string | undefined
        if (softSvg) {
          const soft = add({ kind: 'soft', theme, z, ms: px((T + 2 * PAD) ** 2, wc) * US.soft / 1000, svg: softSvg }, softSvg, `wc${wc}`)
          const crisp = terrainCrispSvg(world, theme, tb, s) ?? undefined
          terrain = add({ kind: 'terrain', theme, z, ms: px(T * T, s) * US.terrain / 1000, svg: crisp, soft, wc }, `${crisp}${soft}`)
        }
        const pieces = world.estates.filter((e) => hit(e.bb, tb, 40)).flatMap((e): Piece[] => {
          const v = estateView(e), l = Math.max(v[0], tb[0]), t = Math.max(v[1], tb[1]), r = Math.min(v[2], tb[2]), b = Math.min(v[3], tb[3])
          return r > l && b > t ? [{ name: estateNames.get(e.id)!, src: [(l - v[0]) * s, (t - v[1]) * s, (r - l) * s, (b - t) * s], at: [(l - tb[0]) * s, (t - tb[1]) * s] }] : []
        })
        const quad: [number, number] = [wrap(x, TEX / T), wrap(y, TEX / T)]
        tiles.push({ name: `tile-${hash(JSON.stringify([theme, z, texture, quad, terrain, pieces]))}.webp`, theme, z, x, y, texture, quad, terrain, pieces })
      }
    }
    previews[theme] = `preview-${theme}-${hash(tiles.filter((t) => t.theme === theme && t.z === 0).map((t) => t.name).join())}.webp`
  }
  const worldJson = JSON.stringify(world), configJson = JSON.stringify(config)
  const worldName = `world-${hash(worldJson)}.json`, configName = `config-${hash(configJson)}.json`
  const estates = Object.fromEntries(world.estates.map((e) => [e.id, hash(JSON.stringify(e))]))
  const id = hash([worldName, configName, ...tiles.map((t) => t.name), ...Object.values(previews)].join())
  return { id, world, config, worldJson, worldName, configJson, configName, estates, grid, jobs, byName, tiles, previews }
}

export const missing = (p: Plan) => ({ jobs: p.jobs.filter((j) => !has(j.name)), tiles: p.tiles.filter((t) => !has(t.name)) })

// What the client opens to: the tile coordinates its default viewport covers on a reference window, and the level it asks for there.
export function initialView(p: Plan) {
  const { w, h } = REF_SIZE, vp = initialViewport(w, h, p.world)
  const x0 = Math.floor(-vp.x / vp.zoom / T), x1 = Math.floor((w - vp.x) / vp.zoom / T), y0 = Math.floor(-vp.y / vp.zoom / T), y1 = Math.floor((h - vp.y) / vp.zoom / T)
  return { z: levelFor(vp.zoom, 1), has: (x: number, y: number) => x >= x0 && x <= x1 && y >= y0 && y <= y1 }
}

// Render order: the tiny z0 level (the preview), then the initial view at the level it needs, then its neighbours, then the other theme the
// same way, then the remaining levels. Light first: it is what the page opens in.
export function order(p: Plan): TileSpec[] {
  const view = initialView(p), levels = [0, view.z, ...SCALE.map((_, z) => z).filter((z) => z && z !== view.z)]
  const rank = (t: TileSpec) => { const l = levels.indexOf(t.z), th = THEMES.indexOf(t.theme); return (l < 2 ? th * 2 + l : l * 2 + th) * 2 + (view.has(t.x, t.y) ? 0 : 1) }
  return [...p.tiles].sort((a, b) => rank(a) - rank(b))
}
// The first wave: the preview's tiles and the initial view's, light theme.
export const firstWave = (p: Plan) => { const v = initialView(p); return p.tiles.filter((t) => t.theme === 'light' && (t.z === 0 || (t.z === v.z && v.has(t.x, t.y)))) }
