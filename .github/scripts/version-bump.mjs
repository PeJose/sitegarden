// Fails unless package.json's version is higher than the base branch's.
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import assert from 'node:assert/strict'

const FILE = 'package.json'
const parse = (v) => String(v).split(/[-+]/)[0].split('.').map(Number) // prerelease/build ignored

export function compare(a, b) {
  const [pa, pb] = [parse(a), parse(b)]
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d) return Math.sign(d)
  }
  return 0
}

if (process.argv[2] === '--self-test') {
  assert.equal(compare('0.0.1', '0.0.0'), 1)
  assert.equal(compare('0.0.0', '0.0.0'), 0)
  assert.equal(compare('1.0.0', '0.9.9'), 1)
  assert.equal(compare('0.10.0', '0.9.0'), 1) // numeric, not lexical
  assert.equal(compare('1.2.3-beta.1', '1.2.3'), 0) // prerelease ignored
  assert.equal(compare('0.0.9', '0.1.0'), -1)
  console.log('self-test ok')
} else {
  const base = process.argv[2]
  let baseVersion
  try {
    const show = (f) => JSON.parse(execFileSync('git', ['show', `origin/${base}:${f}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })).version
    try {
      baseVersion = show(FILE)
    } catch {
      baseVersion = show(`web/${FILE}`) // fallback can go once the web/ -> root move has merged
    }
  } catch {
    console.log(`No ${FILE} on ${base}; nothing to compare.`)
    process.exit(0)
  }
  const version = JSON.parse(readFileSync(FILE, 'utf8')).version
  console.log(`base (${base}): ${baseVersion}\nthis PR: ${version}`)
  if (compare(version, baseVersion) <= 0) {
    console.error(`::error file=${FILE}::${FILE} version must be higher than ${base}'s (${baseVersion}). Bump at least the patch.`)
    process.exit(1)
  }
}
