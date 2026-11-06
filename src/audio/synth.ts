/**
 * Sound synthesis as pure functions: each returns mono samples in -1..1 at the given sample rate.
 * Built once at startup and wrapped in AudioBuffers by the engine. Passing a seeded `rng` makes
 * the output deterministic for tests.
 */

export type Rng = () => number

/** Small, fast seeded PRNG (mulberry32). */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const TAU = Math.PI * 2

/** Coefficient for a one-pole low-pass at `cutoff` Hz. */
const onePole = (cutoff: number, sampleRate: number) => 1 - Math.exp((-TAU * cutoff) / sampleRate)

/**
 * Chamberlin state-variable filter, one sample at a time, with a cutoff that can change every
 * sample (for sweeps). Stable while the cutoff stays below about a sixth of the sample rate.
 */
class StateVariableFilter {
  low = 0
  band = 0
  private readonly sampleRate: number
  private readonly damping: number

  constructor(sampleRate: number, q: number) {
    this.sampleRate = sampleRate
    this.damping = 1 / q
  }

  process(input: number, cutoff: number): void {
    const f = 2 * Math.sin((Math.PI * Math.min(cutoff, this.sampleRate / 6)) / this.sampleRate)
    this.low += f * this.band
    const high = input - this.low - this.damping * this.band
    this.band += f * high
  }
}

/** Scales samples so the loudest one reaches `peak`. */
function normalize(samples: Float32Array<ArrayBuffer>, peak = 0.9): Float32Array<ArrayBuffer> {
  let max = 0
  for (const s of samples) max = Math.max(max, Math.abs(s))
  if (max > 0) for (let i = 0; i < samples.length; i++) samples[i] *= peak / max
  return samples
}

/** Exponential interpolation from `from` to `to` as t goes 0..1, for natural-sounding sweeps. */
const sweep = (from: number, to: number, t: number) => from * Math.pow(to / from, Math.min(Math.max(t, 0), 1))

/**
 * Fills a loop of `n` samples from `sample(i)`, cross-fading the tail into the head so a
 * continuously varying bed (filtered noise) has no seam when the buffer loops.
 */
function loopedBed(n: number, fade: number, sample: (i: number) => number): Float32Array<ArrayBuffer> {
  const bed = new Float32Array(n + fade)
  for (let i = 0; i < bed.length; i++) bed[i] = sample(i)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) out[i] = bed[i]
  for (let i = 0; i < fade; i++) {
    const t = i / fade
    out[i] = bed[i] * t + bed[n + i] * (1 - t)
  }
  return out
}

/** A slow random-looking level (0..~1) built from sines with whole cycles per loop, so it loops too. */
function loopedFlicker(n: number, cycles: number[], rng: Rng): (i: number) => number {
  const parts = cycles.map((c, k) => ({ c, phase: rng() * TAU, depth: 1 / (k + 1.5) }))
  const total = parts.reduce((sum, part) => sum + part.depth, 0)
  return (i) => {
    let value = 0
    for (const { c, phase, depth } of parts) value += depth * Math.sin((TAU * c * i) / n + phase)
    return 0.5 + (0.5 * value) / total
  }
}

interface Snap {
  /** Resonant pitch of the snap in Hz: small splinters ring high, resin pops lower. */
  frequency: number
  q: number
  /** Decay time constant in seconds; real crackles die away within milliseconds. */
  decay: number
  amplitude: number
}

/** Adds one band-passed noise snap at `start`, wrapping around the end of the loop. */
function addSnap(out: Float32Array, start: number, sampleRate: number, snap: Snap, rng: Rng): void {
  const filter = new StateVariableFilter(sampleRate, snap.q)
  const tau = snap.decay * sampleRate
  const length = Math.ceil(tau * 7)
  for (let j = 0; j < length; j++) {
    filter.process(rng() * 2 - 1, snap.frequency)
    out[(start + j) % out.length] += filter.band * snap.amplitude * Math.exp(-j / tau)
  }
}

/** Most crackles are faint and a few are loud, as in a real fire. */
const heavyTail = (rng: Rng, power: number) => Math.pow(rng(), power)

/**
 * Burning wood, seamlessly loopable. Real fire is mostly crackle: sharp snaps of different sizes
 * that come in clusters as pockets of sap and gas burst, with an occasional deeper resin pop. Under
 * that sits only a faint flame "lapping" and a little steam hiss, never a loud rumble or a tone.
 */
