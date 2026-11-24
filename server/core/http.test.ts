import assert from 'node:assert/strict'
import dns from 'node:dns'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { after, test } from 'node:test'
import { blocked, checkedLookup, isMetadata, createHttp, type HttpInit } from './http'
import { createSecrets } from './secrets'

let conns = 0, seenHost = ''
const server = http.createServer((req, res) => {
  seenHost = req.headers.host ?? ''
  const u = new URL(req.url!, 'http://x'), to = u.searchParams.get('to')
  if (u.pathname === '/redir') { res.writeHead(302, { location: to! }).end() }
  else if (u.pathname === '/loop') { res.writeHead(302, { location: `/loop?t=${u.searchParams.get('t')}` }).end() }
  else if (u.pathname === '/echo') { res.end(JSON.stringify(req.headers)) }
  else if (u.pathname === '/big') { res.write('x'.repeat(1e6)); const t = setInterval(() => res.write('x'.repeat(1e6)), 5); res.on('close', () => clearInterval(t)) }
  else if (u.pathname === '/hang') { /* never answers */ }
  else res.end('hello')
})
server.on('connection', () => conns++)
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
const port = (server.address() as AddressInfo).port
after(() => { server.closeAllConnections(); server.close() })

const answer = (...addrs: string[]) => ((_h: string, _o: unknown, cb: (...a: unknown[]) => void) => cb(null, addrs.map((address) => ({ address, family: address.includes(':') ? 6 : 4 })))) as unknown as typeof dns.lookup
const perms = (network: string[] = ['*'], secrets: string[] = []) => ({ id: 'p', permissions: { network, secrets, actions: [] as string[] } })
const client = (...addrs: string[]) => createHttp({ secrets: createSecrets({}), lookup: answer(...addrs) }).forPlugin(perms())
const TOKEN = 'tok-123456'
// Everything on 127.0.0.1 is "public" here except 127.0.0.2, so a redirect can lead from an allowed hop to a blocked one.
const local = (network?: string[], secrets?: string[]) => createHttp({ secrets: createSecrets({ TOK: TOKEN }), lookup: ((h: string, _o: unknown, cb: (...a: unknown[]) => void) => cb(null, [{ address: h === 'bad.test' ? '127.0.0.2' : '127.0.0.1', family: 4 }])) as unknown as typeof dns.lookup, isBlocked: (a) => a === '127.0.0.2' }).forPlugin(perms(network, secrets))
const ask = (c: ReturnType<typeof local>, path: string, init?: HttpInit) => c(`http://a.test:${port}${path}`, init)

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

test('a host the plugin did not declare is refused before any connection, exact, *.suffix and *', async () => {
  conns = 0
  await assert.rejects(local(['api.example'])(`http://example.org:${port}/`), /plugin p may not call example\.org/)
  await assert.rejects(local([])(`http://a.test:${port}/`), /may not call a\.test/)
  await assert.rejects(local(['*.example'])(`http://example:${port}/`), /may not call/) // the suffix form needs a subdomain
  assert.equal(conns, 0)
  assert.equal((await local(['*.test'])(`http://a.test:${port}/`)).status, 200)
  assert.equal((await local(['a.test'])(`http://a.test:${port}/`)).status, 200)
  assert.equal((await local()(`http://a.test:${port}/`)).status, 200)
})

