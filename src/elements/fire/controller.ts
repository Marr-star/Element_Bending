import type { GestureEvent, GestureFrame } from '../../gestures/gestureEngine'
import type { Handedness } from '../../tracking/handState'
import type { Vec2 } from '../../tracking/vec'
import { palmInScene, sizeInScene, velocityInScene, type EffectContext, type ElementController } from '../types'
import { emitCharge, emitExplosion, emitFlames, emitSparks, emitTrail, FireballCore } from './visuals'

/**
 * Fire: a fist conjures a fireball that follows the hand. Opening the hand releases it (thrown if
 * the hand is moving, otherwise it fades), a push launches it at the viewer, and two fists brought
 * together merge into one ball that grows while held.
 *
 * Each ball runs its own state machine: charging -> holding -> launched -> exploding, or
 * holding -> fading on a gentle release. No ball at all is the idle state.
 */

type Phase = 'charging' | 'holding' | 'launched' | 'exploding' | 'fading'

interface Fireball {
  phase: Phase
  phaseTime: number
  /** Hands holding the ball; two after a merge, none once released. */
  owners: Handedness[]
  position: Vec2
  velocity: Vec2
  radius: number
  /** Radius when fully charged in one hand. */
  baseRadius: number
  holdTime: number
  /** Thrown across the screen, or flying at the viewer after a push. */
  towardViewer: boolean
  launchRadius: number
  /** Explosion strength; 1 for a normal fireball. */
  power: number
  core: FireballCore
}

/** Seconds. */
const CHARGE_TIME = 0.35
const MAX_FLIGHT = 1.5
const VIEWER_FLIGHT = 0.35
const EXPLODE_TIME = 0.18
const FADE_TIME = 0.6
/** How quickly a held ball catches up with the hand, per second. */
const FOLLOW_RATE = 18
/** Hand speeds in video heights per second: faster than this on release throws the ball... */
const THROW_SPEED = 0.6
/** ...and a launched ball flies at least this fast. */
const MIN_LAUNCH_SPEED = 1.3
/** Fireball radius relative to hand size, clamped to pixels. */
const RADIUS_PER_HAND = 0.55
const MIN_RADIUS = 22
const MAX_RADIUS = 110
/** A merged ball grows to this many times its base radius while held. */
const MERGED_MAX_GROWTH = 2.5

export class FireController implements ElementController {
  private readonly ctx: EffectContext
  private balls: Fireball[] = []
  private time = 0

  constructor(ctx: EffectContext) {
    this.ctx = ctx
  }

  update(dt: number, frame: GestureFrame, events: readonly GestureEvent[]): void {
    this.time += dt
    for (const event of events) this.handle(event, frame)
    this.mergeIfTogether(frame)
    for (const ball of [...this.balls]) this.step(ball, dt, frame)
  }

  dispose(): void {
    this.balls.forEach((ball) => ball.core.dispose())
    this.balls = []
  }

  private handle(event: GestureEvent, frame: GestureFrame): void {
    if (event.type === 'gestureStart' && event.gesture === 'fist') {
      if (!this.heldBy(event.hand)) this.spawn(event.hand, frame)
    } else if (event.type === 'gestureEnd' && event.gesture === 'fist') {
      const ball = this.heldBy(event.hand)
      if (ball) this.release(ball, frame)
    } else if (event.type === 'push') {
      const ball = this.heldBy(event.hand)
      if (ball) this.launchAtViewer(ball)
    }
  }

  private heldBy(hand: Handedness): Fireball | undefined {
    return this.balls.find((ball) => ball.owners.includes(hand))
  }

  private spawn(hand: Handedness, frame: GestureFrame): void {
    const tracked = frame.hands[hand]
    if (!tracked) return
    const { stage } = this.ctx
    const baseRadius = clamp(sizeInScene(stage, tracked.state) * RADIUS_PER_HAND, MIN_RADIUS, MAX_RADIUS)
    this.balls.push({
      phase: 'charging',
      phaseTime: 0,
      owners: [hand],
      position: palmInScene(stage, tracked.state),
      velocity: { x: 0, y: 0 },
      radius: 0,
      baseRadius,
      holdTime: 0,
      towardViewer: false,
      launchRadius: 0,
      power: 1,
      core: new FireballCore(stage.scene),
    })
  }

  /** Two fists close together, each holding its own ball: fuse them into one. */
  private mergeIfTogether(frame: GestureFrame): void {
    if (!frame.twoHands?.close || frame.hands.Left?.pose !== 'fist' || frame.hands.Right?.pose !== 'fist') return
    const left = this.heldBy('Left')
    const right = this.heldBy('Right')
    if (!left || !right || left === right) return

    const merged: Fireball = {
      ...left,
      phase: 'holding',
      phaseTime: 0,
      owners: ['Left', 'Right'],
      position: midpoint(left.position, right.position),
      radius: Math.max(left.radius, right.radius) * 1.2,
      baseRadius: (left.baseRadius + right.baseRadius) / 2,
      holdTime: 0,
    }
    right.core.dispose()
    this.balls = this.balls.filter((ball) => ball !== left && ball !== right)
    this.balls.push(merged)
    emitSparks(this.ctx.particles, merged.position, merged.radius, 1, 40)
    this.ctx.stage.flash(0xff8a30, 0.12)
  }

