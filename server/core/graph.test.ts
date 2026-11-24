import assert from 'node:assert/strict'
import { test } from 'node:test'
import { z } from 'zod'
import { ConfigError, diffGraphs, parseGraph, type NodeTypes } from './graph'

const types: NodeTypes = { repo: {}, site: { url: z.url().optional() } }
const ok = `world: { seed: s }
groups:
  - { id: g, label: G }
nodes:
  - { id: a, type: repo, group: g }
  - { id: b, type: site, group: g }
edges:
  - { from: a, to: b, type: deploy }
`
const lines = (text: string) => { try { parseGraph(text, 'x.yaml', types) } catch (e) { return (e as ConfigError).issues } throw new Error('parsed') }

test('a valid config gives the graph', () => {
  const g = parseGraph(ok, 'x.yaml', types)
  assert.deepEqual([g.groups.length, g.nodes.length, g.edges.length, g.plugins], [1, 2, 1, []])
})

test('duplicate id reports the second one', () => {
  const [i] = lines(ok.replace('id: b', 'id: a'))
  assert.equal(i.line, 6)
  assert.match(i.message, /duplicate node id "a"/)
})

test('edge to a missing node names its line and the id', () => {
  const [i] = lines(ok.replace('to: b', 'to: nowhere'))
  assert.equal(i.line, 8)
  assert.match(i.message, /"nowhere"/)
})

test('node in a missing group', () => {
  const [i] = lines(ok.replace('group: g }\n  - { id: b', 'group: x }\n  - { id: b'))
  assert.equal(i.line, 5)
  assert.match(i.message, /group "x"/)
})

test('unknown node type lists the known ones', () => {
  const [i] = lines(ok.replace('type: site', 'type: spaceship'))
  assert.equal(i.line, 6)
  assert.match(i.message, /spaceship.*known: repo, site/)
})

test('a bad field reports its own line', () => {
  const [i] = lines(ok.replace('{ id: b, type: site, group: g }', '{ id: b, type: site, group: g, url: nope }'))
  assert.equal(i.line, 6)
  assert.equal(i.path, 'nodes.1.url')
})

test('a missing field falls back to the parent line', () => {
  const [i] = lines(ok.replace(', group: g }\n  - { id: b', ' }\n  - { id: b'))
  assert.equal(i.line, 5)
  assert.equal(i.path, 'nodes.0.group')
})

test('the old estates shape gets the migration message', () => {
  assert.match(lines('accountSeed: a\nestates: []\n')[0].message, /old `estates:` shape, see CHANGELOG 0.2.0/)
})

test('an edge across groups is rejected at its line', () => {
  const [i] = lines(ok.replace('{ id: g, label: G }', '{ id: g, label: G }\n  - { id: h, label: H }').replace('{ id: b, type: site, group: g }', '{ id: b, type: site, group: h }'))
  assert.equal(i.line, 9)
  assert.match(i.message, /crosses groups/)
})

test('an unknown node field is rejected at its node line', () => {
  const [i] = lines(ok.replace('{ id: b, type: site, group: g }', '{ id: b, type: site, group: g, urll: x }'))
  assert.equal(i.line, 6)
  assert.match(i.message, /urll/)
})

test('a secret reference must be declared, and the error carries the line of the field', () => {
  const ref = ok.replace('{ id: b, type: site, group: g }', '{ id: b, type: site, group: g, notes: "x ${secret:TOKEN_A} y" }')
  const [i] = lines(ref)
  assert.deepEqual([i.line, i.path, i.message], [6, 'nodes.1.notes', 'secret TOKEN_A is not declared under secrets:'])
  assert.equal(parseGraph('secrets:\n  TOKEN_A: { expires: "2027-01-01" }\n' + ref, 'x.yaml', types).secrets.TOKEN_A.expires, '2027-01-01')
  assert.match(lines('secrets:\n  lower: {}\n' + ok)[0].path, /^secrets/)
})

test('a diff lists added, changed and removed items by kind', () => {
  const g = (t: string) => parseGraph(t, 'x.yaml', types)
  assert.deepEqual(diffGraphs(g(ok), g(ok)), [])
  const next = g(ok.replace('{ id: b, type: site, group: g }', '{ group: g, type: site, id: b, host: h }\n  - { id: c, type: repo, group: g }').replace('type: deploy', 'type: sync'))
  assert.deepEqual(diffGraphs(g(ok), next), [
    { kind: 'node', op: '~', id: 'b' }, { kind: 'node', op: '+', id: 'c' },
    { kind: 'edge', op: '+', id: 'a>b:sync' }, { kind: 'edge', op: '-', id: 'a>b:deploy' },
  ])
})
