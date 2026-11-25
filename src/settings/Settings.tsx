import { useCallback, useEffect, useState } from 'react'
import { edges } from '../mock/data'
import { flyTo } from '../map/MapView'
import { viewport } from '../map/viewport'
import { live } from '../live/store'
import { deploy, webhook } from '../live/demo'
import { WEB_SDK_VERSION } from '../ext/sdk'
import { ago } from '../lib/time'
import { estateOf, plantEstate, removeLastEstate } from '../world'

interface Info { version: string; sdk: string; renderer: string; demo: boolean; config: { rev: number; at: number; source: string } | null; plugins: { id: string; version: string; status: 'loaded' | 'failed' }[] }
interface Tok { id: number; name: string; created: number; last_used: number | null }
const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)]
const day = (t: number) => new Date(t).toLocaleDateString()

// A plain page over the map (which stays mounted underneath): what is running, API tokens, and the demo controls that used to be the map's `mock` tab.
export function Settings({ onClose }: { onClose: () => void }) {
  const [info, setInfo] = useState<Info | null>(null)
  const [tokens, setTokens] = useState<Tok[] | 'denied' | null>(null)
  const [name, setName] = useState('')
  const [made, setMade] = useState<{ name: string; token: string } | null>(null) // the one time the value is shown
  const [sure, setSure] = useState<number | null>(null) // inline "Revoke? yes / no"
  const [copied, setCopied] = useState(false) // the app's toast sits under this page, so the button says it
  const [err, setErr] = useState('')
  const loadTokens = useCallback(() => fetch('/api/tokens').then(async (r) => setTokens(r.status === 403 ? 'denied' : r.ok ? await r.json() : null)).catch(() => setTokens(null)), [])
  useEffect(() => { fetch('/api/settings').then((r) => r.json()).then(setInfo).catch(() => {}); void loadTokens() }, [loadTokens])

  const generate = async (e: Event) => {
    e.preventDefault()
    setErr('')
    const r = await fetch('/api/tokens', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })
    if (!r.ok) return setErr(r.status === 400 ? 'Name it with 1 to 64 characters.' : 'Could not generate a token.')
    setMade(await r.json()); setCopied(false); setName(''); void loadTokens()
  }
  const revoke = async (id: number) => { setSure(null); await fetch(`/api/tokens/${id}`, { method: 'DELETE' }); void loadTokens() }
  const copy = () => navigator.clipboard.writeText(made!.token).then(() => setCopied(true), () => setErr('Could not copy; select the token and copy it by hand.'))
  const fly = (id: string | null) => { const e = id && estateOf(id); if (e) flyTo(e.cx, e.cy, Math.min(viewport.get().zoom, 0.9)) }

  return (
    <section className="sheet wide" aria-label="Settings">
      <div className="inner">
        <button className="x" onClick={onClose} aria-label="Close (Esc)">×</button>
        <div className="mono-label accent">SETTINGS</div>
        <h2>Settings</h2>

        <div className="group">
          <div className="mono-label">ABOUT</div>
          {info ? (
            <dl className="kv">
              <dt>Version</dt><dd>{info.version}</dd>
              <dt>Plugin API</dt><dd>{info.sdk}</dd>
              <dt>Web SDK</dt><dd>{WEB_SDK_VERSION}</dd>
              <dt>Renderer</dt><dd>{info.renderer}</dd>
              <dt>Config</dt><dd>{info.config ? `rev ${info.config.rev} · ${ago(info.config.at)} · ${info.config.source}` : 'none yet'}</dd>
              <dt>Demo mode</dt><dd>{info.demo ? 'on' : 'off'}</dd>
            </dl>
          ) : <p className="muted">Loading…</p>}
        </div>

        <div className="group">
          <div className="mono-label">PLUGINS</div>
          {info?.plugins.map((p) => (
            <div key={p.id} className="irow"><b>{p.id}</b><span className="muted">{p.version}</span><span className="grow" /><span className="muted">{p.status === 'loaded' ? 'loaded' : 'failed to load'}</span></div>
          ))}
        </div>

        <div className="group">
          <div className="mono-label">API TOKENS</div>
          {tokens === 'denied' ? <p className="muted">Sign in to manage tokens.</p> : (
            <>
              <form className="tokform" onSubmit={generate}>
                <input value={name} onInput={(e) => setName(e.currentTarget.value)} placeholder="Token name, e.g. ci" aria-label="Token name" maxLength={64} />
                <button className="btn primary" disabled={!name.trim()}>Generate</button>
              </form>
              {err && <p className="muted" role="alert">{err}</p>}
              {made && (
                <div className="once" role="status">
                  <div className="muted">{made.name}: shown once. Store it now.</div>
                  <code>{made.token}</code>
                  <button className="btn ghost" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
                </div>
              )}
              {Array.isArray(tokens) && tokens.map((t) => (
                <div key={t.id} className="irow">
                  <b>{t.name}</b>
                  <span className="muted">created {day(t.created)} · last used {t.last_used ? ago(t.last_used) : 'never'}</span>
                  <span className="grow" />
                  {sure === t.id
                    ? <><span className="muted">Revoke?</span><button className="link" onClick={() => revoke(t.id)}>yes</button><button className="link" onClick={() => setSure(null)}>no</button></>
                    : <button className="link" onClick={() => setSure(t.id)}>Revoke</button>}
                </div>
              ))}
            </>
          )}
        </div>

        <div className="group">
          <div className="mono-label">DEV TOOLS</div>
          <div className="tools">
            {info?.demo && <button className="btn ghost" onClick={() => { const free = edges.filter((e) => e.type === 'deploy' && !live.getState().flows[e.id]); if (free.length) deploy(pick(free).id) }}>deploy now</button>}
            {info?.demo && <button className="btn ghost" onClick={() => { const w = edges.filter((e) => e.type === 'webhook'); if (w.length) webhook(pick(w).id) }}>webhook now</button>}
            <button className="btn ghost" onClick={() => plantEstate().then(fly)}>plant an estate</button>
            <button className="btn ghost" onClick={() => removeLastEstate()}>remove last estate</button>
          </div>
        </div>
      </div>
    </section>
  )
}
