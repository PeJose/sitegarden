import { createRegistry, type ExtensionConfig } from './tree'

export const registry = createRegistry()

// The `extensions:` block of sitegarden.yaml. Fetched once at start; the map waits for it so a disabled layer never flashes.
export const extConfig: { extensions: Record<string, ExtensionConfig> } = { extensions: {} }
export const configReady = fetch('/api/config').then((r) => r.json()).then((c: { extensions?: Record<string, ExtensionConfig> }) => { extConfig.extensions = c.extensions ?? {} }).catch(() => {})
