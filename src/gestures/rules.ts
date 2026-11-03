import type { HandState } from '../tracking/handState'
import { bendAngle, dist2, dist3, wrapAngle, type Vec2 } from '../tracking/vec'
import type { GestureSettings } from './settings'

/**
 * Gesture rules as pure functions over HandState (and its recent history). Each takes the
 * settings object so thresholds stay tunable.
 */

export type Pose = 'none' | 'fist' | 'open_palm' | 'pointing' | 'two_fingers' | 'pinch'
export type Finger = 'index' | 'middle' | 'ring' | 'pinky'
export type FingerState = 'extended' | 'curled' | 'neither'

/** Landmark indices: knuckle (MCP), middle joint (PIP), end joint (DIP), tip. */
const FINGER_JOINTS: Record<Finger, [number, number, number, number]> = {
  index: [5, 6, 7, 8],
  middle: [9, 10, 11, 12],
  ring: [13, 14, 15, 16],
  pinky: [17, 18, 19, 20],
}
const PALM = [0, 5, 9, 13, 17]
const THUMB_TIP = 4
const INDEX_MCP = 5
const INDEX_TIP = 8

/** MediaPipe labels we trust when confident. Thumb_Up, Thumb_Down and ILoveYou are ignored. */
const LABEL_POSES: Partial<Record<string, Pose>> = {
  Closed_Fist: 'fist',
  Open_Palm: 'open_palm',
  Pointing_Up: 'pointing',
  Victory: 'two_fingers',
}

/** Total bend of a finger at its two middle joints, in degrees. 0 is straight, ~180 fully curled. */
export function fingerBend(hand: HandState, finger: Finger): number {
  const [mcp, pip, dip, tip] = FINGER_JOINTS[finger].map((i) => hand.points[i])
  return bendAngle(mcp, pip, dip) + bendAngle(pip, dip, tip)
}

export function fingerState(hand: HandState, finger: Finger, s: GestureSettings): FingerState {
  const bend = fingerBend(hand, finger)
  if (bend < s.extendedMaxBend) return 'extended'
  if (bend > s.curledMinBend) return 'curled'
  return 'neither'
}

/** Thumb tip to index tip, in hand sizes. */
export function pinchDistance(hand: HandState): number {
  return dist3(hand.points[THUMB_TIP], hand.points[INDEX_TIP]) / hand.size
}

/** Unit vector along the index finger (knuckle -> tip) in tracking space. */
export function pointingDirection(hand: HandState): Vec2 {
  const from = hand.points[INDEX_MCP]
  const to = hand.points[INDEX_TIP]
  const length = dist2(from, to) || 1
  return { x: (to.x - from.x) / length, y: (to.y - from.y) / length }
}

/**
 * This frame's pose, before stabilizing. Our landmark rules win when they are clear; MediaPipe's
 * label only decides when they are not, and only above `minLabelScore`.
 */
export function detectPose(hand: HandState, s: GestureSettings, wasPinching: boolean): Pose {
  const palmZ = PALM.reduce((sum, i) => sum + hand.points[i].z, 0) / PALM.length
  const indexReach = dist3(hand.points[INDEX_TIP], { ...hand.palm, z: palmZ }) / hand.size
  if (pinchDistance(hand) < (wasPinching ? s.pinchEnd : s.pinchStart) && indexReach > s.pinchMinIndexReach) {
    return 'pinch'
  }

  const index = fingerState(hand, 'index', s)
  const middle = fingerState(hand, 'middle', s)
  const ring = fingerState(hand, 'ring', s)
  const pinky = fingerState(hand, 'pinky', s)
  const ringAndPinkyCurled = ring === 'curled' && pinky === 'curled'

  if (index === 'extended' && middle === 'extended' && ringAndPinkyCurled) return 'two_fingers'
  if (index === 'extended' && middle === 'curled' && ringAndPinkyCurled) return 'pointing'
  if (index === 'curled' && middle === 'curled' && ringAndPinkyCurled) return 'fist'
  if (index === 'extended' && middle === 'extended' && ring === 'extended' && pinky === 'extended') return 'open_palm'

  const labelled = LABEL_POSES[hand.label]
  return labelled && hand.labelScore >= s.minLabelScore ? labelled : 'none'
}

/** Signed roll change in degrees over the last `window` seconds (+ = counter-clockwise on screen). */
export function rollChange(history: HandState[], window: number): number {
  const now = history.at(-1)
  if (!now) return 0
  let total = 0
  for (let i = history.length - 1; i > 0 && history[i - 1].time >= now.time - window; i--) {
    total += wrapAngle(history[i].angle - history[i - 1].angle)
  }
  return (total * 180) / Math.PI
}

/** Current apparent hand size divided by the smallest size seen in the last `window` seconds. */
export function sizeGrowth(history: HandState[], window: number): number {
  const now = history.at(-1)
  if (!now) return 1
  let smallest = now.size
  for (let i = history.length - 2; i >= 0 && history[i].time >= now.time - window; i--) {
    smallest = Math.min(smallest, history[i].size)
  }
  return now.size / smallest
}
