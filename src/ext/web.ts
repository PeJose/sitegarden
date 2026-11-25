import { pluginOf, type Extension, type Registry, type Render } from './tree'
import type { WebPlugin } from './sdk'

// Registers the bundled web plugins the server reports as loaded. A plugin's calls are collected first and applied only when its `register` returns,
// so one that throws leaves nothing behind. shortcut: an `override` of a missing id throws while applying and keeps what came before it, when that matters.
export function registerWebPlugins(registry: Registry, mods: WebPlugin[], loaded: string[]) {
  for (const p of mods) {
    if (!loaded.includes(p.id)) continue
    const ops: (() => void)[] = []
    try {
      p.register({
        id: p.id,
        add: (ext: Extension) => { if (pluginOf(ext.id) !== p.id) throw new Error(`extension "${ext.id}" is not in plugin "${p.id}"`); ops.push(() => registry.add(ext, p.id)) },
        override: (id: string, wrap: (o: Render) => Render) => void ops.push(() => registry.override(id, wrap)),
      })
      ops.forEach((f) => f())
    } catch (err) { console.error(`[sitegarden] web plugin ${p.id} failed`, err) }
  }
}
