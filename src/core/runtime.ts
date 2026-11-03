import type { GestureRecognizer } from '@mediapipe/tasks-vision'
import { GestureEngine, type GestureFrame } from '../gestures/gestureEngine'
import { downloadRecording, Recorder } from '../gestures/recorder'
import type { Pose } from '../gestures/rules'
import { createGestureSettings, type GestureSettings } from '../gestures/settings'
import { sceneToScreen } from '../render/coords'
import { Stage } from '../render/scene'
import { SkeletonOverlay } from '../render/skeleton'
import { HandTracker, readHands, type HandFrame, type Handedness } from '../tracking/handState'
import { startCamera, stopCamera } from './camera'
import { startLoop } from './loop'
import { createRecognizer, type Delegate } from './recognizer'

/** Live numbers for the stats overlay. Mutated every frame; React polls it, never stores it per frame. */
export interface Stats {
  fps: number
  inferenceMs: number
  hands: number
  delegate: Delegate | null
}

export interface RuntimeOptions {
  container: HTMLElement
  video: HTMLVideoElement
  /** One DOM label per hand, positioned beside the wrist each frame. */
  labels: Record<Handedness, HTMLElement | null>
}

export interface Runtime {
  stats: Stats
  /** Live gesture thresholds; changes apply on the next frame. */
  settings: GestureSettings
  gestures: GestureEngine
  setSkeletonVisible(visible: boolean): void
  /** Starts or stops a debug recording; stopping downloads it as JSON. Returns whether recording. */
  toggleRecording(): boolean
  stop(): void
}

const POSE_NAMES: Record<Pose, string> = {
  none: '—',
  fist: 'Fist',
  open_palm: 'Open palm',
  pointing: 'Pointing',
  two_fingers: 'Two fingers',
  pinch: 'Pinch',
}
/** How long a push stays visible on the hand's label, in seconds. */
const PUSH_FLASH = 0.5

/**
 * Wires camera -> recognizer -> tracker -> gesture engine -> scene into one loop. All per-frame
 * data lives here in plain objects; React only starts/stops it and reads `stats`.
 */
export async function startRuntime({ container, video, labels }: RuntimeOptions): Promise<Runtime> {
  const [camera, model] = await Promise.allSettled([startCamera(video), createRecognizer()])
  if (camera.status === 'rejected' || model.status === 'rejected') {
    if (camera.status === 'fulfilled') stopCamera(camera.value)
    if (model.status === 'fulfilled') model.value.recognizer.close()
    throw camera.status === 'rejected' ? camera.reason : (model as PromiseRejectedResult).reason
  }
  const stream = camera.value
  const { recognizer, delegate } = model.value

  const stage = new Stage(container, video)
  const skeleton = new SkeletonOverlay(stage)
  const settings = createGestureSettings()
  const tracker = new HandTracker(settings.smoothing)
  const gestures = new GestureEngine(settings)
  const recorder = new Recorder()
  const stats: Stats = { fps: 0, inferenceMs: 0, hands: 0, delegate }
  const aspect = () => (video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : 16 / 9)

  const pushedAt: Partial<Record<Handedness, number>> = {}
  gestures.on((event) => {
    if (event.type === 'push') pushedAt[event.hand] = event.time
  })

  let frame: GestureFrame = { time: 0, hands: {}, twoHands: null }
  let lastVideoTime = -1
  let frames = 0
  let fpsWindowStart = performance.now()

  const stopLoop = startLoop((_dt, now) => {
    if (video.currentTime !== lastVideoTime) {
      lastVideoTime = video.currentTime
      const time = now / 1000
      const raw = recognize(recognizer, video, stats)
      if (recorder.active) recorder.add(time, raw)
      frame = gestures.update(tracker.update(raw, time, aspect()), time)
    }

    skeleton.update(Object.values(frame.hands).map((hand) => hand.state))
    placeLabels(labels, frame, pushedAt, stage)
    stage.render()

    frames++
    if (now - fpsWindowStart >= 500) {
      stats.fps = (frames * 1000) / (now - fpsWindowStart)
      frames = 0
      fpsWindowStart = now
    }
  })

  return {
    stats,
    settings,
    gestures,
    setSkeletonVisible: (visible) => skeleton.setVisible(visible),
    toggleRecording() {
      if (!recorder.active) {
        recorder.start(aspect(), performance.now() / 1000)
        return true
      }
      const recording = recorder.stop()
      if (recording?.frames.length) downloadRecording(recording)
      return false
    },
    stop() {
      stopLoop()
      recorder.stop()
      skeleton.dispose()
      stage.dispose()
      recognizer.close()
      stopCamera(stream)
      video.srcObject = null
      Object.values(labels).forEach((label) => label && (label.style.display = 'none'))
    },
  }
}

function recognize(recognizer: GestureRecognizer, video: HTMLVideoElement, stats: Stats): HandFrame[] {
  const start = performance.now()
  const result = recognizer.recognizeForVideo(video, start)
  const elapsed = performance.now() - start
  // Exponential moving average keeps the readout steady.
  stats.inferenceMs = stats.inferenceMs === 0 ? elapsed : stats.inferenceMs * 0.9 + elapsed * 0.1
  const hands = readHands(result)
  stats.hands = hands.length
  return hands
}

function placeLabels(
  labels: Record<Handedness, HTMLElement | null>,
  frame: GestureFrame,
  pushedAt: Partial<Record<Handedness, number>>,
  stage: Stage,
): void {
  for (const hand of ['Left', 'Right'] as const) {
    const label = labels[hand]
    if (!label) continue
    const tracked = frame.hands[hand]
    if (!tracked) {
      label.style.display = 'none'
      continue
    }
    const { state, pose, rotation } = tracked
    const wrist = sceneToScreen(stage.toScene(state.landmarks[0]), stage.viewport)
    label.style.display = 'block'
    label.style.transform = `translate(${wrist.x}px, ${wrist.y + 16}px) translateX(-50%)`
    label.dataset.hand = hand

    const [main, raw] = label.children as HTMLCollectionOf<HTMLElement>
    const spin = rotation > 0 ? ' ⟲' : rotation < 0 ? ' ⟳' : ''
    const pushed = frame.time - (pushedAt[hand] ?? -Infinity) < PUSH_FLASH ? ' · PUSH' : ''
    main.textContent = `${hand} · ${POSE_NAMES[pose]}${spin}${pushed}`
    raw.textContent = `MediaPipe: ${state.label.replace(/_/g, ' ')} ${Math.round(state.labelScore * 100)}%`
  }
}
