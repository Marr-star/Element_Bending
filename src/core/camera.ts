export type CameraErrorKind = 'insecure' | 'unsupported' | 'denied' | 'not-found' | 'busy' | 'unknown'

export class CameraError extends Error {
  readonly kind: CameraErrorKind

  constructor(kind: CameraErrorKind, message: string) {
    super(message)
    this.kind = kind
  }
}

const MESSAGES: Record<CameraErrorKind, string> = {
  insecure: 'The camera only works over HTTPS or on localhost.',
  unsupported: 'This browser does not support camera access.',
  denied: 'Camera permission was denied. Allow it in the address bar and try again.',
  'not-found': 'No camera was found. Connect a webcam and try again.',
  busy: 'The camera is in use by another app. Close it and try again.',
  unknown: 'The camera could not be started.',
}

/** Starts the front camera into `video` and resolves once its first frame is ready. */
export async function startCamera(video: HTMLVideoElement): Promise<MediaStream> {
  if (!window.isSecureContext) throw new CameraError('insecure', MESSAGES.insecure)
  if (!navigator.mediaDevices?.getUserMedia) throw new CameraError('unsupported', MESSAGES.unsupported)

  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
    })
  } catch (err) {
    const name = err instanceof DOMException ? err.name : ''
    const kind: CameraErrorKind =
      name === 'NotAllowedError' || name === 'SecurityError'
        ? 'denied'
        : name === 'NotFoundError' || name === 'OverconstrainedError'
          ? 'not-found'
          : name === 'NotReadableError' || name === 'AbortError'
            ? 'busy'
            : 'unknown'
    throw new CameraError(kind, MESSAGES[kind])
  }

  video.srcObject = stream
  video.muted = true
  video.playsInline = true
  await video.play()
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    await new Promise<void>((resolve) => video.addEventListener('loadeddata', () => resolve(), { once: true }))
  }
  return stream
}

export function stopCamera(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop())
}
