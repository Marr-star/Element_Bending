import type { HandState, Handedness } from '../tracking/handState'
import { dist2, type Vec2 } from '../tracking/vec'
import { detectPose, pinchDistance, pointingDirection, rollChange, sizeGrowth, type Pose } from './rules'
import type { GestureSettings } from './settings'
import { Stabilizer } from './stabilizer'

/** Sustained gestures: a pose, or rotating the hand (which can happen during any pose). */
export type GestureName = Exclude<Pose, 'none'> | 'rotate'

export type GestureEvent =
  | { type: 'gestureStart' | 'gestureEnd'; hand: Handedness; gesture: GestureName; time: number }
  | { type: 'gestureHold'; hand: Handedness; gesture: GestureName; time: number; duration: number }
  | { type: 'push'; hand: Handedness; time: number; growth: number }
  | { type: 'handsApart' | 'handsTogether'; time: number; speed: number }

export type GestureListener = (event: GestureEvent) => void

export interface TrackedHand {
  state: HandState
  /** False while the hand is briefly lost; `state` is then its last known one. */
  visible: boolean
  pose: Pose
  poseDuration: number
  /** +1 rotating counter-clockwise, -1 clockwise, 0 not rotating. */
  rotation: -1 | 0 | 1
  /** Thumb tip to index tip in hand sizes; charge effects can scale with it. */
  pinchDistance: number
  /** Index finger direction while pointing or making two fingers, otherwise null. */
  pointing: Vec2 | null
}

export interface TwoHandState {
  /** Palm-to-palm distance in average hand sizes. */
  distance: number
  /** Change of `distance` per second; positive when moving apart. */
  rate: number
  close: boolean
}

/** Everything element controllers need for one frame, alongside the events. */
export interface GestureFrame {
  time: number
  hands: Partial<Record<Handedness, TrackedHand>>
  twoHands: TwoHandState | null
}

/** Enough history for the longest rule window. */
const HISTORY_SECONDS = 1

interface Slot {
  history: HandState[]
  missing: number
  pose: Stabilizer<Pose>
  poseSince: number
  pinching: boolean
  rotation: -1 | 0 | 1
  rotationSince: number
  lastPush: number
}

/**
 * Turns per-frame HandStates into stable gestures and events. Call `update` once per recognizer
 * result; subscribe with `on` for gestureStart / gestureHold / gestureEnd and one-shots.
 */
export class GestureEngine {
  readonly settings: GestureSettings
  private readonly slots = new Map<Handedness, Slot>()
  private readonly listeners = new Set<GestureListener>()
  private distances: { time: number; distance: number }[] = []
  private close = false
  private lastTwoHandEvent = -Infinity

  constructor(settings: GestureSettings) {
    this.settings = settings
  }

  on(listener: GestureListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  update(states: HandState[], time: number): GestureFrame {
    const s = this.settings
    const events: GestureEvent[] = []
    const frame: GestureFrame = { time, hands: {}, twoHands: null }

    for (const state of states) {
      const slot = this.slots.get(state.handedness) ?? this.createSlot()
      this.slots.set(state.handedness, slot)
      slot.history.push(state)
      while (slot.history[0].time < time - HISTORY_SECONDS) slot.history.shift()
      slot.missing = 0
    }

    for (const [hand, slot] of this.slots) {
      const visible = states.some((state) => state.handedness === hand)
      if (!visible) slot.missing++
      const state = slot.history.at(-1)!
      const lost = slot.missing > s.lostFrames

      // Pose
      const raw = visible ? detectPose(state, s, slot.pinching) : 'none'
      if (visible) slot.pinching = raw === 'pinch'
      const before = slot.pose.value
      const pose = lost ? 'none' : slot.pose.update(raw, s.holdFrames)
      if (pose !== before) {
        if (before !== 'none') events.push({ type: 'gestureEnd', hand, gesture: before, time })
        if (pose !== 'none') events.push({ type: 'gestureStart', hand, gesture: pose, time })
        slot.poseSince = time
      } else if (pose !== 'none') {
        events.push({ type: 'gestureHold', hand, gesture: pose, time, duration: time - slot.poseSince })
      }

      // Rotation, with separate start and stop thresholds
      const roll = visible ? rollChange(slot.history, s.rotateWindow) : 0
      const direction = Math.sign(roll) as -1 | 0 | 1
      if (slot.rotation === 0) {
        if (!lost && Math.abs(roll) > s.rotateStartDeg) {
          slot.rotation = direction
          slot.rotationSince = time
          events.push({ type: 'gestureStart', hand, gesture: 'rotate', time })
        }
      } else if (lost || Math.abs(roll) < s.rotateEndDeg || direction !== slot.rotation) {
        slot.rotation = 0
        events.push({ type: 'gestureEnd', hand, gesture: 'rotate', time })
      } else {
        events.push({ type: 'gestureHold', hand, gesture: 'rotate', time, duration: time - slot.rotationSince })
      }

      // Push: apparent size grows fast (a webcam has no real depth)
      if (visible && time - slot.lastPush > s.pushCooldown) {
        const growth = sizeGrowth(slot.history, s.pushWindow)
        if (growth > 1 + s.pushGrowth) {
          slot.lastPush = time
          events.push({ type: 'push', hand, time, growth })
        }
      }

      if (lost) {
        this.slots.delete(hand)
        continue
      }

      frame.hands[hand] = {
        state,
        visible,
        pose,
        poseDuration: pose === 'none' ? 0 : time - slot.poseSince,
        rotation: slot.rotation,
        pinchDistance: pinchDistance(state),
        pointing: pose === 'pointing' || pose === 'two_fingers' ? pointingDirection(state) : null,
      }
    }

    frame.twoHands = this.updateTwoHands(frame, time, events)
    for (const event of events) this.listeners.forEach((listener) => listener(event))
    return frame
  }

  private updateTwoHands(frame: GestureFrame, time: number, events: GestureEvent[]): TwoHandState | null {
    const s = this.settings
    const left = frame.hands.Left
    const right = frame.hands.Right
    if (!left?.visible || !right?.visible) {
      this.distances = []
      this.close = false
      return null
    }

    const averageSize = (left.state.size + right.state.size) / 2
    const distance = dist2(left.state.palm, right.state.palm) / averageSize
    this.distances.push({ time, distance })
    while (this.distances[0].time < time - s.handsSpeedWindow) this.distances.shift()

    const oldest = this.distances[0]
    const rate = time > oldest.time ? (distance - oldest.distance) / (time - oldest.time) : 0
    this.close = this.close ? distance < s.closeEnd : distance < s.closeStart

    if (time - this.lastTwoHandEvent > s.handsCooldown) {
      if (rate > s.handsApartSpeed) {
        events.push({ type: 'handsApart', time, speed: rate })
        this.lastTwoHandEvent = time
      } else if (rate < -s.handsTogetherSpeed) {
        events.push({ type: 'handsTogether', time, speed: -rate })
        this.lastTwoHandEvent = time
      }
    }

    return { distance, rate, close: this.close }
  }

  private createSlot(): Slot {
    return {
      history: [],
      missing: 0,
      pose: new Stabilizer<Pose>('none'),
      poseSince: 0,
      pinching: false,
      rotation: 0,
      rotationSince: 0,
      lastPush: -Infinity,
    }
  }
}
