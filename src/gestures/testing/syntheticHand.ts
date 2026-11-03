import { fromTrackSpace, type HandFrame, type Handedness } from '../../tracking/handState'
import type { Vec3 } from '../../tracking/vec'
import type { Finger } from '../rules'
import type { Recording } from '../recorder'

/**
 * Builds plausible 21-point hands for tests. Geometry is laid out in a local frame (fingers along
 * +y, the camera toward -z, in hand sizes), then rotated, scaled and placed in tracking space.
 */

export type FingerPose = 'extended' | 'bent' | 'curled'

export interface SyntheticHand {
  handedness?: Handedness
  /** Wrist position in tracking space (video heights, +y up). */
  x?: number
  y?: number
  /** Wrist to middle knuckle. */
  size?: number
  /** Hand axis in radians; PI/2 = fingers up, 0 = fingers to the right. */
  angle?: number
  fingers?: Partial<Record<Finger, FingerPose>>
  /** Thumb tip touching the index tip. */
  pinch?: boolean
  label?: string
  labelScore?: number
}

export const ASPECT = 16 / 9

const KNUCKLES: Record<Finger, [number, number]> = {
  index: [0.3, 0.95],
  middle: [0, 1],
  ring: [-0.25, 0.95],
  pinky: [-0.5, 0.85],
}
const SEGMENTS = [0.45, 0.28, 0.22]
/** Degrees each segment turns toward the camera, per joint. */
const CURL: Record<FingerPose, number> = { extended: 0, bent: 45, curled: 90 }
const THUMB: [number, number][] = [[0.2, 0.2], [0.4, 0.38], [0.55, 0.55], [0.68, 0.7]]

function fingerPoints(finger: Finger, pose: FingerPose): Vec3[] {
  const [x, y] = KNUCKLES[finger]
  const step = (CURL[pose] * Math.PI) / 180
  const points: Vec3[] = [{ x, y, z: 0 }]
  SEGMENTS.forEach((length, i) => {
    const turn = (i + 1) * step
    const last = points[points.length - 1]
    points.push({ x, y: last.y + length * Math.cos(turn), z: last.z - length * Math.sin(turn) })
  })
  return points
}

export function syntheticHand(hand: SyntheticHand = {}): HandFrame {
  const { handedness = 'Right', x = ASPECT / 2, y = 0.35, size = 0.2, angle = Math.PI / 2, pinch = false } = hand
  const poses: Record<Finger, FingerPose> = { index: 'extended', middle: 'extended', ring: 'extended', pinky: 'extended', ...hand.fingers }

  const local: Vec3[] = new Array(21)
  local[0] = { x: 0, y: 0, z: 0 }
  ;(['index', 'middle', 'ring', 'pinky'] as Finger[]).forEach((finger, f) => {
    fingerPoints(finger, poses[finger]).forEach((p, j) => (local[5 + f * 4 + j] = p))
  })
  THUMB.forEach(([tx, ty], j) => (local[1 + j] = { x: tx, y: ty, z: 0 }))
  if (pinch) {
    const indexTip = local[8]
    local[4] = { x: indexTip.x + 0.05, y: indexTip.y, z: indexTip.z }
    local[3] = { x: (local[2].x + local[4].x) / 2, y: (local[2].y + local[4].y) / 2, z: local[4].z / 2 }
  }

  const turn = angle - Math.PI / 2
  const cos = Math.cos(turn)
  const sin = Math.sin(turn)
  const landmarks = local.map((p) =>
    fromTrackSpace({ x: x + size * (p.x * cos - p.y * sin), y: y + size * (p.x * sin + p.y * cos), z: size * p.z }, ASPECT),
  )

  return {
    landmarks,
    handedness,
    handednessScore: 0.95,
    gesture: hand.label ?? 'None',
    gestureScore: hand.labelScore ?? 0.5,
  }
}

/** A recording at `fps`, where `frame(i, t)` describes the hands in frame i. */
export function syntheticRecording(count: number, frame: (i: number, t: number) => SyntheticHand[], fps = 30): Recording {
  return {
    version: 1,
    aspect: ASPECT,
    frames: Array.from({ length: count }, (_, i) => {
      const t = i / fps
      return { t, hands: frame(i, t).map(syntheticHand) }
    }),
  }
}
