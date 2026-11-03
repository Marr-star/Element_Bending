import type { Ref } from 'react'

/**
 * A label that follows one hand. The runtime writes its position and text directly every
 * frame, so it never re-renders through React.
 */
export function GestureBadge({ ref }: { ref: Ref<HTMLDivElement> }) {
  return (
    <div
      ref={ref}
      style={{ display: 'none' }}
      className="pointer-events-none absolute top-0 left-0 rounded-full bg-black/70 px-3 py-1 text-sm font-medium whitespace-nowrap backdrop-blur will-change-transform data-[hand=Left]:text-sky-300 data-[hand=Right]:text-orange-300"
    />
  )
}
