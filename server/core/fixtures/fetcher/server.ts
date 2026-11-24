import { definePlugin } from '../../sdk'

export default definePlugin({
  id: 'fetcher',
  register(ctx) {
    ctx.registerCheck({ id: 'fetcher.get', every: '1m', run: async () => {
      const r = await ctx.http(process.env.FX_URL!, { allowPrivate: true, headers: { authorization: 'Bearer ${secret:FX_TOKEN}' } })
      return { status: 'ok', detail: await r.text() }
    } })
  },
})
