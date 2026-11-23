import { loadConfig, loadPositions } from './config'
import { apply } from './apply'
import { computePlan, estimateMs, missing } from './plan'
import { currentRelease } from './store'

// pnpm sg plan | apply
const cmd = process.argv[2]
if (cmd === 'plan') {
  const plan = computePlan(loadConfig(), loadPositions())
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
} else {
  console.error('usage: pnpm sg plan | apply')
  process.exit(2)
}
