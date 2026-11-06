import type { ElementKind } from './elementStyles'

/**
 * The start screen's moving backdrop, drawn on a 2D canvas: each element's emblem gives off its
 * element (rising embers, orbiting water, spiralling air, crackling lightning), with faint motes
 * drifting through the whole scene.
 */

export interface Emitter {
  kind: ElementKind
  x: number
  y: number
  /** Emblem radius in CSS pixels. */
  radius: number
}

interface Particle {
  kind: ElementKind | 'mote'
  x: number
  y: number
  vx: number
  vy: number
  age: number
  life: number
  size: number
  /** For orbiting and spiralling particles: centre, angle, distance and their rates. */
  cx: number
  cy: number
  angle: number
  distance: number
  spin: number
  drift: number
  px: number
  py: number
}

interface Bolt {
  points: [number, number][]
  age: number
  life: number
}

const MAX_PARTICLES = 900
const rand = (min: number, max: number) => min + Math.random() * (max - min)

/** Particles per second from each emblem. */
const RATES: Record<Exclude<ElementKind, 'lightning'>, number> = { fire: 60, water: 40, air: 28 }

/** Starts the animation; returns a function that stops it. */
export function startBackdrop(canvas: HTMLCanvasElement, emitters: () => Emitter[]): () => void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return () => {}
  const particles: Particle[] = []
  const bolts: Bolt[] = []
  const nextBolt = new Map<ElementKind, number>()
  let width = 0
  let height = 0
  let handle = 0
  let last = performance.now()
  let time = 0

  const resize = () => {
    const ratio = Math.min(window.devicePixelRatio, 2)
    width = canvas.clientWidth
    height = canvas.clientHeight
    canvas.width = Math.round(width * ratio)
    canvas.height = Math.round(height * ratio)
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
  }
  resize()
  window.addEventListener('resize', resize)

  const spawn = (p: Partial<Particle> & Pick<Particle, 'kind' | 'x' | 'y' | 'life' | 'size'>) => {
    if (particles.length >= MAX_PARTICLES) particles.shift()
    particles.push({ vx: 0, vy: 0, age: 0, cx: 0, cy: 0, angle: 0, distance: 0, spin: 0, drift: 0, px: p.x, py: p.y, ...p })
  }

  // Faint motes drifting through the whole scene.
  for (let i = 0; i < 70; i++) {
    spawn({ kind: 'mote', x: rand(0, width), y: rand(0, height), vx: rand(-6, 6), vy: rand(-10, -3), life: rand(8, 16), size: rand(0.6, 1.6), age: rand(0, 8) })
  }

  const emit = (e: Emitter, dt: number) => {
    if (e.kind === 'lightning') {
      const due = nextBolt.get(e.kind) ?? 0
      if (time >= due) {
        bolts.push({ points: jaggedBolt(e), age: 0, life: rand(0.12, 0.22) })
        if (Math.random() < 0.4) bolts.push({ points: jaggedBolt(e), age: 0, life: rand(0.08, 0.16) })
        nextBolt.set(e.kind, time + rand(0.25, 0.9))
        for (let i = 0; i < 8; i++) {
          const a = rand(0, Math.PI * 2)
          spawn({ kind: 'lightning', x: e.x, y: e.y, vx: Math.cos(a) * rand(40, 120), vy: Math.sin(a) * rand(40, 120), life: rand(0.25, 0.6), size: rand(0.8, 1.8) })
        }
      }
      return
    }

    let count = RATES[e.kind] * dt
    while (count > 0) {
      if (Math.random() < count) {
        if (e.kind === 'fire') {
          // From the upper rim, so embers aren't hidden behind the medallion as they rise.
          const a = rand(Math.PI * 1.05, Math.PI * 1.95)
          spawn({
            kind: 'fire',
            x: e.x + Math.cos(a) * e.radius * rand(0.9, 1.15),
            y: e.y + Math.sin(a) * e.radius * rand(0.9, 1.15),
            vx: Math.cos(a) * rand(10, 30),
            vy: rand(-90, -40),
            life: rand(2.5, 4.5),
            size: rand(2, 4.5),
            spin: rand(1.5, 4),
          })
        } else if (e.kind === 'water') {
          spawn({
            kind: 'water',
            x: e.x,
            y: e.y,
            cx: e.x,
            cy: e.y,
            angle: rand(0, Math.PI * 2),
            distance: e.radius * rand(1.1, 1.5),
            spin: rand(1.2, 2.2),
            drift: rand(4, 14),
            life: rand(1.8, 3.2),
            size: rand(1.6, 3),
          })
        } else {
          spawn({
            kind: 'air',
            x: e.x,
            y: e.y,
            cx: e.x,
            cy: e.y,
            angle: rand(0, Math.PI * 2),
            distance: e.radius * 0.9,
            spin: -rand(1.4, 2.4),
            drift: rand(22, 40),
            life: rand(2.4, 3.6),
            size: rand(1.2, 2.4),
          })
        }
      }
      count -= 1
    }
  }

  const frame = (now: number) => {
    const dt = Math.min((now - last) / 1000, 0.05)
    last = now
    time += dt
    const sources = emitters()
    for (const e of sources) emit(e, dt)

    ctx.clearRect(0, 0, width, height)
    ctx.globalCompositeOperation = 'lighter'

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]
      p.age += dt
      if (p.age >= p.life) {
        if (p.kind === 'mote') {
          Object.assign(p, { x: rand(0, width), y: height + 10, age: 0 })
        } else {
          particles.splice(i, 1)
          continue
        }
      }
      const t = p.age / p.life
      p.px = p.x
      p.py = p.y

      switch (p.kind) {
        case 'fire': {
          p.vx += Math.sin(time * p.spin + p.size * 10) * 20 * dt
          p.x += p.vx * dt
          p.y += p.vy * dt
          const alpha = (1 - t) * (0.6 + 0.4 * Math.sin(time * 20 + p.size * 7))
          glowDot(ctx, p.x, p.y, p.size * (1 - t * 0.5), `hsla(${30 - t * 25}, 100%, ${65 - t * 20}%, ${alpha})`)
          break
        }
        case 'water': {
          p.angle += p.spin * dt
          p.distance += p.drift * dt
          p.x = p.cx + Math.cos(p.angle) * p.distance
          p.y = p.cy + Math.sin(p.angle) * p.distance * 0.75
          streak(ctx, p, `hsla(200, 100%, 72%, ${Math.sin(Math.PI * t) * 0.9})`, p.size, dt)
          break
        }
        case 'air': {
          p.angle += p.spin * dt
          p.distance += p.drift * dt
          p.x = p.cx + Math.cos(p.angle) * p.distance
          p.y = p.cy + Math.sin(p.angle) * p.distance
          streak(ctx, p, `hsla(160, 75%, 88%, ${Math.sin(Math.PI * t) * 0.7})`, p.size, dt)
          break
        }
        case 'lightning': {
          p.x += p.vx * dt
          p.y += p.vy * dt
          p.vx *= 0.94
          p.vy *= 0.94
          glowDot(ctx, p.x, p.y, p.size, `hsla(270, 100%, 85%, ${1 - t})`)
          break
        }
        case 'mote': {
          p.x += (p.vx + Math.sin(time * 0.3 + p.size * 5) * 4) * dt
          p.y += p.vy * dt
          glowDot(ctx, p.x, p.y, p.size, `hsla(40, 60%, 85%, ${Math.sin(Math.PI * t) * 0.35})`)
          break
        }
      }
    }

    for (let i = bolts.length - 1; i >= 0; i--) {
      const bolt = bolts[i]
      bolt.age += dt
      if (bolt.age >= bolt.life) {
        bolts.splice(i, 1)
        continue
      }
      const alpha = 1 - bolt.age / bolt.life
      drawBolt(ctx, bolt.points, alpha)
    }

    ctx.globalCompositeOperation = 'source-over'
    handle = requestAnimationFrame(frame)
  }
  handle = requestAnimationFrame(frame)

  return () => {
    cancelAnimationFrame(handle)
    window.removeEventListener('resize', resize)
  }
}

