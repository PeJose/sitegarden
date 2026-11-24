import { start } from './app'

await start(Number(process.env.PORT) || 8787)
