import { useCallback, type CSSProperties, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { live } from './live/store'
import { nodeById } from './mock/data'
import { usePrefs } from './prefs'
import { HeroSmear } from './ui/HeroSmear'
import { pinAt, useWorld, type WorldData } from './world'
import { MapView, flyTo } from './map/MapView'
import { viewport } from './map/viewport'
import { heroInset } from './lib/view'
import { Hero } from './ui/Hero'
import { StatusStrip } from './ui/StatusStrip'
import { CommandBar } from './ui/CommandBar'
import { Controls } from './ui/Controls'
import { Popover } from './ui/Popover'
import { extConfig, registry } from './ext/registry'
import { Settings } from './settings/Settings'
import { Boring } from './Boring'

const params = new URLSearchParams(location.search) // ?select=copperleaf-site&still=1 are for screenshots

export default function App() {
  const prefs = usePrefs()
  const world = useWorld()
  if (!world) return <div className="app" />
  if (prefs.style === 'boring') return <Boring setStyle={prefs.setStyle} />
  return (
    <Fun {...prefs} world={world} />
  )
}

function Fun({ scheme, style, toggleScheme, setStyle, world }: ReturnType<typeof usePrefs> & { world: WorldData }) {
  const [selected, setSelected] = useState<string | null>(world.estates.some((e) => params.get('select') && e.pins[params.get('select')!]) ? params.get('select') : null)
  const [panel, setPanel] = useState<string | null>(params.get('panel') && `tab:essentials:${params.get('panel')}`) // a tab id
  const [settings, setSettings] = useState(() => location.pathname === '/settings') // /settings is a page over the map, which stays mounted
  const [toast, setToast] = useState('')
  const [size, setSize] = useState<{ w: number; h: number } | null>(null) // measured, so the first frame matches the design exactly
  const box = useRef<HTMLDivElement>(null)
  const app = useRef<HTMLDivElement>(null)
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem('sitegarden-hero') === 'hidden' } catch { return false } })
  const collapsed = hidden && (size?.w ?? 1440) >= 760 // the stacked mobile hero covers nothing
  const toggle = () => setHidden((h) => { try { localStorage.setItem('sitegarden-hero', h ? 'open' : 'hidden') } catch { /* private mode */ } return !h })
  const toggleRef = useRef(toggle)
  toggleRef.current = toggle
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const say = useCallback((m: string) => {
    setToast(m)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 4500)
  }, [])
  useEffect(() => { live.say = say; return () => { live.say = undefined } }, [say])

  useLayoutEffect(() => {
    const r = box.current!.getBoundingClientRect()
    setSize({ w: Math.round(r.width), h: Math.round(r.height) })
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.round(e.contentRect.width), h: Math.round(e.contentRect.height) }))
    ro.observe(box.current!)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const onPop = () => setSettings(location.pathname === '/settings')
    addEventListener('popstate', onPop)
    return () => removeEventListener('popstate', onPop)
  }, [])
  const openSettings = () => { history.pushState(null, '', '/settings'); setSettings(true) }
  const closeSettings = useCallback(() => { history.pushState(null, '', '/' + location.search); setSettings(false) }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '[' && !e.metaKey && !e.ctrlKey && !e.altKey && !(e.target instanceof HTMLElement && e.target.closest('input,textarea,[contenteditable]'))) return innerWidth >= 760 ? toggleRef.current() : undefined
      if (e.key !== 'Escape') return
      if (location.pathname === '/settings') return closeSettings()
      if (document.activeElement instanceof HTMLInputElement) document.activeElement.blur()
      setPanel((p) => { if (!p) setSelected(null); return null })
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [closeSettings])

  const pickFromPanel = (id: string) => {
    setPanel(null)
    setSelected(id)
    const [x, y] = pinAt(id)
    flyTo(x, y, 1.4)
  }

  return (
    <div className={`app${collapsed ? ' collapsed' : ''}`} ref={app} style={{ '--inset': `${heroInset(size?.w ?? 1440, collapsed)}px` } as CSSProperties}>
      <HeroSmear scheme={scheme} seed={world.seed} appRef={app} />
      <Hero onPanel={setPanel} onSettings={openSettings} say={say} collapsed={collapsed} onToggle={toggle} />
      <div className="mapbox" ref={box}>
        {size && <MapView world={world} scheme={scheme} size={size} collapsed={collapsed} onSelect={(id) => { setSelected(id); setPanel(null) }} />}
        <StatusStrip onPick={pickFromPanel} />
        {selected && nodeById(selected) && <Anchored key={selected} id={selected} boxW={size?.w ?? 1440} />}
        {panel && registry.resolve('sidepanel', 'tabs', extConfig.extensions).find((t) => t.id === panel)?.render({ onClose: () => setPanel(null), onPick: pickFromPanel })}
        {toast && <div className="toast" role="status">{toast}</div>}
        <CommandBar say={say} />
        <Controls scheme={scheme} style={style} toggleScheme={toggleScheme} setStyle={setStyle}  />
      </div>
      {settings && <Settings onClose={closeSettings} />}
    </div>
  )
}

// Follows the pin without a React render per frame: the viewport subscription writes --x/--y on the card; React only sees the card flip above/below the pin.
function Anchored({ id, boxW }: { id: string; boxW: number }) {
  const wrap = useRef<HTMLDivElement>(null)
  const [px, py] = pinAt(id)
  const at = ({ x, y, zoom }: { x: number; y: number; zoom: number }) => ({ x: px * zoom + x, y: py * zoom + y })
  const [pos, setPos] = useState(() => at(viewport.get()))
  useLayoutEffect(() => {
    let below = pos.y < 430
    const apply = (t: { x: number; y: number; zoom: number }) => {
      const p = at(t)
      if (p.y < 430 !== below) { below = !below; setPos(p) }
      wrap.current?.querySelector<HTMLElement>('.pop')?.style.setProperty('--x', String(Math.min(Math.max(p.x, 147), Math.max(147, boxW - 147))))
      wrap.current?.querySelector<HTMLElement>('.pop')?.style.setProperty('--y', String(p.y))
      const arrow = wrap.current?.querySelector<HTMLElement>('.pop-arrow')
      arrow?.style.setProperty('--x', String(p.x)); arrow?.style.setProperty('--y', String(p.y))
    }
    apply(viewport.get())
    return viewport.subscribe(apply)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boxW, px, py])
  return <div ref={wrap} style={{ display: 'contents' }}><Popover nodeId={id} x={pos.x} y={pos.y} boxW={boxW} /></div>
}