export function woodFire(sampleRate: number, seconds = 4, rng: Rng = Math.random): Float32Array<ArrayBuffer> {
  const n = Math.round(sampleRate * seconds)
  const flicker = loopedFlicker(n, [2, 5, 9, 14], rng)
  const lap = onePole(220, sampleRate)
  const hissLow = onePole(3500, sampleRate)
  let low = 0
  let hissFiltered = 0
  const out = loopedBed(n, Math.round(sampleRate * 0.1), (i) => {
    const white = rng() * 2 - 1
    low += lap * (white - low)
    hissFiltered += hissLow * (white - hissFiltered)
    const hiss = white - hissFiltered
    const f = flicker(i % n)
    return low * (0.3 + 0.7 * f) * 0.9 + hiss * f * 0.025
  })

  const snap = (at: number, scale: number) => {
    // A crackle is often two or three snaps a fraction of a millisecond apart.
    const parts = 1 + Math.floor(rng() * 3)
    let offset = 0
    for (let k = 0; k < parts; k++) {
      addSnap(out, at + offset, sampleRate, {
        frequency: 1100 * Math.pow(7, rng()),
        q: 1.5 + rng() * 4,
        decay: 0.0004 + rng() * 0.0022,
        amplitude: (0.05 + 0.95 * heavyTail(rng, 3)) * scale * (k === 0 ? 1 : 0.5),
      }, rng)
      offset += Math.round(sampleRate * (0.0003 + rng() * 0.0018))
    }
  }

  // Steady sparse crackles, louder where the flame flickers up.
  for (let k = 0, count = Math.round(seconds * 16); k < count; k++) {
    const at = Math.floor(rng() * n)
    snap(at, 0.4 + 0.6 * flicker(at))
  }
  // Bursts: a pocket of gas lets go with a rapid run of crackles.
  for (let b = 0, bursts = Math.round(seconds * 1.6); b < bursts; b++) {
    const at = Math.floor(rng() * n)
    for (let k = 0, count = 3 + Math.floor(rng() * 7); k < count; k++) {
      snap(at + Math.floor(rng() * sampleRate * 0.12), 0.6 + 0.4 * rng())
    }
  }
  // Resin pops: rarer, lower and longer.
  for (let k = 0, count = Math.max(1, Math.round(seconds * 0.6)); k < count; k++) {
    addSnap(out, Math.floor(rng() * n), sampleRate, {
      frequency: 450 + rng() * 900,
      q: 3 + rng() * 3,
      decay: 0.005 + rng() * 0.01,
      amplitude: 0.7 + 0.5 * rng(),
    }, rng)
  }
  return normalize(out, 0.9)
}

/** Ignition "fwoomp": noise through a low-pass that opens fast, over a low swelling tone. */
export function ignite(sampleRate: number, rng: Rng = Math.random): Float32Array<ArrayBuffer> {
  const n = Math.round(sampleRate * 0.7)
  const out = new Float32Array(n)
  const filter = new StateVariableFilter(sampleRate, 0.9)
  let phase = 0
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate
    const envelope = Math.min(t / 0.04, 1) * Math.exp(-Math.max(t - 0.04, 0) / 0.18)
    filter.process(rng() * 2 - 1, t < 0.12 ? sweep(180, 3200, t / 0.12) : sweep(3200, 700, (t - 0.12) / 0.5))
    phase += (TAU * sweep(85, 140, t / 0.3)) / sampleRate
    out[i] = (filter.low * 1.1 + Math.sin(phase) * 0.45) * envelope
  }
  return normalize(out)
}

/** Whoosh: noise through a fast-sweeping band-pass, rising then falling. */
export function whoosh(sampleRate: number, rng: Rng = Math.random, seconds = 0.55): Float32Array<ArrayBuffer> {
  const n = Math.round(sampleRate * seconds)
  const out = new Float32Array(n)
  const filter = new StateVariableFilter(sampleRate, 2.2)
  for (let i = 0; i < n; i++) {
    const t = i / n
    const cutoff = t < 0.35 ? sweep(300, 2600, t / 0.35) : sweep(2600, 500, (t - 0.35) / 0.65)
    const envelope = Math.sin(Math.PI * Math.min(t / 0.7, 1)) ** 2 * (1 - t)
    filter.process(rng() * 2 - 1, cutoff)
    out[i] = filter.band * envelope
  }
  return normalize(out, 0.8)
}

