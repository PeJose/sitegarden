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
  checks?: string[] // human description of the mock checks; real nodes have none
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

export interface CheckState { id: string; status: Status; detail: string | null; at: number; ms: number | null } // a check's latest result

export interface NodeState {
  status: Status
  lastChecked: number // 0 = never
  since: number // when the current status began
  responseMs: number | null
  history: number[] // response times, 0 = failed
  checks: CheckState[]
}

export interface EngineState {
  nodes: Record<string, NodeState>
  edges: Record<string, { lastResult: 'ok' | 'failed' | null }>
  flows: Record<string, 'deploy' | 'webhook'> // edge id -> flow in flight
  demo: boolean // the server runs the mock plugin: the client may play deploy/webhook flows
  updatedAt: number
}
