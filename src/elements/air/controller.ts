import * as THREE from 'three'
import type { LoopVoice } from '../../audio/loopVoice'
import type { GestureEvent, GestureFrame, TrackedHand } from '../../gestures/gestureEngine'
import { GlowSprite } from '../../render/glow'
import type { RGB } from '../../render/particles'
import { VIDEO_BRIGHTNESS } from '../../render/scene'
import { distortionVertex, shockwaveFragment } from '../../render/shaders/distortion'
import type { Handedness } from '../../tracking/handState'
import type { Vec2 } from '../../tracking/vec'
import { palmInScene, panInScene, sizeInScene, velocityInScene, type EffectContext, type ElementController } from '../types'
import { AirSounds } from './sounds'

/**
 * Air: an open palm sends a stream of air the way the hand moves, twisting the wrist spins up a
 * vortex, bringing both hands close compresses the air into a dense glowing ball, and snapping
 * them apart releases a shockwave that ripples the room around it.
 */

const HANDS: Handedness[] = ['Left', 'Right']
const AIR: RGB = [0.75, 1.0, 0.95]
const AIR_END: RGB = [0.15, 0.25, 0.25]
const AIR_BRIGHT: RGB = [1.3, 1.7, 1.6]
/** Seconds the shockwave takes to reach full size. */
const SHOCKWAVE_TIME = 0.7
/** Seconds of compression for full power. */
const FULL_COMPRESS = 2
/** How long after the hands separate a compression still powers a shockwave. */
const COMPRESS_MEMORY = 1

interface Shockwave {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>
  center: Vec2
  power: number
  age: number
}

const rand = (min: number, max: number) => min + Math.random() * (max - min)

export class AirController implements ElementController {
  private readonly ctx: EffectContext
  private readonly sounds: AirSounds | null
  private readonly ball: GlowSprite
  private windVoice: LoopVoice | null = null
  private shockwaves: Shockwave[] = []
  private compress = 0
  private compressCenter: Vec2 = { x: 0, y: 0 }
  /** Strongest recent compression and when it was, so a shockwave can still use it. */
  private lastCompress = { amount: 0, time: -Infinity }
  private time = 0

  constructor(ctx: EffectContext) {
    this.ctx = ctx
    this.sounds = ctx.audio ? new AirSounds(ctx.audio) : null
    this.ball = new GlowSprite(ctx.stage.scene, '#bff5e8')
  }

  update(dt: number, frame: GestureFrame, events: readonly GestureEvent[]): void {
    this.time += dt
    for (const event of events) {
      if (event.type === 'handsApart') this.releaseShockwave(frame)
    }

    let airflow = 0
    let spinning = 0
    for (const hand of HANDS) {
      const tracked = frame.hands[hand]
      if (!tracked?.visible) continue
      if (tracked.pose === 'open_palm') airflow = Math.max(airflow, this.blow(tracked, dt))
      if (tracked.rotation !== 0) {
        this.vortex(tracked, dt)
        spinning = 1
      }
    }
    const compressing = this.updateCompress(frame, dt)
    this.updateShockwaves(dt)
    this.updateWind(airflow, spinning, compressing)
  }

  reset(): void {
    this.windVoice?.stop()
    this.windVoice = null
    this.shockwaves.forEach((s) => disposeMesh(s.mesh))
    this.shockwaves = []
    this.compress = 0
    this.ball.hide()
  }

  dispose(): void {
    this.reset()
    this.ball.dispose()
  }

