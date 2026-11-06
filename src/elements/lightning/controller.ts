import type { GestureEvent, GestureFrame } from '../../gestures/gestureEngine'
import { BoltRenderer, boltBranches, boltPath } from '../../render/bolts'
import { GlowSprite } from '../../render/glow'
import type { RGB } from '../../render/particles'
import type { Handedness } from '../../tracking/handState'
import type { Vec2 } from '../../tracking/vec'
import type { LoopVoice } from '../../audio/loopVoice'
import { landmarkInScene, panInScene, sizeInScene, type EffectContext, type ElementController } from '../types'
import { LightningSounds, type ChargeVoice } from './sounds'

/**
 * Lightning: point to throw a bolt from your index finger (aimed along it), make two fingers to
 * split it into forks, and pinch to charge an energy sphere between thumb and index finger that
 * discharges in a burst of arcs when you let go.
 */

const HANDS: Handedness[] = ['Left', 'Right']
/** Bolts re-jag this often (seconds), which is what makes them flicker. */
const REGEN_MIN = 0.05
const REGEN_MAX = 0.08
/** Bolt reach as a fraction of the larger screen dimension. */
const REACH = 0.55
/** Seconds of pinching to reach full charge. */
const FULL_CHARGE = 2
const DISCHARGE_TIME = 0.3
const THUMB_TIP = 4
const INDEX_TIP = 8

const SPARK: RGB = [1.6, 1.3, 2.6]
const SPARK_END: RGB = [0.45, 0.2, 1]

interface HandBolt {
  paths: Vec2[][]
  nextRegen: number
  buzz: LoopVoice | null
}

interface Charge {
  start: number
  charge: number
  position: Vec2
  orb: GlowSprite
  arcs: Vec2[][]
  nextRegen: number
  voice: ChargeVoice | null
}

interface Discharge {
  origin: Vec2
  charge: number
  age: number
  nextRegen: number
  paths: Vec2[][]
}

const rand = (min: number, max: number) => min + Math.random() * (max - min)

export class LightningController implements ElementController {
  private readonly ctx: EffectContext
  private readonly sounds: LightningSounds | null
  private readonly bolts: BoltRenderer
  private readonly handBolts: Partial<Record<Handedness, HandBolt>> = {}
  private readonly charges: Partial<Record<Handedness, Charge>> = {}
  private discharges: Discharge[] = []
  private time = 0

  constructor(ctx: EffectContext) {
    this.ctx = ctx
    this.sounds = ctx.audio ? new LightningSounds(ctx.audio) : null
    this.bolts = new BoltRenderer(ctx.stage.scene)
  }

  update(dt: number, frame: GestureFrame, events: readonly GestureEvent[]): void {
    this.time += dt
    for (const event of events) {
      if (event.type === 'gestureEnd' && event.gesture === 'pinch') this.discharge(event.hand)
    }

    const paths: Vec2[][] = []
    for (const hand of HANDS) {
      paths.push(...this.updateBolt(hand, frame))
      paths.push(...this.updateCharge(hand, frame))
    }
    paths.push(...this.updateDischarges(dt))
    this.bolts.draw(paths, this.ctx.stage.viewport, 0.75 + 0.25 * Math.random())
  }

  reset(): void {
    for (const hand of HANDS) {
      this.stopBolt(hand)
      this.stopCharge(hand)
    }
    this.discharges = []
    this.bolts.hide()
  }

  dispose(): void {
    this.reset()
    this.bolts.dispose()
  }

  /** Pointing or two fingers: a bolt from the fingertip along the finger, forked for two fingers. */
  private updateBolt(hand: Handedness, frame: GestureFrame): Vec2[][] {
    const tracked = frame.hands[hand]
    const aiming = tracked && (tracked.pose === 'pointing' || tracked.pose === 'two_fingers') && tracked.pointing
    if (!tracked || !aiming || !tracked.pointing) {
      this.stopBolt(hand)
      return []
    }
    const { stage, particles } = this.ctx
    const tip = landmarkInScene(stage, tracked.state, INDEX_TIP)
    const reach = REACH * Math.max(stage.viewport.width, stage.viewport.height)
    const target = { x: tip.x + tracked.pointing.x * reach, y: tip.y + tracked.pointing.y * reach }

    let bolt = this.handBolts[hand]
    if (!bolt) {
      bolt = { paths: [], nextRegen: 0, buzz: this.sounds?.buzz() ?? null }
      this.handBolts[hand] = bolt
      this.sounds?.zap(panInScene(stage, tip))
    }
    if (this.time >= bolt.nextRegen) {
      const main = boltPath(tip, target, reach * 0.12)
      const forks = tracked.pose === 'two_fingers' ? 2 + Math.floor(Math.random() * 3) : Math.random() < 0.3 ? 1 : 0
      const branches = boltBranches(main, forks, reach * 0.1)
      // Forks sometimes fork again.
      const twigs = tracked.pose === 'two_fingers' ? branches.flatMap((b) => (Math.random() < 0.4 ? boltBranches(b, 1, reach * 0.05) : [])) : []
      bolt.paths = [main, ...branches, ...twigs]
      bolt.nextRegen = this.time + rand(REGEN_MIN, REGEN_MAX)
      for (const end of [tip, target, ...branches.map((b) => b[b.length - 1])]) sparks(particles, end, 3)
    }
    bolt.buzz?.setLevel(0.5 + 0.2 * Math.random())
    bolt.buzz?.setPan(panInScene(stage, tip))
    return bolt.paths
  }

