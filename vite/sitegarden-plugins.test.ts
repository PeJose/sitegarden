import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { webPluginsModule } from './sitegarden-plugins.ts'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-vite-'))
const plugin = (name: string, sitegarden: object) => { fs.mkdirSync(path.join(dir, name)); fs.writeFileSync(path.join(dir, name, 'package.json'), JSON.stringify({ sitegarden })) }
plugin('with-web', { id: 'a', web: './web.tsx' })
plugin('server-only', { id: 'b' })
const config = (plugins: string[]) => { const f = path.join(dir, 'sitegarden.yaml'); fs.writeFileSync(f, `plugins:\n${plugins.map((p) => `  - ${p}`).join('\n')}\n`); return f }

test('imports the web entry of each listed plugin that has one, skips the others', () => {
  const watched: string[] = []
  const code = webPluginsModule(config(['./with-web', './server-only']), (f) => watched.push(f))
  assert.equal(code, `import p0 from ${JSON.stringify(path.join(dir, 'with-web/web.tsx'))}\nexport default [p0]`)
  assert.deepEqual(watched, [path.join(dir, 'sitegarden.yaml'), path.join(dir, 'with-web/package.json'), path.join(dir, 'server-only/package.json')])
})

test('no plugins or no config: an empty list; an unreadable manifest fails naming the plugin', () => {
  assert.equal(webPluginsModule(config(['./server-only'])), '\nexport default []')
  assert.equal(webPluginsModule(path.join(dir, 'nope.yaml')), 'export default []')
  assert.throws(() => webPluginsModule(config(['./missing'])), /web plugin "\.\/missing": cannot read its manifest/)
})
