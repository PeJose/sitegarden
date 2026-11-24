// Prints the CHANGELOG.md section for a version (exit 1 if missing).
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'

export function section(text, version) {
  const lines = text.split('\n')
  const start = lines.findIndex((l) => l.startsWith(`## [${version}]`))
  if (start < 0) return null
  const end = lines.findIndex((l, i) => i > start && l.startsWith('## '))
  return lines.slice(start + 1, end < 0 ? undefined : end).join('\n').trim()
}

if (!process.argv[1].endsWith('release-notes.mjs')) {
  // imported by version-bump.mjs: only the export is wanted
} else if (process.argv[2] === '--self-test') {
  const t = '# Log\n\n## [1.1.0] - 2026-01-02\n\n### Added\n- b\n\n## [1.0.0] - 2026-01-01\n- a\n'
  assert.equal(section(t, '1.1.0'), '### Added\n- b')
  assert.equal(section(t, '1.0.0'), '- a')
  assert.equal(section(t, '1.0'), null) // exact heading, not a prefix
  console.log('self-test ok')
} else {
  const notes = section(readFileSync('CHANGELOG.md', 'utf8'), process.argv[2])
  if (!notes) {
    console.error(`CHANGELOG.md has no "## [${process.argv[2]}]" section.`)
    process.exit(1)
  }
  console.log(notes)
}
