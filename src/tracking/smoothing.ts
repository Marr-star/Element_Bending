import type { Vec3 } from './vec'

/**
 * One Euro filter parameters (Casiez et al., 2012). A low `minCutoff` removes jitter when the
 * hand is still; a higher `beta` raises the cutoff with speed so fast moves don't lag.
 */
export interface OneEuroParams {
  minCutoff: number
  beta: number
  dCutoff: number
}

const smoothingFactor = (cutoff: number, dt: number) => {
  const tau = 1 / (2 * Math.PI * cutoff)
  return 1 / (1 + tau / dt)
}

export class OneEuroFilter {
  private readonly params: OneEuroParams
  private value: number | null = null
  private derivative = 0

  /** `params` is read on every call, so changing the object tunes the filter live. */
  constructor(params: OneEuroParams) {
    this.params = params
  }

  filter(value: number, dt: number): number {
    if (this.value === null || dt <= 0) {
      this.value ??= value
      return this.value
    }
    const { minCutoff, beta, dCutoff } = this.params
    const rawDerivative = (value - this.value) / dt
    this.derivative += smoothingFactor(dCutoff, dt) * (rawDerivative - this.derivative)
    const cutoff = minCutoff + beta * Math.abs(this.derivative)
    this.value += smoothingFactor(cutoff, dt) * (value - this.value)
    return this.value
  }
}

/** Smooths all 21 landmarks of one hand, one filter per coordinate. */
export class LandmarkSmoother {
  private readonly filters: OneEuroFilter[][]

  constructor(params: OneEuroParams, count = 21) {
    this.filters = Array.from({ length: count }, () => [
      new OneEuroFilter(params),
      new OneEuroFilter(params),
      new OneEuroFilter(params),
    ])
  }

  filter(points: Vec3[], dt: number): Vec3[] {
    return points.map((p, i) => {
      const [fx, fy, fz] = this.filters[i]
      return { x: fx.filter(p.x, dt), y: fy.filter(p.y, dt), z: fz.filter(p.z, dt) }
    })
  }
}
