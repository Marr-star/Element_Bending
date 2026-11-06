import { describe, expect, it } from 'vitest'
import { explosion, ignite, seededRng, whoosh, woodFire } from './synth'

const RATE = 48000

const peak = (s: Float32Array) => s.reduce((max, v) => Math.max(max, Math.abs(v)), 0)
const rms = (s: Float32Array) => Math.sqrt(s.reduce((sum, v) => sum + v * v, 0) / s.length)

const sounds = {
  woodFire: () => woodFire(RATE, 4, seededRng(1)),
  ignite: () => ignite(RATE, seededRng(2)),
  whoosh: () => whoosh(RATE, seededRng(3)),
  explosion: () => explosion(RATE, seededRng(4)),
}
const loops = ['woodFire'] as const

describe('synthesized sounds', () => {
  for (const [name, make] of Object.entries(sounds)) {
    it(`${name} is finite, audible and never clips`, () => {
      const samples = make()
      expect(samples.every(Number.isFinite)).toBe(true)
      expect(peak(samples)).toBeGreaterThan(0.5)
      expect(peak(samples)).toBeLessThanOrEqual(0.95 + 1e-6)
    })

    it(`${name} is deterministic for a given seed`, () => {
      expect(make()).toEqual(make())
    })
  }

  it('wood fire has the requested length', () => {
    expect(woodFire(RATE, 4, seededRng(1)).length).toBe(RATE * 4)
  })

  for (const name of loops) {
    it(`${name} loops without a jump at the seam`, () => {
      const samples = sounds[name]()
      const steps = Array.from({ length: samples.length - 1 }, (_, i) => Math.abs(samples[i + 1] - samples[i])).sort((a, b) => a - b)
      const typicalStep = steps[Math.floor(steps.length * 0.99)]
      expect(Math.abs(samples[0] - samples.at(-1)!)).toBeLessThan(typicalStep)
    })

    it(`${name} is crackly, not a steady noise`, () => {
      // Crest factor (peak / RMS): sharp snaps over a quiet bed score high. Steady filtered noise,
      // which sounds like a rumble or an engine, scores about 4.
      const samples = sounds[name]()
      expect(peak(samples) / rms(samples)).toBeGreaterThan(10)
    })

    it(`${name} has no strong pitched tone (the "motor" sound)`, () => {
      // Autocorrelation of a tonal sound peaks again at its period; crackle and noise do not.
      const samples = sounds[name]().subarray(0, RATE)
      const correlation = (lag: number) => {
        let sum = 0
        for (let i = 0; i + lag < samples.length; i++) sum += samples[i] * samples[i + lag]
        return sum
      }
      const energy = correlation(0)
      // Lags covering 50-400 Hz, where an engine-like hum would sit.
      let strongest = 0
      for (let lag = RATE / 400; lag <= RATE / 50; lag++) strongest = Math.max(strongest, correlation(lag) / energy)
      expect(strongest).toBeLessThan(0.5)
    })
  }

  it('explosion starts loud and ends in silence', () => {
    const samples = explosion(RATE, seededRng(4))
    const first = samples.subarray(0, RATE * 0.1)
    const last = samples.subarray(samples.length - RATE * 0.05)
    expect(rms(first)).toBeGreaterThan(0.1)
    expect(rms(last)).toBeLessThan(0.01)
  })

  it('one-shots fade in instead of starting with a click', () => {
    for (const make of [sounds.ignite, sounds.whoosh]) {
      expect(Math.abs(make()[0])).toBeLessThan(0.01)
    }
  })
})
