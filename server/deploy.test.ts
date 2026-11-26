import assert from 'node:assert/strict'
import { test } from 'node:test'
import { deployPlan, hostArch, sshArgv } from './deploy'

const base = { host: 'root@box.example -p 2222', dir: '/opt/sitegarden', pkgVersion: '1.2.3' }

test('ssh target: options first, target last', () => {
  assert.deepEqual(sshArgv('root@box.example -p 2222'), ['-p', '2222', 'root@box.example'])
  assert.deepEqual(sshArgv('box'), ['box'])
})

test('arch mapping', () => {
  assert.equal(hostArch('x86_64\n'), 'amd64')
  assert.equal(hostArch('aarch64'), 'arm64')
  assert.throws(() => hostArch('armv7l'), /unsupported/)
})

test('ci: pulls latest, builds nothing', () => {
  const p = deployPlan({ ...base, build: 'ci' })
  assert.deepEqual(p.local, [])
  assert.match(p.remote[0], /SITEGARDEN_VERSION='latest'\ndocker compose pull sitegarden\ndocker compose up -d sitegarden\ndocker image prune -f/)
  assert.match(p.remote[0], /exit 5/)
})

test('local: buildx for the host arch, streamed over ssh, version defaults to package.json', () => {
  const p = deployPlan({ ...base, build: 'local', arch: 'aarch64' })
  assert.deepEqual(p.local[0], ['docker', 'buildx', 'build', '--platform', 'linux/arm64', '--load', '-t', 'ghcr.io/pejose/sitegarden:1.2.3', '.'])
  assert.equal(p.local[1][2], `docker save ghcr.io/pejose/sitegarden:1.2.3 | gzip -1 | ssh -p 2222 root@box.example 'gunzip | docker load'`)
  assert.match(p.remote[0], /SITEGARDEN_VERSION='1.2.3'\ndocker compose up -d sitegarden/)
  assert.doesNotMatch(p.remote[0], /--build/)
})

test('server: tag when --version is given, else the current branch', () => {
  const t = deployPlan({ ...base, build: 'server', version: '1.0.0' }).remote[0]
  assert.match(t, /git checkout 'v1\.0\.0'\nnice -n 10 docker compose up -d --build sitegarden/)
  assert.doesNotMatch(t, /merge/)
  const b = deployPlan({ ...base, build: 'server', branch: 'main' })
  assert.deepEqual(b.local, [])
  assert.match(b.remote[0], /SITEGARDEN_VERSION='1\.2\.3'/)
  assert.match(b.remote[0], /git checkout 'main'\ngit merge --ff-only @\{u\}\nnice/)
})
