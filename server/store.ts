import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

// Everything the pipeline produces lives here (a Docker volume in production). Artifacts are flat files named by content hash.
export const DATA = path.resolve(process.env.SITEGARDEN_DATA ?? path.join(import.meta.dirname, '../.data'))
export const ART = path.join(DATA, 'a')
export const RENDERER = 'r8' // bump when a render change should drop every artifact
fs.mkdirSync(ART, { recursive: true })

export const hash = (s: string | Buffer) => createHash('sha1').update(s).digest('hex').slice(0, 16)
export const art = (name: string) => path.join(ART, name)
export const has = (name: string) => fs.existsSync(art(name))

// Write to a temp name and rename, so a reader never sees half a file.
export function writeAtomic(file: string, data: string | Buffer) {
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, data)
  fs.renameSync(tmp, file)
}

export interface Manifest {
  id: string
  rev: number // grows as tiles appear within one release id, so a client knows to refresh its tile index
  complete: boolean
  world: string; config: string // artifact names
  estates: Record<string, string> // estate id -> hash of its geometry, for plan diffs
  tiles: { size: number; x0: number; y0: number; cols: number; rows: number; names: Record<'light' | 'night', (string | null)[][]> } // names[theme][z][row * cols + col]
  previews: Partial<Record<'light' | 'night', string>>
  textures: Record<'light' | 'night', string[]> // seamless paper per level (repeats every 1024 units), the client's fallback under the tiles
}
const CURRENT = path.join(DATA, 'current')
export function currentRelease(): Manifest | null {
  try { return JSON.parse(fs.readFileSync(path.join(DATA, fs.readFileSync(CURRENT, 'utf8').trim()), 'utf8')) } catch { return null }
}
export function publish(m: Manifest) {
  const name = `release-${m.id}.json`
  writeAtomic(path.join(DATA, name), JSON.stringify(m))
  writeAtomic(CURRENT, name)
}

// Drop everything the current release and the current plan no longer reference.
export function collect(keep: Set<string>) {
  let n = 0
  for (const f of fs.readdirSync(ART)) if (!keep.has(f)) { fs.rmSync(art(f), { force: true }); n++ }
  const cur = fs.readFileSync(CURRENT, 'utf8').trim()
  for (const f of fs.readdirSync(DATA)) if (/^release-.*\.json$/.test(f) && f !== cur) fs.rmSync(path.join(DATA, f))
  return n
}
