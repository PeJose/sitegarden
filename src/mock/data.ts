import type { Config } from '../gen/types'
import type { Group, MockEdge, MockNode } from './types'

// Filled from /api/config before the first render; everything else reads these live bindings.
export let groups: Group[] = []
export let nodes: MockNode[] = []
export let edges: MockEdge[] = []

export function setConfig(cfg: Config) {
  groups = cfg.estates.map((e) => ({ id: e.id, label: e.label }))
  nodes = cfg.estates.flatMap((e) => e.nodes.map((n) => ({ ...n, group: e.id }) as unknown as MockNode))
  edges = cfg.estates.flatMap((e) => e.edges.map((x) => ({ id: `${x.from}>${x.to}`, from: x.from, to: x.to, type: x.type, label: x.label ?? x.type.toUpperCase() })))
}

export const nodeById = (id: string) => nodes.find((n) => n.id === id)
