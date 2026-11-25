import type { Context } from 'hono'
import { streamSSE } from 'hono/streaming'
import type { Db, StoredEvent } from './db'

export const KEEP_DAYS = 30

// Every event is stored first, then pushed to live listeners with its row ID, so a reconnecting client can catch up from the store.
// `redact` runs over every string in an event before it is stored or pushed.
export function createBus(db: Db, redact = (s: string) => s) {
  const scrub = (v: unknown): unknown => typeof v === 'string' ? redact(v) : Array.isArray(v) ? v.map(scrub) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, scrub(x)])) : v
  const listeners = new Set<(e: StoredEvent) => void>()
  const prune = () => db.prune(Date.now() - KEEP_DAYS * 86_400_000)
  prune()
  setInterval(prune, 86_400_000).unref() // a server that runs for months still drops old rows
  return {
    db,
    emit(type: string, data: unknown) {
      const e = db.append(type, scrub(data))
      listeners.forEach((f) => f(e))
      return e
    },
    on(f: (e: StoredEvent) => void) { listeners.add(f); return () => void listeners.delete(f) },
  }
}
export type Bus = ReturnType<typeof createBus>

// Catch-up and live events share one sequence: the listener is attached before the stored rows are read, and anything at or below the last sent ID is skipped.
export const eventsHandler = (bus: Bus, initial: () => string | null, keepAliveMs = 25_000) => (c: Context) => streamSSE(c, async (s) => {
  let sent = Number(c.req.header('Last-Event-ID')) || 0
  const send = (e: StoredEvent) => {
    if (e.id <= sent) return
    sent = e.id
    void s.writeSSE({ id: String(e.id), event: e.type, data: JSON.stringify(e.data) })
  }
  const off = bus.on(send)
  s.onAbort(off)
  const first = initial()
  if (!c.req.header('Last-Event-ID') && first) void s.writeSSE({ event: 'release', data: JSON.stringify(first) }) // no id: a fresh page learns the current release without moving the cursor
  bus.db.eventsAfter(sent).forEach(send)
  while (!s.aborted) await s.sleep(keepAliveMs).then(() => s.write(': keep-alive\n\n')) // keeps proxies from closing an idle stream
})
