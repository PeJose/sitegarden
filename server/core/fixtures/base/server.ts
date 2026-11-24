import { z } from 'zod'
import { definePlugin } from '../../sdk'

export default definePlugin({
  id: 'base',
  register(ctx) {
    ctx.registerNodeType('widget')
    ctx.registerSchema('widget', { color: z.string().optional().describe('Paint colour') })
    ctx.registerCheck({ id: 'base.ping', every: '1m', run: () => ({ status: 'ok' }) })
  },
})
