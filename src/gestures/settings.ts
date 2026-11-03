import type { OneEuroParams } from '../tracking/smoothing'

/**
 * Every gesture threshold in one place. These are starting values from the build plan; tune them
 * against recorded fixtures, and Phase 6 turns the main ones into sensitivity sliders.
 * Distances are in hand sizes (wrist -> middle knuckle) unless noted.
 */
export interface GestureSettings {
  smoothing: OneEuroParams

  /** MediaPipe labels below this score are ignored. */
  minLabelScore: number
  /** Frames a pose must hold before it starts (and be absent before it ends). */
  holdFrames: number
  /** Frames a hand may go undetected before its gestures end. */
  lostFrames: number

  /** A finger counts as straight below this total bend (degrees, at its two middle joints)... */
  extendedMaxBend: number
  /** ...and as curled above this one. In between it is neither. */
  curledMinBend: number

  /** Thumb tip to index tip, starts a pinch below this... */
  pinchStart: number
  /** ...and ends it above this. */
  pinchEnd: number
  /** Index tip must be at least this far from the palm center, so a fist is not a pinch. */
  pinchMinIndexReach: number

  /** Seconds of roll history to measure rotation over. */
  rotateWindow: number
  /** Roll change within the window (degrees) that starts a rotation... */
  rotateStartDeg: number
  /** ...and that it must fall below to end. */
  rotateEndDeg: number

  /** Seconds over which the hand must grow by `pushGrowth` to count as a push. */
  pushWindow: number
  /** Fractional growth in apparent hand size, e.g. 0.25 = 25%. */
  pushGrowth: number
  pushCooldown: number

  /** Seconds over which the distance between hands is differentiated. */
  handsSpeedWindow: number
  /** Hand sizes per second the hands must separate (or close) at to fire handsApart (handsTogether). */
  handsApartSpeed: number
  handsTogetherSpeed: number
  handsCooldown: number
  /** Palm-to-palm distance that counts as hands close together, with hysteresis. */
  closeStart: number
  closeEnd: number
}

const DEFAULTS: GestureSettings = {
  smoothing: { minCutoff: 1.2, beta: 15, dCutoff: 1 },

  minLabelScore: 0.6,
  holdFrames: 4,
  lostFrames: 4,

  extendedMaxBend: 60,
  curledMinBend: 100,

  pinchStart: 0.25,
  pinchEnd: 0.35,
  pinchMinIndexReach: 0.7,

  rotateWindow: 0.5,
  rotateStartDeg: 60,
  rotateEndDeg: 30,

  pushWindow: 0.3,
  pushGrowth: 0.25,
  pushCooldown: 0.6,

  handsSpeedWindow: 0.2,
  handsApartSpeed: 8,
  handsTogetherSpeed: 8,
  handsCooldown: 0.6,
  closeStart: 2,
  closeEnd: 2.6,
}

export function createGestureSettings(): GestureSettings {
  return structuredClone(DEFAULTS)
}
