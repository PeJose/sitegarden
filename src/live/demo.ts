import { edges } from '../mock/data'
import { live, still } from './store'

// The design's flows (deploys, webhooks, the copperleaf opening scene) for the sample map; statuses stay the server's, a deploy only overlays `working`.
export const NO_DEPLOY = 'Deploys arrive with the GitHub plugin (M2)'
const rnd = (a: number, b: number) => a + Math.random() * (b - a)
const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)]
const deployEdges = () => edges.filter((e) => e.type === 'deploy')
const webhookEdges = () => edges.filter((e) => e.type === 'webhook')
const SCENE_EDGE = 'copperleaf-repo>copperleaf-site' // the design's scene: copperleaf's site is down, a redeploy is on its way
const state = () => live.getState()

let seeded = false
let running = false
const timers = new Set<ReturnType<typeof setTimeout>>()

function setFlow(edgeId: string, kind: 'deploy' | 'webhook' | null) {
  const flows = { ...state().flows }
  if (kind) flows[edgeId] = kind
  else delete flows[edgeId]
  live.set({ flows })
}
// In-flight results always land (so a stop/start can't strand a deploy as 'working').
const later = (ms: number, fn: () => void) => void setTimeout(fn, ms)
function loop(minS: number, maxS: number, fn: () => void) {
  const t = setTimeout(() => {
    timers.delete(t)
    if (!running) return
    fn()
    loop(minS, maxS, fn)
  }, rnd(minS, maxS) * 1000)
  timers.add(t)
}

// Marks a node `working` unless it is down (a down node stays down until the deploy lands).
const overlay = (edgeId: string, on: boolean) => {
  const e = edges.find((x) => x.id === edgeId)!
  live.setWorking([e.from, e.to].filter((id) => !on || live.serverStatus(id) !== 'down'), on)
}

export function deploy(edgeId: string) {
  if (!state().demo || !edges.some((e) => e.id === edgeId) || state().flows[edgeId] === 'deploy') return
  overlay(edgeId, true)
  setFlow(edgeId, 'deploy')
  later(rnd(6, 12) * 1000, () => finishDeploy(edgeId))
}

function finishDeploy(edgeId: string) {
  if (state().flows[edgeId] !== 'deploy') return
  const e = edges.find((x) => x.id === edgeId)!
  const result = Math.random() < 0.85 ? 'ok' : 'failed'
  live.set({ edges: { ...state().edges, [edgeId]: { lastResult: result } } })
  setFlow(edgeId, null)
  overlay(edgeId, false)
  if (result === 'ok') void live.check(e.to)
}

export function webhook(edgeId: string) {
  if (!state().demo || state().flows[edgeId]) return
  setFlow(edgeId, 'webhook')
  later(1800, () => {
    setFlow(edgeId, null)
    live.set({ edges: { ...state().edges, [edgeId]: { lastResult: Math.random() < 0.92 ? 'ok' : 'failed' } } })
  })
}

// Called after every snapshot: only the demo map plays flows (checks are the server's), and `?still=1` keeps just the opening scene (no timers) for screenshots.
export function start() {
  if (!state().demo) return
  if (!seeded && edges.some((e) => e.id === SCENE_EDGE)) {
    seeded = true
    live.set({ flows: { ...state().flows, [SCENE_EDGE]: 'deploy' } })
    if (!still) later(45_000, () => finishDeploy(SCENE_EDGE))
  }
  if (running || still) return
  running = true
  const each = <T,>(xs: () => T[], fn: (x: T) => void) => () => xs().length && fn(pick(xs()))
  loop(35, 60, each(deployEdges, (e) => deploy(e.id)))
  loop(25, 45, each(webhookEdges, (e) => webhook(e.id)))
}
export function stop() {
  running = false
  timers.forEach(clearTimeout)
  timers.clear()
}
