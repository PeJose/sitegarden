import { z } from 'zod'
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
    ctx.registerShorthand({
      nodeType: 'site', field: 'url', schema: z.url({ protocol: /^https?$/ }),
      links: (v: string) => [{ label: new URL(v).host, url: v }],
    })
  },
})
