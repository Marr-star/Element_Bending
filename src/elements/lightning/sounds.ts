import { clamp, type AudioEngine } from '../../audio/audioEngine'
import { LoopVoice } from '../../audio/loopVoice'
import { loadSample } from '../../audio/samples'
import { electricBuzz, thunder, zap } from '../../audio/synth'

/** Recordings in public/sounds/ that replace the synthesized versions when present. */
const RECORDINGS = { buzz: 'lightning-buzz', zap: 'lightning-zap', strike: 'lightning-strike' } as const
type LightningSound = keyof typeof RECORDINGS

/**
 * Lightning's sounds: a crackling buzz while a bolt is live, a zap as it leaps out, a rising
 * whine while a pinch charges, and a crack of thunder on discharge.
 */
export class LightningSounds {
  private readonly audio: AudioEngine
  private readonly buffers: Record<LightningSound, AudioBuffer>

  constructor(audio: AudioEngine) {
    this.audio = audio
    const rate = audio.context.sampleRate
    this.buffers = { buzz: audio.buffer(electricBuzz(rate, 2)), zap: audio.buffer(zap(rate)), strike: audio.buffer(thunder(rate)) }
    for (const [sound, file] of Object.entries(RECORDINGS) as [LightningSound, string][]) {
      void loadSample(audio, file).then((buffer) => buffer && (this.buffers[sound] = buffer))
    }
  }

  buzz(): LoopVoice {
    return new LoopVoice(this.audio, 'lightning', this.buffers.buzz)
  }

  zap(pan: number): void {
    this.audio.playOneShot('lightning', this.buffers.zap, { gain: 0.45, pan, rateJitter: 0.15 })
  }

  /** `charge` 0..1: bigger charges crack louder and roll deeper. */
  strike(pan: number, charge: number): void {
    this.audio.playOneShot('lightning', this.buffers.strike, { gain: 0.55 + 0.45 * charge, pan, rateJitter: 0.1 })
  }

  charge(): ChargeVoice {
    return new ChargeVoice(this.audio)
  }
}

/** A thin electric whine that climbs in pitch as a pinch charges up. */
export class ChargeVoice {
  private readonly audio: AudioEngine
  private readonly oscillator: OscillatorNode
  private readonly vibrato: OscillatorNode
  private readonly output: GainNode
  private readonly panner: StereoPannerNode
  private stopped = false

  constructor(audio: AudioEngine) {
    this.audio = audio
    const ctx = audio.context
    const { input, panner } = audio.channel('lightning', 0)
    this.output = input
    this.panner = panner
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = 1200
    filter.Q.value = 0.7
    this.oscillator = ctx.createOscillator()
    this.oscillator.type = 'sawtooth'
    this.oscillator.frequency.value = 180
    // A fast wobble makes it crackle with energy rather than hum like a motor.
    this.vibrato = ctx.createOscillator()
    this.vibrato.frequency.value = 23
    const depth = ctx.createGain()
    depth.gain.value = 18
    this.vibrato.connect(depth).connect(this.oscillator.frequency)
    this.oscillator.connect(filter).connect(this.output)
    this.oscillator.start()
    this.vibrato.start()
  }

  update(charge: number, pan: number): void {
    if (this.stopped) return
    const now = this.audio.now
    this.oscillator.frequency.setTargetAtTime(180 + 720 * clamp(charge, 0, 1), now, 0.08)
    this.output.gain.setTargetAtTime(0.04 + 0.1 * charge, now, 0.05)
    this.panner.pan.setTargetAtTime(clamp(pan, -1, 1), now, 0.05)
  }

  stop(): void {
    if (this.stopped) return
    this.stopped = true
    const now = this.audio.now
    this.output.gain.setTargetAtTime(0, now, 0.02)
    this.oscillator.stop(now + 0.12)
    this.vibrato.stop(now + 0.12)
    this.oscillator.onended = () => {
      this.oscillator.disconnect()
      this.vibrato.disconnect()
      this.output.disconnect()
      this.panner.disconnect()
    }
  }
}
