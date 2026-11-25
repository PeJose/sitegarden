import { z } from 'zod'
import { parseEvery } from '../../server/core/scheduler'
import { definePlugin } from '../../server/core/sdk'

const path = (base: string, parts: [string, string][]) => parts.map(([label, p]) => ({ label, url: base + p }))

export default definePlugin({
  id: 'essentials',
  register(ctx) {
    for (const t of ['repo', 'cms', 'site', 'job', 'db']) ctx.registerNodeType(t)
    ctx.registerShorthand({
      nodeType: 'repo', field: 'repo', schema: z.string().regex(/^[\w.-]+\/[\w.-]+$/, 'must be owner/name'),
      links: (v: string) => path(`https://github.com/${v}/`, [['Actions', 'actions'], ['Settings', 'settings'], ['Secrets', 'settings/secrets/actions'], ['Pull requests', 'pulls'], ['Issues', 'issues']]),
    })
    ctx.registerShorthand({
      nodeType: 'cms', field: 'sanity', schema: z.string().regex(/^[a-z0-9]+$/, 'must be a Sanity project id (lowercase letters and digits)'),
      links: (v: string) => path(`https://www.sanity.io/manage/project/${v}`, [['Sanity manage', ''], ['API', '/api'], ['Webhooks', '/api#webhooks']]),
    })
    ctx.registerShorthand({
      nodeType: 'cms', field: 'studio', schema: z.string().regex(/^[a-z0-9-]+$/, 'must be the studio name (lowercase letters, digits, dashes)'),
      links: (v: string) => [{ label: 'Studio', url: `https://${v}.sanity.studio` }],
    })
    const int = z.number().int()
    ctx.registerCheckType({
      type: 'http',
      schema: {
        url: z.url({ protocol: /^https?$/ }).optional().describe("Defaults to the node's url"),
        expect_status: z.union([int, z.array(int)]).optional().describe('A status or a list of them; default any 2xx'),
        expect_text: z.string().optional().describe('Case-sensitive text the body must contain'),
        timeout: z.string().default('10s').refine((v) => { try { return !!parseEvery(v) } catch { return false } }, 'bad duration (use 10s or 1m)'),
        alert_after: int.min(1).default(1).describe('Failures in a row before the status is down instead of degraded'),
        allow_private: z.boolean().default(false).describe('Reach private and loopback addresses'),
      },
      async run(c, node, { http, store: { kv }, index }) {
        const key = `fails:${node.id}#${index}`
        const fail = (detail: string, ms?: number) => { const n = Number(kv.get(key) ?? 0) + 1; kv.set(key, n); return { status: n >= c.alert_after ? 'down' as const : 'degraded' as const, detail, ms } }
        const url = c.url ?? node.url
        if (typeof url !== 'string') return fail('no url on the check or the node')
        const t0 = performance.now()
        let status: number, body: string
        try { const r = await http(url, { timeoutMs: parseEvery(c.timeout), allowPrivate: c.allow_private }); status = r.status; body = await r.text() } catch (e) { return fail((e as Error).message) }
        const ms = Math.round(performance.now() - t0), want = c.expect_status === undefined ? null : [c.expect_status].flat()
        if (want ? !want.includes(status) : status < 200 || status > 299) return fail(`expected ${want?.join(' or ') ?? '2xx'}, got ${status} (${ms} ms)`, ms)
        if (c.expect_text !== undefined && !body.includes(c.expect_text)) return fail(`text "${c.expect_text}" not found (${status}, ${ms} ms)`, ms)
        kv.delete(key)
        return { status: 'ok' as const, detail: `${status} in ${ms} ms`, ms }
      },
    })
    ctx.registerShorthand({
      nodeType: 'site', field: 'url', schema: z.url({ protocol: /^https?$/ }),
      links: (v: string) => [{ label: new URL(v).host, url: v }],
    })
  },
})