  /** Open palm: a stream of air leaving the hand in the direction it moves. Returns its strength 0..1. */
  private blow(tracked: TrackedHand, dt: number): number {
    const { stage, particles } = this.ctx
    const palm = palmInScene(stage, tracked.state)
    const size = sizeInScene(stage, tracked.state)
    const speed = tracked.state.speed
    const velocity = velocityInScene(stage, tracked.state)
    const length = Math.hypot(velocity.x, velocity.y)
    // A still hand breathes gently upward; a moving one throws air after itself.
    const dir = speed > 0.25 && length > 0 ? { x: velocity.x / length, y: velocity.y / length } : { x: 0, y: 1 }
    const strength = Math.min(speed / 2, 1)
    const count = roundRandomly(dt * (20 + 90 * strength))
    for (let i = 0; i < count; i++) {
      const spread = rand(-0.35, 0.35)
      const cos = Math.cos(spread)
      const sin = Math.sin(spread)
      const d = { x: dir.x * cos - dir.y * sin, y: dir.x * sin + dir.y * cos }
      const fast = rand(250, 650) * (0.5 + 0.7 * strength)
      const x = palm.x + rand(-0.45, 0.45) * size
      const y = palm.y + rand(-0.45, 0.45) * size
      const life = rand(0.55, 1)
      const width = rand(4, 7)
      // Each puff is a short streak: a few points in a line along its direction, fading to the tail.
      for (let k = 0; k < 4; k++) {
        particles.emit({
          x: x - d.x * k * width * 1.4,
          y: y - d.y * k * width * 1.4,
          vx: d.x * fast,
          vy: d.y * fast,
          drag: 1.4,
          life,
          size: width * (1 - k * 0.2),
          sizeEnd: 1.5,
          color: k === 0 ? AIR_BRIGHT : AIR,
          colorEnd: AIR_END,
        })
      }
    }
    return 0.25 + 0.75 * strength
  }

  /** Wrist rotation: air orbits the palm in a narrowing spiral, spinning the way the hand turns. */
  private vortex(tracked: TrackedHand, dt: number): void {
    const { stage, particles } = this.ctx
    const center = palmInScene(stage, tracked.state)
    const size = sizeInScene(stage, tracked.state)
    const count = roundRandomly(dt * 110)
    for (let i = 0; i < count; i++) {
      const angle = rand(0, Math.PI * 2)
      const radius = size * rand(1.6, 2.6)
      const life = rand(0.8, 1.4)
      particles.emit({
        x: center.x + Math.cos(angle) * radius,
        y: center.y + Math.sin(angle) * radius,
        orbit: { x: center.x, y: center.y, spin: tracked.rotation * rand(3, 5), inward: (radius * 0.85) / life },
        life,
        size: rand(2, 4),
        sizeEnd: 1.5,
        color: AIR_BRIGHT,
        colorEnd: AIR,
      })
    }
  }

  /** Both hands close together: air is drawn in between them and packs into a glowing ball. */
  private updateCompress(frame: GestureFrame, dt: number): boolean {
    const { stage, particles } = this.ctx
    const left = frame.hands.Left
    const right = frame.hands.Right
    const pressing = Boolean(frame.twoHands?.close && left?.visible && right?.visible)

    if (pressing && left && right) {
      const a = palmInScene(stage, left.state)
      const b = palmInScene(stage, right.state)
      this.compressCenter = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      this.compress = Math.min(this.compress + dt / FULL_COMPRESS, 1)
      this.lastCompress = { amount: this.compress, time: this.time }
      const ring = Math.max(Math.hypot(a.x - b.x, a.y - b.y) / 2, 40)
      const count = roundRandomly(dt * 80)
      for (let i = 0; i < count; i++) {
        const angle = rand(0, Math.PI * 2)
        const life = rand(0.35, 0.6)
        particles.emit({
          x: this.compressCenter.x + Math.cos(angle) * ring * 1.3,
          y: this.compressCenter.y + Math.sin(angle) * ring * 1.3,
          orbit: { x: this.compressCenter.x, y: this.compressCenter.y, spin: rand(1.5, 3), inward: (ring * 1.2) / life },
          life,
          size: rand(2, 3.5),
          sizeEnd: 1,
          color: AIR,
          colorEnd: AIR_BRIGHT,
        })
      }
    } else {
      this.compress = Math.max(this.compress - dt * 2, 0)
    }
    const radius = 8 + 26 * this.compress
    this.ball.update(this.compressCenter, radius, this.compress * (0.8 + 0.2 * Math.sin(this.time * 30)))
    return pressing
  }

