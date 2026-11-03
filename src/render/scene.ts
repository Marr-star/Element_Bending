import * as THREE from 'three'
import { coverSize, toScene, type Point2, type Size } from './coords'

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

  private readonly container: HTMLElement
  private readonly video: HTMLVideoElement
  private readonly videoTexture: THREE.VideoTexture
  private readonly videoMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>
  private readonly onResize = () => this.resize()

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
      new THREE.MeshBasicMaterial({ map: this.videoTexture, depthWrite: false }),
    )
    this.videoMesh.position.z = -500
    this.videoMesh.renderOrder = -1
    this.scene.add(this.videoMesh)

    this.resize()
    window.addEventListener('resize', this.onResize)
  }

  /** MediaPipe 0..1 landmark -> scene coordinates. Every effect places itself through this. */
  toScene(landmark: Point2): Point2 {
    return toScene(landmark, this.plane)
  }

  resize(): void {
    const width = this.container.clientWidth || window.innerWidth
    const height = this.container.clientHeight || window.innerHeight
    this.viewport.width = width
    this.viewport.height = height

    this.renderer.setSize(width, height)
    this.camera.left = -width / 2
    this.camera.right = width / 2
    this.camera.top = height / 2
    this.camera.bottom = -height / 2
    this.camera.updateProjectionMatrix()

    const cover = coverSize(this.viewport, {
      width: this.video.videoWidth || 1280,
      height: this.video.videoHeight || 720,
    })
    this.plane.width = cover.width
    this.plane.height = cover.height
    this.videoMesh.scale.set(cover.width, cover.height, 1)
  }

  render(): void {
    this.renderer.render(this.scene, this.camera)
  }

  dispose(): void {
    window.removeEventListener('resize', this.onResize)
    this.videoTexture.dispose()
    this.videoMesh.geometry.dispose()
    this.videoMesh.material.dispose()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }
}
