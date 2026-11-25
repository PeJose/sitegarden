import { nodes } from '../mock/data'
import { useEngine } from '../live/store'
import type { CheckState, NodeState, Status } from '../mock/types'
import type { Extension, Render } from './tree'

// What a web plugin may import (as `@sitegarden/web-sdk`); nothing else under src/ is stable.
export const WEB_SDK_VERSION = '1.0.0'
export type { CheckState, Extension, Render, Status }
export interface WebPluginContext { id: string; add(ext: Extension): void; override(id: string, wrap: (original: Render) => Render): void }
export interface WebPlugin { id: string; register(ctx: WebPluginContext): void }
export const defineWebPlugin = (p: WebPlugin) => p

export const useNodes = (): { id: string; type: string; name: string; group: string }[] => nodes.map((n) => ({ id: n.id, type: n.type, name: n.name, group: n.group }))
export const useStatuses = (): Record<string, Pick<NodeState, 'status' | 'lastChecked' | 'responseMs' | 'checks'>> => useEngine((s) => s.nodes)
