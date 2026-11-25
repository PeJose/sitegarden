import { Component, createElement, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

// Every visual piece is an extension with an ID `kind:plugin:name`; a slot (`map`) takes the ones whose `input` (`layers`) it asks for.
export type Render = (props: any, config: unknown) => ReactNode
export interface Extension { id: string; slot: string; input: string; order?: number; title?: string; render: Render }
export interface ExtensionConfig { disabled?: boolean; config?: unknown }
export interface Replacement { id: string; replaced: string; by: string } // the plugin that lost and the one that won
export interface Resolved { id: string; title?: string; render: (props: unknown) => ReactNode }

export const pluginOf = (id: string) => id.split(':')[1] ?? ''

// One extension throwing while it renders shows a small card in its place and leaves every other extension alone.
// A map layer lives in the scaled world, so its card floats over the map box instead (shortcut: failed layers share one spot, fine for the rare case).
class ErrorBoundary extends Component<{ id: string; float: boolean; children?: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error: unknown) { console.error(`[sitegarden] extension ${this.props.id} failed`, error) }
  render() {
    if (!this.state.failed) return this.props.children
    const card = createElement('div', { className: 'ext-failed', role: 'alert' }, 'plugin ', createElement('code', null, this.props.id), ' failed')
    return this.props.float ? createPortal(card, document.querySelector('.mapbox') ?? document.body) : card
  }
}
const Call = ({ f }: { f: () => ReactNode }) => f() // so the extension's render runs inside the boundary, not in its parent

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
        .map((e) => { const r = (wraps.get(e.id) ?? []).reduce((f, w) => w(f), e.render); return { id: e.id, title: e.title, render: (props: unknown) => createElement(ErrorBoundary, { key: e.id, id: e.id, float: slot === 'map' }, createElement(Call, { f: () => r(props, config[e.id]?.config) })) } })
    },
  }
}
export type Registry = ReturnType<typeof createRegistry>
