import { definePlugin } from '../../sdk'

export default definePlugin({ id: 'needs-base', register(ctx) { ctx.registerNodeType('gadget') } })
