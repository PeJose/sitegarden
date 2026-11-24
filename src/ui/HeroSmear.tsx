import { useEffect, useState } from 'react'
import { SMEAR_FILL } from '../gen/render'
import { rngFor } from '../gen/rng'
import { smearRects } from '../gen/smear'
import type { Box } from '../gen/types'
import type { Scheme } from '../prefs'

// Text lines and blocks of the hero panel, measured in `.app` coordinates.
function measure(app: HTMLElement): Box[] {
  const hero = app.querySelector('.hero')
  if (!hero) return []
  const a = app.getBoundingClientRect()
  const out: Box[] = []
  const add = (el: Element, px = 0) => { const b = el.getBoundingClientRect(); if (b.width > 1) out.push([b.left - a.left - px, b.top - a.top, b.right - a.left + px, b.bottom - a.top]) }
  for (const el of hero.children) {
    // the estate table's text runs to its edges, so its smear needs extra room or the filtered edge eats the padding
    if (el.matches('.estates')) { add(el, 22); continue }
    if (el.matches('.row, .brand')) { add(el); continue }
    // one box per text line, so the smear hugs ragged paragraphs instead of their bounding rectangle
    const r = document.createRange()
    r.selectNodeContents(el)
    const lines: Box[] = []
    for (const q of r.getClientRects()) {
      const b: Box = [q.left - a.left, q.top - a.top, q.right - a.left, q.bottom - a.top]
      const l = lines.find((o) => Math.abs(o[1] - b[1]) < 6)
      if (l) { l[0] = Math.min(l[0], b[0]); l[2] = Math.max(l[2], b[2]); l[1] = Math.min(l[1], b[1]); l[3] = Math.max(l[3], b[3]) } else lines.push(b)
    }
    out.push(...lines)
  }
  return out
}

// The paper-coloured smear behind the hero text: irregular, soft, generated around what is actually on screen.
export function HeroSmear({ scheme, seed, appRef }: { scheme: Scheme; seed: string; appRef: React.RefObject<HTMLDivElement | null> }) {
  const [boxes, setBoxes] = useState<Box[]>([])
  useEffect(() => {
    const app = appRef.current!
    let raf = 0
    const run = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => setBoxes(measure(app))) }
    const ro = new ResizeObserver(run)
    const hero = app.querySelector('.hero')!
    ro.observe(hero)
    ro.observe(app)
    const mo = new MutationObserver(run)
    mo.observe(hero, { subtree: true, childList: true, characterData: true })
    void document.fonts.ready.then(run)
    run()
    return () => { cancelAnimationFrame(raf); ro.disconnect(); mo.disconnect() }
  }, [appRef])
  if (!boxes.length) return null
  const w = Math.max(...boxes.map((b) => b[2])) + 80, h = Math.max(...boxes.map((b) => b[3])) + 80
  // the corner radii are seeded; the box geometry itself comes from the DOM
  return (
    <svg className="hero-smear" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <g fill={SMEAR_FILL[scheme]}><g filter="url(#smearT)" dangerouslySetInnerHTML={{ __html: smearRects(boxes, rngFor(seed, 'hero-smear'), 14) }} /></g>
    </svg>
  )
}
