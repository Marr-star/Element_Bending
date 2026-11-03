import { describe, expect, it } from 'vitest'
import { HandTracker, type HandState } from '../tracking/handState'
import { detectPose, fingerState, pinchDistance, pointingDirection } from './rules'
import { createGestureSettings } from './settings'
import { ASPECT, syntheticHand, type SyntheticHand } from './testing/syntheticHand'

const s = createGestureSettings()

function stateOf(hand: SyntheticHand): HandState {
  return new HandTracker(s.smoothing).update([syntheticHand(hand)], 0, ASPECT)[0]
}

const curled = { index: 'curled', middle: 'curled', ring: 'curled', pinky: 'curled' } as const
const pointing = { index: 'extended', middle: 'curled', ring: 'curled', pinky: 'curled' } as const
const twoFingers = { index: 'extended', middle: 'extended', ring: 'curled', pinky: 'curled' } as const
const allBent = { index: 'bent', middle: 'bent', ring: 'bent', pinky: 'bent' } as const

describe('HandState', () => {
  it('measures size and roll from wrist to middle knuckle', () => {
    const state = stateOf({ size: 0.2, angle: Math.PI / 2 })
    expect(state.size).toBeCloseTo(0.2, 5)
    expect(state.angle).toBeCloseTo(Math.PI / 2, 5)
  })
})

describe('fingerState', () => {
  it('tells straight and curled fingers apart', () => {
    const state = stateOf({ fingers: { index: 'extended', middle: 'curled', ring: 'bent' } })
    expect(fingerState(state, 'index', s)).toBe('extended')
    expect(fingerState(state, 'middle', s)).toBe('curled')
    expect(fingerState(state, 'ring', s)).toBe('neither')
  })
})

describe('detectPose', () => {
  it('detects an open palm and a fist from landmarks alone', () => {
    expect(detectPose(stateOf({}), s, false)).toBe('open_palm')
    expect(detectPose(stateOf({ fingers: curled }), s, false)).toBe('fist')
  })

  it('detects pointing in any direction', () => {
    for (const angle of [Math.PI / 2, 0, Math.PI, -Math.PI / 2]) {
      expect(detectPose(stateOf({ fingers: pointing, angle }), s, false)).toBe('pointing')
    }
  })

  it('treats pointing down as pointing even when MediaPipe says Thumb_Up', () => {
    const state = stateOf({ fingers: pointing, angle: -Math.PI / 2, label: 'Thumb_Up', labelScore: 0.9 })
    expect(detectPose(state, s, false)).toBe('pointing')
  })

  it('reports the finger direction for aiming', () => {
    const right = pointingDirection(stateOf({ fingers: pointing, angle: 0 }))
    expect(right.x).toBeCloseTo(1, 5)
    expect(right.y).toBeCloseTo(0, 5)
  })

  it('detects two fingers without relying on the Victory label', () => {
    expect(detectPose(stateOf({ fingers: twoFingers }), s, false)).toBe('two_fingers')
  })

  it('detects a pinch, but not on a fist', () => {
    expect(detectPose(stateOf({ fingers: { index: 'bent' }, pinch: true }), s, false)).toBe('pinch')
    expect(detectPose(stateOf({ fingers: curled, pinch: true }), s, false)).toBe('fist')
  })

  it('uses separate start and stop distances for pinch', () => {
    const state = stateOf({ fingers: { index: 'bent' }, pinch: true })
    const ratio = pinchDistance(state)
    const between = { ...s, pinchStart: ratio - 0.05, pinchEnd: ratio + 0.05 }
    expect(detectPose(state, between, false)).not.toBe('pinch')
    expect(detectPose(state, between, true)).toBe('pinch')
  })

  it('falls back to a confident MediaPipe label when the rules are unclear', () => {
    expect(detectPose(stateOf({ fingers: allBent, label: 'Closed_Fist', labelScore: 0.8 }), s, false)).toBe('fist')
    expect(detectPose(stateOf({ fingers: allBent, label: 'Closed_Fist', labelScore: 0.4 }), s, false)).toBe('none')
  })

  it('ignores labels we do not use', () => {
    expect(detectPose(stateOf({ fingers: allBent, label: 'ILoveYou', labelScore: 0.99 }), s, false)).toBe('none')
    expect(detectPose(stateOf({ fingers: allBent, label: 'Thumb_Up', labelScore: 0.99 }), s, false)).toBe('none')
  })
})
