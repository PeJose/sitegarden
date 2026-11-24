import { definePlugin } from '../../server/core/sdk'

// Only the node types for now; shorthands and checks come with M1 item 3.
export default definePlugin({
  id: 'essentials',
  register(ctx) { for (const t of ['repo', 'cms', 'site', 'job', 'db']) ctx.registerNodeType(t) },
})
