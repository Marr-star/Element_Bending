/** The app's single requestAnimationFrame loop. `tick` receives seconds since the last frame. */
export function startLoop(tick: (dt: number, now: number) => void): () => void {
  let handle = 0
  let last = performance.now()

  const frame = (now: number) => {
    const dt = Math.min((now - last) / 1000, 0.1)
    last = now
    tick(dt, now)
    handle = requestAnimationFrame(frame)
  }

  handle = requestAnimationFrame(frame)
  return () => cancelAnimationFrame(handle)
}