  /** Pinch: an energy sphere between thumb and index finger, growing with hold time. */
  private updateCharge(hand: Handedness, frame: GestureFrame): Vec2[][] {
    const tracked = frame.hands[hand]
    if (!tracked || tracked.pose !== 'pinch') {
      // A pinch that ended this frame was already discharged by its gestureEnd event.
      this.stopCharge(hand)
      return []
    }
    const { stage, particles } = this.ctx
    const thumb = landmarkInScene(stage, tracked.state, THUMB_TIP)
    const index = landmarkInScene(stage, tracked.state, INDEX_TIP)
    const position = { x: (thumb.x + index.x) / 2, y: (thumb.y + index.y) / 2 }

    let charge = this.charges[hand]
    if (!charge) {
      charge = {
        start: this.time,
        charge: 0,
        position,
        orb: new GlowSprite(stage.scene, '#a77bff'),
        arcs: [],
        nextRegen: 0,
        voice: this.sounds?.charge() ?? null,
      }
      this.charges[hand] = charge
    }
    charge.position = position
    charge.charge = Math.min((this.time - charge.start) / FULL_CHARGE, 1)
    const radius = sizeInScene(stage, tracked.state) * (0.12 + 0.5 * charge.charge)
    charge.orb.update(position, radius, (0.6 + 0.8 * charge.charge) * (0.85 + 0.15 * Math.random()))
    charge.voice?.update(charge.charge, panInScene(stage, position))

    if (this.time >= charge.nextRegen) {
      // Little arcs crawling over the sphere's surface.
      const count = 1 + Math.round(3 * charge.charge)
      charge.arcs = Array.from({ length: count }, () => {
        const a = rand(0, Math.PI * 2)
        const b = a + rand(0.8, 2.2)
        const r = radius * 1.4
        return boltPath(
          { x: position.x + Math.cos(a) * r, y: position.y + Math.sin(a) * r },
          { x: position.x + Math.cos(b) * r, y: position.y + Math.sin(b) * r },
          r * 0.5,
        )
      })
      charge.nextRegen = this.time + rand(REGEN_MIN, REGEN_MAX)
      sparks(particles, position, 1 + Math.round(3 * charge.charge), radius)
    }
    return charge.arcs
  }

  /** Releasing a pinch: arcs burst outward, with a flash, a shake and thunder. */
  private discharge(hand: Handedness): void {
    const charge = this.charges[hand]
    if (!charge) return
    const { stage, particles } = this.ctx
    const amount = charge.charge
    this.discharges.push({ origin: charge.position, charge: amount, age: 0, nextRegen: 0, paths: [] })
    stage.flash('#b48cff', 0.15 + 0.35 * amount)
    stage.shake(3 + 9 * amount)
    sparks(particles, charge.position, 30 + Math.round(60 * amount), 10)
    this.sounds?.strike(panInScene(stage, charge.position), amount)
    this.stopCharge(hand)
  }

  private updateDischarges(dt: number): Vec2[][] {
    const paths: Vec2[][] = []
    const reach = Math.max(this.ctx.stage.viewport.width, this.ctx.stage.viewport.height)
    for (const d of this.discharges) {
      d.age += dt
      if (this.time >= d.nextRegen) {
        const count = 5 + Math.round(7 * d.charge)
        d.paths = Array.from({ length: count }, () => {
          const angle = rand(0, Math.PI * 2)
          const length = reach * rand(0.12, 0.3) * (0.6 + d.charge)
          const end = { x: d.origin.x + Math.cos(angle) * length, y: d.origin.y + Math.sin(angle) * length }
          return boltPath(d.origin, end, length * 0.15)
        })
        d.nextRegen = this.time + rand(REGEN_MIN, REGEN_MAX)
      }
      paths.push(...d.paths)
    }
    this.discharges = this.discharges.filter((d) => d.age < DISCHARGE_TIME)
    return paths
  }

  private stopBolt(hand: Handedness): void {
    this.handBolts[hand]?.buzz?.stop()
    delete this.handBolts[hand]
  }

  private stopCharge(hand: Handedness): void {
    const charge = this.charges[hand]
    if (!charge) return
    charge.voice?.stop()
    charge.orb.dispose()
    delete this.charges[hand]
  }
}

/** Bright violet sparks flying off a point. */
function sparks(particles: EffectContext['particles'], at: Vec2, count: number, spread = 4): void {
  for (let i = 0; i < count; i++) {
    const angle = rand(0, Math.PI * 2)
    const speed = rand(80, 380)
    particles.emit({
      x: at.x + rand(-spread, spread),
      y: at.y + rand(-spread, spread),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      ay: -250,
      drag: 3,
      life: rand(0.15, 0.4),
      size: rand(2, 4),
      sizeEnd: 1,
      color: SPARK,
      colorEnd: SPARK_END,
    })
  }
}
