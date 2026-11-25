import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRegistry, type Extension } from './tree'
import { registerWebPlugins } from './web'
import { defineWebPlugin } from './sdk'

const tab = (id: string): Extension => ({ id, slot: 'sidepanel', input: 'tabs', render: () => id })
const ids = (r: ReturnType<typeof createRegistry>) => r.resolve('sidepanel', 'tabs').map((x) => x.id)

test('only plugins the server reports as loaded register', () => {
  const r = createRegistry()
  registerWebPlugins(r, [defineWebPlugin({ id: 'a', register: (c) => c.add(tab('tab:a:x')) }), defineWebPlugin({ id: 'b', register: (c) => c.add(tab('tab:b:x')) })], ['a'])
  assert.deepEqual(ids(r), ['tab:a:x'])
})

test('ctx.add refuses an id from another plugin; a throwing register leaves nothing behind and the others keep working', () => {
  const r = createRegistry(), errors: unknown[][] = [], log = console.error
  console.error = (...a: unknown[]) => void errors.push(a)
  registerWebPlugins(r, [
    defineWebPlugin({ id: 'a', register: (c) => { c.add(tab('tab:a:one')); c.add(tab('tab:b:stolen')) } }), // second add throws
    defineWebPlugin({ id: 'b', register: (c) => c.add(tab('tab:b:ok')) }),
    defineWebPlugin({ id: 'c', register: (c) => { c.add(tab('tab:c:x')); throw new Error('boom') } }),
  ], ['a', 'b', 'c'])
  console.error = log
  assert.deepEqual(ids(r), ['tab:b:ok'])
  assert.deepEqual(errors.map((e) => e[0]), ['[sitegarden] web plugin a failed', '[sitegarden] web plugin c failed'])
})