  /** Let go: thrown along the hand's motion if it is moving fast, otherwise it fades away. */
  private release(ball: Fireball, frame: GestureFrame): void {
    const { stage } = this.ctx
    const hands = ball.owners.map((hand) => frame.hands[hand]).filter((hand) => hand !== undefined)
    ball.owners = []
    const velocity = hands.length
      ? average(hands.map((hand) => velocityInScene(stage, hand.state)))
      : { x: 0, y: 0 }
    const speed = Math.hypot(velocity.x, velocity.y)

    if (speed > THROW_SPEED * stage.plane.height) {
      const launchSpeed = Math.max(speed * 1.2, MIN_LAUNCH_SPEED * stage.plane.height)
      ball.velocity = { x: (velocity.x / speed) * launchSpeed, y: (velocity.y / speed) * launchSpeed }
      ball.power = Math.max(1, ball.radius / ball.baseRadius)
      this.setPhase(ball, 'launched')
    } else {
      this.setPhase(ball, 'fading')
    }
  }

  /** A push sends the ball at the viewer: it swells toward the camera and bursts. */
  private launchAtViewer(ball: Fireball): void {
    ball.owners = []
    ball.towardViewer = true
    ball.launchRadius = Math.max(ball.radius, ball.baseRadius * 0.6)
    ball.power = 1.6 * Math.max(1, ball.radius / ball.baseRadius)
    this.setPhase(ball, 'launched')
  }

  private explode(ball: Fireball): void {
    const { particles, stage } = this.ctx
    emitExplosion(particles, ball.position, Math.min(ball.radius, MAX_RADIUS * 1.5), ball.power)
    stage.flash(0xff7a20, Math.min(0.2 * ball.power, 0.7))
    stage.shake(7 * ball.power)
    this.setPhase(ball, 'exploding')
  }

  private setPhase(ball: Fireball, phase: Phase): void {
    ball.phase = phase
    ball.phaseTime = 0
  }

  private step(ball: Fireball, dt: number, frame: GestureFrame): void {
    const { particles, stage } = this.ctx
    ball.phaseTime += dt
    const previous = { ...ball.position }
    let intensity = 1

    switch (ball.phase) {
      case 'charging':
      case 'holding': {
        const hands = ball.owners.map((hand) => frame.hands[hand])
        if (hands.some((hand) => hand === undefined)) {
          this.release(ball, frame)
          break
        }
        const states = hands.map((hand) => hand!.state)
        const target = average(states.map((state) => palmInScene(stage, state)))
        const follow = 1 - Math.exp(-FOLLOW_RATE * dt)
        ball.position.x += (target.x - ball.position.x) * follow
        ball.position.y += (target.y - ball.position.y) * follow

        if (ball.phase === 'charging') {
          const t = Math.min(ball.phaseTime / CHARGE_TIME, 1)
          ball.radius = ball.baseRadius * (1 - (1 - t) * (1 - t))
          intensity = 0.6 + 0.4 * t
          emitCharge(particles, ball.position, ball.baseRadius, dt)
          if (t >= 1) this.setPhase(ball, 'holding')
        } else {
          ball.holdTime += dt
          const growth = ball.owners.length > 1 ? Math.min(1.2 + ball.holdTime * 0.6, MERGED_MAX_GROWTH) : 1 + Math.min(ball.holdTime, 2) * 0.08
          ball.radius += (ball.baseRadius * growth - ball.radius) * (1 - Math.exp(-4 * dt))
          intensity = 1 + 0.08 * Math.sin(this.time * 9 + ball.baseRadius)
        }

        emitFlames(particles, ball.position, ball.radius, dt)
        emitSparks(particles, ball.position, ball.radius, dt)
        const handSpeed = Math.max(...states.map((state) => state.speed))
        if (handSpeed > 0.3) emitTrail(particles, previous, ball.position, ball.radius, Math.min(handSpeed, 3) / 3)
        break
      }

      case 'launched': {
        if (ball.towardViewer) {
          const t = Math.min(ball.phaseTime / VIEWER_FLIGHT, 1)
          ball.radius = ball.launchRadius * (1 + 3 * t * t)
          intensity = 1 + 0.15 * t
          emitFlames(particles, ball.position, ball.radius, dt, 0.8)
          if (t >= 1) this.explode(ball)
          break
        }
        ball.position.x += ball.velocity.x * dt
        ball.position.y += ball.velocity.y * dt
        emitTrail(particles, previous, ball.position, ball.radius, 1.5)
        emitFlames(particles, ball.position, ball.radius, dt, 0.6)

        const halfWidth = stage.viewport.width / 2 - ball.radius * 0.3
        const halfHeight = stage.viewport.height / 2 - ball.radius * 0.3
        const outside = Math.abs(ball.position.x) > halfWidth || Math.abs(ball.position.y) > halfHeight
        if (outside || ball.phaseTime >= MAX_FLIGHT) {
          ball.position.x = clamp(ball.position.x, -halfWidth, halfWidth)
          ball.position.y = clamp(ball.position.y, -halfHeight, halfHeight)
          this.explode(ball)
        }
        break
      }

      case 'exploding': {
        const t = ball.phaseTime / EXPLODE_TIME
        ball.radius *= 1 + dt * 6
        intensity = Math.max(0, 1.6 * (1 - t))
        if (t >= 1) this.remove(ball)
        break
      }

      case 'fading': {
        const t = ball.phaseTime / FADE_TIME
        ball.position.y += 70 * dt
        ball.radius *= Math.exp(-dt * 2.5)
        intensity = Math.max(0, 1 - t)
        emitFlames(particles, ball.position, ball.radius, dt, 1 - t)
        if (t >= 1) this.remove(ball)
        break
      }
    }

    ball.core.update(ball.position, ball.radius, intensity, this.time)
  }

  private remove(ball: Fireball): void {
    ball.core.dispose()
    this.balls = this.balls.filter((other) => other !== ball)
  }
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const midpoint = (a: Vec2, b: Vec2): Vec2 => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })

function average(points: Vec2[]): Vec2 {
  return {
    x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
    y: points.reduce((sum, p) => sum + p.y, 0) / points.length,
  }
}
