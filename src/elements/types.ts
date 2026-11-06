import type { AudioEngine } from '../audio/audioEngine'
import type { GestureEvent, GestureFrame } from '../gestures/gestureEngine'
import type { ParticleSystem } from '../render/particles'
import type { Stage } from '../render/scene'
import type { HandState } from '../tracking/handState'
import type { Vec2 } from '../tracking/vec'

/** What every element controller gets to draw with. */
export interface EffectContext {
  stage: Stage
  particles: ParticleSystem
  /** Null when Web Audio is unavailable; elements then stay silent. */
  audio: AudioEngine | null
}

/**
 * One element (fire, water, lightning, air). The runtime calls `update` every rendered frame with
 * the gesture events queued since the previous call (except gestureHold; the frame carries pose
 * durations instead) and the latest gesture frame.
 */
export interface ElementController {
  update(dt: number, frame: GestureFrame, events: readonly GestureEvent[]): void
  /** Clears everything on screen and silences it; called when switching to another element. */
  reset(): void
  dispose(): void
}

const PALM = [0, 5, 9, 13, 17]

/** Palm center in scene pixels. */
export function palmInScene(stage: Stage, hand: HandState): Vec2 {
  const x = PALM.reduce((sum, i) => sum + hand.landmarks[i].x, 0) / PALM.length
  const y = PALM.reduce((sum, i) => sum + hand.landmarks[i].y, 0) / PALM.length
  return stage.toScene({ x, y })
}

/** One landmark (e.g. 8 = index fingertip) in scene pixels. */
export function landmarkInScene(stage: Stage, hand: HandState, index: number): Vec2 {
  return stage.toScene(hand.landmarks[index])
}

/** Stereo position for a scene point: -1 at the left edge of the view, +1 at the right. */
export function panInScene(stage: Stage, point: Vec2): number {
  return Math.min(1, Math.max(-1, point.x / (stage.viewport.width / 2)))
}

/** Palm velocity in scene pixels per second (tracking space is in video heights, mirrored, +y up). */
export function velocityInScene(stage: Stage, hand: HandState): Vec2 {
  return { x: hand.velocity.x * stage.plane.height, y: hand.velocity.y * stage.plane.height }
}

/** Hand size (wrist to middle knuckle) in scene pixels. */
export function sizeInScene(stage: Stage, hand: HandState): number {
  return hand.size * stage.plane.height
}
