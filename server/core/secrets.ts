import fs from 'node:fs'

type Got = { value: string } | { error?: string }

// Values come from env NAME or the file named by NAME_FILE (trimmed). Read on first use and kept; a restart picks up new values.
export function createSecrets(env: Record<string, string | undefined> = process.env, readFile: (f: string) => string = (f) => fs.readFileSync(f, 'utf8')) {
  const cache = new Map<string, Got>(), known = new Set<string>()
  function get(name: string): Got {
    known.add(name)
    let g = cache.get(name)
    if (!g) {
      try {
        const file = env[`${name}_FILE`], v = (env[name] || (file ? readFile(file) : '')).trim()
        g = v ? { value: v } : {}
      } catch (e) { g = { error: (e as Error).message } }
      cache.set(name, g)
    }
    return g
  }
  const value = (name: string) => 'value' in get(name) ? (get(name) as { value: string }).value : undefined
  return {
    value,
    // Declared names with no value, with the reason when the file could not be read.
    missing: (names: string[]) => names.flatMap((secret) => { const g = get(secret); return 'value' in g ? [] : [{ secret, message: g.error ? `secret ${secret} could not be read: ${g.error}` : `secret ${secret} is not set` }] }),
    // Values shorter than 4 characters would mangle ordinary text; Basic auth carries the base64 form, so that is replaced too.
    redact: (text: string) => [...known].flatMap((n) => { const v = value(n); return v && v.length >= 4 ? [[v, n], [Buffer.from(v).toString('base64'), n]] : [] })
      .sort((a, b) => b[0].length - a[0].length).reduce((t, [v, n]) => t.replaceAll(v, `[secret:${n}]`), text),
  }
}
export type Secrets = ReturnType<typeof createSecrets>