/** Explosion: a sharp crack, a noise body whose low-pass closes, a low sine thump and a rumbling tail. */
export function explosion(sampleRate: number, rng: Rng = Math.random): Float32Array<ArrayBuffer> {
  const n = Math.round(sampleRate * 1.6)
  const out = new Float32Array(n)
  const body = new StateVariableFilter(sampleRate, 0.8)
  const rumble = onePole(110, sampleRate)
  let tail = 0
  let phase = 0
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate
    const white = rng() * 2 - 1

    const crack = white * Math.exp(-t / 0.008)
    body.process(white, sweep(2600, 140, t / 1.2))
    const bodyEnvelope = Math.min(t / 0.005, 1) * Math.exp(-t / 0.35)
    phase += (TAU * sweep(72, 34, t / 0.6)) / sampleRate
    const thump = Math.sin(phase) * Math.exp(-t / 0.18)
    tail += rumble * (white - tail)

    out[i] = crack * 0.6 + body.low * bodyEnvelope * 1.4 + thump * 0.9 + tail * 3 * Math.exp(-t / 0.6)
  }
  // Fade the last 50 ms so the buffer ends in silence.
  const fade = Math.round(sampleRate * 0.05)
  for (let i = 0; i < fade; i++) out[n - 1 - i] *= i / fade
  return normalize(out, 0.95)
}

/** Fades the last `seconds` of a one-shot to silence. */
function fadeTail(out: Float32Array, sampleRate: number, seconds = 0.05): void {
  const fade = Math.round(sampleRate * seconds)
  for (let i = 0; i < fade; i++) out[out.length - 1 - i] *= i / fade
}

/** A sine "blip" whose pitch rises as it decays: the sound of one bubble or droplet. */
function addBlip(out: Float32Array, start: number, sampleRate: number, frequency: number, decay: number, amplitude: number): void {
  const length = Math.ceil(decay * sampleRate * 6)
  let phase = 0
  for (let j = 0; j < length; j++) {
    const t = j / sampleRate
    phase += (TAU * frequency * (1 + 0.6 * (t / (decay * 6)))) / sampleRate
    const attack = Math.min(j / (sampleRate * 0.0015), 1)
    out[(start + j) % out.length] += Math.sin(phase) * amplitude * attack * Math.exp(-t / decay)
  }
}

/**
 * Electric buzz, seamlessly loopable: mains-like hum harmonics (whole cycles per loop) through a
 * band-pass, flickering in level, with sharp little crackles of discharge.
 */
export function electricBuzz(sampleRate: number, seconds = 2, rng: Rng = Math.random): Float32Array<ArrayBuffer> {
  const n = Math.round(sampleRate * seconds)
  const out = new Float32Array(n)
  const flicker = loopedFlicker(n, [11, 23, 37, 53], rng)
  const filter = new StateVariableFilter(sampleRate, 1.2)
  // Run the filter over two loops and keep the second, so it starts already settled.
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < n; i++) {
      const t = i / n
      const saw = ((t * seconds * 100) % 1) * 2 - 1
      const saw2 = ((t * seconds * 150) % 1) * 2 - 1
      filter.process(saw * 0.6 + saw2 * 0.4, 1600)
      if (pass === 1) out[i] = filter.band * (0.35 + 0.65 * flicker(i))
    }
  }
  for (let k = 0, count = Math.round(seconds * 30); k < count; k++) {
    addSnap(out, Math.floor(rng() * n), sampleRate, { frequency: 3000 + rng() * 5000, q: 2, decay: 0.0006 + rng() * 0.0015, amplitude: 0.6 + rng() }, rng)
  }
  return normalize(out, 0.8)
}

/** Zap: the crack of a bolt leaping out, a bright chirp falling in pitch over a buzzy burst. */
export function zap(sampleRate: number, rng: Rng = Math.random): Float32Array<ArrayBuffer> {
  const n = Math.round(sampleRate * 0.35)
  const out = new Float32Array(n)
  const filter = new StateVariableFilter(sampleRate, 3)
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate
    filter.process(rng() * 2 - 1, sweep(7000, 1200, t / 0.2))
    const saw = ((t * 120) % 1) * 2 - 1
    out[i] = (filter.band * 1.4 + saw * 0.25) * Math.min(t / 0.002, 1) * Math.exp(-t / 0.07)
  }
  fadeTail(out, sampleRate)
  return normalize(out, 0.85)
}

/** Thunder: a splitting crack, then a long rumble that rolls in irregular waves. */
export function thunder(sampleRate: number, rng: Rng = Math.random): Float32Array<ArrayBuffer> {
  const n = Math.round(sampleRate * 2.8)
  const out = new Float32Array(n)
  const crack = new StateVariableFilter(sampleRate, 0.9)
  const rumble = onePole(140, sampleRate)
  const roll = onePole(3, sampleRate)
  let low = 0
  let rolling = 0
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate
    const white = rng() * 2 - 1
    crack.process(white, sweep(5000, 900, t / 0.15))
    low += rumble * (white - low)
    rolling += roll * ((rng() < 0.5 ? 0 : 1) - rolling)
    const crackEnvelope = Math.min(t / 0.003, 1) * Math.exp(-t / 0.05)
    const rumbleEnvelope = Math.min(t / 0.12, 1) * Math.exp(-t / 0.9) * (0.4 + 1.2 * rolling)
    out[i] = crack.band * crackEnvelope * 1.5 + low * rumbleEnvelope * 5
  }
  fadeTail(out, sampleRate, 0.2)
  return normalize(out, 0.95)
}

