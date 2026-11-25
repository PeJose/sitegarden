import type { z } from 'zod'
import type { HttpInit, HttpResponse } from './http'

export const SDK_VERSION = '1.3.0'

export type Disposer = () => void
export type Status = 'ok' | 'degraded' | 'down' | 'working' | 'paused' | 'unknown'
export interface CheckNode { id: string; type: string; [k: string]: unknown }
export interface CheckResult { status: Status; detail?: string; ms?: number } // ms: response time, when the check measured one
// Runs once per node of the listed types (every node when `nodeTypes` is left out).
export interface CheckDef { id: string; every: string; nodeTypes?: string[]; run(node: CheckNode): CheckResult | Promise<CheckResult> }

export interface Link { label: string; url: string }
// A short config field on a node type that expands into links when the config loads.
export interface ShorthandDef { nodeType: string; field: string; schema: z.ZodType; links(value: any, node: CheckNode): Link[] }

export type CheckRunContext = PluginContext & { index: number } // index: the entry's position in the node's `checks:`
// A check type configured per node under `checks:`; `schema` adds fields to the standard `type` and `every` (default 5m).
export interface CheckTypeDef { type: string; schema: z.ZodRawShape; run(config: any, node: CheckNode, ctx: CheckRunContext): CheckResult | Promise<CheckResult> }

export interface PluginContext {
  id: string
  // A new node type with its extra config fields.
  registerNodeType(type: string, fields?: z.ZodRawShape): Disposer
  // More config fields on a node type some plugin already registered.
  registerSchema(nodeType: string, fields: z.ZodRawShape): Disposer
  registerCheck(check: CheckDef): Disposer
  // Also accepts `field` on the node type; its links come before the node's explicit ones.
  registerShorthand(def: ShorthandDef): Disposer
  registerCheckType(def: CheckTypeDef): Disposer
  store: { kv: { get(key: string): unknown; set(key: string, value: unknown): void; delete(key: string): void }; cache: { get(key: string): { value: unknown; fetched_at: number } | undefined; set(key: string, value: unknown): void } }
  emit(type: string, data: unknown): void
  // The only way out to the network: limited to the manifest's permissions.network, `${secret:NAME}` in the URL and headers only for permissions.secrets, internal addresses blocked.
  http(url: string, init?: HttpInit): Promise<HttpResponse>
}
export interface Plugin { id: string; register(ctx: PluginContext): void | Promise<void> }
export const definePlugin = (p: Plugin) => p
