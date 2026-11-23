export type Pt = [number, number]
export type Box = [number, number, number, number] // x0 y0 x1 y1

// Config: what the user declares. Node fields beyond id/type are opaque to the generator.
export interface ConfigNode { id: string; type: string; [k: string]: unknown }
export interface ConfigEdge { from: string; to: string; type: string; label?: string }
export interface ConfigEstate { id: string; label: string; nodes: ConfigNode[]; edges: ConfigEdge[] }
export interface Config { accountSeed: string; estates: ConfigEstate[] }
export type Positions = Record<string, { x: number; y: number }>

export interface Tree { x: number; y: number; s: number }
export interface Patch { x: number; y: number; r: number; fill: string; o: number }
export interface Building {
  id: string; type: string; v: number // v = variant index within the type
  x: number; y: number; w: number; h: number; rot: number
  pal: [string, string, string] // wall/roof, ridge line, ribs
  win: Box[] // lit-window rects in the building's local frame (night, live)
}
export interface Road { id: string; from: string; to: string; d: string; pts: Pt[]; label: string; labelBox: Box; labelPath: string; labelAt: number; lamp: Pt } // labelPath runs left to right so text on it is upright; labelAt is the 0..1 position along it
export interface Label { text: string; x: number; y: number; w: number; h: number; mono?: boolean }
export interface Estate {
  id: string; label: string; cx: number; cy: number; r: number; bb: Box
  d: string; poly: Pt[]
  base: string; patches: Patch[]
  trees: Tree[]; beds: Box[]; ponds: { x: number; y: number; rx: number; ry: number }[]; rows: string[]
  drops: { x: number; y: number; r: number; c: string }[]
  seeds: [number, number, number, number] // per-plot watercolour filter seeds
  buildings: Building[]; roads: Road[]
  tag: Label // estate name
  pins: Record<string, Pt>; campfire: Pt
  chips: Record<string, { box: Box; align: 'start' | 'end' | 'center' }> // reserved pin-chip boxes (world)
}
export interface Cell {
  bb: Box
  streets: string; houses: { x: number; y: number; k: 'hr' | 'hg' }[]; stripes: string; lamps: Pt[]
  trees: Tree[]; patches: { d: string; fill: string }[]
}
export interface Gate { estate: string; at: Pt; street: Pt; outer: string; d: string } // outer: street end -> gate (grey, like the streets); d: gate -> garden path to the nearest building (coloured)
export interface Hood { angle: number; pivot: Pt; cells: Cell[]; gates: Gate[] }
export interface World {
  seed: string
  bounds: { x: number; y: number; w: number; h: number }
  estates: Estate[]
  hood: Hood
  positions: Positions
}
