import { FilesetResolver, GestureRecognizer } from '@mediapipe/tasks-vision'

export type Delegate = 'GPU' | 'CPU'

export interface Recognizer {
  recognizer: GestureRecognizer
  delegate: Delegate
}

const BASE = import.meta.env.BASE_URL

/**
 * One model for everything: the Gesture Recognizer already returns landmarks,
 * handedness and a gesture label per hand. Tries the GPU delegate first, then CPU.
 */
export async function createRecognizer(): Promise<Recognizer> {
  const fileset = await FilesetResolver.forVisionTasks(`${BASE}wasm`)

  const create = (delegate: Delegate) =>
    GestureRecognizer.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: `${BASE}models/gesture_recognizer.task`, delegate },
      runningMode: 'VIDEO',
      numHands: 2,
    })

  try {
    return { recognizer: await create('GPU'), delegate: 'GPU' }
  } catch (err) {
    console.warn('[recognizer] GPU delegate failed, falling back to CPU', err)
    return { recognizer: await create('CPU'), delegate: 'CPU' }
  }
}
