import type { Ref } from 'react'

/**
 * A label that follows one hand: the stable gesture on top, MediaPipe's raw label below. The
 * runtime writes its position and text directly every frame, so it never re-renders through React.
 */
export function GestureBadge({ ref }: { ref: Ref<HTMLDivElement> }) {
  return (
    <div
      ref={ref}
      style={{ display: 'none' }}
      className="pointer-events-none absolute top-0 left-0 rounded-xl bg-black/70 px-3 py-1 text-center whitespace-nowrap backdrop-blur will-change-transform data-[hand=Left]:text-sky-300 data-[hand=Right]:text-orange-300"
    >
      <span className="block text-sm font-semibold" />
      <span className="block text-[11px] text-neutral-400" />
    </div>
  )
}
