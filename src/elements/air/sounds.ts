import type { AudioEngine } from '../../audio/audioEngine'
import { LoopVoice } from '../../audio/loopVoice'
import { loadSample } from '../../audio/samples'
import { thump, wind } from '../../audio/synth'

/** Recordings in public/sounds/ that replace the synthesized versions when present. */
const RECORDINGS = { wind: 'air-wind', shockwave: 'air-shockwave' } as const
type AirSound = keyof typeof RECORDINGS

/** Air's sounds: one wind loop that swells with the airflow, and a low thump for shockwaves. */
export class AirSounds {
  private readonly audio: AudioEngine
  private readonly buffers: Record<AirSound, AudioBuffer>

  constructor(audio: AudioEngine) {
    this.audio = audio
    const rate = audio.context.sampleRate
    this.buffers = { wind: audio.buffer(wind(rate, 4)), shockwave: audio.buffer(thump(rate)) }
    for (const [sound, file] of Object.entries(RECORDINGS) as [AirSound, string][]) {
      void loadSample(audio, file).then((buffer) => buffer && (this.buffers[sound] = buffer))
    }
  }

  wind(): LoopVoice {
    return new LoopVoice(this.audio, 'air', this.buffers.wind)
  }

  shockwave(pan: number, power: number): void {
    this.audio.playOneShot('air', this.buffers.shockwave, { gain: 0.6 + 0.4 * Math.min(power, 1.5), pan, rateJitter: 0.1 })
  }
}
