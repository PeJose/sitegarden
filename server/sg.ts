import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import readline from 'node:readline/promises'

// pnpm sg plan | apply | pull | schema [--server URL] [--yes] [--no-wait] [--local-render] [--force]
// plan/apply/pull talk to a server (SITEGARDEN_SERVER, default http://localhost:8787); the server's latest revision is the state.
const args = process.argv.slice(2), cmd = args[0], flag = (n: string) => args.includes(`--${n}`)
const CONFIG_FILE = path.resolve(process.env.SITEGARDEN_CONFIG ?? path.join(import.meta.dirname, '../sitegarden.yaml'))
const at = args.indexOf('--server')
const server = ((at >= 0 ? args[at + 1] : undefined) ?? process.env.SITEGARDEN_SERVER ?? 'http://localhost:8787').replace(/\/$/, '')

// Local state: the revision this file was last pulled from or applied to, and the hash of the text at that point.
const STATE = path.join(path.dirname(CONFIG_FILE), '.sitegarden/state.json')
const sha = (s: string) => createHash('sha1').update(s).digest('hex')
function state(): { rev: number; base?: string } {
  try { const s = JSON.parse(fs.readFileSync(STATE, 'utf8')); if (s.server === server) return s } catch { /* none yet */ }
  return { rev: 0 } // matches only an empty server
}
function remember(rev: number, yaml: string) {
  fs.mkdirSync(path.dirname(STATE), { recursive: true })
  fs.writeFileSync(STATE, JSON.stringify({ server, rev, base: sha(yaml) }))
}

const die = (code: number, msg: string): never => { console.error(msg); process.exit(code) }
async function call(p: string, body?: unknown) {
  const r = await fetch(server + p, body === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch((e: Error) => die(1, `cannot reach ${server}: ${e.cause ?? e.message}`))
  const out = { status: r.status, body: (await r.json().catch(() => ({}))) as any }
  if (out.status === 409 && out.body.error === 'drift') die(3, `server is at rev ${out.body.rev}, you are based on rev ${state().rev}: run sg pull`)
  if (out.status === 422 || (out.status === 200 && out.body.ok === false)) {
    for (const i of out.body.issues) console.error(`${path.basename(CONFIG_FILE)}:${i.line}${i.path ? ` ${i.path}` : ''}: ${i.message}`)
    process.exit(1)
  }
  return out.status === 200 ? out.body : die(1, `${server}${p}: ${out.status} ${out.body.error ?? ''}`)
}

async function plan() {
  const yaml = fs.readFileSync(CONFIG_FILE, 'utf8'), p = await call('/api/plan', { yaml, baseRev: state().rev })
  console.log(`server ${server} at rev ${p.rev}`)
  for (const w of p.warnings ?? []) console.log(`warning: ${w.message}`)
  for (const d of p.diff) console.log(`${d.op} ${d.kind} ${d.id}`)
  if (!p.diff.length) console.log('no changes')
  const { jobs, tiles, ms } = p.render
  console.log(jobs || tiles ? `to render: ${jobs} layers, ${tiles} tiles, ~${(ms / 1000).toFixed(1)} s` : 'nothing to render')
  return { yaml, p }
}

// Follows the event stream (progress lines) until the release for this plan is complete.
async function release(id: string, ctl: AbortController) {
  const done = async () => { const r = (await (await fetch(`${server}/api/release`)).json().catch(() => null)) as { id?: string; complete?: boolean } | null; return r?.id === id && !!r.complete }
  const res = await fetch(`${server}/api/events`, { signal: ctl.signal })
  return { done, wait: async (rev: number) => { // the stream replays stored events first, so progress is filtered by rev
    let buf = ''
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      buf += Buffer.from(chunk).toString()
      for (let i = buf.indexOf('\n\n'); i >= 0; i = buf.indexOf('\n\n')) {
        const frame = buf.slice(0, i); buf = buf.slice(i + 2)
        const ev = /^event: (.*)$/m.exec(frame)?.[1], data = /^data: (.*)$/m.exec(frame)?.[1]
        if (ev === 'apply.progress') { const p = JSON.parse(data!); if (p.rev === rev) console.log(`[apply] ${p.done}/${p.total} tiles`) }
        if (ev === 'apply.failed') { const p = JSON.parse(data!); if (p.rev === rev) die(1, `apply failed on the server: ${p.message}`) }
        if (ev === 'release' && await done()) return
      }
    }
  } }
}

