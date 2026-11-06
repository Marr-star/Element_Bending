import { RAMP, type AudioEngine, type Channel } from '../../audio/audioEngine'
import { loadSample } from '../../audio/samples'
import { explosion, ignite, whoosh, woodFire } from '../../audio/synth'

/**
 * Recordings that replace the synthesized sounds when present in public/sounds/
 * (as .ogg, .mp3, .wav or .m4a).
 */
const RECORDINGS = {
  hold: 'fire-hold',
  ignite: 'fire-ignite',
  whoosh: 'fire-whoosh',
  explosion: 'fire-explosion',
} as const
type FireSound = keyof typeof RECORDINGS

/**
 * Fire's sounds. Everything is synthesized once at startup, then swapped for a real recording
 * wherever one exists in public/sounds/. While a fireball is held it plays the `fire-hold`
 * recording exactly as recorded.
 */
export class FireSounds {
  private readonly audio: AudioEngine
  private readonly buffers: Record<FireSound, AudioBuffer>

  constructor(audio: AudioEngine) {
    this.audio = audio
    const rate = audio.context.sampleRate
    this.buffers = {
      hold: audio.buffer(woodFire(rate, 4)),
      ignite: audio.buffer(ignite(rate)),
      whoosh: audio.buffer(whoosh(rate)),
      explosion: audio.buffer(explosion(rate)),
    }
    void this.loadRecordings()
  }

  ignite(pan: number): void {
    this.audio.playOneShot('fire', this.buffers.ignite, { gain: 0.7, pan })
  }

  whoosh(pan: number, gain = 0.8): void {
    this.audio.playOneShot('fire', this.buffers.whoosh, { gain, pan, rateJitter: 0.15 })
  }

  /** `power` 1 is a normal fireball; bigger blasts are louder and deeper. */
  explode(pan: number, power: number): void {
    this.audio.playOneShot('fire', this.buffers.explosion, {
      gain: Math.min(0.6 + 0.25 * power, 1.2),
      pan,
      rateJitter: 0.08 / power,
    })
  }

  voice(): FireballVoice {
    return new FireballVoice(this.audio, this.buffers.hold)
  }

  /** New voices and one-shots pick up recordings as they finish loading. */
  private async loadRecordings(): Promise<void> {
    const found: string[] = []
    await Promise.all(
      (Object.entries(RECORDINGS) as [FireSound, string][]).map(async ([sound, file]) => {
        const buffer = await loadSample(this.audio, file)
        if (!buffer) return
        this.buffers[sound] = buffer
        found.push(file)
      }),
    )
    if (found.length) console.info(`[audio] using recorded fire sounds: ${found.join(', ')}`)
  }
}

/**
 * The sound of one fireball while it exists: the hold recording, played from the start at its
 * original volume, looping if the ball is held longer than the recording. Nothing else is
 * mixed in, filtered or panned.
 */
export class FireballVoice {
  private readonly audio: AudioEngine
  private readonly channel: Channel
  private readonly source: AudioBufferSourceNode
  private stopped = false

  constructor(audio: AudioEngine, buffer: AudioBuffer) {
    this.audio = audio
    this.channel = audio.channel('fire', 0)
    this.source = audio.context.createBufferSource()
    this.source.buffer = buffer
    this.source.loop = true
    this.source.connect(this.channel.input)
    this.source.start()
    // A few milliseconds of fade-in only, so starting mid-waveform doesn't click.
    this.channel.input.gain.setTargetAtTime(1, audio.now, 0.005)
  }

  /** `level` 1 while held; lower while the ball fades away after being released. */
  setLevel(level: number): void {
    if (this.stopped) return
    this.channel.input.gain.setTargetAtTime(Math.min(Math.max(level, 0), 1), this.audio.now, RAMP)
  }

  /** Fades out over `fade` seconds, then frees the nodes. */
  stop(fade = 0.12): void {
    if (this.stopped) return
    this.stopped = true
    const now = this.audio.now
    this.channel.input.gain.setTargetAtTime(0, now, fade / 4)
    this.source.stop(now + fade + 0.05)
    this.source.onended = () => {
      this.source.disconnect()
      this.channel.input.disconnect()
      this.channel.panner.disconnect()
    }
  }
}
