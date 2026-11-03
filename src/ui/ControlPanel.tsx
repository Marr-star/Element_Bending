interface ControlPanelProps {
  showSkeleton: boolean
  onShowSkeletonChange(show: boolean): void
  recording: boolean
  onToggleRecording(): void
  onStop(): void
}

/** Settings panel. Phase 6 adds quality, volume and sensitivity sliders. */
export function ControlPanel({ showSkeleton, onShowSkeletonChange, recording, onToggleRecording, onStop }: ControlPanelProps) {
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
      <button
        type="button"
        onClick={onToggleRecording}
        title="Record hand landmarks to a JSON file for test fixtures"
        className={`flex items-center gap-1.5 rounded-md px-2 py-1 ${recording ? 'bg-rose-500/80 hover:bg-rose-500' : 'bg-white/10 hover:bg-white/20'}`}
      >
        <span className={`size-2 rounded-full ${recording ? 'animate-pulse bg-white' : 'bg-rose-400'}`} />
        {recording ? 'Stop rec' : 'Record'} <kbd className="rounded bg-white/10 px-1 text-xs">R</kbd>
      </button>
      <button type="button" onClick={onStop} className="rounded-md bg-white/10 px-2 py-1 hover:bg-white/20">
        Stop
      </button>
    </div>
  )
}
