// Measures the production build in system Chrome (real GPU). See perf/README.md.
// pnpm perf [--label x] [--url http://localhost:4173] [--out perf/out] [--baseline perf/baseline] [--only pan,zoom] [--dpr 2]
import { chromium, type Browser, type Page } from 'playwright-core'
import { execSync } from 'node:child_process'
import { appendFileSync, mkdirSync } from 'node:fs'
import os from 'node:os'
import sharp from 'sharp'

const arg = (k: string, d = '') => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1] }
const base = arg('url', 'http://localhost:4173')
const out = arg('out', 'perf/out')
const dpr = +arg('dpr', '1') || 1 // retina = 2; the screenshot diff only applies at dpr 1 (baseline size)
const baseline = process.argv.includes('--baseline') && dpr === 1 ? arg('baseline') : ''
const label = arg('label', 'run')
const W = 1440, H = 900
const MEAN_MAX = 0.5, OVER_MAX = 2 // screenshot diff thresholds: mean abs diff %, % of channel values differing by > 16/255
const scenarios: Record<string, { q: string; kind: 'idle' | 'pan' | 'zoom' | 'fly' | 'hidden' | 'reduced'; warm?: boolean; cpu?: number; shot?: boolean }> = {
  light: { q: '', kind: 'idle' },
  night: { q: '?theme=night', kind: 'idle' },
  'light-still': { q: '?still=1', kind: 'idle', shot: true },
  'night-still': { q: '?theme=night&still=1', kind: 'idle', shot: true },
  hidden: { q: '', kind: 'hidden' }, // tab in the background for 5 s: frames, GPU and timers should be ~0
  reduced: { q: '?still=1', kind: 'reduced' }, // prefers-reduced-motion: reduce, 5 s: no running animation, GPU at the static floor
  pan: { q: '', kind: 'pan' },
  zoom: { q: '', kind: 'zoom' },
  'pan-4x': { q: '', kind: 'pan', cpu: 4 },
  'zoom-4x': { q: '', kind: 'zoom', cpu: 4 },
  fly: { q: '', kind: 'fly' }, // cold cache: first click on the last sidebar plot
  'fly-warm': { q: '', kind: 'fly', warm: true }, // after one flight: click another plot, then back
}
// default run keeps the non-fly scenarios; fly scenarios run with --only fly,fly-warm
const only = arg('only')
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Page-side counters, injected so app code stays untouched. A string, because tsx adds __name helpers that do not exist in the page.
const init = `window.__frames = 0; window.__timers = 0; window.__lt = []; window.__gaps = []
for (const n of ['setTimeout', 'setInterval']) { const o = window[n].bind(window); window[n] = (f, ...a) => typeof f === 'function' ? o((...x) => { window.__timers++; return f(...x) }, ...a) : o(f, ...a) }
let last = performance.now()
const tick = (t) => { window.__frames++; window.__gaps.push(Math.round(t - last)); last = t; requestAnimationFrame(tick) }
requestAnimationFrame(tick)
new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__lt.push(Math.round(e.duration)))).observe({ type: 'longtask', buffered: true })`
const counters = (p: Page) => p.evaluate(() => { const w = window as unknown as { __frames: number; __timers: number; __lt: number[] }; return { frames: w.__frames, timers: w.__timers, lt: w.__lt.length } })

// Sum of top-level (non-nested) trace events whose name matches, in ms.
type Ev = { name: string; ph: string; ts: number; dur?: number; tid: number; args?: { data?: { clip?: number[] } } }
const topMs = (evs: Ev[], re: RegExp) => {
  let end = new Map<number, number>(), sum = 0
  for (const e of evs.filter((e) => e.ph === 'X' && re.test(e.name)).sort((a, b) => a.ts - b.ts)) {
    if (e.ts < (end.get(e.tid) ?? 0)) continue
    end.set(e.tid, e.ts + (e.dur ?? 0)); sum += (e.dur ?? 0) / 1000
  }
  return Math.round(sum)
}
const quadArea = (c: number[]) => Math.abs((c[2] - c[0]) * (c[5] - c[1]))

