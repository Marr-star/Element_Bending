import { useEffect, useRef } from 'react'
import { startBackdrop, type Emitter } from './backdrop'
import type { ElementKind } from './elementStyles'
import { Emblem } from './emblems'

const KINDS: ElementKind[] = ['fire', 'water', 'air', 'lightning']

interface StartScreenProps {
  starting: boolean
  error: string | null
  onStart(): void
}

/** The title screen: four elemental medallions giving off their element around the title. */
export function StartScreen({ starting, error, onStart }: StartScreenProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const emblemRefs = useRef<Partial<Record<ElementKind, HTMLDivElement | null>>>({})

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    return startBackdrop(canvas, () => {
      const origin = canvas.getBoundingClientRect()
      return KINDS.flatMap((kind): Emitter[] => {
        const element = emblemRefs.current[kind]
        if (!element) return []
        const box = element.getBoundingClientRect()
        return [{ kind, x: box.left + box.width / 2 - origin.left, y: box.top + box.height / 2 - origin.top, radius: box.width / 2 }]
      })
    })
  }, [])

  const emblem = (kind: ElementKind, delay: number) => (
    <Emblem kind={kind} delay={delay} ref={(element) => void (emblemRefs.current[kind] = element)} />
  )

  return (
    <div className="absolute inset-0 overflow-hidden bg-[radial-gradient(ellipse_at_center,#14203a_0%,#0a0f1e_45%,#04050a_100%)]">
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 size-full" />
      <Ring />

      <div className="relative z-10 flex h-full items-center justify-center overflow-y-auto px-4 py-3">
        <div className="flex w-full max-w-4xl flex-col items-center gap-3 sm:gap-5 [@media(max-height:700px)]:gap-1">
          <div className="flex w-full justify-between px-[4%] sm:px-[8%]">
            {emblem('air', 0)}
            {emblem('water', 1.5)}
          </div>

          <div className="flex max-w-2xl flex-col items-center text-center">
            <p className="font-display text-[10px] tracking-[0.5em] text-amber-200/60 uppercase sm:text-xs">
              Water · Fire · Lightning · Air
            </p>
            <h1 className="font-display mt-3 animate-shimmer bg-[linear-gradient(100deg,#ffb36b_0%,#ff7a3d_18%,#7fd3ff_38%,#c9a6ff_58%,#b9f3e4_78%,#ffb36b_100%)] bg-[length:200%_100%] bg-clip-text text-4xl leading-tight font-black tracking-[0.08em] text-transparent uppercase drop-shadow-[0_0_24px_rgba(255,170,90,0.25)] sm:text-6xl lg:text-7xl [@media(max-height:700px)]:text-5xl">
              Elements Bending
            </h1>
            <Divider />
            <p className="font-serif-italic text-lg text-neutral-200 italic sm:text-2xl">
              Master fire, water, lightning and air with nothing but your hands.
            </p>
            <p className="mt-3 max-w-md text-xs text-neutral-500 sm:text-sm">
              Your webcam tracks your hands. Video is processed on this device and never leaves it.
            </p>

            <button
              type="button"
              onClick={onStart}
              disabled={starting}
              className="group relative mt-6 rounded-full [@media(max-height:700px)]:mt-4 border border-amber-300/60 bg-[linear-gradient(135deg,#ff9b4a,#e2451c)] px-10 py-3.5 font-display text-sm font-bold tracking-[0.25em] text-black uppercase shadow-[0_0_30px_rgba(255,120,50,0.45)] transition hover:scale-105 hover:shadow-[0_0_45px_rgba(255,140,60,0.7)] disabled:cursor-wait disabled:opacity-70 disabled:hover:scale-100"
            >
              <span className="pointer-events-none absolute -inset-2 rounded-full border border-amber-300/40 motion-safe:animate-pulse-ring" />
              {starting ? 'Loading hand tracking…' : error ? 'Try again' : 'Start bending'}
            </button>
            {error && <p className="mt-4 max-w-md text-sm text-rose-400">{error}</p>}
          </div>

          <div className="flex w-full justify-between px-[4%] sm:px-[8%]">
            {emblem('fire', 0.75)}
            {emblem('lightning', 2.25)}
          </div>
        </div>
      </div>
    </div>
  )
}

/** A slowly turning ring of marks behind the title, tying the four elements together. */
function Ring() {
  const ticks = Array.from({ length: 72 }, (_, i) => i * 5)
  return (
    <svg
      viewBox="-100 -100 200 200"
      className="pointer-events-none absolute top-1/2 left-1/2 size-[min(92vw,92vh)] -translate-x-1/2 -translate-y-1/2 opacity-40 motion-safe:animate-spin-slow"
      aria-hidden
    >
      <circle r="96" fill="none" stroke="#e8c98a" strokeOpacity="0.35" strokeWidth="0.4" />
      <circle r="88" fill="none" stroke="#e8c98a" strokeOpacity="0.25" strokeWidth="0.3" strokeDasharray="1 2.4" />
      {ticks.map((angle) => (
        <line
          key={angle}
          x1="0"
          y1={angle % 30 === 0 ? -96 : -94}
          x2="0"
          y2="-91"
          stroke="#e8c98a"
          strokeOpacity={angle % 30 === 0 ? 0.55 : 0.25}
          strokeWidth={angle % 30 === 0 ? 0.6 : 0.3}
          transform={`rotate(${angle})`}
        />
      ))}
      {[45, 135, 225, 315].map((angle) => (
        <rect key={angle} x="-2" y="-98" width="4" height="4" fill="none" stroke="#e8c98a" strokeOpacity="0.6" strokeWidth="0.4" transform={`rotate(${angle}) rotate(45 0 -96)`} />
      ))}
      <circle r="60" fill="none" stroke="#e8c98a" strokeOpacity="0.12" strokeWidth="0.3" />
    </svg>
  )
}

function Divider() {
  return (
    <div className="my-4 flex w-56 items-center gap-3 sm:w-72" aria-hidden>
      <span className="h-px flex-1 bg-gradient-to-r from-transparent to-amber-200/50" />
      <span className="size-1.5 rotate-45 border border-amber-200/70" />
      <span className="h-px flex-1 bg-gradient-to-l from-transparent to-amber-200/50" />
    </div>
  )
}
