import { useState } from 'react'
import { zoomBy } from '../map/MapView'
import type { Scheme, Style } from '../prefs'

const sun = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/></svg>
const moon = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z" strokeLinejoin="round"/></svg>
const speaker = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 10v4h3l5 4V6L7 10z"/><path d="M16 9c1 1 1 5 0 6M19 7c2 2 2 8 0 10"/></svg>

// The fun / boring switch hides behind the theme button and slides out on hover, focus, or a tap on the button.
export function FunSwitch({ style, setStyle, className = '' }: { style: Style; setStyle: (s: Style) => void; className?: string }) {
  return (
    <div className={`funswitch ${className}`} role="group" aria-label="Look">
      {(['fun', 'boring'] as const).map((s) => (
        <button key={s} aria-pressed={style === s} onClick={() => setStyle(s)}>{s === 'fun' ? 'Fun' : 'Boring'}</button>
      ))}
    </div>
  )
}

export function Controls({ scheme, style, toggleScheme, setStyle }: { scheme: Scheme; style: Style; toggleScheme: () => void; setStyle: (s: Style) => void }) {
  const [open, setOpen] = useState(false)
  const [sound, setSound] = useState(false)
  const night = scheme === 'night'
  const tapOpen = () => { setOpen(true); setTimeout(() => setOpen(false), 3500) }
  return (
    <div className={`controls ${open ? 'open' : ''}`}>
      <FunSwitch style={style} setStyle={setStyle} />
      <div className="stack">
        <button aria-label="Zoom in" onClick={() => zoomBy(1.2)}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button>
        <button aria-label="Zoom out" onClick={() => zoomBy(1 / 1.2)}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M5 12h14"/></svg></button>
        {night && <button className="sound" aria-label={`Night sounds: crickets (${sound ? 'on' : 'off'})`} aria-pressed={sound} onClick={() => setSound(!sound)}>{speaker}</button>}
        <button className="theme" aria-label={`Theme: ${night ? 'dark' : 'light'}. Hover for fun or boring mode`} onClick={() => { toggleScheme(); tapOpen() }}>{night ? moon : sun}</button>
      </div>
    </div>
  )
}