// --local-render renders in a scratch DATA dir here; the pipeline is imported only after DATA is set, and only on this path.
async function localRenderer() {
  const s = await call('/api/state'), tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-render-'))
  process.env.SITEGARDEN_DATA = tmp
  process.on('exit', () => fs.rmSync(tmp, { recursive: true, force: true }))
  const [{ RENDERER, art }, { loadGraph, toRenderConfig }, { computePlan }, { renderTiles }] = await Promise.all([import('./store'), import('./config'), import('./plan'), import('./apply')])
  if (RENDERER !== s.renderer) die(1, `renderer mismatch: server has ${s.renderer}, this machine ${RENDERER}: nothing was uploaded`)
  // Renders the tiles the server lacks and uploads them; returns the positions the plan was made with.
  return async (yaml: string) => {
    const plan = computePlan(toRenderConfig(await loadGraph(yaml)), s.positions), names = [...new Set(plan.tiles.map((t) => t.name))]
    const miss = new Set((await call('/api/artifacts/missing', { names })).missing as string[]), todo = [...new Map(plan.tiles.filter((t) => miss.has(t.name)).map((t) => [t.name, t])).values()]
    console.log(`rendering ${todo.length} of ${names.length} tiles here`)
    await renderTiles(plan, todo)
    const put = async (n: string) => { const r = await fetch(`${server}/a/${n}`, { method: 'PUT', body: fs.readFileSync(art(n)) }); if (!r.ok) die(1, `upload of ${n} failed: ${r.status}`) }
    for (let i = 0; i < todo.length; i += 8) await Promise.all(todo.slice(i, i + 8).map((t) => put(t.name)))
    console.log(`uploaded ${todo.length} tiles`)
    return plan.world.positions
  }
}

if (cmd === 'plan') {
  await plan()
} else if (cmd === 'apply') {
  const render = flag('local-render') ? await localRenderer() : null // first: a renderer mismatch stops everything
  const { yaml, p } = await plan()
  if (!flag('yes') && (p.diff.length || p.render.tiles)) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout }), a = await rl.question('Apply? [y/N] ')
    rl.close()
    if (!/^y(es)?$/i.test(a.trim())) die(1, 'aborted')
  }
  const ctl = new AbortController(), rel = flag('no-wait') ? null : await release(p.release, ctl)
  const positions = await render?.(yaml)
  const r = await call('/api/apply', { yaml, baseRev: p.rev, planId: p.planId, render: render ? 'client' : 'server', positions })
  if (r.unchanged) console.log(`no changes, server stays at rev ${r.rev}`)
  else {
    remember(r.rev, yaml)
    console.log(p.diff.length ? `applied as rev ${r.rev}` : `no graph changes, text changed: stored as rev ${r.rev}`)
    if (rel && !(await rel.done())) await rel.wait(r.rev)
    console.log(rel ? 'release published' : 'rendering on the server')
  }
  ctl.abort()
} else if (cmd === 'pull') {
  const s = await call('/api/state'), st = state(), local = fs.existsSync(CONFIG_FILE) ? fs.readFileSync(CONFIG_FILE, 'utf8') : null
  if (local !== null && local !== s.yaml && !flag('force') && (st.base ? sha(local) !== st.base : true)) die(1, `${path.basename(CONFIG_FILE)} has changes that were never applied: sg apply them, or pull with --force`)
  fs.writeFileSync(CONFIG_FILE, s.yaml)
  remember(s.rev, s.yaml)
  console.log(`pulled rev ${s.rev} into ${CONFIG_FILE}`)
} else if (cmd === 'schema') {
  const { schemaJson } = await import('./config')
  const file = path.join(path.dirname(CONFIG_FILE), 'schema.json')
  fs.writeFileSync(file, `${JSON.stringify(await schemaJson(), null, 2)}\n`)
  console.log(`wrote ${file}`)
} else {
  die(2, 'usage: pnpm sg plan | apply | pull | schema [--server URL] [--yes] [--no-wait] [--local-render] [--force]')
}
process.exit(0)
