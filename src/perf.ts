// Page-load timeline for the POC: script start -> world JSON -> first tiles visible, plus main-thread long tasks.
export function startPerf() {
  performance.mark('app-start')
  const longTasks: number[] = []
  try {
    new PerformanceObserver((l) => l.getEntries().forEach((e) => longTasks.push(Math.round(e.duration)))).observe({ type: 'longtask', buffered: true })
  } catch { /* longtask unsupported */ }
  const at = (n: string) => Math.round(performance.getEntriesByName(n)[0]?.startTime ?? -1)
  const report = () => {
    const r = { appStart: at('app-start'), worldJson: at('world-json'), tilesVisible: at('tiles-visible'), longTasks, longTaskTotal: longTasks.reduce((a, b) => a + b, 0) }
    ;(window as unknown as { __perf: unknown }).__perf = r
    console.info('[perf]', JSON.stringify(r))
  }
  new PerformanceObserver((_, o) => { if (performance.getEntriesByName('tiles-visible').length) { setTimeout(report, 300); o.disconnect() } }).observe({ type: 'mark' })
}
