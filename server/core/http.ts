import dns from 'node:dns'
import net from 'node:net'
import { Agent, fetch } from 'undici'
import type { Manifest } from './plugins'
import type { Secrets } from './secrets'

export class HttpError extends Error {}
const MB = 1048576, MAX_HOPS = 5

const deny = new net.BlockList()
for (const [a, n] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.168.0.0', 16], ['224.0.0.0', 4]] as const) deny.addSubnet(a, n, 'ipv4')
for (const [a, n] of [['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8]] as const) deny.addSubnet(a, n, 'ipv6') // fc00::/7 covers fd00:ec2::254
const METADATA = 'metadata.google.internal'

// `::ffff:a.b.c.d` and `::ffff:7f00:1` are the same host as the IPv4 address, so they are checked as it.
const unmap = (a: string) => {
  const m = /^::ffff:(?:(\d+\.\d+\.\d+\.\d+)|([0-9a-f]{1,4}):([0-9a-f]{1,4}))$/i.exec(a)
  return !m ? a : m[1] ?? [m[2], m[3]].flatMap((h) => [parseInt(h, 16) >> 8, parseInt(h, 16) & 255]).join('.')
}
export const blocked = (addr: string) => { const a = unmap(addr); return deny.check(a, net.isIPv6(a) ? 'ipv6' : 'ipv4') }

type Lookup = typeof dns.lookup
// The connection itself resolves through this, so the address that was checked is the address that is used. Fails when ANY answer is blocked.
export const checkedLookup = (lookup: Lookup, isBlocked = blocked): Lookup => ((host: string, opts: dns.LookupOptions, cb: (...a: unknown[]) => void) => {
  lookup(host, { ...opts, all: true }, (err: Error | null, addrs: dns.LookupAddress[]) => {
    const bad = addrs?.find((a) => isBlocked(a.address))
    if (err || bad) return cb(err ?? new HttpError(`blocked address ${bad!.address}`))
    if (opts.all) cb(null, addrs)
    else cb(null, addrs[0].address, addrs[0].family)
  })
}) as Lookup

export interface HttpInit { method?: string; headers?: Record<string, string>; body?: string | Uint8Array; allowPrivate?: boolean; timeoutMs?: number; maxBytes?: number }
export interface HttpResponse { status: number; headers: Headers; text(): Promise<string>; json(): Promise<unknown> }

// `isBlocked` is only replaced in tests: there is no public address a local test server could listen on.
export function createHttp({ secrets, lookup = dns.lookup, isBlocked = blocked }: { secrets: Secrets; lookup?: Lookup; isBlocked?: (addr: string) => boolean }) {
  const agents = { guarded: new Agent({ connect: { lookup: checkedLookup(lookup, isBlocked) } }), open: new Agent({ connect: { lookup } }) }
  return {
    forPlugin: (m: Pick<Manifest, 'id' | 'permissions'>) => async (url: string, init: HttpInit = {}): Promise<HttpResponse> => {
      const { timeoutMs = 10_000, maxBytes = 5 * MB } = init
      // Only names the plugin lists may be substituted, and only in the URL and header values.
      const sub = (v: string) => v.replace(/\$\{secret:([^}]*)\}/g, (_, name: string) => {
        if (!m.permissions.secrets.includes(name)) throw new HttpError(`plugin ${m.id} may not use secret ${name}`)
        const value = secrets.value(name)
        if (value === undefined) throw new HttpError(`secret ${name} is not set`)
        return value
      })
      const allowed = (h: string) => m.permissions.network.some((p) => p === '*' || p.toLowerCase() === h || (p.startsWith('*.') && h.endsWith(p.slice(1).toLowerCase())))
      try {
        const signal = AbortSignal.timeout(timeoutMs), carrying = new Set<string>(['authorization'])
        let headers = Object.fromEntries(Object.entries(init.headers ?? {}).map(([k, v]) => { const s = sub(v); if (s !== v) carrying.add(k.toLowerCase()); return [k, s] }))
        let u = new URL(sub(url)), method = init.method ?? 'GET', body = init.body
        for (let hop = 0; ; hop++) {
          const host = u.hostname.replace(/^\[|\]$/g, '')
          if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new HttpError(`unsupported scheme ${u.protocol}`)
          if (!allowed(host)) throw new HttpError(`plugin ${m.id} may not call ${host} (permissions.network)`)
          if (host === METADATA) throw new HttpError(`blocked host ${host}`)
          if (!init.allowPrivate && net.isIP(host) && isBlocked(host)) throw new HttpError(`blocked address ${host}`)
          const res = await fetch(u, { method, headers, body, redirect: 'manual', signal, dispatcher: init.allowPrivate ? agents.open : agents.guarded })
          const to = res.headers.get('location')
          if (res.status >= 300 && res.status < 400 && to) {
            await res.body?.cancel()
            if (hop === MAX_HOPS) throw new HttpError(`more than ${MAX_HOPS} redirects, last to ${u}`)
            const next = new URL(to, u)
            if (next.hostname !== u.hostname) headers = Object.fromEntries(Object.entries(headers).filter(([k]) => !carrying.has(k.toLowerCase())))
            if (res.status === 303 || (method === 'POST' && (res.status === 301 || res.status === 302))) { method = 'GET'; body = undefined }
            u = next
            continue
          }
          const chunks: Uint8Array[] = []
          let n = 0
          for await (const c of res.body ?? []) { // leaving the loop cancels the stream and closes the connection
            if ((n += c.length) > maxBytes) throw new HttpError(`response larger than ${maxBytes >= MB ? `${+(maxBytes / MB).toFixed(1)} MB` : `${maxBytes} bytes`}`)
            chunks.push(c)
          }
          const text = Buffer.concat(chunks).toString()
          return { status: res.status, headers: res.headers as unknown as Headers, text: async () => text, json: async () => JSON.parse(text) }
        }
      } catch (e) {
        const c = (e as Error).cause as Error | undefined
        const msg = [e, c].some((x) => (x as Error | undefined)?.name === 'TimeoutError') ? `request timed out after ${timeoutMs} ms` : c instanceof HttpError ? c.message : (e as Error).message
        throw new HttpError(secrets.redact(msg))
      }
    },
  }
}
