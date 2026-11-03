/**
 * Coordinate helpers shared by every effect.
 *
 * Scene units are CSS pixels with the origin at the viewport center and +y up, so an
 * OrthographicCamera spanning [-w/2, w/2] x [-h/2, h/2] shows them 1:1. The webcam plane
 * is "cover"-scaled to fill the viewport, which may push part of the video off-screen.
 */

export interface Size {
  width: number
  height: number
}

export interface Point2 {
  x: number
  y: number
}

/** Size of the video plane that covers the viewport while keeping the video's aspect ratio. */
export function coverSize(viewport: Size, video: Size): Size {
  const scale = Math.max(viewport.width / video.width, viewport.height / video.height)
  return { width: video.width * scale, height: video.height * scale }
}

/**
 * MediaPipe 0..1 video coordinates -> scene coordinates on the mirrored video plane.
 * The mirror (x -> 1 - x) matches the flipped webcam texture.
 */
export function toScene(landmark: Point2, plane: Size): Point2 {
  return {
    x: (1 - landmark.x - 0.5) * plane.width,
    y: (0.5 - landmark.y) * plane.height,
  }
}

/** Scene coordinates -> CSS pixels from the viewport's top-left, for positioning DOM overlays. */
export function sceneToScreen(point: Point2, viewport: Size): Point2 {
  return { x: point.x + viewport.width / 2, y: viewport.height / 2 - point.y }
}
