import webPlugins from 'virtual:sitegarden-web-plugins'
import { createRegistry, type ExtensionConfig } from './tree'
import { registerWebPlugins } from './web'

export const registry = createRegistry()

// The `extensions:` block of sitegarden.yaml. Fetched once at start; the map waits for it so a disabled layer never flashes.
export const extConfig: { extensions: Record<string, ExtensionConfig> } = { extensions: {} }
export const configReady = fetch('/api/config').then((r) => r.json()).then((c: { extensions?: Record<string, ExtensionConfig>; plugins?: string[] }) => { extConfig.extensions = c.extensions ?? {}; registerWebPlugins(registry, webPlugins, c.plugins ?? []) }).catch(() => {})
