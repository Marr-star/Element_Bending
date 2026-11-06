import * as THREE from 'three'
import { particleFragment, particleVertex } from './shaders/particles'

export type RGB = readonly [number, number, number]

/** One particle. Positions and speeds are in scene pixels; times in seconds. */
export interface ParticleSpec {
  x: number
  y: number
  vx?: number
  vy?: number
  /** Constant acceleration, e.g. negative ay for gravity, positive for rising flame. */
  ax?: number
  ay?: number
  /** Exponential slow-down per second. */
  drag?: number
  /** Sideways wobble amplitude in pixels, growing over the particle's life. */
  turbulence?: number
  life: number
  size: number
  sizeEnd?: number
  color: RGB
  colorEnd?: RGB
  /**
   * Circle around (x, y) instead of flying straight: `spin` in radians per second (sign sets the
   * direction) and `inward` in pixels per second toward the centre, for spirals and vortices.
   */
  orbit?: { x: number; y: number; spin: number; inward?: number }
}

const ATTRIBUTES = {
  position: 3,
  aVelocity: 3,
  aExtra: 4,
  aTime: 2,
  aSize: 2,
  aColorA: 3,
  aColorB: 3,
  aOrbit: 4,
} as const
type AttributeName = keyof typeof ATTRIBUTES

/**
 * One reusable particle system for every element: a fixed ring buffer drawn as THREE.Points with
 * additive blending. Emitting overwrites the oldest slot, so nothing is allocated after startup,
 * and only the slots written this frame are uploaded to the GPU.
 */
export class ParticleSystem {
  readonly capacity: number
  private readonly points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>
  private readonly attributes: Record<AttributeName, THREE.BufferAttribute>
  private cursor = 0
  private dirtyStart = 0
  private dirtyCount = 0
  private now = 0

  constructor(scene: THREE.Scene, capacity = 5000) {
    this.capacity = capacity
    const geometry = new THREE.BufferGeometry()
    this.attributes = {} as Record<AttributeName, THREE.BufferAttribute>
    for (const [name, size] of Object.entries(ATTRIBUTES) as [AttributeName, number][]) {
      const attribute = new THREE.BufferAttribute(new Float32Array(capacity * size), size)
      attribute.setUsage(THREE.DynamicDrawUsage)
      geometry.setAttribute(name, attribute)
      this.attributes[name] = attribute
    }

    const material = new THREE.ShaderMaterial({
      vertexShader: particleVertex,
      fragmentShader: particleFragment,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      },
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    })

    this.points = new THREE.Points(geometry, material)
    this.points.frustumCulled = false
    this.points.renderOrder = 5
    scene.add(this.points)
  }

  /** Seconds on the particle clock, which stamps each particle's birth. */
  get time(): number {
    return this.now
  }

  emit(p: ParticleSpec): void {
    const i = this.cursor
    this.cursor = (this.cursor + 1) % this.capacity
    if (this.dirtyCount === 0) this.dirtyStart = i
    this.dirtyCount = Math.min(this.dirtyCount + 1, this.capacity)

    const a = this.attributes
    a.position.setXYZ(i, p.x, p.y, 0)
    a.aVelocity.setXYZ(i, p.vx ?? 0, p.vy ?? 0, p.drag ?? 0)
    a.aExtra.setXYZW(i, p.ax ?? 0, p.ay ?? 0, p.turbulence ?? 0, Math.random())
    a.aTime.setXY(i, this.now, p.life)
    a.aSize.setXY(i, p.size, p.sizeEnd ?? p.size)
    const end = p.colorEnd ?? p.color
    a.aColorA.setXYZ(i, p.color[0], p.color[1], p.color[2])
    a.aColorB.setXYZ(i, end[0], end[1], end[2])
    const orbit = p.orbit
    a.aOrbit.setXYZW(i, orbit?.x ?? 0, orbit?.y ?? 0, orbit ? orbit.spin || 1e-4 : 0, orbit?.inward ?? 0)
  }

  /** Advances the clock by `dt` seconds and uploads this frame's new particles. Call once per frame before rendering. */
  update(dt: number): void {
    this.now += dt
    this.points.material.uniforms.uTime.value = this.now
    if (this.dirtyCount === 0) return

    const ranges: [number, number][] =
      this.dirtyCount >= this.capacity
        ? []
        : this.dirtyStart + this.dirtyCount <= this.capacity
          ? [[this.dirtyStart, this.dirtyCount]]
          : [
              [this.dirtyStart, this.capacity - this.dirtyStart],
              [0, this.dirtyStart + this.dirtyCount - this.capacity],
            ]
    for (const [name, size] of Object.entries(ATTRIBUTES) as [AttributeName, number][]) {
      const attribute = this.attributes[name]
      attribute.clearUpdateRanges()
      for (const [start, count] of ranges) attribute.addUpdateRange(start * size, count * size)
      attribute.needsUpdate = true
    }
    this.dirtyCount = 0
  }

  dispose(): void {
    this.points.removeFromParent()
    this.points.geometry.dispose()
    this.points.material.dispose()
  }
}
