import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { nodeById } from '../mock/data'
import { useEngine } from '../mock/engine'
import type { NodeType, Status } from '../mock/types'
import { WORD } from '../gen/labels'
import type { Estate } from '../gen/types'
import { Dot, COLOR, colorOf, shapeOf } from '../ui/Dots'
import { roughPin } from './roughPin'

// Icon paths from the design's pins, relative to the pin centre.
const ICON: Record<NodeType, { d: string; dot?: boolean }> = {
  cms: { d: 'M-6 7c0-8 4-13 13-13-1 8-5 13-13 13zM-6 7l-2 2' },
  repo: { d: 'M-5 -7v14M-5 -4c5 0 10 1 10 6', dot: true },
  site: { d: 'M-8 1l8-7 8 7v7h-16z' },
  job: { d: 'M0 -8v8l5 3M-8 0a8 8 0 1 0 16 0a8 8 0 1 0 -16 0' },
  db: { d: 'M-7 -5c0-3 14-3 14 0v10c0 3-14 3-14 0zM-7 -5c0 3 14 3 14 0M-7 0c0 3 14 3 14 0' },
}

function chipText(status: Status, host: string): { text: string; color: string } | null {
  if (status === 'down') return null // the design shows no chip on the red diamond
  if (status === 'working') return { text: 'deploying', color: 'var(--warn-text)' }
  if (status === 'degraded') return { text: 'slow', color: 'var(--warn-text)' }
  if (status === 'paused') return { text: 'paused', color: 'var(--muted)' }
  return { text: host, color: 'var(--muted)' }
}

function PinNodeInner({ id, data }: NodeProps) {
  const slot = (data as { chip: Estate['chips'][string]; pin: [number, number] }) // chip box reserved by the generator, world coords
  const def = nodeById(id)
  const status = useEngine((s) => s.nodes[id]?.status)
  if (!def || !status) return null
  const c = colorOf(status)
  const shape = shapeOf(status)
  const icon = ICON[def.type]
  const chip = chipText(status, def.host)
  const stroke = shape === 'diamond' ? '#fff' : c
  const iconD = shape === 'diamond' && def.type === 'site' ? 'M-7 1l7-6 7 6v6h-14z' : icon.d
  return (
    <div className="pin" role="img" aria-label={`${def.name}: ${status}`}>
      {/* the pulse repaints (its radius animates), so it gets its own layer: only its 76 px box is redrawn */}
      {shape === 'diamond' && <svg className="pulse-svg" width="34" height="34" viewBox="-17 -17 34 34" overflow="visible" aria-hidden="true"><circle className="pulse" cx="0" cy="0" r="17" fill="none" stroke={COLOR.down} strokeWidth="2" /></svg>}
      <svg width="34" height="34" viewBox="-17 -17 34 34" overflow="visible" aria-hidden="true">
        {roughPin(id, status, shape, c, iconD).map((p, i) => <path key={i} d={p.d} fill={p.fill ?? 'none'} stroke={p.stroke} strokeWidth={p.strokeWidth} strokeLinecap="round" strokeLinejoin="round" />)}
        {icon.dot && shape !== 'diamond' && <circle cx="5" cy="4" r="1.9" fill={stroke} />}
      </svg>
      {chip && (
        <div className="chipbox" style={{ left: slot.chip.box[0] - slot.pin[0] + 17, top: slot.chip.box[1] - slot.pin[1] + 17, width: slot.chip.box[2] - slot.chip.box[0], height: slot.chip.box[3] - slot.chip.box[1], transformOrigin: `${17 - (slot.chip.box[0] - slot.pin[0] + 17)}px ${17 - (slot.chip.box[1] - slot.pin[1] + 17)}px`, justifyContent: slot.chip.align === 'start' ? 'flex-start' : slot.chip.align === 'end' ? 'flex-end' : 'center' }}>
          <div className="chip">
            <Dot status={status} size={8} />
            {WORD[def.type]} <span style={{ color: chip.color, fontWeight: 400 }}>{chip.text}</span>
          </div>
        </div>
      )}
    </div>
  )
}
export const PinNode = memo(PinNodeInner)
