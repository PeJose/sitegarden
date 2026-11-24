import assert from 'node:assert/strict'
import { test } from 'node:test'
import { log, sink } from './log'
import { createSecrets } from './secrets'

const files: Record<string, string> = { '/run/s/gh': 'ghp_filetoken\n' }
const read = (f: string) => { if (!(f in files)) throw new Error(`ENOENT ${f}`); return files[f] }

test('value comes from the env, or from NAME_FILE trimmed', () => {
  const s = createSecrets({ A: 'aaaa1111', B_FILE: '/run/s/gh' }, read)
  assert.equal(s.value('A'), 'aaaa1111')
  assert.equal(s.value('B'), 'ghp_filetoken')
  assert.equal(s.value('C'), undefined)
})

test('missing names the secret, and the reason for an unreadable file', () => {
  const s = createSecrets({ OK: 'okokok', GONE_FILE: '/nope' }, read)
  const m = s.missing(['OK', 'NONE', 'GONE'])
  assert.deepEqual(m.map((x) => x.secret), ['NONE', 'GONE'])
  assert.match(m[0].message, /secret NONE is not set/)
  assert.match(m[1].message, /GONE could not be read: ENOENT/)
})

test('values are read once', () => {
  let n = 0
  const s = createSecrets({ X_FILE: '/f' }, () => { n++; return 'xxxxxxxx' })
  s.value('X'); s.value('X')
  assert.equal(n, 1)
})

test('redact replaces plain and base64 forms, longest first, and leaves short values alone', () => {
  const s = createSecrets({ LONG: 'tok-abcdef', SHORT: 'abc', PAIR: 'tok-abc' }, read)
  s.missing(['LONG', 'SHORT', 'PAIR'])
  const b64 = Buffer.from('tok-abcdef').toString('base64')
  assert.equal(s.redact('bad tok-abcdef and tok-abc, abc'), 'bad [secret:LONG] and [secret:PAIR], abc')
  assert.equal(s.redact(`Authorization: Basic ${b64}`), 'Authorization: Basic [secret:LONG]')
})

test('log redacts secret values from whatever it prints', () => {
  const s = createSecrets({ T: 'tok-abcdef' }), lines: string[] = [], was = console.warn
  s.missing(['T'])
  sink.redact = s.redact
  console.warn = (m: string) => void lines.push(m)
  try { log.warn('failed:', new Error('401 tok-abcdef'), { t: 'tok-abcdef' }) } finally { console.warn = was; sink.redact = (x) => x }
  assert.ok(lines[0].includes('[secret:T]') && !lines[0].includes('tok-abcdef'))
})