function glowDot(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string): void {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, size * 4)
  gradient.addColorStop(0, color)
  gradient.addColorStop(1, 'transparent')
  ctx.fillStyle = gradient
  ctx.beginPath()
  ctx.arc(x, y, size * 4, 0, Math.PI * 2)
  ctx.fill()
}

/** Trail length in seconds of travel, so streams look the same at any frame rate. */
const TRAIL = 0.07

/** A line back along the particle's recent path, so moving particles read as streams. */
function streak(ctx: CanvasRenderingContext2D, p: Particle, color: string, width: number, dt: number): void {
  const back = dt > 0 ? TRAIL / dt : 0
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(p.x - (p.x - p.px) * back, p.y - (p.y - p.py) * back)
  ctx.lineTo(p.x, p.y)
  ctx.stroke()
}

/** A forked, jagged bolt from the emblem's edge outward, by midpoint displacement. */
function jaggedBolt(e: Emitter): [number, number][] {
  const angle = rand(0, Math.PI * 2)
  const start: [number, number] = [e.x + Math.cos(angle) * e.radius, e.y + Math.sin(angle) * e.radius]
  const reach = e.radius * rand(1.6, 3)
  const end: [number, number] = [start[0] + Math.cos(angle + rand(-0.5, 0.5)) * reach, start[1] + Math.sin(angle + rand(-0.5, 0.5)) * reach]
  let points: [number, number][] = [start, end]
  let spread = reach * 0.3
  for (let level = 0; level < 5; level++) {
    const next: [number, number][] = [points[0]]
    for (let i = 1; i < points.length; i++) {
      const [ax, ay] = points[i - 1]
      const [bx, by] = points[i]
      next.push([(ax + bx) / 2 + rand(-spread, spread), (ay + by) / 2 + rand(-spread, spread)], points[i])
    }
    points = next
    spread /= 2
  }
  return points
}

function drawBolt(ctx: CanvasRenderingContext2D, points: [number, number][], alpha: number): void {
  const path = () => {
    ctx.beginPath()
    ctx.moveTo(points[0][0], points[0][1])
    for (const [x, y] of points.slice(1)) ctx.lineTo(x, y)
  }
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = `rgba(170, 120, 255, ${0.35 * alpha})`
  ctx.lineWidth = 6
  path()
  ctx.stroke()
  ctx.strokeStyle = `rgba(245, 235, 255, ${alpha})`
  ctx.lineWidth = 1.4
  path()
  ctx.stroke()
}
