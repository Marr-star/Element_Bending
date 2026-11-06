import * as THREE from 'three'
import { Line2 } from 'three/addons/lines/Line2.js'
import { LineGeometry } from 'three/addons/lines/LineGeometry.js'
import { LineMaterial } from 'three/addons/lines/LineMaterial.js'
import type { Vec2 } from '../tracking/vec'

/** Every bolt path has exactly this many points (midpoint displacement, 5 levels deep). */
export const BOLT_POINTS = 33

/**
 * A jagged lightning path from `from` to `to` by midpoint displacement: each level splits every
 * segment and pushes the midpoint sideways by up to `spread`, halving the spread each time.
 */
export function boltPath(from: Vec2, to: Vec2, spread: number, rng: () => number = Math.random): Vec2[] {
  let points: Vec2[] = [from, to]
  let amount = spread
  while (points.length < BOLT_POINTS) {
    const next: Vec2[] = [points[0]]
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1]
      const b = points[i]
      const dx = b.x - a.x
      const dy = b.y - a.y
      const length = Math.hypot(dx, dy) || 1
      const offset = (rng() * 2 - 1) * amount
      next.push({ x: (a.x + b.x) / 2 - (dy / length) * offset, y: (a.y + b.y) / 2 + (dx / length) * offset }, b)
    }
    points = next
    amount /= 2
  }
  return points
}

/**
 * Forks splitting off a main bolt: each starts at a random point along it and heads off at an
 * angle, shorter than what is left of the main bolt.
 */
export function boltBranches(main: Vec2[], count: number, spread: number, rng: () => number = Math.random): Vec2[][] {
  const first = main[0]
  const end = main[main.length - 1]
  const mainLength = Math.hypot(end.x - first.x, end.y - first.y)
  return Array.from({ length: count }, () => {
    const start = main[Math.floor(BOLT_POINTS * (0.15 + 0.5 * rng()))]
    // Wide enough to read as separate forks rather than doubling the main bolt.
    const heading = Math.atan2(end.y - start.y, end.x - start.x) + (rng() < 0.5 ? -1 : 1) * (0.5 + 0.6 * rng())
    const length = mainLength * (0.3 + 0.3 * rng())
    return boltPath(start, { x: start.x + Math.cos(heading) * length, y: start.y + Math.sin(heading) * length }, spread * 0.6, rng)
  })
}

interface BoltLine {
  glow: Line2
  core: Line2
}

/**
 * Draws bolts as thick screen-space lines: a wide translucent glow under a thin bright core.
 * Lines are pooled with fixed-size buffers that are rewritten in place, so regenerating bolts
 * every few frames allocates nothing on the GPU.
 */
export class BoltRenderer {
  private readonly scene: THREE.Scene
  private readonly glowMaterial: LineMaterial
  private readonly coreMaterial: LineMaterial
  private readonly pool: BoltLine[] = []

  constructor(scene: THREE.Scene, glowColor: THREE.ColorRepresentation = '#9b6bff') {
    this.scene = scene
    const shared = { transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, worldUnits: false }
    this.glowMaterial = new LineMaterial({ ...shared, color: new THREE.Color(glowColor), linewidth: 9, opacity: 0.5 })
    // Above 1 so the core feeds the bloom pass.
    this.coreMaterial = new LineMaterial({ ...shared, color: new THREE.Color(2.4, 2.2, 2.8), linewidth: 2.2 })
  }

  /** Shows these paths (each of BOLT_POINTS points) and hides any spare lines. */
  draw(paths: Vec2[][], viewport: { width: number; height: number }, flicker = 1): void {
    this.glowMaterial.resolution.set(viewport.width, viewport.height)
    this.coreMaterial.resolution.set(viewport.width, viewport.height)
    this.glowMaterial.opacity = 0.5 * flicker
    this.coreMaterial.opacity = flicker
    while (this.pool.length < paths.length) this.pool.push(this.createLine())
    this.pool.forEach((line, i) => {
      const path = paths[i]
      line.glow.visible = line.core.visible = path !== undefined
      if (path) {
        writePath(line.glow.geometry, path)
        writePath(line.core.geometry, path)
      }
    })
  }

  hide(): void {
    this.pool.forEach((line) => (line.glow.visible = line.core.visible = false))
  }

  dispose(): void {
    this.pool.forEach((line) => {
      for (const part of [line.glow, line.core]) {
        part.removeFromParent()
        part.geometry.dispose()
      }
    })
    this.glowMaterial.dispose()
    this.coreMaterial.dispose()
  }

  private createLine(): BoltLine {
    const make = (material: LineMaterial, order: number) => {
      const geometry = new LineGeometry()
      geometry.setPositions(new Array(BOLT_POINTS * 3).fill(0))
      const line = new Line2(geometry, material)
      line.frustumCulled = false
      line.renderOrder = order
      line.position.z = 15
      this.scene.add(line)
      return line
    }
    return { glow: make(this.glowMaterial, 8), core: make(this.coreMaterial, 9) }
  }
}

/** Rewrites a LineGeometry's segment buffer in place: segment i runs from point i to point i+1. */
function writePath(geometry: LineGeometry, path: Vec2[]): void {
  const attribute = geometry.attributes.instanceStart as THREE.InterleavedBufferAttribute
  const buffer = attribute.data
  const array = buffer.array as Float32Array
  for (let i = 0; i < BOLT_POINTS - 1; i++) {
    const a = path[Math.min(i, path.length - 1)]
    const b = path[Math.min(i + 1, path.length - 1)]
    array.set([a.x, a.y, 0, b.x, b.y, 0], i * 6)
  }
  buffer.needsUpdate = true
}
