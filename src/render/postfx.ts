import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'

/**
 * Glow via UnrealBloomPass. Only pixels brighter than the threshold bloom; the webcam is dimmed
 * below it (see Stage), so the glow comes from effects whose additive colours exceed 1.
 * Bloom is usually the most expensive pass, so it can be switched off.
 */
export class PostFx {
  enabled = true
  private readonly composer: EffectComposer
  private readonly bloom: UnrealBloomPass
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene: THREE.Scene
  private readonly camera: THREE.Camera

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    this.renderer = renderer
    this.scene = scene
    this.camera = camera
    this.composer = new EffectComposer(renderer)
    this.composer.addPass(new RenderPass(scene, camera))
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.35, 0.95)
    this.composer.addPass(this.bloom)
    this.composer.addPass(new OutputPass())
  }

  setSize(width: number, height: number, pixelRatio: number): void {
    this.composer.setPixelRatio(pixelRatio)
    this.composer.setSize(width, height)
  }

  render(): void {
    if (this.enabled) this.composer.render()
    else this.renderer.render(this.scene, this.camera)
  }

  dispose(): void {
    this.bloom.dispose()
    this.composer.dispose()
  }
}
