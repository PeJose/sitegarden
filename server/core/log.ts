import { format } from 'node:util'

// The one place server code prints from, so a secret value never reaches the console. config.ts points `redact` at the secret store.
export const sink = { redact: (s: string) => s }
const out = (f: (m: string) => void) => (...a: unknown[]) => f(sink.redact(format(...a)))
export const log = { info: out((m) => console.log(m)), warn: out((m) => console.warn(m)), error: out((m) => console.error(m)) }
