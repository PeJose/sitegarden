import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { rngFor } from '../src/gen/rng'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-cfg-'))
process.env.SITEGARDEN_DATA = dir // before store.ts and config.ts load
process.env.SITEGARDEN_CONFIG = path.join(dir, 'sitegarden.yaml')
const root = path.join(import.meta.dirname, '..')
fs.writeFileSync(process.env.SITEGARDEN_CONFIG, fs.readFileSync(path.join(root, 'sitegarden.yaml'), 'utf8').replaceAll('./plugins/', `${root}/plugins/`))
const { addEstate, authConfig, bootstrap, canEditConfig, db, latestYaml, loadConfig, loadGraph, removeLastEstate } = await import('./config')
const { makeEstate } = await import('./mock')

test('an empty store imports the file once as rev 1, later file edits change nothing', async () => {
  bootstrap()
  assert.deepEqual([db.latestRev(), db.getRev(1)?.source], [1, 'bootstrap'])
  const yaml = latestYaml()
  fs.appendFileSync(process.env.SITEGARDEN_CONFIG!, '\n# edited on the server\n')
  bootstrap()
  assert.equal(db.latestRev(), 1)
  assert.equal(latestYaml(), yaml)
  assert.equal((await loadGraph(latestYaml())).groups.length, 6)
})

test('planting adds a group with its nodes and edges, removing takes them out again, comments stay', async () => {
  const text = latestYaml(), before = await loadConfig(), g0 = await loadGraph(text)
  const e = makeEstate(rngFor('cfg-test'), before.estates.map((x) => x.id))
  const planted = addEstate(text, e)
  const g1 = await loadGraph(planted)
  assert.equal(g1.groups.length, before.estates.length + 1)
  assert.equal(g1.nodes.length, g0.nodes.length + e.nodes.length)
  const gone = removeLastEstate(planted)!
  assert.equal(gone.id, e.id)
  assert.deepEqual(await loadGraph(gone.yaml), g0)
  assert.match(gone.yaml, /# yaml-language-server.*\n# Sitegarden config/)
})

test('the last estate cannot be removed', async () => {
  let text = latestYaml()
  for (let r = removeLastEstate(text); r; r = removeLastEstate(text)) text = r.yaml
  assert.equal((await loadGraph(text)).groups.length, 1)
})

test('the sample config expands its shorthands into the links it used to spell out', async () => {
  const g = await loadGraph(latestYaml()), links = (id: string) => g.nodes.find((n) => n.id === id)!.links
  const repo = (o: string) => [['Actions', 'actions'], ['Settings', 'settings'], ['Secrets', 'settings/secrets/actions'], ['Pull requests', 'pulls'], ['Issues', 'issues']].map(([label, p]) => ({ label, url: `https://github.com/${o}/${p}` }))
  assert.deepEqual(links('fernhill-repo'), repo('acme/fernhill'))
  assert.deepEqual(links('copperleaf-repo'), repo('acme/copperleaf'))
  assert.deepEqual(links('fernhill-site'), [{ label: 'fernhill.example', url: 'https://fernhill.example' }, { label: 'host.example panel', url: 'https://panel.host.example' }])
  assert.deepEqual(links('sedum-site2')?.map((l) => l.label), ['sedum.example', 'Hosting panel'])
  const cfg = await loadConfig(), node = cfg.estates[0].nodes.find((n) => n.id === 'fernhill-repo')!
  assert.ok(!('repo' in node) && node.links) // the render config carries the links, not the field
})

test('canEditConfig: always with auth off, with auth on only for a request that has a user; an unreadable auth block means on', () => {
  const req = (user?: string) => ({ get: () => user }) as unknown as Parameters<typeof canEditConfig>[0]
  const text = latestYaml(), put = (auth: string) => db.storeRev(db.latestRev(), `${text}\n${auth}`, 'cli') // authConfig reads the text only
  assert.deepEqual([authConfig().enabled, canEditConfig(req())], [false, true])
  put('auth: { enabled: true, mode: password }')
  assert.deepEqual([authConfig().mode, canEditConfig(req()), canEditConfig(req('owner'))], ['password', false, true])
  assert.equal(authConfig().users.length, 0)
  put('auth: nonsense')
  assert.deepEqual([authConfig().enabled, canEditConfig(req())], [true, false])
  put('auth: { enabled: "yes" }')
  assert.equal(authConfig().enabled, true)
  put('auth: { enabled: false }')
  assert.deepEqual([authConfig().enabled, canEditConfig(req())], [false, true])
})
