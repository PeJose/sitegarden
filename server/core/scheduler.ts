import type { Db } from './db'
import type { CheckDef, CheckNode, Status } from './sdk'

const UNITS: Record<string, number> = { s: 1e3, m: 6e4, h: 36e5, d: 864e5 }
export function parseEvery(v: string): number {
  const m = /^(\d+)([smhd])$/.exec(v)
  if (!m || !Number(m[1])) throw new Error(`bad interval "${v}" (use 30s, 5m, 1h or 1d)`)
  return Number(m[1]) * UNITS[m[2]]
}

// Worst first: a node shows the most urgent of its checks.
const WORST: Status[] = ['down', 'degraded', 'working', 'unknown', 'paused', 'ok']
const worst = (s: Iterable<Status>) => [...s].sort((a, b) => WORST.indexOf(a) - WORST.indexOf(b))[0]

export interface Timers { set(f: () => void, ms: number): () => void }
const realTimers: Timers = { set: (f, ms) => { const t = setTimeout(f, ms); t.unref(); return () => clearTimeout(t) } }
export interface SchedulerOptions { db: Db; emit: (type: string, data: unknown) => void; limit?: number; now?: () => number; random?: () => number; timers?: Timers }

interface Inst { key: string; check: CheckDef; node: CheckNode; every: number; fails: number; cancel?: () => void; queued: boolean }

// One timer per (check, node). First run lands anywhere in the first interval, later ones every ±10 %; a `down` result backs off 2^n up to 4x.
export function createScheduler({ db, emit, limit = 4, random = Math.random, timers = realTimers }: SchedulerOptions) {
  const insts = new Map<string, Inst>(), queue: Inst[] = [], status = new Map<string, Status>() // status: instance key -> last result
  let active = 0, stopped = false
  for (const s of db.snapshots()) status.set(`${s.check_id}@${s.node}`, s.status as Status)
  const nodeStatus = new Map<string, Status>()

  const arm = (i: Inst, ms: number) => { i.cancel?.(); i.cancel = timers.set(() => { i.cancel = undefined; enqueue(i) }, ms) }
  const next = (i: Inst) => i.fails ? Math.min(i.every * 2 ** i.fails, 4 * i.every) : i.every * (1 + (random() * 2 - 1) * 0.1)

  function enqueue(i: Inst) {
    if (stopped || i.queued) return
    i.queued = true
    queue.push(i)
    pump()
  }
  function pump() {
    while (active < limit && queue.length) {
      const i = queue.shift()!
      active++
      void run(i).finally(() => { active--; pump() })
    }
  }
  async function run(i: Inst) {
    let res: { status: Status; detail?: string }
    try { res = await i.check.run(i.node) } catch (e) { res = { status: 'down', detail: (e as Error).message } }
    i.queued = false
    if (stopped || insts.get(i.key) !== i) return
    i.fails = res.status === 'down' ? i.fails + 1 : 0
    db.saveSnapshot(i.node.id, i.check.id, res.status, res.detail)
    status.set(i.key, res.status)
    emit('check.result', { node: i.node.id, check: i.check.id, status: res.status, detail: res.detail })
    const own = [...insts.values()].filter((x) => x.node.id === i.node.id && status.has(x.key)).map((x) => status.get(x.key)!), now = worst(own)
    if (nodeStatus.get(i.node.id) !== now) { emit('node.status', { node: i.node.id, status: now, from: nodeStatus.get(i.node.id) }); nodeStatus.set(i.node.id, now) }
    arm(i, next(i))
  }

  return {
    // Replaces the set of running checks; an instance that is still there keeps its backoff state.
    set(nodes: CheckNode[], checks: CheckDef[]) {
      const keep = new Map<string, Inst>()
      for (const c of checks) for (const n of nodes) {
        if (c.nodeTypes && !c.nodeTypes.includes(n.type)) continue
        const key = `${c.id}@${n.id}`, old = insts.get(key), every = parseEvery(c.every)
        if (old && old.every === every) { old.check = c; old.node = n; keep.set(key, old); continue }
        const i: Inst = { key, check: c, node: n, every, fails: 0, queued: false }
        keep.set(key, i)
        arm(i, random() * every)
      }
      for (const [k, i] of insts) if (keep.get(k) !== i) { i.cancel?.(); status.delete(k) }
      insts.clear()
      keep.forEach((v, k) => insts.set(k, v))
    },
    // Runs the matching checks now, backoff or not, still through the concurrency limit. Returns how many were queued.
    refresh(node?: string) {
      const hit = [...insts.values()].filter((i) => !node || i.node.id === node)
      hit.forEach((i) => { i.cancel?.(); i.cancel = undefined; enqueue(i) })
      return hit.length
    },
    stop() { stopped = true; insts.forEach((i) => i.cancel?.()); queue.length = 0 },
  }
}
export type Scheduler = ReturnType<typeof createScheduler>
