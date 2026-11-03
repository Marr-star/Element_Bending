import { HandTracker, type HandFrame } from '../tracking/handState'
import { GestureEngine, type GestureEvent, type GestureFrame } from './gestureEngine'
import { createGestureSettings, type GestureSettings } from './settings'

/**
 * Debug recordings of raw MediaPipe hands. Press R in the app to start and stop; the JSON that
 * downloads can be dropped into src/gestures/fixtures/ and replayed in Vitest to tune rules
 * without standing at the camera.
 */

export interface RecordedFrame {
  /** Seconds since the recording started. */
  t: number
  hands: HandFrame[]
}

export interface Recording {
  version: 1
  /** Video width / height, needed to rebuild tracking-space geometry. */
  aspect: number
  frames: RecordedFrame[]
}

const round = (n: number) => Math.round(n * 1e4) / 1e4

export class Recorder {
  private recording: Recording | null = null
  private startTime = 0

  get active(): boolean {
    return this.recording !== null
  }

  start(aspect: number, time: number): void {
    this.recording = { version: 1, aspect, frames: [] }
    this.startTime = time
  }

  add(time: number, hands: HandFrame[]): void {
    this.recording?.frames.push({
      t: round(time - this.startTime),
      hands: hands.map((hand) => ({
        ...hand,
        handednessScore: round(hand.handednessScore),
        gestureScore: round(hand.gestureScore),
        landmarks: hand.landmarks.map(({ x, y, z }) => ({ x: round(x), y: round(y), z: round(z) })),
      })),
    })
  }

  stop(): Recording | null {
    const recording = this.recording
    this.recording = null
    return recording
  }
}

export function downloadRecording(recording: Recording): void {
  const blob = new Blob([JSON.stringify(recording)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `gestures-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  link.click()
  URL.revokeObjectURL(url)
}

/** Runs a recording through the same tracker and engine as the app. */
export function replay(
  recording: Recording,
  settings: GestureSettings = createGestureSettings(),
): { events: GestureEvent[]; frames: GestureFrame[] } {
  const tracker = new HandTracker(settings.smoothing)
  const engine = new GestureEngine(settings)
  const events: GestureEvent[] = []
  engine.on((event) => events.push(event))
  const frames = recording.frames.map(({ t, hands }) => engine.update(tracker.update(hands, t, recording.aspect), t))
  return { events, frames }
}
