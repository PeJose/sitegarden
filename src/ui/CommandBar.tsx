import { useState, type FormEvent } from 'react'
import { edges, groups, nodeById, nodes } from '../mock/data'
import { live } from '../live/store'
import { NO_DEPLOY, deploy } from '../live/demo'

const eg = () => [groups[groups.length - 1]?.id ?? 'estate', groups[0]?.id ?? 'estate']
const hint = () => `Try “redeploy ${eg()[0]}”, “open ${eg()[1]} secrets” or “check everything”.`
const WHAT: Record<string, (label: string) => boolean> = {
  secrets: (l) => /secrets/i.test(l),
  actions: (l) => /actions/i.test(l),
  sanity: (l) => /sanity manage/i.test(l),
  site: (l) => /\./.test(l),
}

// Runs a typed command against the mock; returns what to tell the user.
function run(text: string): string {
  const t = text.trim().toLowerCase().replace(/[“”"]/g, '')
  if (/^check (everything|all)$/.test(t)) return live.checkAll(), 'Checking everything…'
  const estate = groups.find((g) => t.includes(g.id) || t.includes(g.id.replace(/(\d)/, ' $1')))
  const redeploy = /^(re)?deploy\b/.exec(t)
  if (redeploy && estate) {
    const e = edges.find((x) => x.type === 'deploy' && nodeById(x.from)?.group === estate.id)
    if (!e) return `${estate.id} has nothing to deploy.`
    if (!live.getState().demo) return NO_DEPLOY + '.'
    return live.getState().flows[e.id] ? `${estate.id} is already redeploying.` : (deploy(e.id), `Redeploying ${estate.id}…`)
  }
  const open = /^open\b.*?\b(secrets|actions|sanity|site)\b/.exec(t)
  if (open && estate) {
    const link = nodes.filter((n) => n.group === estate.id).flatMap((n) => n.links).find((l) => WHAT[open[1]](l.label))
    if (link) return window.open(link.url, '_blank', 'noopener'), `Opening ${estate.id} ${open[1]}…`
  }
  return hint()
}

export function CommandBar({ say }: { say: (m: string) => void }) {
  const [v, setV] = useState('')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!v.trim()) return
    say(run(v))
    setV('')
  }
  return (
    <form className="cmd" onSubmit={submit}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/></svg>
      <label htmlFor="cmd3" className="sr">Command</label>
      <input id="cmd3" type="text" value={v} onChange={(e) => setV(e.currentTarget.value)} placeholder={`Try “redeploy ${eg()[0]}” or “open ${eg()[1]} secrets”`} autoComplete="off" />
      <button type="submit" aria-label="Run">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
      </button>
    </form>
  )
}
