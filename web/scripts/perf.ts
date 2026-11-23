// Measures the production build in system Chrome (real GPU). See perf/README.md.
// pnpm perf [--label x] [--url http://localhost:4173] [--out perf/out] [--baseline perf/baseline] [--only pan,zoom]
import { chromium, type Browser, type Page } from 'playwright-core'
import { execSync } from 'node:child_process'
import { appendFileSync, mkdirSync } from 'node:fs'
import os from 'node:os'
import sharp from 'sharp'

const arg = (k: string, d = '') => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1] }
const base = arg('url', 'http://localhost:4173')
const out = arg('out', 'perf/out')
const baseline = process.argv.includes('--baseline') ? arg('baseline') : ''
const label = arg('label', 'run')
const W = 1440, H = 900
const MEAN_MAX = 0.5, OVER_MAX = 2 // screenshot diff thresholds: mean abs diff %, % of channel values differing by > 16/255
const scenarios: Record<string, { q: string; kind: 'idle' | 'pan' | 'zoom'; cpu?: number; shot?: boolean }> = {
  light: { q: '', kind: 'idle' },
  night: { q: '?theme=night', kind: 'idle' },
  'light-still': { q: '?still=1', kind: 'idle', shot: true },
  'night-still': { q: '?theme=night&still=1', kind: 'idle', shot: true },
  pan: { q: '', kind: 'pan' },
  zoom: { q: '', kind: 'zoom' },
  'pan-4x': { q: '', kind: 'pan', cpu: 4 },
}
const only = arg('only')
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Page-side counters, injected so app code stays untouched. A string, because tsx adds __name helpers that do not exist in the page.
const init = `window.__frames = 0; window.__lt = []
const tick = () => { window.__frames++; requestAnimationFrame(tick) }
requestAnimationFrame(tick)
new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__lt.push(Math.round(e.duration)))).observe({ type: 'longtask', buffered: true })`
const counters = (p: Page) => p.evaluate(() => { const w = window as unknown as { __frames: number; __lt: number[] }; return { frames: w.__frames, lt: w.__lt.length } })

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
  if (only && !only.split(',').includes(name)) continue
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, serviceWorkers: 'block' }) // fresh and cold every time
  await ctx.addInitScript({ content: init })
  const page = await ctx.newPage()
  const cdp = await ctx.newCDPSession(page)
  await cdp.send('Network.enable')
  const urls = new Map<string, string>(), sizes = new Map<string, number>()
  cdp.on('Network.requestWillBeSent', (e) => urls.set(e.requestId, e.request.url))
  cdp.on('Network.loadingFinished', (e) => sizes.set(urls.get(e.requestId) ?? e.requestId, (sizes.get(urls.get(e.requestId) ?? e.requestId) ?? 0) + e.encodedDataLength))
  await page.goto(base + '/' + s.q)
  await page.waitForFunction(() => (window as unknown as { __perf?: unknown }).__perf, null, { timeout: 120_000 }) // set 300 ms after the tiles-visible mark
  await sleep(1500)
  const load = await page.evaluate(() => (window as unknown as { __perf: Record<string, number> }).__perf)
  const sum = (re?: RegExp) => [...sizes].filter(([u]) => !re || re.test(u)).reduce((a, [, b]) => a + b, 0)
  const bytes = { total: sum(), texture: sum(/layer-texture/), tiles: sum(/tile-/), js: sum(/\.js/) }
  const zoom = await page.evaluate(() => +(/scale\(([\d.]+)\)/.exec(document.querySelector<HTMLElement>('.react-flow__viewport')?.style.transform ?? '')?.[1] ?? 0))
  if (s.cpu) await cdp.send('Emulation.setCPUThrottlingRate', { rate: s.cpu })

  await browser.startTracing(page, { categories: ['devtools.timeline'] })
  const [c0, g0, t0] = [await counters(page), await gpuCpu(), Date.now()]
  const cx = W / 2, cy = H / 2
  if (s.kind === 'idle') await sleep(10_000)
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
  const paints = evs.filter((e) => e.name === 'Paint' && e.args?.data?.clip)
  const lt = await page.evaluate((n) => (window as unknown as { __lt: number[] }).__lt.slice(n), c0.lt)
  const r = {
    scenario: name, zoom, loadMs: load.tilesVisible, bytes,
    gpuPct: +(((g1 - g0) / secs) * 100).toFixed(1),
    fps: +((c1.frames - c0.frames) / secs).toFixed(1),
    paints: paints.length, paintAreaMpx: +(paints.reduce((a, e) => a + quadArea(e.args!.data!.clip!), 0) / 1e6).toFixed(2), maxPaintMpx: +(Math.max(0, ...paints.map((e) => quadArea(e.args!.data!.clip!))) / 1e6).toFixed(2),
    longTasks: lt.length, longTaskMs: lt.reduce((a, b) => a + b, 0), maxLongTask: Math.max(0, ...lt),
    ms: { style: topMs(evs, /^UpdateLayoutTree$/), layout: topMs(evs, /^Layout$/), script: topMs(evs, /^(FunctionCall|EvaluateScript)$/), paint: topMs(evs, /^Paint$/), decode: topMs(evs, /^Decode/) },
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
  appendFileSync('perf/results.md', `\n## ${new Date().toISOString().slice(0, 10)} ${label}\n\ncommit ${git('rev-parse --short HEAD')}${dirty} · ${chrome} · ${os.cpus()[0].model} · ${W}x${H} · ${mode} · GPU ${gpu}\n\n\`\`\`json\n${lines.join('\n')}\n\`\`\`\n`)
}
if (failed) { console.error('screenshot diff over threshold'); process.exit(1) }
