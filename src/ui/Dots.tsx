import type { Status } from '../mock/types'

export const COLOR = { ok: '#2F8F4E', warn: '#D98A1C', down: '#D0342C', idle: '#8A8478' }
export const shapeOf = (s: Status) => (s === 'down' ? 'diamond' : s === 'working' || s === 'degraded' ? 'square' : 'circle')
export const colorOf = (s: Status) => (s === 'down' ? COLOR.down : s === 'working' || s === 'degraded' ? COLOR.warn : s === 'ok' ? COLOR.ok : COLOR.idle)

// The design's status dots: circle = well, rounded square = deploying, diamond = down (never colour alone).
// `size` is the circle size; strip 10 / list 9 / pin chip 8 / popover 11 (shapes follow the design's per-place tweaks).
export function Dot({ status, size, radius = 2 }: { status: Status; size: number; radius?: number }) {
  const shape = shapeOf(status)
  const common = { width: size, height: size, background: colorOf(status), flex: '0 0 auto' } as const
  if (shape === 'diamond') {
    const d = size <= 10 ? size - 1 : size
    return <span style={{ ...common, width: d, height: d, margin: (size - d) / 2, transform: 'rotate(45deg)' }} />
  }
  return <span style={{ ...common, borderRadius: shape === 'circle' ? '50%' : radius }} />
}
