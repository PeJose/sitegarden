import assert from 'node:assert/strict'
import { test } from 'node:test'
import { z } from 'zod'
import { ConfigError, diffGraphs, parseGraph, type NodeTypes } from './graph'
import type { CheckTypeDef, ShorthandDef } from './sdk'

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

const gh: ShorthandDef = { nodeType: 'repo', field: 'repo', schema: z.string().regex(/^[\w.-]+\/[\w.-]+$/, 'must be owner/name'), links: (v) => ['Actions', 'Issues'].map((label) => ({ label, url: `https://github.com/${v}/${label.toLowerCase()}` })) }
const repoTypes: NodeTypes = { repo: { repo: gh.schema.optional() } }
const withRepo = (extra: string) => `world: { seed: s }\ngroups:\n  - { id: g, label: G }\nnodes:\n  - { id: a, type: repo, group: g, ${extra} }\n`

test('a shorthand adds its links before the explicit ones; an explicit link with the same label replaces the generated one', () => {
  const links = (extra: string) => parseGraph(withRepo(extra), 'x.yaml', repoTypes, [gh]).nodes[0].links
  assert.deepEqual(links('repo: acme/fern'), [{ label: 'Actions', url: 'https://github.com/acme/fern/actions' }, { label: 'Issues', url: 'https://github.com/acme/fern/issues' }])
  assert.deepEqual(links('repo: acme/fern, links: [{ label: Issues, url: "https://x.example/i" }, { label: Docs, url: "https://x.example/d" }]'), [
    { label: 'Actions', url: 'https://github.com/acme/fern/actions' }, { label: 'Issues', url: 'https://x.example/i' }, { label: 'Docs', url: 'https://x.example/d' },
  ])
  assert.equal(parseGraph(withRepo('name: n'), 'x.yaml', repoTypes, [gh]).nodes[0].links, undefined)
})

test('a bad shorthand value is an error on its line with the field schema message', () => {
  try { parseGraph(withRepo('repo: fernhill'), 'x.yaml', repoTypes, [gh]); assert.fail('parsed') } catch (e) {
    const [i] = (e as ConfigError).issues
    assert.deepEqual([i.line, i.path, i.message], [5, 'nodes.0.repo', 'must be owner/name'])
  }
})

const ping: CheckTypeDef = { type: 'ping', schema: { host: z.string().optional() }, run: () => ({ status: 'ok' }) }
const checked = (extra: string) => `world: { seed: s }\ngroups:\n  - { id: g, label: G }\nnodes:\n  - { id: a, type: repo, group: g, checks: [${extra}] }\n`

test('checks entries are validated against their type with the line, and every defaults to 5m', () => {
  const g = parseGraph(checked('{ type: ping, host: x }, { type: ping, every: 30s }'), 'x.yaml', { repo: {} }, [], [ping])
  assert.deepEqual((g.nodes[0] as { checks: unknown[] }).checks, [{ type: 'ping', host: 'x', every: '5m' }, { type: 'ping', every: '30s' }])
  const bad = (extra: string) => { try { parseGraph(checked(extra), 'x.yaml', { repo: {} }, [], [ping]) } catch (e) { return (e as ConfigError).issues[0] } throw new Error('parsed') }
  assert.deepEqual([bad('{ type: pong }').line, bad('{ type: pong }').message], [5, 'unknown check type "pong", known: ping'])
  assert.match(bad('{ type: ping, every: soon }').message, /bad interval/)
  assert.match(bad('{ type: ping, hots: x }').message, /hots/)
  assert.deepEqual((parseGraph(checked(''), 'x.yaml', { repo: {} }).nodes[0] as { checks: unknown[] }).checks, [])
})
