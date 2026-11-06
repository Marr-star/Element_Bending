import type { Ref } from 'react'
import { ELEMENT_STYLES, type ElementKind } from './elementStyles'

/** Original line-art glyphs, drawn on a 48-unit grid. */
export function ElementGlyph({ kind }: { kind: ElementKind }) {
  switch (kind) {
    case 'fire':
      return (
        <>
          <path d="M24 6c3 7 11 11 11 21a11 11 0 0 1-22 0c0-6 4-9 5-14 2 4 3 6 5 7 1-5 0-9 1-14z" />
          <path d="M24 26c2 3 5 5 5 9a5 5 0 0 1-10 0c0-3 3-5 5-9z" />
        </>
      )
    case 'water':
      return (
        <>
          <path d="M8 20c5-6 11-6 16 0s11 6 16 0" />
          <path d="M8 29c5-6 11-6 16 0s11 6 16 0" />
          <path d="M24 6c2 3 4 5 4 7a4 4 0 0 1-8 0c0-2 2-4 4-7z" />
          <path d="M14 38c3 3 7 4 10 4s7-1 10-4" />
        </>
      )
    case 'lightning':
      return (
        <>
          <path d="M27 5 13 27h10l-3 16 15-23H25z" />
          <path d="M9 14l4 3M39 30l-4 3M38 12l-3 3" />
        </>
      )
    case 'air':
      return (
        <>
          <path d="M6 17h22a6 6 0 1 0-6-6" />
          <path d="M6 25h32a6 6 0 1 1-6 6" />
          <path d="M10 33h12" />
          <path d="M14 11h4" />
        </>
      )
  }
}

/** A glowing medallion for one element. The ref lets the backdrop emit particles from it. */
export function Emblem({ kind, ref, delay = 0 }: { kind: ElementKind; ref?: Ref<HTMLDivElement>; delay?: number }) {
  const style = ELEMENT_STYLES[kind]
  return (
    <div className="flex flex-col items-center gap-2 motion-safe:animate-float" style={{ animationDelay: `${delay}s` }}>
      <div
        ref={ref}
        className="relative grid size-16 place-items-center rounded-full border sm:size-20 lg:size-24"
        style={{
          borderColor: `${style.color}88`,
          background: `radial-gradient(circle at 50% 40%, ${style.deep} 0%, #05060a 75%)`,
          boxShadow: `0 0 28px ${style.glow}, inset 0 0 18px ${style.glow}`,
        }}
      >
        <div className="absolute inset-1.5 rounded-full border border-dashed opacity-40" style={{ borderColor: style.color }} />
        <svg
          viewBox="0 0 48 48"
          className="size-9 sm:size-11 lg:size-12"
          fill="none"
          stroke={style.color}
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ filter: `drop-shadow(0 0 6px ${style.glow})` }}
          aria-hidden
        >
          <ElementGlyph kind={kind} />
        </svg>
      </div>
      <div className="text-center leading-tight">
        <div className="font-display text-xs tracking-[0.3em] uppercase sm:text-sm" style={{ color: style.color }}>
          {style.label}
        </div>
      </div>
    </div>
  )
}
