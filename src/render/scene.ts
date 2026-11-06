import * as THREE from 'three'
import { coverSize, toScene, type Point2, type Size } from './coords'
import { PostFx } from './postfx'

/** Extra video beyond each viewport edge so screen shake never reveals the background. */
const SHAKE_MARGIN = 24
/** Webcam brightness, kept under the bloom threshold so only effects glow. */
export const VIDEO_BRIGHTNESS = 0.85

/**
 * The one Three.js scene: the webcam is a full-screen VideoTexture plane at the back, and
 * every effect lives in front of it in the same coordinate system (see coords.ts).
 */
export class Stage {
  readonly renderer: THREE.WebGLRenderer
  readonly scene = new THREE.Scene()
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -1000, 1000)
  readonly viewport: Size = { width: 1, height: 1 }
  readonly plane: Size = { width: 1, height: 1 }
  readonly postFx: PostFx
  /** The mirrored webcam, for effects that bend the real image (water, shockwaves). */
  readonly videoTexture: THREE.VideoTexture

  private readonly container: HTMLElement
  private readonly video: HTMLVideoElement
  private readonly videoMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>
  private readonly flashMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>
  private readonly onResize = () => this.resize()
  private shakeAmount = 0
  private flashAmount = 0

  constructor(container: HTMLElement, video: HTMLVideoElement) {
    this.container = container
    this.video = video
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    container.appendChild(this.renderer.domElement)

    this.videoTexture = new THREE.VideoTexture(video)
    this.videoTexture.colorSpace = THREE.SRGBColorSpace
    // Mirror horizontally so the view behaves like a mirror.
    this.videoTexture.wrapS = THREE.RepeatWrapping
    this.videoTexture.repeat.x = -1
    this.videoTexture.offset.x = 1

    this.videoMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: this.videoTexture,
        color: new THREE.Color(VIDEO_BRIGHTNESS, VIDEO_BRIGHTNESS, VIDEO_BRIGHTNESS),
        depthWrite: false,
      }),
    )
    this.videoMesh.position.z = -500
    this.videoMesh.renderOrder = -1
    this.scene.add(this.videoMesh)

    this.flashMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthTest: false,
        depthWrite: false,
      }),
    )
    this.flashMesh.position.z = 500
    this.flashMesh.renderOrder = 100
    this.flashMesh.visible = false
    this.scene.add(this.flashMesh)

    this.postFx = new PostFx(this.renderer, this.scene, this.camera)
    this.resize()
    window.addEventListener('resize', this.onResize)
  }

  /** MediaPipe 0..1 landmark -> scene coordinates. Every effect places itself through this. */
  toScene(landmark: Point2): Point2 {
    return toScene(landmark, this.plane)
  }

  /** Shakes the view by up to `pixels`, decaying quickly. Stronger calls override weaker ones. */
  shake(pixels: number): void {
    this.shakeAmount = Math.min(Math.max(this.shakeAmount, pixels), SHAKE_MARGIN)
  }

  /** Washes the screen with `color` at `strength` (0..1), fading out quickly. */
  flash(color: THREE.ColorRepresentation, strength: number): void {
    if (strength < this.flashAmount) return
    this.flashMesh.material.color.set(color)
    this.flashAmount = Math.min(strength, 1)
  }

  resize(): void {
    const width = this.container.clientWidth || window.innerWidth
    const height = this.container.clientHeight || window.innerHeight
    this.viewport.width = width
    this.viewport.height = height

    const pixelRatio = Math.min(window.devicePixelRatio, 2)
    this.renderer.setSize(width, height)
    this.postFx.setSize(width, height, pixelRatio)
    this.camera.left = -width / 2
    this.camera.right = width / 2
    this.camera.top = height / 2
    this.camera.bottom = -height / 2
    this.camera.updateProjectionMatrix()

    const cover = coverSize(
      { width: width + 2 * SHAKE_MARGIN, height: height + 2 * SHAKE_MARGIN },
      { width: this.video.videoWidth || 1280, height: this.video.videoHeight || 720 },
    )
    this.plane.width = cover.width
    this.plane.height = cover.height
    this.videoMesh.scale.set(cover.width, cover.height, 1)
    this.flashMesh.scale.set(width + 2 * SHAKE_MARGIN, height + 2 * SHAKE_MARGIN, 1)
  }

  render(dt: number): void {
    this.shakeAmount *= Math.exp(-dt * 10)
    if (this.shakeAmount < 0.3) this.shakeAmount = 0
    this.camera.position.x = (Math.random() * 2 - 1) * this.shakeAmount
    this.camera.position.y = (Math.random() * 2 - 1) * this.shakeAmount

    this.flashAmount *= Math.exp(-dt * 9)
    if (this.flashAmount < 0.01) this.flashAmount = 0
    this.flashMesh.visible = this.flashAmount > 0
    this.flashMesh.material.opacity = this.flashAmount

    this.postFx.render()
  }

  dispose(): void {
    window.removeEventListener('resize', this.onResize)
    this.postFx.dispose()
    this.videoTexture.dispose()
    this.videoMesh.geometry.dispose()
    this.videoMesh.material.dispose()
    this.flashMesh.geometry.dispose()
    this.flashMesh.material.dispose()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }
}
