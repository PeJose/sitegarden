import { start } from './app'
import { log } from './core/log'

// HOST defaults to this machine only; the container sets it wider behind the Tailscale sidecar.
await start(Number(process.env.PORT) || 8787, process.env.HOST || '127.0.0.1').catch((e: Error) => { log.error(`[server] ${e.message}`); process.exit(1) })
