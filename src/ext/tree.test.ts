import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createRegistry, type Extension } from './tree'

const ext = (id: string, out: string, order?: number): Extension => ({ id, slot: 'map', input: 'layers', order, render: (_p, c) => `${out}${c ?? ''}` })
// What React does around a boundary, minus the DOM: render the child; if it throws, let the boundary class turn the error into its fallback.
const show = (el: unknown) => {
  const b = el as ReactElement<{ children: ReactElement }> & { type: { getDerivedStateFromError: (e: unknown) => object } }
  try { return renderToStaticMarkup(b.props.children) } catch (e) {
    const inst = new (b.type as unknown as new (p: unknown) => { state: object; render(): unknown })(b.props)
    inst.state = b.type.getDerivedStateFromError(e)
    return renderToStaticMarkup(createElement('div', null, inst.render() as ReactElement))
  }
}
const run = (r: ReturnType<typeof createRegistry>, config?: Parameters<typeof r.resolve>[2]) => r.resolve('map', 'layers', config).map((x) => show(x.render({})))

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

test('a throwing extension becomes a failure card with its id; the others still render and nothing throws at resolve', () => {
  const r = createRegistry(), tab = (id: string, render: Extension['render']): Extension => ({ id, slot: 'sidepanel', input: 'tabs', render })
  r.add(tab('tab:g:a', () => 'a')); r.add(tab('tab:bad:x', () => { throw new Error('boom') })); r.add(tab('tab:g:b', () => 'b'))
  const els = r.resolve('sidepanel', 'tabs').map((x) => x.render({})) // no throw here: the render runs inside the boundary
  const out = els.map(show)
  assert.equal(out[0], 'a'); assert.equal(out[2], 'b')
  assert.match(out[1], /class="ext-failed"/); assert.match(out[1], /tab:bad:x/); assert.match(out[1], /failed/)
})
