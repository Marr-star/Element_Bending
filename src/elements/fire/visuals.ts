import * as THREE from 'three'
import type { ParticleSystem, RGB } from '../../render/particles'
import { fireballFragment, fireballVertex } from '../../render/shaders/fireball'
import type { Vec2 } from '../../tracking/vec'

/**
 * Particles blend additively, so overlapping flames add up; keep single-particle colours modest
 * and let overlap (and sparks, which are tiny) push past 1 into the bloom.
 */
const FLAME_HOT: RGB = [0.75, 0.38, 0.08]
const FLAME_COOL: RGB = [0.3, 0.04, 0.0]
const SPARK: RGB = [2.2, 1.6, 0.7]
const SPARK_END: RGB = [0.9, 0.2, 0.03]
const EMBER: RGB = [0.8, 0.28, 0.05]

/**
 * Quad width per unit of ball radius. The shader's flame edge sits at about 0.6 of the quad's
 * half-width, so this makes the visible ball match `radius` with room for flames and halo.
 */
const QUAD_SCALE = 3.3

const rand = (min: number, max: number) => min + Math.random() * (max - min)

/** The glowing noise-shaded core of one fireball. */
export class FireballCore {
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>

  constructor(scene: THREE.Scene) {
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.ShaderMaterial({
        vertexShader: fireballVertex,
        fragmentShader: fireballFragment,
        uniforms: {
          uTime: { value: 0 },
          uIntensity: { value: 1 },
          uSeed: { value: Math.random() * 100 },
        },
        // Premultiplied "over": colour + background * (1 - alpha). See the shader.
        blending: THREE.CustomBlending,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneMinusSrcAlphaFactor,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
    )
    this.mesh.position.z = 10
    this.mesh.renderOrder = 6
    scene.add(this.mesh)
  }

  update(position: Vec2, radius: number, intensity: number, time: number): void {
    this.mesh.position.x = position.x
    this.mesh.position.y = position.y
    this.mesh.scale.setScalar(Math.max(radius, 0.001) * QUAD_SCALE)
    this.mesh.material.uniforms.uTime.value = time
    this.mesh.material.uniforms.uIntensity.value = intensity
  }

  dispose(): void {
    this.mesh.removeFromParent()
    this.mesh.geometry.dispose()
    this.mesh.material.dispose()
  }
}

/**
 * Flame tongues licking up off the ball's rim (mostly its upper half), so they frame the core
 * instead of piling additively on top of it. `amount` scales the count (1 = normal).
 */
export function emitFlames(particles: ParticleSystem, at: Vec2, radius: number, dt: number, amount = 1): void {
  // Big balls get more and larger tongues, but capped so additive overlap doesn't clip to white.
  const flameScale = Math.min(radius, 80)
  const count = roundRandomly(dt * (25 + flameScale * 0.5) * amount)
  for (let i = 0; i < count; i++) {
    const angle = rand(-0.35, Math.PI + 0.35)
    const r = radius * rand(0.55, 0.85)
    particles.emit({
      x: at.x + Math.cos(angle) * r,
      y: at.y + Math.sin(angle) * r,
      vx: Math.cos(angle) * 25 + rand(-15, 15),
      vy: rand(30, 80),
      ay: flameScale * 3,
      drag: 1.5,
      turbulence: flameScale * 0.2,
      life: rand(0.3, 0.6),
      size: flameScale * rand(0.45, 0.7),
      sizeEnd: flameScale * 0.08,
      color: FLAME_HOT,
      colorEnd: FLAME_COOL,
    })
  }
}

/** Small bright sparks thrown off in random directions, falling slightly. */
export function emitSparks(particles: ParticleSystem, at: Vec2, radius: number, dt: number, rate = 14): void {
  const count = roundRandomly(dt * rate)
  for (let i = 0; i < count; i++) {
    const angle = rand(-0.3, Math.PI + 0.3)
    const speed = rand(120, 320)
    particles.emit({
      x: at.x + rand(-0.4, 0.4) * radius,
      y: at.y + rand(-0.2, 0.5) * radius,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      ay: -260,
      drag: 1.2,
      life: rand(0.35, 0.8),
      size: rand(3, 6),
      sizeEnd: 1,
      color: SPARK,
      colorEnd: SPARK_END,
    })
  }
}

/** Energy pulled in toward a charging ball. */
export function emitCharge(particles: ParticleSystem, at: Vec2, radius: number, dt: number): void {
  const count = roundRandomly(dt * 90)
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2
    const distance = radius * rand(2.2, 3.2)
    const life = rand(0.25, 0.4)
    particles.emit({
      x: at.x + Math.cos(angle) * distance,
      y: at.y + Math.sin(angle) * distance,
      vx: (-Math.cos(angle) * distance) / life,
      vy: (-Math.sin(angle) * distance) / life,
      life,
      size: rand(4, 9),
      sizeEnd: radius * 0.4,
      color: EMBER,
      colorEnd: FLAME_HOT,
    })
  }
}

/** Trail along a segment the ball just covered; denser the faster it moves. */
export function emitTrail(particles: ParticleSystem, from: Vec2, to: Vec2, radius: number, intensity = 1): void {
  const length = Math.hypot(to.x - from.x, to.y - from.y)
  const count = Math.min(40, Math.floor((length / Math.max(radius * 0.35, 4)) * intensity))
  for (let i = 0; i < count; i++) {
    const t = Math.random()
    particles.emit({
      x: from.x + (to.x - from.x) * t + rand(-0.3, 0.3) * radius,
      y: from.y + (to.y - from.y) * t + rand(-0.3, 0.3) * radius,
      vx: rand(-25, 25),
      vy: rand(10, 50),
      ay: radius,
      drag: 2,
      turbulence: radius * 0.15,
      life: rand(0.25, 0.5),
      size: radius * rand(0.5, 0.85),
      sizeEnd: radius * 0.08,
      color: FLAME_HOT,
      colorEnd: FLAME_COOL,
    })
  }
}

/** Explosion burst. `power` 1 is a normal fireball; larger for charged or point-blank ones. */
export function emitExplosion(particles: ParticleSystem, at: Vec2, radius: number, power: number): void {
  // Heavy drag keeps the fireball a dense, billowing cloud instead of scattering into dots.
  const flames = Math.round(160 * power)
  for (let i = 0; i < flames; i++) {
    const angle = Math.random() * Math.PI * 2
    const speed = Math.sqrt(Math.random()) * radius * 6 * Math.sqrt(power)
    particles.emit({
      x: at.x,
      y: at.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      ay: radius * 1.5,
      drag: 5,
      turbulence: radius * 0.35,
      life: rand(0.35, 0.75),
      size: Math.min(radius, 120) * rand(0.9, 1.6),
      sizeEnd: Math.min(radius, 120) * 0.3,
      color: FLAME_HOT,
      colorEnd: FLAME_COOL,
    })
  }
  const sparks = Math.round(70 * power)
  for (let i = 0; i < sparks; i++) {
    const angle = Math.random() * Math.PI * 2
    const speed = rand(300, 900) * Math.sqrt(power)
    particles.emit({
      x: at.x,
      y: at.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      ay: -400,
      drag: 1.8,
      life: rand(0.5, 1.1),
      size: rand(3, 7),
      sizeEnd: 1,
      color: SPARK,
      colorEnd: SPARK_END,
    })
  }
}

/** Rounds up with probability equal to the fraction, so low emission rates still emit at high FPS. */
function roundRandomly(mean: number): number {
  const whole = Math.floor(mean)
  return whole + (Math.random() < mean - whole ? 1 : 0)
}
