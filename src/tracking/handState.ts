import type { GestureRecognizerResult } from '@mediapipe/tasks-vision'
import { LandmarkSmoother, type OneEuroParams } from './smoothing'
import { dist3, type Vec2, type Vec3 } from './vec'

export type Handedness = 'Left' | 'Right'

/** One hand as MediaPipe reported it this frame, before smoothing. */
export interface HandFrame {
  /** 21 landmarks in MediaPipe's 0..1 video coordinates (unmirrored). */
  landmarks: Vec3[]
  handedness: Handedness
  handednessScore: number
  /** MediaPipe's pretrained label: None, Closed_Fist, Open_Palm, Pointing_Up, ... */
  gesture: string
  gestureScore: number
}

/**
 * Whether to flip MediaPipe's Left/Right labels. Verified with a real left hand on the raw
 * (unmirrored) webcam feed: MediaPipe's labels are already correct, so no swap is needed.
 */
export const SWAP_HANDEDNESS = false

export function readHands(result: GestureRecognizerResult): HandFrame[] {
  return result.landmarks.map((landmarks, i) => {
    const hand = result.handedness[i]?.[0]
    const gesture = result.gestures[i]?.[0]
    const raw = (hand?.categoryName ?? 'Right') as Handedness
    const handedness: Handedness = SWAP_HANDEDNESS ? (raw === 'Left' ? 'Right' : 'Left') : raw
    return {
      landmarks,
      handedness,
      handednessScore: hand?.score ?? 0,
      gesture: gesture?.categoryName || 'None',
      gestureScore: gesture?.score ?? 0,
    }
  })
}

/**
 * Tracking space: mirrored like the on-screen view, +y up, and measured in video heights so x and
 * y share one scale. All gesture geometry happens here.
 */
export function toTrackSpace(landmark: Vec3, aspect: number): Vec3 {
  return { x: (1 - landmark.x) * aspect, y: 1 - landmark.y, z: landmark.z * aspect }
}

export function fromTrackSpace(point: Vec3, aspect: number): Vec3 {
  return { x: 1 - point.x / aspect, y: 1 - point.y, z: point.z / aspect }
}

/** One hand per frame after smoothing, with the measurements every gesture rule builds on. */
export interface HandState {
  handedness: Handedness
  /** Seconds. */
  time: number
  /** Smoothed landmarks in MediaPipe 0..1 coordinates, for rendering through `stage.toScene`. */
  landmarks: Vec3[]
  /** Smoothed landmarks in tracking space. */
  points: Vec3[]
  /** Average of the wrist and the four finger knuckles (landmarks 0, 5, 9, 13, 17). */
  palm: Vec2
  /** Wrist to middle knuckle (0 -> 9). Grows as the hand nears the camera. */
  size: number
  /** Palm velocity in video heights per second. */
  velocity: Vec2
  speed: number
  /** Roll: direction of wrist -> middle knuckle in radians; PI/2 means fingers up. */
  angle: number
  label: string
  labelScore: number
}

const PALM = [0, 5, 9, 13, 17]
/** How much of each new velocity sample to take; the rest is the previous estimate. */
const VELOCITY_RESPONSE = 0.5

/** Turns raw MediaPipe hands into smoothed HandStates, keeping one filter set per handedness. */
export class HandTracker {
  private readonly params: OneEuroParams
  private readonly tracks = new Map<Handedness, { smoother: LandmarkSmoother; last: HandState }>()

  constructor(params: OneEuroParams) {
    this.params = params
  }

  update(frames: HandFrame[], time: number, aspect: number): HandState[] {
    const states = uniqueHandedness(frames).map((frame) => {
      const track = this.tracks.get(frame.handedness)
      const smoother = track?.smoother ?? new LandmarkSmoother(this.params)
      const dt = track ? time - track.last.time : 0
      const points = smoother.filter(
        frame.landmarks.map((l) => toTrackSpace(l, aspect)),
        dt,
      )
      const state = measure(frame, points, time, aspect, track?.last)
      this.tracks.set(frame.handedness, { smoother, last: state })
      return state
    })

    for (const hand of this.tracks.keys()) {
      if (!states.some((s) => s.handedness === hand)) this.tracks.delete(hand)
    }
    return states
  }
}

/** If MediaPipe labels both hands the same, trust the more confident one and flip the other. */
function uniqueHandedness(frames: HandFrame[]): HandFrame[] {
  if (frames.length < 2 || frames[0].handedness !== frames[1].handedness) return frames
  const [a, b] = frames
  const flip = (f: HandFrame): HandFrame => ({ ...f, handedness: f.handedness === 'Left' ? 'Right' : 'Left' })
  return a.handednessScore >= b.handednessScore ? [a, flip(b)] : [flip(a), b]
}

function measure(frame: HandFrame, points: Vec3[], time: number, aspect: number, prev?: HandState): HandState {
  const palm = {
    x: PALM.reduce((sum, i) => sum + points[i].x, 0) / PALM.length,
    y: PALM.reduce((sum, i) => sum + points[i].y, 0) / PALM.length,
  }

  let velocity = { x: 0, y: 0 }
  const dt = prev ? time - prev.time : 0
  if (prev && dt > 0) {
    velocity = {
      x: prev.velocity.x + VELOCITY_RESPONSE * ((palm.x - prev.palm.x) / dt - prev.velocity.x),
      y: prev.velocity.y + VELOCITY_RESPONSE * ((palm.y - prev.palm.y) / dt - prev.velocity.y),
    }
  }

  return {
    handedness: frame.handedness,
    time,
    landmarks: points.map((p) => fromTrackSpace(p, aspect)),
    points,
    palm,
    size: dist3(points[0], points[9]),
    velocity,
    speed: Math.hypot(velocity.x, velocity.y),
    angle: Math.atan2(points[9].y - points[0].y, points[9].x - points[0].x),
    label: frame.gesture,
    labelScore: frame.gestureScore,
  }
}
