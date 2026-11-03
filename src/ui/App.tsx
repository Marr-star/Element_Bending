import { useEffect, useRef, useState } from 'react'
import { CameraError } from '../core/camera'
import { startRuntime, type Runtime } from '../core/runtime'
import { ControlPanel } from './ControlPanel'
import { EventLog } from './EventLog'
import { GestureBadge } from './GestureBadge'
import { Stats } from './Stats'

type Status = { kind: 'idle' } | { kind: 'starting' } | { kind: 'running'; runtime: Runtime } | { kind: 'error'; message: string }

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const leftLabelRef = useRef<HTMLDivElement>(null)
  const rightLabelRef = useRef<HTMLDivElement>(null)
  const runtimeRef = useRef<Runtime | null>(null)

  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [showSkeleton, setShowSkeleton] = useState(true)
  const [recording, setRecording] = useState(false)

  // The Start click is the user gesture that camera (and, from Phase 4, audio) require.
  async function start() {
    if (!containerRef.current || !videoRef.current) return
    setStatus({ kind: 'starting' })
    try {
      const runtime = await startRuntime({
        container: containerRef.current,
        video: videoRef.current,
        labels: { Left: leftLabelRef.current, Right: rightLabelRef.current },
      })
      runtime.setSkeletonVisible(showSkeleton)
      runtimeRef.current = runtime
      setStatus({ kind: 'running', runtime })
    } catch (err) {
      console.error(err)
      const message =
        err instanceof CameraError
          ? err.message
          : `Hand tracking could not start: ${err instanceof Error ? err.message : String(err)}`
      setStatus({ kind: 'error', message })
    }
  }

  function stop() {
    runtimeRef.current?.stop()
    runtimeRef.current = null
    setRecording(false)
    setStatus({ kind: 'idle' })
  }

  function toggleRecording() {
    if (runtimeRef.current) setRecording(runtimeRef.current.toggleRecording())
  }

  useEffect(() => {
    runtimeRef.current?.setSkeletonVisible(showSkeleton)
  }, [showSkeleton])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return
      const key = e.key.toLowerCase()
      if (key === 's') setShowSkeleton((show) => !show)
      if (key === 'r') toggleRecording()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => () => runtimeRef.current?.stop(), [])

  return (
    <main className="relative h-full w-full">
      <video ref={videoRef} className="hidden" playsInline muted />
      <div ref={containerRef} className="absolute inset-0" />
      <GestureBadge ref={leftLabelRef} />
      <GestureBadge ref={rightLabelRef} />

      {status.kind === 'running' ? (
        <>
          <div className="absolute top-4 left-4">
            <Stats stats={status.runtime.stats} />
          </div>
          <div className="absolute bottom-4 left-4">
            <EventLog gestures={status.runtime.gestures} />
          </div>
          <div className="absolute top-4 right-4">
            <ControlPanel
              showSkeleton={showSkeleton}
              onShowSkeletonChange={setShowSkeleton}
              recording={recording}
              onToggleRecording={toggleRecording}
              onStop={stop}
            />
          </div>
        </>
      ) : (
        <StartScreen status={status} onStart={start} />
      )}
    </main>
  )
}

function StartScreen({ status, onStart }: { status: Status; onStart(): void }) {
  const starting = status.kind === 'starting'
  return (
    <div className="absolute inset-0 flex items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="bg-gradient-to-r from-orange-400 via-sky-300 to-violet-400 bg-clip-text text-5xl font-black tracking-tight text-transparent">
          ELEMENTAL AI
        </h1>
        <p className="mt-4 text-neutral-300">Bend fire, water, lightning and air with your hands.</p>
        <p className="mt-2 text-sm text-neutral-500">
          Your webcam tracks your hands. Video is processed on this device and never leaves it.
        </p>
        <button
          type="button"
          onClick={onStart}
          disabled={starting}
          className="mt-8 rounded-full bg-orange-500 px-8 py-3 font-semibold text-black shadow-lg shadow-orange-500/30 transition hover:bg-orange-400 disabled:cursor-wait disabled:opacity-60"
        >
          {starting ? 'Loading hand tracking…' : status.kind === 'error' ? 'Try again' : 'Start'}
        </button>
        {status.kind === 'error' && <p className="mt-4 text-sm text-rose-400">{status.message}</p>}
      </div>
    </div>
  )
}
