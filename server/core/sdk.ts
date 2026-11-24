import type { z } from 'zod'
import type { HttpInit, HttpResponse } from './http'

export const SDK_VERSION = '1.1.0'

export type Disposer = () => void
export type Status = 'ok' | 'degraded' | 'down' | 'working' | 'paused' | 'unknown'
export interface CheckNode { id: string; type: string; [k: string]: unknown }
export interface CheckResult { status: Status; detail?: string }
// Runs once per node of the listed types (every node when `nodeTypes` is left out).
export interface CheckDef { id: string; every: string; nodeTypes?: string[]; run(node: CheckNode): CheckResult | Promise<CheckResult> }

export interface PluginContext {
  id: string
  // A new node type with its extra config fields.
  registerNodeType(type: string, fields?: z.ZodRawShape): Disposer
  // More config fields on a node type some plugin already registered.
  registerSchema(nodeType: string, fields: z.ZodRawShape): Disposer
  registerCheck(check: CheckDef): Disposer
  store: { kv: { get(key: string): unknown; set(key: string, value: unknown): void; delete(key: string): void }; cache: { get(key: string): { value: unknown; fetched_at: number } | undefined; set(key: string, value: unknown): void } }
  emit(type: string, data: unknown): void
  // The only way out to the network: limited to the manifest's permissions.network, `${secret:NAME}` in the URL and headers only for permissions.secrets, internal addresses blocked.
  http(url: string, init?: HttpInit): Promise<HttpResponse>
}
export interface Plugin { id: string; register(ctx: PluginContext): void | Promise<void> }
export const definePlugin = (p: Plugin) => p
