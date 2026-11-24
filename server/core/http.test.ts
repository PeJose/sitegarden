import assert from 'node:assert/strict'
import dns from 'node:dns'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { after, test } from 'node:test'
import { blocked, checkedLookup, createHttp } from './http'
import { createSecrets } from './secrets'

let conns = 0, seenHost = ''
const server = http.createServer((req, res) => { seenHost = req.headers.host ?? ''; res.end('hello') })
server.on('connection', () => conns++)
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
const port = (server.address() as AddressInfo).port
after(() => { server.closeAllConnections(); server.close() })

const answer = (...addrs: string[]) => ((_h: string, _o: unknown, cb: (...a: unknown[]) => void) => cb(null, addrs.map((address) => ({ address, family: address.includes(':') ? 6 : 4 })))) as unknown as typeof dns.lookup
const client = (...addrs: string[]) => createHttp({ secrets: createSecrets({}), lookup: answer(...addrs) }).forPlugin({ id: 'p', permissions: { network: ['*'], secrets: [], actions: [] } })

test('every private, loopback, link-local, CGNAT, ULA, multicast and mapped address is blocked, public ones are not', () => {
  for (const a of ['127.0.0.1', '0.1.2.3', '10.0.0.5', '172.16.0.1', '172.31.255.255', '192.168.1.20', '169.254.169.254', '100.64.0.1', '100.127.255.255', '224.0.0.1', '::1', '::', 'fe80::1', 'fc00::1', 'fd00:ec2::254', 'ff02::1', '::ffff:10.0.0.1', '::ffff:7f00:1', '::ffff:a9fe:a9fe']) assert.ok(blocked(a), a)
  for (const a of ['93.184.216.34', '8.8.8.8', '172.32.0.1', '100.128.0.1', '2606:4700::1111', '::ffff:8.8.8.8', '::ffff:808:808']) assert.ok(!blocked(a), a)
})

test('the lookup fails when any answer is blocked, including a mixed one, and passes a public answer through unchanged', async () => {
  const run = (...addrs: string[]) => new Promise<unknown[]>((r) => checkedLookup(answer(...addrs))('x.test', { all: true }, (...a: unknown[]) => r(a)))
  assert.match(String(((await run('10.0.0.5'))[0] as Error).message), /^blocked address 10\.0\.0\.5$/)
  assert.match(String(((await run('93.184.216.34', '::ffff:7f00:1'))[0] as Error).message), /blocked address ::ffff:7f00:1/)
  assert.deepEqual(await run('93.184.216.34'), [null, [{ address: '93.184.216.34', family: 4 }]])
  const one = await new Promise<unknown[]>((r) => checkedLookup(answer('93.184.216.34'))('x.test', {}, (...a: unknown[]) => r(a)))
  assert.deepEqual(one, [null, '93.184.216.34', 4])
})

test('connect.lookup is honoured: a blocked answer fails the request and no connection is made', async () => {
  conns = 0
  for (const a of ['127.0.0.1', '10.0.0.5', '::ffff:7f00:1']) await assert.rejects(client(a)(`http://internal.test:${port}/`), /blocked address/)
  await assert.rejects(client('93.184.216.34', '127.0.0.1')(`http://mixed.test:${port}/`), /blocked address 127\.0\.0\.1/)
  assert.equal(conns, 0)
})

test('IP literals are checked without a lookup, v4 and bracketed v6', async () => {
  const c = createHttp({ secrets: createSecrets({}), lookup: (() => assert.fail('lookup must not run')) as unknown as typeof dns.lookup }).forPlugin({ id: 'p', permissions: { network: ['*'], secrets: [], actions: [] } })
  for (const u of ['http://169.254.169.254/latest/meta-data', `http://127.0.0.1:${port}/`, 'http://[::1]/', 'http://[::ffff:10.0.0.1]/', 'http://[::ffff:7f00:1]/', 'http://metadata.google.internal/']) await assert.rejects(c(u), /blocked/, u)
  assert.equal(conns, 0)
})

test('allowPrivate connects to the address the lookup returned, keeping the host name', async () => {
  const r = await client('127.0.0.1')(`http://internal.test:${port}/`, { allowPrivate: true })
  assert.equal(await r.text(), 'hello')
  assert.equal(seenHost, `internal.test:${port}`)
  assert.equal(conns, 1)
})