  /** Hands snapping apart: an expanding ring that warps the room, stronger after compressing. */
  private releaseShockwave(frame: GestureFrame): void {
    const { stage, particles } = this.ctx
    const recent = this.time - this.lastCompress.time < COMPRESS_MEMORY ? this.lastCompress.amount : 0
    const power = 0.6 + 0.8 * recent
    const left = frame.hands.Left
    const right = frame.hands.Right
    const center =
      recent > 0
        ? this.compressCenter
        : left && right
          ? midpoint(palmInScene(stage, left.state), palmInScene(stage, right.state))
          : { x: 0, y: 0 }

    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        vertexShader: distortionVertex,
        fragmentShader: shockwaveFragment,
        uniforms: {
          uVideo: { value: stage.videoTexture },
          uPlane: { value: new THREE.Vector2(stage.plane.width, stage.plane.height) },
          uBrightness: { value: VIDEO_BRIGHTNESS },
          uRadius: { value: 1 },
          uStrength: { value: power },
        },
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
    )
    mesh.position.set(center.x, center.y, 4)
    mesh.renderOrder = 4
    stage.scene.add(mesh)
    this.shockwaves.push({ mesh, center, power, age: 0 })

    for (let i = 0; i < 90 * power; i++) {
      const angle = rand(0, Math.PI * 2)
      const speed = rand(500, 900) * power
      particles.emit({
        x: center.x,
        y: center.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        drag: 2.5,
        life: rand(0.4, 0.7),
        size: rand(2.5, 5),
        sizeEnd: 1,
        color: AIR_BRIGHT,
        colorEnd: AIR_END,
      })
    }
    stage.shake(3 + 5 * power)
    stage.flash('#d8fff4', 0.08 + 0.12 * recent)
    this.sounds?.shockwave(panInScene(stage, center), power)
    this.compress = 0
    this.lastCompress = { amount: 0, time: -Infinity }
  }

  private updateShockwaves(dt: number): void {
    const { stage } = this.ctx
    const maxRadius = 0.6 * Math.max(stage.viewport.width, stage.viewport.height)
    for (const wave of this.shockwaves) {
      wave.age += dt
      const t = Math.min(wave.age / SHOCKWAVE_TIME, 1)
      const radius = maxRadius * wave.power * (1 - (1 - t) * (1 - t))
      // The ring sits at 85% of the quad, so scale the quad to put it at `radius`.
      wave.mesh.scale.setScalar(Math.max(radius / 0.85, 1))
      const uniforms = wave.mesh.material.uniforms
      uniforms.uRadius.value = radius
      uniforms.uStrength.value = wave.power * (1 - t)
      uniforms.uPlane.value.set(stage.plane.width, stage.plane.height)
    }
    for (const wave of this.shockwaves.filter((w) => w.age >= SHOCKWAVE_TIME)) disposeMesh(wave.mesh)
    this.shockwaves = this.shockwaves.filter((w) => w.age < SHOCKWAVE_TIME)
  }

  private updateWind(airflow: number, spinning: number, compressing: boolean): void {
    const level = Math.min(airflow * 0.7 + spinning * 0.5 + (compressing ? 0.3 : 0), 1)
    if (level <= 0) {
      this.windVoice?.setLevel(0, 0.15)
      return
    }
    this.windVoice ??= this.sounds?.wind() ?? null
    this.windVoice?.setLevel(level * 0.8, 0.08)
    // A spinning vortex makes the wind howl and wobble.
    this.windVoice?.setBrightness(700 + 3500 * level + spinning * 900 * Math.sin(this.time * 7))
  }
}

const midpoint = (a: Vec2, b: Vec2): Vec2 => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })

function roundRandomly(mean: number): number {
  const whole = Math.floor(mean)
  return whole + (Math.random() < mean - whole ? 1 : 0)
}

function disposeMesh(mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>): void {
  mesh.removeFromParent()
  mesh.geometry.dispose()
  mesh.material.dispose()
}
