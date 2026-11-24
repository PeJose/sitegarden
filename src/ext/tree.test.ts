import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRegistry, type Extension } from './tree'

const ext = (id: string, out: string, order?: number): Extension => ({ id, slot: 'map', input: 'layers', order, render: (_p, c) => `${out}${c ?? ''}` })
const run = (r: ReturnType<typeof createRegistry>, config?: Parameters<typeof r.resolve>[2]) => r.resolve('map', 'layers', config).map((x) => x.render({}))

test('ordered by order, then by registration', () => {
  const r = createRegistry()
  r.add(ext('layer:g:c', 'c', 2)); r.add(ext('layer:g:a', 'a')); r.add(ext('layer:g:b', 'b'))
  assert.deepEqual(run(r), ['a', 'b', 'c'])
})

test('only the asked slot and input', () => {
  const r = createRegistry()
  r.add(ext('layer:g:a', 'a')); r.add({ ...ext('tab:g:t', 't'), slot: 'sidepanel', input: 'tabs' })
  assert.deepEqual(r.resolve('sidepanel', 'tabs').map((x) => x.id), ['tab:g:t'])
})

test('the same ID replaces, keeps its place and is logged with both plugins', () => {
  const r = createRegistry()
  r.add(ext('layer:g:a', 'a')); r.add(ext('layer:g:b', 'b'))
  r.add(ext('layer:g:a', 'A'), 'other')
  assert.deepEqual(run(r), ['A', 'b'])
  assert.deepEqual(r.overrides(), [{ id: 'layer:g:a', replaced: 'g', by: 'other' }])
})

test('a wrap receives the original and survives a replacement', () => {
  const r = createRegistry()
  r.add(ext('layer:g:a', 'a'))
  r.override('layer:g:a', (orig) => (p, c) => `[${String(orig(p, c))}]`)
  assert.deepEqual(run(r), ['[a]'])
  r.add(ext('layer:g:a', 'A'))
  assert.deepEqual(run(r), ['[A]'])
  assert.throws(() => r.override('layer:g:nope', (o) => o))
})

test('disabled is removed and config reaches the render', () => {
  const r = createRegistry()
  r.add(ext('layer:g:a', 'a')); r.add(ext('layer:g:b', 'b'))
  assert.deepEqual(run(r, { 'layer:g:a': { disabled: true }, 'layer:g:b': { config: 7 } }), ['b7'])
})
