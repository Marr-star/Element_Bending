import type { GestureRecognizerResult, NormalizedLandmark } from '@mediapipe/tasks-vision'

export type Handedness = 'Left' | 'Right'

/** One hand as MediaPipe reported it this frame, before smoothing (Phase 2 adds HandState on top). */
export interface HandFrame {
  /** 21 landmarks in MediaPipe's 0..1 video coordinates (unmirrored). */
  landmarks: NormalizedLandmark[]
  handedness: Handedness
  handednessScore: number
  /** MediaPipe's pretrained label: None, Closed_Fist, Open_Palm, Pointing_Up, ... */
  gesture: string
  gestureScore: number
}

/**
 * MediaPipe assumes a mirrored (selfie) input when it labels handedness. We feed it the raw,
 * unmirrored webcam frame, so its labels come out swapped. Check with your real left hand:
 * if the "Left" label appears on your right hand, flip this.
 */
export const SWAP_HANDEDNESS = true

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
