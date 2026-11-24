import { definePlugin } from '../../sdk'

export default definePlugin({
  id: 'throws',
  register(ctx) {
    ctx.registerNodeType('doomed')
    throw new Error('boom')
  },
})
