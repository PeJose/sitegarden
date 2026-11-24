import type { ReactNode } from 'react'

// Every visual piece is an extension with an ID `kind:plugin:name`; a slot (`map`) takes the ones whose `input` (`layers`) it asks for.
export type Render = (props: any, config: unknown) => ReactNode
export interface Extension { id: string; slot: string; input: string; order?: number; render: Render }
export interface ExtensionConfig { disabled?: boolean; config?: unknown }
export interface Replacement { id: string; replaced: string; by: string } // the plugin that lost and the one that won
export interface Resolved { id: string; render: (props: unknown) => ReactNode }

const pluginOf = (id: string) => id.split(':')[1] ?? ''

export function createRegistry() {
  const items = new Map<string, { ext: Extension; by: string }>(), wraps = new Map<string, ((original: Render) => Render)[]>(), log: Replacement[] = []
  return {
    // Same ID again replaces the earlier registration (later plugin wins) and is logged.
    add(ext: Extension, by = pluginOf(ext.id)) {
      const old = items.get(ext.id)
      if (old) log.push({ id: ext.id, replaced: old.by, by })
      items.set(ext.id, { ext, by })
    },
    // Decorates an extension without copying it; wraps stack in the order they were added and survive a replacement of the base.
    override(id: string, wrap: (original: Render) => Render) {
      if (!items.has(id)) throw new Error(`no extension "${id}" to wrap`)
      wraps.set(id, [...(wraps.get(id) ?? []), wrap])
    },
    overrides: (): readonly Replacement[] => log,
    // Enabled extensions for one slot input, by `order` then registration order, each bound to its YAML config.
    resolve(slot: string, input: string, config: Record<string, ExtensionConfig> = {}): Resolved[] {
      return [...items.values()]
        .map((x) => x.ext)
        .filter((e) => e.slot === slot && e.input === input && !config[e.id]?.disabled)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map((e) => { const r = (wraps.get(e.id) ?? []).reduce((f, w) => w(f), e.render); return { id: e.id, render: (props: unknown) => r(props, config[e.id]?.config) } })
    },
  }
}
export type Registry = ReturnType<typeof createRegistry>
