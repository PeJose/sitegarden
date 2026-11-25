import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import YAML from 'yaml'
import type { Plugin } from 'vite'

const ID = 'virtual:sitegarden-web-plugins'

// The module text: one import per listed plugin whose manifest has a `web` entry. An unreadable manifest fails the build instead of dropping the plugin.
// shortcut: a missing config file means no web plugins (not an error), when a build without a config should fail instead.
export function webPluginsModule(configFile: string, watch: (f: string) => void = () => {}): string {
  watch(configFile)
  if (!fs.existsSync(configFile)) return 'export default []'
  const dir = path.dirname(configFile), list = (YAML.parse(fs.readFileSync(configFile, 'utf8')) as { plugins?: unknown } | null)?.plugins
  const imports: string[] = []
  for (const e of Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : []) {
    try {
      const pkgFile = /^[./]/.test(e) ? path.resolve(dir, e, 'package.json') : createRequire(configFile).resolve(`${e}/package.json`)
      watch(pkgFile)
      const web = (JSON.parse(fs.readFileSync(pkgFile, 'utf8')) as { sitegarden?: { web?: string } }).sitegarden?.web
      if (web) imports.push(JSON.stringify(path.resolve(path.dirname(pkgFile), web)))
    } catch (err) { throw new Error(`web plugin "${e}": cannot read its manifest (${(err as Error).message})`) }
  }
  return `${imports.map((p, i) => `import p${i} from ${p}`).join('\n')}\nexport default [${imports.map((_, i) => `p${i}`).join(', ')}]`
}

export function sitegardenPlugins(): Plugin {
  let root = ''
  return {
    name: 'sitegarden-web-plugins',
    configResolved: (c) => { root = c.root },
    resolveId: (id) => (id === ID ? '\0' + ID : undefined),
    load(id) {
      if (id === '\0' + ID) return webPluginsModule(path.resolve(root, process.env.SITEGARDEN_CONFIG ?? 'sitegarden.yaml'), (f) => this.addWatchFile(f))
    },
  }
}
