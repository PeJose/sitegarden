import assert from 'node:assert/strict'
import path from 'node:path'
import { test } from 'node:test'
import { ConfigError, parseGraph } from '../../server/core/graph'
import { createHost } from '../../server/core/plugins'

const host = createHost({ baseDir: path.join(import.meta.dirname, '../..') })
await host.load(['./plugins/essentials'])
const parse = (nodes: string) => parseGraph(`world: { seed: s }\ngroups:\n  - { id: g, label: G }\nnodes:\n${nodes}`, 'x.yaml', host.nodeTypes(), host.shorthands())
const labels = (nodes: string) => parse(nodes).nodes[0].links!.map((l) => l.label)

test('repo, sanity with studio, and url give their links', () => {
  assert.deepEqual(labels('  - { id: a, type: repo, group: g, repo: acme/fern.hill_2 }'), ['Actions', 'Settings', 'Secrets', 'Pull requests', 'Issues'])
  const cms = parse('  - { id: a, type: cms, group: g, sanity: ab12cd, studio: fern-hill }').nodes[0].links!
  assert.deepEqual(cms.map((l) => [l.label, l.url]), [
    ['Sanity manage', 'https://www.sanity.io/manage/project/ab12cd'], ['API', 'https://www.sanity.io/manage/project/ab12cd/api'],
    ['Webhooks', 'https://www.sanity.io/manage/project/ab12cd/api#webhooks'], ['Studio', 'https://fern-hill.sanity.studio'],
  ])
  assert.deepEqual(parse('  - { id: a, type: site, group: g, url: "https://fern.example/x" }').nodes[0].links, [{ label: 'fern.example', url: 'https://fern.example/x' }])
})

test('bad values are errors on their line', () => {
  for (const [type, field, bad] of [['repo', 'repo', 'fernhill'], ['repo', 'repo', 'a/b/c'], ['cms', 'sanity', 'Not Valid'], ['cms', 'studio', 'a.b'], ['site', 'url', 'ftp://x.example'], ['site', 'url', 'x.example']]) {
    try { parse(`  - { id: ok, type: db, group: g }\n  - { id: a, type: ${type}, group: g, ${field}: "${bad}" }`); assert.fail(`${field}: ${bad} parsed`) } catch (e) {
      assert.ok(e instanceof ConfigError, String(e))
      assert.deepEqual([e.issues[0].line, e.issues[0].path], [6, `nodes.1.${field}`])
    }
  }
  assert.throws(() => parse('  - { id: a, type: repo, group: g, repo: fernhill }'), /must be owner\/name/)
})
