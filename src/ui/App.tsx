import { useEffect, useRef, useState } from 'react'
import { createAudioEngine } from '../audio/audioEngine'
import { CameraError } from '../core/camera'
import { startRuntime, type Runtime } from '../core/runtime'
import { ControlPanel } from './ControlPanel'
import { ElementSwitcher } from './ElementSwitcher'
import { EventLog } from './EventLog'
import { GestureBadge } from './GestureBadge'
import type { ElementKind } from './start/elementStyles'
import { StartScreen } from './start/StartScreen'
import { Stats } from './Stats'

const ELEMENT_KEYS: Record<string, ElementKind> = { '1': 'fire', '2': 'water', '3': 'lightning', '4': 'air' }

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
  const [bloom, setBloom] = useState(true)
  const [sound, setSound] = useState(true)
  const [element, setElement] = useState<ElementKind>('fire')

  // The Start click is the user gesture that camera and audio require.
  async function start() {
    if (!containerRef.current || !videoRef.current) return
    // Create the AudioContext before any await, while still inside the click, so it may play.
    const audio = createAudioEngine()
    setStatus({ kind: 'starting' })
    try {
      const runtime = await startRuntime({
        container: containerRef.current,
        video: videoRef.current,
        labels: { Left: leftLabelRef.current, Right: rightLabelRef.current },
        audio,
      })
      runtime.setSkeletonVisible(showSkeleton)
      runtime.setBloom(bloom)
      runtime.audio?.setMuted(!sound)
      runtime.setElement(element)
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
    runtimeRef.current?.setBloom(bloom)
  }, [bloom])

  useEffect(() => {
    runtimeRef.current?.audio?.setMuted(!sound)
  }, [sound])

  useEffect(() => {
    runtimeRef.current?.setElement(element)
  }, [element])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return
      const key = e.key.toLowerCase()
      if (key === 's') setShowSkeleton((show) => !show)
      if (key === 'b') setBloom((on) => !on)
      if (key === 'm') setSound((on) => !on)
      if (key === 'r') toggleRecording()
      const picked = ELEMENT_KEYS[key]
      if (picked) setElement(picked)
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
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
            <ElementSwitcher element={element} onChange={setElement} />
          </div>
          <div className="absolute top-4 right-4">
            <ControlPanel
              showSkeleton={showSkeleton}
              onShowSkeletonChange={setShowSkeleton}
              bloom={bloom}
              onBloomChange={setBloom}
              sound={sound}
              onSoundChange={setSound}
              recording={recording}
              onToggleRecording={toggleRecording}
              onStop={stop}
            />
          </div>
        </>
      ) : (
        <StartScreen
          starting={status.kind === 'starting'}
          error={status.kind === 'error' ? status.message : null}
          onStart={start}
        />
      )}
    </main>
  )
}
