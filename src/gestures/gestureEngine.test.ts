import { describe, expect, it } from 'vitest'
import type { GestureEvent } from './gestureEngine'
import { replay } from './recorder'
import { ASPECT, syntheticRecording, type SyntheticHand } from './testing/syntheticHand'

const fist = { fingers: { index: 'curled', middle: 'curled', ring: 'curled', pinky: 'curled' } } as const
const pointing = { fingers: { index: 'extended', middle: 'curled', ring: 'curled', pinky: 'curled' } } as const

/** Events without the per-frame holds, as compact strings. */
function summary(events: GestureEvent[]): string[] {
  return events
    .filter((e) => e.type !== 'gestureHold')
    .map((e) => ('gesture' in e ? `${e.type}:${e.hand}:${e.gesture}` : 'hand' in e ? `${e.type}:${e.hand}` : e.type))
}

describe('GestureEngine', () => {
  it('waits for a pose to hold before starting it', () => {
    const brief = replay(syntheticRecording(10, (i) => [i < 2 ? fist : {}]))
    expect(summary(brief.events)).not.toContain('gestureStart:Right:fist')

    const held = replay(syntheticRecording(10, () => [fist]))
    expect(summary(held.events)).toEqual(['gestureStart:Right:fist'])
  })

  it('does not flicker when one frame disagrees', () => {
    const { events } = replay(syntheticRecording(30, (i) => [i === 15 ? {} : pointing]))
    expect(summary(events)).toEqual(['gestureStart:Right:pointing'])
  })

  it('emits holds with a growing duration', () => {
    const { events } = replay(syntheticRecording(20, () => [fist]))
    const holds = events.filter((e) => e.type === 'gestureHold' && e.gesture === 'fist')
    expect(holds.length).toBeGreaterThan(10)
    const durations = holds.map((e) => (e.type === 'gestureHold' ? e.duration : 0))
    expect(durations).toEqual([...durations].sort((a, b) => a - b))
  })

  it('ends gestures when the hand leaves the frame', () => {
    const { events, frames } = replay(syntheticRecording(30, (i) => (i < 15 ? [fist] : [])))
    expect(summary(events)).toEqual(['gestureStart:Right:fist', 'gestureEnd:Right:fist'])
    expect(frames.at(-1)!.hands.Right).toBeUndefined()
  })

  it('detects a push from fast growth in apparent size', () => {
    const size = (i: number) => (i < 10 ? 0.2 : Math.min(0.32, 0.2 + (i - 10) * 0.02))
    const { events } = replay(syntheticRecording(30, (i) => [{ ...fist, size: size(i) }]))
    expect(summary(events).filter((e) => e.startsWith('push'))).toEqual(['push:Right'])
  })

  it('does not count slow approach as a push', () => {
    const { events } = replay(syntheticRecording(60, (i) => [{ ...fist, size: 0.2 + i * 0.001 }]))
    expect(summary(events).some((e) => e.startsWith('push'))).toBe(false)
  })

  it('detects rotation and its direction', () => {
    const angle = (i: number) => Math.PI / 2 + Math.min(i, 12) * ((Math.PI / 2) / 12)
    const { events, frames } = replay(syntheticRecording(14, (i) => [{ angle: angle(i) }]))
    expect(summary(events)).toContain('gestureStart:Right:rotate')
    expect(frames.some((f) => f.hands.Right?.rotation === 1)).toBe(true)
  })

  it('fires handsApart when the hands snap apart', () => {
    const gap = (i: number) => (i < 10 ? 0.15 : Math.min(0.65, 0.15 + (i - 10) * 0.1))
    const hands = (i: number): SyntheticHand[] => [
      { handedness: 'Left', x: ASPECT / 2 - gap(i) },
      { handedness: 'Right', x: ASPECT / 2 + gap(i) },
    ]
    const { events, frames } = replay(syntheticRecording(30, hands))
    expect(summary(events).filter((e) => e.startsWith('hands'))).toEqual(['handsApart'])
    expect(frames[5].twoHands?.close).toBe(true)
    expect(frames.at(-1)!.twoHands?.close).toBe(false)
  })
})