test('a redirect to a blocked address fails at that hop, to an undeclared host too', async () => {
  const c = local(), narrow = local(['a.test'])
  await assert.rejects(ask(c, `/redir?to=${encodeURIComponent(`http://bad.test:${port}/`)}`), /blocked address 127\.0\.0\.2/)
  await assert.rejects(ask(c, `/redir?to=${encodeURIComponent(`http://127.0.0.2:${port}/`)}`), /blocked address 127\.0\.0\.2/)
  await assert.rejects(ask(narrow, `/redir?to=${encodeURIComponent('http://elsewhere.test/')}`), /may not call elsewhere\.test/)
  await assert.rejects(ask(c, `/redir?to=${encodeURIComponent('file:///etc/passwd')}`), /unsupported scheme/)
  assert.equal(await (await ask(c, `/redir?to=${encodeURIComponent(`http://a.test:${port}/ok`)}`)).text(), 'hello')
})

test('at most 5 redirects are followed', async () => {
  await assert.rejects(ask(local(), '/loop?t=1'), /more than 5 redirects/)
})

test('secrets are substituted in URL and headers for a permitted plugin only, and never in the body', async () => {
  const r = await ask(local(['*'], ['TOK']), '/echo?k=${secret:TOK}', { headers: { authorization: 'Bearer ${secret:TOK}', 'x-plain': 'v' } })
  const h = JSON.parse(await r.text())
  assert.equal(h.authorization, `Bearer ${TOKEN}`)
  await assert.rejects(ask(local(), '/echo', { headers: { authorization: 'Bearer ${secret:TOK}' } }), /plugin p may not use secret TOK/)
  await assert.rejects(ask(local(['*'], ['TOK']), '/?k=${secret:TOK}', { headers: { a: '${secret:OTHER}' } }), /may not use secret OTHER/)
  await assert.rejects(createHttp({ secrets: createSecrets({}) }).forPlugin(perms(['*'], ['TOK']))('http://a.test/${secret:TOK}'), /secret TOK is not set/)
})

test('authorization and secret headers are dropped when a redirect changes the host, kept on the same host', async () => {
  const c = local(['*'], ['TOK']), init = { headers: { authorization: 'Bearer x', 'x-key': '${secret:TOK}', 'x-plain': 'v' } }
  const other = JSON.parse(await (await ask(c, `/redir?to=${encodeURIComponent(`http://b.test:${port}/echo`)}`, init)).text())
  assert.deepEqual([other.authorization, other['x-key'], other['x-plain']], [undefined, undefined, 'v'])
  const same = JSON.parse(await (await ask(c, `/redir?to=${encodeURIComponent('/echo')}`, init)).text())
  assert.deepEqual([same.authorization, same['x-key']], ['Bearer x', TOKEN])
})

test('the timeout and the body cap fail the request with a clear message', async () => {
  conns = 0
  await assert.rejects(ask(local(), '/hang', { timeoutMs: 150 }), /request timed out after 150 ms/)
  await assert.rejects(ask(local(), '/big', { maxBytes: 5000 }), /response larger than 5000 bytes/)
  const c = createHttp({ secrets: createSecrets({}), lookup: answer('127.0.0.1') }).forPlugin(perms())
  await assert.rejects(c(`http://a.test:${port}/big`, { allowPrivate: true }), /response larger than 5 MB/)
})

test('errors never carry a secret value', async () => {
  await assert.rejects(ask(local(['*'], ['TOK']), '/loop?t=${secret:TOK}'), (e: Error) => e.message.includes('[secret:TOK]') && !e.message.includes(TOKEN))
})

test('a secret placeholder in the scheme, userinfo, host or port is refused, in the path or query it works', async () => {
  const c = local(['*'], ['TOK']), msg = /secrets are only allowed in the path, query or headers/
  conns = 0
  for (const u of ['http://${secret:TOK}.a.test/', 'http://${secret:TOK}@a.test/', 'http://user:${secret:TOK}@a.test/', `http://a.test:\${secret:TOK}/`, '${secret:TOK}://a.test/', 'http:\\\\${secret:TOK}.a.test/', '${secret:TOK}']) await assert.rejects(c(u), msg, u)
  assert.equal(conns, 0)
  assert.equal(await (await ask(c, '/echo?k=${secret:TOK}')).text().then((t) => JSON.parse(t).host), `a.test:${port}`)
  assert.equal((await ask(c, '/a/${secret:TOK}/b')).status, 200)
})

test('cloud metadata stays blocked with allowPrivate, as a literal, mapped, by name and in a lookup answer; other private ranges do not', async () => {
  conns = 0
  const open = { allowPrivate: true }
  for (const u of ['http://169.254.169.254/latest', 'http://[fd00:ec2::254]/', 'http://[::ffff:a9fe:a9fe]/', 'http://metadata.google.internal/']) await assert.rejects(client('127.0.0.1')(u, open), /blocked/, u)
  await assert.rejects(client('169.254.169.254')(`http://x.test:${port}/`, open), /blocked address 169\.254\.169\.254/)
  await assert.rejects(client('93.184.216.34', '::ffff:a9fe:a9fe')(`http://x.test:${port}/`, open), /blocked address/)
  assert.ok(isMetadata('169.254.169.254') && !isMetadata('169.254.1.1'))
  assert.equal(conns, 0)
  assert.equal(await (await client('127.0.0.1')(`http://x.test:${port}/`, open)).text(), 'hello')
})

test('a redirect to another port of the same host also drops authorization and secret headers', async () => {
  const other = http.createServer((req, res) => res.end(JSON.stringify(req.headers)))
  await new Promise<void>((r) => other.listen(0, '127.0.0.1', r))
  try {
    const p2 = (other.address() as AddressInfo).port
    const h = JSON.parse(await (await ask(local(['*'], ['TOK']), `/redir?to=${encodeURIComponent(`http://a.test:${p2}/`)}`, { headers: { authorization: 'Bearer x', 'x-key': '${secret:TOK}', 'x-plain': 'v' } })).text())
    assert.deepEqual([h.authorization, h['x-key'], h['x-plain']], [undefined, undefined, 'v'])
  } finally { other.close() }
})
