import { clamp, RAMP, type AudioEngine, type Channel, type ElementName } from './audioEngine'

/**
 * A looping sound that can be faded, panned, filtered and sped up while it plays: wind, bubbling
 * water, an electric buzz. Starts silent; call `setLevel` to bring it in.
 */
export class LoopVoice {
  private readonly audio: AudioEngine
  private readonly channel: Channel
  private readonly source: AudioBufferSourceNode
  private readonly filter: BiquadFilterNode
  private stopped = false

  constructor(audio: AudioEngine, bus: ElementName, buffer: AudioBuffer) {
    this.audio = audio
    this.channel = audio.channel(bus, 0)
    this.filter = audio.context.createBiquadFilter()
    this.filter.type = 'lowpass'
    this.filter.frequency.value = 20000
    this.source = audio.context.createBufferSource()
    this.source.buffer = buffer
    this.source.loop = true
    this.source.connect(this.filter).connect(this.channel.input)
    // Start at a random point so several voices of the same loop don't play in unison.
    this.source.start(0, Math.random() * buffer.duration)
  }

  setLevel(level: number, timeConstant = RAMP): void {
    if (!this.stopped) this.channel.input.gain.setTargetAtTime(clamp(level, 0, 1.5), this.audio.now, timeConstant)
  }

  setPan(pan: number): void {
    if (!this.stopped) this.channel.panner.pan.setTargetAtTime(clamp(pan, -1, 1), this.audio.now, RAMP)
  }

  /** Low-pass cutoff in Hz; lower sounds muffled and distant, higher bright and close. */
  setBrightness(frequency: number): void {
    if (!this.stopped) this.filter.frequency.setTargetAtTime(clamp(frequency, 100, 20000), this.audio.now, 0.05)
  }

  setRate(rate: number): void {
    if (!this.stopped) this.source.playbackRate.setTargetAtTime(clamp(rate, 0.5, 2), this.audio.now, 0.08)
  }

  /** Fades out over `fade` seconds, then frees the nodes. */
  stop(fade = 0.15): void {
    if (this.stopped) return
    this.stopped = true
    const now = this.audio.now
    this.channel.input.gain.setTargetAtTime(0, now, fade / 4)
    this.source.stop(now + fade + 0.05)
    this.source.onended = () => {
      this.source.disconnect()
      this.filter.disconnect()
      this.channel.input.disconnect()
      this.channel.panner.disconnect()
    }
  }
}
