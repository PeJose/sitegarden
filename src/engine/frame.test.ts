import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createFrames } from './frame'

const sim = () => {
  const q = new Map<number, FrameRequestCallback>(); let id = 0, v = { x: 0, y: 0, zoom: 1 }
  const frames = createFrames(() => v, (f) => { q.set(++id, f); return id }, (i) => { q.delete(i) })
  return { frames, set: (nv: typeof v) => { v = nv }, step: () => { const fs = [...q.values()]; q.clear(); fs.forEach((f) => f(0)) }, pending: () => q.size }
}

test('one frame runs the one-shots, then every applier with the same view', () => {
  const s = sim(), seen: string[] = []
  s.frames.onFrame((v) => seen.push('a' + v.x)); s.frames.onFrame((v) => seen.push('b' + v.x))
  s.frames.raf(() => s.set({ x: 5, y: 0, zoom: 1 })) // input applied at the top of the frame
  assert.equal(s.pending(), 1)
  s.step()
  assert.deepEqual(seen, ['a5', 'b5'])
  assert.equal(s.pending(), 0) // nothing runs while idle
})

test('a request inside the frame does not add a frame, again does; a disposed applier stops', () => {
  const s = sim(); let n = 0
  const off = s.frames.onFrame(() => { n++; s.frames.request() })
  s.step(); assert.equal(s.pending(), 0)
  s.frames.onFrame(() => { if (n < 3) s.frames.again() })
  s.step(); assert.equal(s.pending(), 1)
  off(); s.step(); assert.equal(n, 2)
})

test('a one-shot scheduled inside the frame waits for the next one; caf cancels', () => {
  const s = sim(), seen: number[] = []
  s.frames.raf(() => { seen.push(1); s.frames.raf(() => seen.push(2)) })
  const c = s.frames.raf(() => seen.push(9)); s.frames.caf(c)
  s.step(); assert.deepEqual(seen, [1])
  s.step(); assert.deepEqual(seen, [1, 2])
})
