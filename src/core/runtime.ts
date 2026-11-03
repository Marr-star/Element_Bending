import type { GestureRecognizer } from '@mediapipe/tasks-vision'
import { sceneToScreen } from '../render/coords'
import { Stage } from '../render/scene'
import { SkeletonOverlay } from '../render/skeleton'
import { readHands, type HandFrame } from '../tracking/handState'
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
  /** One DOM label per hand slot, positioned beside the wrist each frame. */
  labels: (HTMLElement | null)[]
}

export interface Runtime {
  stats: Stats
  setSkeletonVisible(visible: boolean): void
  stop(): void
}

/**
 * Wires camera -> recognizer -> scene into one loop. All per-frame data lives here in plain
 * objects; React only starts/stops it and reads `stats`.
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
  const stats: Stats = { fps: 0, inferenceMs: 0, hands: 0, delegate }

  let hands: HandFrame[] = []
  let lastVideoTime = -1
  let frames = 0
  let fpsWindowStart = performance.now()

  const stopLoop = startLoop((_dt, now) => {
    if (video.currentTime !== lastVideoTime) {
      lastVideoTime = video.currentTime
      hands = recognize(recognizer, video, stats)
    }

    skeleton.update(hands)
    placeLabels(labels, hands, stage)
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
    setSkeletonVisible: (visible) => skeleton.setVisible(visible),
    stop() {
      stopLoop()
      skeleton.dispose()
      stage.dispose()
      recognizer.close()
      stopCamera(stream)
      video.srcObject = null
      labels.forEach((label) => label && (label.style.display = 'none'))
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

function placeLabels(labels: (HTMLElement | null)[], hands: HandFrame[], stage: Stage): void {
  labels.forEach((label, i) => {
    if (!label) return
    const hand = hands[i]
    if (!hand) {
      label.style.display = 'none'
      return
    }
    const wrist = sceneToScreen(stage.toScene(hand.landmarks[0]), stage.viewport)
    label.style.display = 'block'
    label.style.transform = `translate(${wrist.x}px, ${wrist.y + 16}px) translateX(-50%)`
    label.dataset.hand = hand.handedness
    label.textContent = `${hand.handedness} · ${hand.gesture.replace(/_/g, ' ')} ${Math.round(hand.gestureScore * 100)}%`
  })
}
