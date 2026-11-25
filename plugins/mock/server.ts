import { definePlugin, type Status } from '../../server/core/sdk'

// Fake results for the sample map: a node's `mock:` block (baseMs, initialStatus) drives them. Tests swap these.
export const env = { random: Math.random, now: Date.now }
const DOWN_MS = 25_000

export default definePlugin({
  id: 'mock',
  register(ctx) {
    const runs = new Map<string, number>() // in memory on purpose: a restart replays the opening scene
    ctx.registerCheckType({
      type: 'mock',
      schema: {},
      run(_cfg, node) {
        const { baseMs = 0, initialStatus = 'ok' } = (node.mock ?? {}) as { baseMs?: number; initialStatus?: Status }
        const n = runs.get(node.id) ?? 0, down = `downUntil:${node.id}`, now = env.now()
        runs.set(node.id, n + 1)
        const timed = (status: 'ok' | 'degraded') => ({ status, ms: Math.round(baseMs * (0.7 + env.random() * 0.8)) })
        if (initialStatus === 'down' ? n < 3 : n === 0) return baseMs && (initialStatus === 'ok' || initialStatus === 'degraded') ? timed(initialStatus) : { status: initialStatus }
        if (!baseMs) return { status: 'ok' as const }
        if (now < Number(ctx.store.kv.get(down) ?? 0)) return { status: 'down' as const }
        const r = env.random()
        if (r < 0.02) { ctx.store.kv.set(down, now + DOWN_MS); return { status: 'down' as const } }
        return timed(r < 0.08 ? 'degraded' : 'ok')
      },
    })
  },
})
