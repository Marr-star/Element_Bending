export type ElementName = 'fire' | 'water' | 'lightning' | 'air'

/** Time constant for parameter changes, in seconds. Ramping instead of jumping avoids clicks. */
export const RAMP = 0.03

/**
 * One AudioContext for the app. Every sound is routed:
 * gain -> StereoPanner -> element bus -> master -> compressor -> speakers.
 *
 * Browsers start an AudioContext suspended unless it is created during a user gesture, so create
 * this inside the Start button's click handler.
 */
export class AudioEngine {
  readonly context: AudioContext
  private readonly master: GainNode
  private readonly buses: Record<ElementName, GainNode>
  private volume = 0.8
  private muted = false

  constructor() {
    this.context = new AudioContext({ latencyHint: 'interactive' })
    const compressor = this.context.createDynamicsCompressor()
    compressor.threshold.value = -14
    compressor.knee.value = 12
    compressor.ratio.value = 4
    compressor.connect(this.context.destination)

    this.master = this.context.createGain()
    this.master.gain.value = this.volume
    this.master.connect(compressor)

    const bus = () => {
      const gain = this.context.createGain()
      gain.connect(this.master)
      return gain
    }
    this.buses = { fire: bus(), water: bus(), lightning: bus(), air: bus() }
    void this.context.resume()
  }

  get now(): number {
    return this.context.currentTime
  }

  /** Wraps mono samples in an AudioBuffer at the context's sample rate. */
  buffer(samples: Float32Array<ArrayBuffer>): AudioBuffer {
    const buffer = this.context.createBuffer(1, samples.length, this.context.sampleRate)
    buffer.copyToChannel(samples, 0)
    return buffer
  }

  /** A gain -> panner chain into an element's bus; sources connect to `input`. */
  channel(bus: ElementName, gain = 1, pan = 0): Channel {
    const input = this.context.createGain()
    input.gain.value = gain
    const panner = this.context.createStereoPanner()
    panner.pan.value = clamp(pan, -1, 1)
    input.connect(panner).connect(this.buses[bus])
    return { input, panner }
  }

  /**
   * Plays a buffer once. Each call gets a fresh source node and a slightly random playback rate,
   * so repeats don't sound identical.
   */
  playOneShot(bus: ElementName, buffer: AudioBuffer, { gain = 1, pan = 0, rateJitter = 0.1 } = {}): void {
    const { input, panner } = this.channel(bus, gain, pan)
    const source = this.context.createBufferSource()
    source.buffer = buffer
    source.playbackRate.value = 1 + (Math.random() * 2 - 1) * rateJitter
    source.connect(input)
    source.onended = () => {
      source.disconnect()
      input.disconnect()
      panner.disconnect()
    }
    source.start()
  }

  setMasterVolume(volume: number): void {
    this.volume = clamp(volume, 0, 1)
    this.applyMaster()
  }

  setBusVolume(bus: ElementName, volume: number): void {
    this.buses[bus].gain.setTargetAtTime(clamp(volume, 0, 1), this.now, RAMP)
  }

  setMuted(muted: boolean): void {
    this.muted = muted
    this.applyMaster()
  }

  close(): void {
    void this.context.close()
  }

  private applyMaster(): void {
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.now, RAMP)
  }
}

export interface Channel {
  input: GainNode
  panner: StereoPannerNode
}

/** Creates the engine, or returns null where Web Audio is unavailable so the app still runs silently. */
export function createAudioEngine(): AudioEngine | null {
  try {
    return new AudioEngine()
  } catch (err) {
    console.warn('[audio] Web Audio unavailable, running without sound', err)
    return null
  }
}

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
