/**
 * Debounces a per-frame value: a new value must repeat for `holdFrames` consecutive frames before
 * it replaces the current one. A single odd frame in the middle of a gesture changes nothing.
 */
export class Stabilizer<T> {
  private current: T
  private candidate: T
  private count = 0

  constructor(initial: T) {
    this.current = initial
    this.candidate = initial
  }

  get value(): T {
    return this.current
  }

  update(next: T, holdFrames: number): T {
    if (next === this.current) {
      this.candidate = next
      this.count = 0
      return this.current
    }
    if (next === this.candidate) {
      this.count++
    } else {
      this.candidate = next
      this.count = 1
    }
    if (this.count >= holdFrames) {
      this.current = next
      this.count = 0
    }
    return this.current
  }
}
