import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'
import type { Config, ConfigEstate, Positions } from '../src/gen/types'
import { DATA, writeAtomic } from './store'

export const CONFIG_FILE = path.resolve(process.env.SITEGARDEN_CONFIG ?? path.join(import.meta.dirname, '../sitegarden.yaml'))
const POSITIONS = path.join(DATA, 'positions.json') // layout results live apart from the YAML so it stays human

export function loadConfig(): Config {
  const c = YAML.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) as Config
  if (typeof c?.accountSeed !== 'string' || !Array.isArray(c.estates)) throw new Error(`${CONFIG_FILE}: need accountSeed and an estates list`)
  return c
}
export function loadPositions(): Positions {
  try { return JSON.parse(fs.readFileSync(POSITIONS, 'utf8')) } catch { return {} }
}
export const savePositions = (p: Positions) => writeAtomic(POSITIONS, JSON.stringify(p))

// Edits keep the file's comments and layout; the watcher then applies the change like any other.
function edit<T>(f: (estates: YAML.YAMLSeq) => T): T {
  const doc = YAML.parseDocument(fs.readFileSync(CONFIG_FILE, 'utf8'))
  const out = f(doc.get('estates', true) as YAML.YAMLSeq)
  writeAtomic(CONFIG_FILE, doc.toString({ lineWidth: 0 }))
  return out
}
export const addEstate = (e: ConfigEstate) => edit((seq) => { seq.add(new YAML.Document(e).contents) })
export function removeLastEstate(): string | null {
  const last = edit((seq) => (seq.items.length > 1 ? (seq.items.pop() as YAML.YAMLMap).get('id') as string : null))
  if (last) { const p = loadPositions(); delete p[last]; savePositions(p) }
  return last
}
