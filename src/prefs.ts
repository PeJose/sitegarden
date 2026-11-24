import { useEffect, useState } from 'react'

export type Scheme = 'light' | 'night'
export type Style = 'fun' | 'boring'
const KEY = 'sitegarden-prefs'

// URL (?theme=night&style=boring) beats localStorage, so screenshots and shared links are exact.
function load(): { scheme: Scheme; style: Style } {
  const q = new URLSearchParams(location.search)
  let saved: Partial<{ scheme: string; style: string }> = {}
  try {
    saved = JSON.parse(localStorage.getItem(KEY) ?? '{}')
  } catch {
    /* storage blocked: defaults */
  }
  const scheme = q.get('theme') ?? saved.scheme
  const style = q.get('style') ?? saved.style
  return { scheme: scheme === 'night' ? 'night' : 'light', style: style === 'boring' ? 'boring' : 'fun' }
}

export function usePrefs() {
  const [prefs, setPrefs] = useState(load)
  useEffect(() => {
    document.documentElement.dataset.theme = prefs.scheme
    document.documentElement.dataset.style = prefs.style
    try {
      localStorage.setItem(KEY, JSON.stringify(prefs))
    } catch {
      /* private mode: fine */
    }
  }, [prefs])
  return {
    ...prefs,
    toggleScheme: () => setPrefs((p) => ({ ...p, scheme: p.scheme === 'night' ? 'light' : 'night' })),
    setStyle: (style: Style) => setPrefs((p) => ({ ...p, style })),
  }
}
