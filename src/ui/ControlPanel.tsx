interface ControlPanelProps {
  showSkeleton: boolean
  onShowSkeletonChange(show: boolean): void
  onStop(): void
}

/** Settings panel. Phase 1 has only the skeleton toggle; Phase 6 adds quality, volume and sensitivity. */
export function ControlPanel({ showSkeleton, onShowSkeletonChange, onStop }: ControlPanelProps) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-black/60 px-3 py-2 text-sm backdrop-blur">
      <label className="flex cursor-pointer items-center gap-2 select-none">
        <input
          type="checkbox"
          className="accent-orange-400"
          checked={showSkeleton}
          onChange={(e) => onShowSkeletonChange(e.target.checked)}
        />
        Skeleton <kbd className="rounded bg-white/10 px-1 text-xs">S</kbd>
      </label>
      <button type="button" onClick={onStop} className="rounded-md bg-white/10 px-2 py-1 hover:bg-white/20">
        Stop
      </button>
    </div>
  )
}
