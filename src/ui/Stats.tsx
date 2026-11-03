import { useEffect, useState } from 'react'
import type { Stats as LiveStats } from '../core/runtime'

/** FPS, inference time and hand count. Polls the runtime's live object a few times a second. */
export function Stats({ stats }: { stats: LiveStats }) {
  const [snapshot, setSnapshot] = useState({ ...stats })

  useEffect(() => {
    const id = setInterval(() => setSnapshot({ ...stats }), 250)
    return () => clearInterval(id)
  }, [stats])

  const fpsColor = snapshot.fps >= 30 ? 'text-emerald-400' : snapshot.fps >= 20 ? 'text-amber-400' : 'text-rose-400'

  return (
    <div className="pointer-events-none rounded-lg bg-black/60 px-3 py-2 font-mono text-xs leading-5 backdrop-blur">
      <div>
        FPS <span className={fpsColor}>{snapshot.fps.toFixed(0)}</span>
      </div>
      <div>Inference {snapshot.inferenceMs.toFixed(1)} ms</div>
      <div>Hands {snapshot.hands}</div>
      <div>
        Gap{' '}
        {snapshot.handsGap
          ? `${snapshot.handsGap.distance.toFixed(1)} (${snapshot.handsGap.rate >= 0 ? '+' : ''}${snapshot.handsGap.rate.toFixed(1)}/s)`
          : '—'}
      </div>
      <div>
        Delegate{' '}
        <span className={snapshot.delegate === 'CPU' ? 'text-amber-400' : 'text-emerald-400'}>{snapshot.delegate}</span>
      </div>
    </div>
  )
}
