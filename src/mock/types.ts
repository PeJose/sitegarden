export type Status = 'ok' | 'degraded' | 'down' | 'working' | 'paused' | 'unknown'
export type NodeType = 'repo' | 'cms' | 'site' | 'job' | 'db'

export interface LinkItem {
  label: string
  url: string
}

export interface Group {
  id: string
  label: string
}

export interface MockNode {
  id: string
  group: string
  type: NodeType
  name: string
  host: string
  links: LinkItem[]
  notes: string
  checks: string[] // human description of the configured checks
  baseMs: number // typical response time for the generated history
  initialStatus: Status
}

export interface MockEdge {
  id: string
  from: string
  to: string
  type: string // webhook | deploy | sync
  label: string
}

// SSE event shapes from docs/plan.md, plus a node.status event for the UI.
export type EngineEvent =
  | { type: 'check.ping'; nodeId: string }
  | { type: 'flow.started'; id: string; kind: 'deploy' | 'webhook'; edgeId: string; t0: number }
  | { type: 'flow.finished'; id: string; t1: number; result: 'ok' | 'failed' }

export interface NodeState {
  status: Status
  lastChecked: number
  since: number // when the current status began
  responseMs: number | null
  history: number[] // response times, 0 = failed
}

export interface EngineState {
  nodes: Record<string, NodeState>
  edges: Record<string, { lastResult: 'ok' | 'failed' | null }>
  flows: Record<string, 'deploy' | 'webhook'> // edge id -> flow in flight
  updatedAt: number
}