// Headless first (no window in the user's way); if Chrome then has no hardware GPU, headed but off-screen and not throttled.
const gpuInfo = async (b: Browser) => { const i = (await (await b.newBrowserCDPSession()).send('SystemInfo.getInfo')) as { gpu: { devices: { deviceString: string }[]; auxAttributes?: { glRenderer?: string } } }; return `${i.gpu.devices.map((d) => d.deviceString).join(', ')} / ${i.gpu.auxAttributes?.glRenderer ?? '?'}` }
let mode = 'headless'
let browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
let gpu = await gpuInfo(browser)
if (/swiftshader|software|llvmpipe/i.test(gpu) || !gpu.trim()) {
  await browser.close(); mode = 'headed, off-screen'
  browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--window-position=-10000,-10000', '--window-size=1440,900', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'] })
  gpu = await gpuInfo(browser)
}
console.log(JSON.stringify({ mode, gpu }))
const chrome = browser.version()
const bcdp = await browser.newBrowserCDPSession()
const gpuCpu = async () => ((await bcdp.send('SystemInfo.getProcessInfo')) as { processInfo: { type: string; cpuTime: number }[] }).processInfo.filter((p) => p.type === 'GPU').reduce((a, p) => a + p.cpuTime, 0)

const lines: string[] = []
let failed = false
mkdirSync(out, { recursive: true })
for (const [name, s] of Object.entries(scenarios)) {
  if (only ? !only.split(',').includes(name) : s.kind === 'fly') continue
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, serviceWorkers: 'block', deviceScaleFactor: dpr }) // fresh and cold every time
  await ctx.addInitScript({ content: init })
  const page = await ctx.newPage()
  if (s.kind === 'reduced') await page.emulateMedia({ reducedMotion: 'reduce' })
  const cdp = await ctx.newCDPSession(page)
  await cdp.send('Network.enable')
  const urls = new Map<string, string>(), sizes = new Map<string, number>()
  let tileReqs = 0
  const tileUrls: string[] = []
  cdp.on('Network.requestWillBeSent', (e) => { urls.set(e.requestId, e.request.url); if (/\/a\/.*tile-/.test(e.request.url)) { tileReqs++; tileUrls.push(new URL(e.request.url).pathname) } })
  cdp.on('Network.loadingFinished', (e) => sizes.set(urls.get(e.requestId) ?? e.requestId, (sizes.get(urls.get(e.requestId) ?? e.requestId) ?? 0) + e.encodedDataLength))
  await page.goto(base + '/' + s.q)
  await page.waitForFunction(() => (window as unknown as { __perf?: unknown }).__perf, null, { timeout: 120_000 }) // set 300 ms after the tiles-visible mark
  await sleep(1500)
  const load = await page.evaluate(() => (window as unknown as { __perf: Record<string, number> }).__perf)
  const sum = (re?: RegExp) => [...sizes].filter(([u]) => !re || re.test(u)).reduce((a, [, b]) => a + b, 0)
  const bytes = { total: sum(), texture: sum(/layer-texture/), tiles: sum(/tile-/), js: sum(/\.js/) }
  const zoom = await page.evaluate(() => +(/scale\(([\d.]+)\)/.exec(document.querySelector<HTMLElement>('.react-flow__viewport')?.style.transform ?? '')?.[1] ?? 0))
  if (s.cpu) await cdp.send('Emulation.setCPUThrottlingRate', { rate: s.cpu })

  const rows = await page.locator('.estates .estate').count()
  if (s.kind === 'fly') {
    if (rows < 3) throw new Error('fly needs 3 sidebar plots')
    if (s.warm) { await page.locator('.estates .estate').nth(0).click(); await sleep(3000) } // one flight done, untimed
  }
  await browser.startTracing(page, { categories: s.kind === 'fly' ? ['devtools.timeline', 'disabled-by-default-devtools.timeline'] : ['devtools.timeline'] })
  const reqs0 = tileReqs, urls0 = tileUrls.length
  const [c0, g0, t0] = [await counters(page), await gpuCpu(), Date.now()]
  const cx = W / 2, cy = H / 2
  let extra = {}
  if (s.kind === 'hidden') {
    // Headless Chrome is always visible (bringToFront / minimize do not hide it, headed is not allowed here), so fake the page-side signal the app listens to.
    await page.evaluate("Object.defineProperty(document, 'hidden', { get: () => true }); Object.defineProperty(document, 'visibilityState', { get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange'))")
    await sleep(500)
    const hid = await page.evaluate(() => document.hidden)
    await sleep(5000)
    const running = await page.evaluate("document.getAnimations().filter((a) => a.playState === 'running').length")
    extra = { hidden: hid, running }
  } else if (s.kind === 'reduced') {
    await sleep(5000)
    extra = { running: await page.evaluate("document.getAnimations().filter((a) => a.playState === 'running').length") }
  } else if (s.kind === 'idle') await sleep(10_000)
  else if (s.kind === 'fly') for (const i of s.warm ? [1, 0] : [rows - 1]) { await page.locator('.estates .estate').nth(i).click(); await sleep(1500) }
  else if (s.kind === 'pan') {
    await page.mouse.move(cx, cy); await page.mouse.down()
    for (const t0 = Date.now(); Date.now() - t0 < 3000;) { const a = (Date.now() - t0) / 3000 * 4 * Math.PI; await page.mouse.move(cx + 250 * Math.sin(a), cy + 150 * Math.sin(2 * a)) }
    await page.mouse.up()
  } else {
    await page.mouse.move(cx, cy)
    for (let i = 0; Date.now() - t0 < 3000; i++) { await page.mouse.wheel(0, i % 40 < 20 ? -60 : 60); await sleep(16) } // in, then out
  }
  const [c1, g1, secs] = [await counters(page), await gpuCpu(), (Date.now() - t0) / 1000]
  const trace = JSON.parse((await browser.stopTracing()).toString()) as { traceEvents: Ev[] }
  const evs = trace.traceEvents
  const mainTid = (evs as (Ev & { args?: { name?: string } })[]).find((e) => e.name === 'thread_name' && e.args?.name === 'CrRendererMain')?.tid
  const paints = evs.filter((e) => e.name === 'Paint' && e.args?.data?.clip)
  const gaps = await page.evaluate((n) => (window as unknown as { __gaps: number[] }).__gaps.slice(n), c0.frames)
  const lt = await page.evaluate((n) => (window as unknown as { __lt: number[] }).__lt.slice(n), c0.lt)
  // tile requests in the window for tiles that are not on screen at the end: travel tiles of a flight (or tiles that scrolled out again)
  const final = new Set(await page.evaluate(() => [...document.querySelectorAll<HTMLImageElement>('img.tile')].map((i) => new URL(i.src).pathname)))
  const tileReqsOff = tileUrls.slice(urls0).filter((u) => !final.has(u)).length
  const r = {
    scenario: name, zoom, loadMs: load.tilesVisible, bytes,
    gpuPct: +(((g1 - g0) / secs) * 100).toFixed(1),
    fps: +((c1.frames - c0.frames) / secs).toFixed(1), frames: c1.frames - c0.frames, timers: c1.timers - c0.timers, ...extra,
    paints: paints.length, paintAreaMpx: +(paints.reduce((a, e) => a + quadArea(e.args!.data!.clip!), 0) / 1e6).toFixed(2), maxPaintMpx: +(Math.max(0, ...paints.map((e) => quadArea(e.args!.data!.clip!))) / 1e6).toFixed(2),
    maxFrameMs: Math.max(0, ...gaps), slowFrames: gaps.filter((g) => g > 25).length,
    longTasks: lt.length, longTaskMs: lt.reduce((a, b) => a + b, 0), maxLongTask: Math.max(0, ...lt),
    tileReqs: tileReqs - reqs0, tileReqsOff,
    ms: { style: topMs(evs, /^UpdateLayoutTree$/), layout: topMs(evs, /^Layout$/), script: topMs(evs, /^(FunctionCall|EvaluateScript)$/), paint: topMs(evs, /^Paint$/), decode: topMs(evs.filter((e) => e.tid === mainTid), /^Decode/), decodeAllThreads: Math.round(evs.filter((e) => e.ph === 'X' && e.name === 'ImageDecodeTask').reduce((a, e) => a + (e.dur ?? 0) / 1000, 0)) },
  }
  console.log(JSON.stringify(r)); lines.push(JSON.stringify(r))

  if (s.shot) {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
    await page.screenshot({ path: `${out}/${name}.png` })
    if (baseline) {
      const [a, b] = await Promise.all([`${out}/${name}.png`, `${baseline}/${name}.png`].map((f) => sharp(f).removeAlpha().raw().toBuffer()))
      let sumD = 0, over = 0
      for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); sumD += d; if (d > 16) over++ }
      const mean = +((sumD / a.length / 255) * 100).toFixed(3), pct = +((over / a.length) * 100).toFixed(3)
      const bad = a.length !== b.length || mean > MEAN_MAX || pct > OVER_MAX
      console.log(JSON.stringify({ diff: name, meanPct: mean, overPct: pct, ok: !bad })); failed ||= bad
    }
  }
  await ctx.close()
}
await browser.close()

if (lines.length) {
  const git = (c: string) => { try { return execSync(`git ${c}`, { encoding: 'utf8' }).trim() } catch { return '?' } }
  const dirty = git('status --porcelain -- src server') ? ' (dirty)' : ''
  appendFileSync('perf/results.md', `\n## ${new Date().toISOString().slice(0, 10)} ${label}\n\ncommit ${git('rev-parse --short HEAD')}${dirty} · ${chrome} · ${os.cpus()[0].model} · ${W}x${H} dpr ${dpr} · ${mode} · GPU ${gpu}\n\n\`\`\`json\n${lines.join('\n')}\n\`\`\`\n`)
}
if (failed) { console.error('screenshot diff over threshold'); process.exit(1) }