/** Wind, seamlessly loopable: breathy band-passed noise rising and falling in gusts. */
export function wind(sampleRate: number, seconds = 4, rng: Rng = Math.random): Float32Array<ArrayBuffer> {
  const n = Math.round(sampleRate * seconds)
  const gusts = loopedFlicker(n, [1, 2, 3, 5], rng)
  const filter = new StateVariableFilter(sampleRate, 1.4)
  const out = loopedBed(n, Math.round(sampleRate * 0.1), (i) => {
    const g = gusts(i % n)
    filter.process(rng() * 2 - 1, 380 + 900 * g)
    return filter.band * (0.25 + 0.75 * g)
  })
  return normalize(out, 0.8)
}

/** A soft, low thump: pressure released, as air bursts outward. */
export function thump(sampleRate: number, rng: Rng = Math.random): Float32Array<ArrayBuffer> {
  const n = Math.round(sampleRate * 0.9)
  const out = new Float32Array(n)
  const filter = new StateVariableFilter(sampleRate, 0.8)
  let phase = 0
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate
    phase += (TAU * sweep(75, 38, t / 0.4)) / sampleRate
    filter.process(rng() * 2 - 1, sweep(1800, 300, t / 0.5))
    const attack = Math.min(t / 0.006, 1)
    out[i] = (Math.sin(phase) * Math.exp(-t / 0.2) + filter.low * 0.8 * Math.exp(-t / 0.25)) * attack
  }
  fadeTail(out, sampleRate)
  return normalize(out, 0.9)
}

/** Bubbling water, seamlessly loopable: many small bubbles over a quiet watery bed. */
export function bubbles(sampleRate: number, seconds = 3, rng: Rng = Math.random): Float32Array<ArrayBuffer> {
  const n = Math.round(sampleRate * seconds)
  const filter = new StateVariableFilter(sampleRate, 0.7)
  const out = loopedBed(n, Math.round(sampleRate * 0.05), () => {
    filter.process(rng() * 2 - 1, 700)
    return filter.band * 0.04
  })
  for (let k = 0, count = Math.round(seconds * 26); k < count; k++) {
    addBlip(out, Math.floor(rng() * n), sampleRate, 350 * Math.pow(4, rng()), 0.008 + rng() * 0.02, 0.15 + 0.85 * heavyTail(rng, 2))
  }
  return normalize(out, 0.8)
}

/** Flowing water, seamlessly loopable: a rushing, gurgling stream. */
export function stream(sampleRate: number, seconds = 4, rng: Rng = Math.random): Float32Array<ArrayBuffer> {
  const n = Math.round(sampleRate * seconds)
  const ripple = loopedFlicker(n, [17, 29, 43, 61], rng)
  const filter = new StateVariableFilter(sampleRate, 1)
  const out = loopedBed(n, Math.round(sampleRate * 0.08), (i) => {
    filter.process(rng() * 2 - 1, 1400 + 1400 * ripple(i % n))
    return filter.band * (0.4 + 0.6 * ripple(i % n))
  })
  for (let k = 0, count = Math.round(seconds * 40); k < count; k++) {
    addBlip(out, Math.floor(rng() * n), sampleRate, 600 * Math.pow(3, rng()), 0.005 + rng() * 0.01, 0.1 + 0.3 * rng())
  }
  return normalize(out, 0.8)
}

/** Splash: a wash of noise breaking, then droplets falling back. */
export function splash(sampleRate: number, rng: Rng = Math.random): Float32Array<ArrayBuffer> {
  const n = Math.round(sampleRate * 1.4)
  const out = new Float32Array(n)
  const filter = new StateVariableFilter(sampleRate, 0.9)
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate
    filter.process(rng() * 2 - 1, sweep(4500, 900, t / 0.6))
    out[i] = filter.band * Math.min(t / 0.01, 1) * Math.exp(-t / 0.22) * 1.6
  }
  for (let k = 0; k < 30; k++) {
    const at = Math.floor((0.08 + Math.pow(rng(), 1.5) * 0.9) * sampleRate)
    addBlip(out, at, sampleRate, 500 * Math.pow(3.5, rng()), 0.006 + rng() * 0.015, 0.2 + 0.5 * rng())
  }
  fadeTail(out, sampleRate, 0.1)
  return normalize(out, 0.9)
}
