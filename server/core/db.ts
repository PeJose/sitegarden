import { DatabaseSync } from 'node:sqlite'

export interface StoredEvent { id: number; at: number; type: string; data: unknown }
export interface Rev { rev: number; at: number; source: string; yaml: string }
// Thrown when a revision is stored on top of a base that is no longer the latest.
export class DriftError extends Error {
  latest: number
  constructor(latest: number) { super(`server is at rev ${latest}`); this.latest = latest }
}
export interface HistoryRow { check_id: string; status: string; at: number; ms: number | null }
export interface ApiToken { id: number; name: string; created: number; last_used: number | null }
export interface Snapshot { node: string; check_id: string; status: string; at: number; detail: string | null; ms: number | null }

// Everything the server remembers besides render artifacts. One writer, WAL; `user_version` is for later migrations.
export function openDb(file: string, now = Date.now) {
  const db = new DatabaseSync(file)
  db.exec('PRAGMA journal_mode=WAL')
  if ((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version < 1) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, type TEXT NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS snapshots(node TEXT NOT NULL, check_id TEXT NOT NULL, status TEXT NOT NULL, at INTEGER NOT NULL, detail TEXT, PRIMARY KEY(node, check_id));
      CREATE TABLE IF NOT EXISTS snapshot_history(node TEXT NOT NULL, check_id TEXT NOT NULL, status TEXT NOT NULL, at INTEGER NOT NULL, detail TEXT);
      CREATE TABLE IF NOT EXISTS cache(key TEXT PRIMARY KEY, value TEXT NOT NULL, fetched_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS kv(plugin TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(plugin, key));
      PRAGMA user_version=1`)
  }
  if ((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version < 2) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS config_revs(rev INTEGER PRIMARY KEY, at INTEGER NOT NULL, source TEXT NOT NULL, yaml TEXT NOT NULL);
      PRAGMA user_version=2`)
  }
  if ((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version < 3) {
    db.exec(`
      CREATE INDEX IF NOT EXISTS snapshot_history_node ON snapshot_history(node);
      CREATE INDEX IF NOT EXISTS snapshot_history_at ON snapshot_history(at);
      CREATE INDEX IF NOT EXISTS events_at ON events(at);
      PRAGMA user_version=3`)
  }
  if ((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version < 4) {
    // Rows older than the live window, kept for the M7 replay; M7 compacts them (dedupe, downsample).
    db.exec(`
      CREATE TABLE IF NOT EXISTS archive_events(id INTEGER PRIMARY KEY, at INTEGER NOT NULL, type TEXT NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS archive_history(node TEXT NOT NULL, check_id TEXT NOT NULL, status TEXT NOT NULL, at INTEGER NOT NULL, detail TEXT, ms INTEGER);
      CREATE INDEX IF NOT EXISTS archive_events_at ON archive_events(at);
      CREATE INDEX IF NOT EXISTS archive_history_at ON archive_history(at);
      PRAGMA user_version=4`)
  }
  if ((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version < 5) {
    // Login sessions: only the SHA-256 of the cookie token is stored.
    db.exec(`
      CREATE TABLE IF NOT EXISTS sessions(id_hash TEXT PRIMARY KEY, user TEXT NOT NULL, created INTEGER NOT NULL, expires INTEGER NOT NULL);
      PRAGMA user_version=5`)
  }
  if ((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version < 6) {
    // Generated API tokens: only the SHA-256 of the value is stored.
    db.exec(`
      CREATE TABLE IF NOT EXISTS api_tokens(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, hash TEXT NOT NULL UNIQUE, created INTEGER NOT NULL, last_used INTEGER);
      PRAGMA user_version=6`)
  }
  for (const t of ['snapshots', 'snapshot_history']) if (!(db.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).some((c) => c.name === 'ms')) db.exec(`ALTER TABLE ${t} ADD COLUMN ms INTEGER`)
  const q = <T>(sql: string) => { const s = db.prepare(sql); return { all: (...a: any[]) => s.all(...a) as T[], get: (...a: any[]) => s.get(...a) as T | undefined, run: (...a: any[]) => s.run(...a) } }
  const insEvent = q('INSERT INTO events(at, type, data) VALUES(?, ?, ?)'), after = q<{ id: number; at: number; type: string; data: string }>('SELECT * FROM events WHERE id > ? ORDER BY id')
  const upsert = q('INSERT INTO snapshots(node, check_id, status, at, detail, ms) VALUES(?, ?, ?, ?, ?, ?) ON CONFLICT(node, check_id) DO UPDATE SET status=excluded.status, at=excluded.at, detail=excluded.detail, ms=excluded.ms')
  const hist = q('INSERT INTO snapshot_history(node, check_id, status, at, detail, ms) VALUES(?, ?, ?, ?, ?, ?)')
  const recent = q<HistoryRow>('SELECT check_id, status, at, ms FROM snapshot_history WHERE node = ? ORDER BY rowid DESC LIMIT ?')
  const getCache = q<{ value: string; fetched_at: number }>('SELECT value, fetched_at FROM cache WHERE key = ?'), putCache = q('INSERT OR REPLACE INTO cache(key, value, fetched_at) VALUES(?, ?, ?)')
  const getKv = q<{ value: string }>('SELECT value FROM kv WHERE plugin = ? AND key = ?'), putKv = q('INSERT OR REPLACE INTO kv(plugin, key, value) VALUES(?, ?, ?)'), delKv = q('DELETE FROM kv WHERE plugin = ? AND key = ?')
  const latest = () => q<{ m: number | null }>('SELECT MAX(rev) AS m FROM config_revs').get()!.m ?? 0
  const insRev = q('INSERT INTO config_revs(rev, at, source, yaml) VALUES(?, ?, ?, ?)'), getRev = q<Rev>('SELECT * FROM config_revs WHERE rev = ?')
  const insSession = q('INSERT INTO sessions(id_hash, user, created, expires) VALUES(?, ?, ?, ?)'), getSession = q<{ user: string; expires: number }>('SELECT user, expires FROM sessions WHERE id_hash = ? AND expires > ?')
  const extSession = q('UPDATE sessions SET expires = ? WHERE id_hash = ?'), delSession = q('DELETE FROM sessions WHERE id_hash = ?')
  const insToken = q('INSERT INTO api_tokens(name, hash, created) VALUES(?, ?, ?)'), listTokens = q<ApiToken>('SELECT id, name, created, last_used FROM api_tokens ORDER BY id')
  const byHash = q<{ id: number; name: string; last_used: number | null }>('SELECT id, name, last_used FROM api_tokens WHERE hash = ?'), useToken = q('UPDATE api_tokens SET last_used = ? WHERE id = ?'), delToken = q('DELETE FROM api_tokens WHERE id = ?')
  return {
    append(type: string, data: unknown): StoredEvent {
      const at = now(), r = insEvent.run(at, type, JSON.stringify(data))
      return { id: Number(r.lastInsertRowid), at, type, data }
    },
    eventsAfter: (id: number): StoredEvent[] => after.all(id).map((e) => ({ ...e, data: JSON.parse(e.data) })),
    lastEventId: () => q<{ m: number | null }>('SELECT MAX(id) AS m FROM events').get()!.m ?? 0,
    // Moves events and check history older than `olderThan` to the archive tables, in one transaction. `check.result` events are
    // dropped instead: the same results are in the archived history. Latest snapshots, config revisions, cache and kv stay.
    prune(olderThan: number) {
      db.exec('BEGIN')
      try {
        q("INSERT INTO archive_events(id, at, type, data) SELECT id, at, type, data FROM events WHERE at < ? AND type != 'check.result'").run(olderThan)
        q('INSERT INTO archive_history(node, check_id, status, at, detail, ms) SELECT node, check_id, status, at, detail, ms FROM snapshot_history WHERE at < ?').run(olderThan)
        const n = Number(q('DELETE FROM events WHERE at < ?').run(olderThan).changes) + Number(q('DELETE FROM snapshot_history WHERE at < ?').run(olderThan).changes)
        q('DELETE FROM sessions WHERE expires < ?').run(now()) // expired logins go with the daily prune
        db.exec('COMMIT')
        return n
      } catch (e) { db.exec('ROLLBACK'); throw e }
    },
    addSession: (idHash: string, user: string, expires: number) => void insSession.run(idHash, user, now(), expires),
    session: (idHash: string, at: number) => getSession.get(idHash, at), // undefined when unknown or expired
    extendSession: (idHash: string, expires: number) => void extSession.run(expires, idHash),
    removeSession: (idHash: string) => void delSession.run(idHash),
    addToken: (name: string, hash: string, at: number) => Number(insToken.run(name, hash, at).lastInsertRowid),
    tokens: () => listTokens.all(), // never the hash
    tokenByHash: (hash: string) => byHash.get(hash),
    touchToken: (id: number, at: number) => void useToken.run(at, id),
    removeToken: (id: number) => Number(delToken.run(id).changes) > 0,
    saveSnapshot(node: string, checkId: string, status: string, detail?: string, ms?: number) {
      const at = now()
      upsert.run(node, checkId, status, at, detail ?? null, ms ?? null)
      hist.run(node, checkId, status, at, detail ?? null, ms ?? null)
    },
    history: (node: string, limit: number) => recent.all(node, limit).reverse(), // oldest first
    snapshots: () => q<Snapshot>('SELECT * FROM snapshots ORDER BY node, check_id').all(),
    cacheGet: (key: string) => { const r = getCache.get(key); return r && { value: JSON.parse(r.value) as unknown, fetched_at: r.fetched_at } },
    cacheSet: (key: string, value: unknown) => void putCache.run(key, JSON.stringify(value), now()),
    kv: (plugin: string) => ({
      get: (key: string) => { const r = getKv.get(plugin, key); return r && (JSON.parse(r.value) as unknown) },
      set: (key: string, value: unknown) => void putKv.run(plugin, key, JSON.stringify(value)),
      delete: (key: string) => void delKv.run(plugin, key),
    }),
    latestRev: latest,
    getRev: (rev: number) => getRev.get(rev),
    // Compare-and-set: the new rev is only written when `baseRev` is still the latest, so two racing writers cannot both win.
    storeRev(baseRev: number, yaml: string, source: string): number {
      db.exec('BEGIN IMMEDIATE')
      try {
        const l = latest()
        if (l !== baseRev) throw new DriftError(l)
        insRev.run(l + 1, now(), source, yaml)
        db.exec('COMMIT')
        return l + 1
      } catch (e) { db.exec('ROLLBACK'); throw e }
    },
    close: () => db.close(),
  }
}
export type Db = ReturnType<typeof openDb>
