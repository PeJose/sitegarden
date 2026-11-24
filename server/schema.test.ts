import assert from 'node:assert/strict'
import path from 'node:path'
import { test } from 'node:test'
import { jsonSchema } from './core/graph'
import { createHost } from './core/plugins'

type Branch = { properties: Record<string, { const?: string; description?: string }> }

test('a plugin fragment field shows up under its node type in the JSON Schema', async () => {
  const host = createHost({ baseDir: path.join(import.meta.dirname, 'core/fixtures') })
  await host.load(['./base'])
  const items = (jsonSchema(host.nodeTypes()) as unknown as { properties: { nodes: { items: { oneOf?: Branch[]; anyOf?: Branch[] } } } }).properties.nodes.items
  const widget = (items.oneOf ?? items.anyOf)!.find((b) => b.properties.type.const === 'widget')!
  assert.equal(widget.properties.color.description, 'Paint colour')
  assert.ok(widget.properties.group && widget.properties.mock)
})

test('the essentials plugin registers the five node types', async () => {
  const host = createHost({ baseDir: path.join(import.meta.dirname, '..') })
  await host.load(['./plugins/essentials'])
  assert.deepEqual(Object.keys(host.nodeTypes()), ['repo', 'cms', 'site', 'job', 'db'])
})
