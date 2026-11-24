import fs from 'node:fs'
import path from 'node:path'
import { CONFIG_FILE, loadConfig, loadPositions, schemaJson } from './config'
import { apply } from './apply'
import { computePlan, estimateMs, missing } from './plan'
import { currentRelease } from './store'

// pnpm sg plan | apply | schema
const cmd = process.argv[2]
if (cmd === 'plan') {
  const plan = computePlan(await loadConfig(), loadPositions())
  const cur = currentRelease()
  const old = cur?.estates ?? {}
  const added = Object.keys(plan.estates).filter((id) => !(id in old)), removed = Object.keys(old).filter((id) => !(id in plan.estates))
  const changed = Object.keys(plan.estates).filter((id) => id in old && old[id] !== plan.estates[id])
  const todo = missing(plan)
  const kinds = todo.jobs.reduce<Record<string, number>>((a, j) => ({ ...a, [j.kind]: (a[j.kind] ?? 0) + 1 }), {})
  console.log(`estates: +${added.length}${added.length ? ` (${added.join(', ')})` : ''} ~${changed.length}${changed.length ? ` (${changed.join(', ')})` : ''} -${removed.length}${removed.length ? ` (${removed.join(', ')})` : ''}`)
  console.log(todo.jobs.length || todo.tiles.length
    ? `to render: ${todo.jobs.length} layers (${Object.entries(kinds).map(([k, n]) => `${n} ${k}`).join(', ')}), ${todo.tiles.length} tiles, ~${(estimateMs(todo.jobs, todo.tiles.length) / 1000).toFixed(1)} s`
    : cur?.id === plan.id && cur.complete ? 'nothing to do: the current release matches the config' : 'nothing to render; apply will only publish the release')
} else if (cmd === 'apply') {
  const s = await apply((m) => console.log(`[apply] ${m}`))
  console.log(`[apply] done in ${s.ms} ms, first release after ${s.first} ms, rendered`, s.rendered, `+ ${s.tiles} tiles`)
} else if (cmd === 'schema') {
  const file = path.join(path.dirname(CONFIG_FILE), 'schema.json')
  fs.writeFileSync(file, `${JSON.stringify(await schemaJson(), null, 2)}\n`)
  console.log(`wrote ${file}`)
} else {
  console.error('usage: pnpm sg plan | apply | schema')
  process.exit(2)
}
