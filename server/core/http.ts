import dns from 'node:dns'
import net from 'node:net'
import { Agent, fetch } from 'undici'
import type { Manifest } from './plugins'
import type { Secrets } from './secrets'

export class HttpError extends Error {}

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
export const checkedLookup = (lookup: Lookup): Lookup => ((host: string, opts: dns.LookupOptions, cb: (...a: unknown[]) => void) => {
  lookup(host, { ...opts, all: true }, (err: Error | null, addrs: dns.LookupAddress[]) => {
    const bad = addrs?.find((a) => blocked(a.address))
    if (err || bad) return cb(err ?? new HttpError(`blocked address ${bad!.address}`))
    if (opts.all) cb(null, addrs)
    else cb(null, addrs[0].address, addrs[0].family)
  })
}) as Lookup

export interface HttpInit { method?: string; headers?: Record<string, string>; body?: string | Uint8Array; allowPrivate?: boolean }
export interface HttpResponse { status: number; headers: Headers; text(): Promise<string>; json(): Promise<unknown> }

export function createHttp({ secrets, lookup = dns.lookup }: { secrets: Secrets; lookup?: Lookup }) {
  const agents = { guarded: new Agent({ connect: { lookup: checkedLookup(lookup) } }), open: new Agent({ connect: { lookup } }) }
  return {
    forPlugin: (_plugin: Pick<Manifest, 'id' | 'permissions'>) => async (url: string, init: HttpInit = {}): Promise<HttpResponse> => {
      try {
        const u = new URL(url), host = u.hostname.replace(/^\[|\]$/g, '')
        if (host === METADATA) throw new HttpError(`blocked host ${host}`)
        if (!init.allowPrivate && net.isIP(host) && blocked(host)) throw new HttpError(`blocked address ${host}`)
        const res = await fetch(u, { method: init.method, headers: init.headers, body: init.body, dispatcher: init.allowPrivate ? agents.open : agents.guarded })
        const text = await res.text()
        return { status: res.status, headers: res.headers as unknown as Headers, text: async () => text, json: async () => JSON.parse(text) }
      } catch (e) {
        const c = (e as Error).cause
        throw new HttpError(secrets.redact(c instanceof HttpError ? c.message : (e as Error).message))
      }
    },
  }
}
