import { useEffect, useState } from 'react'
import type { GestureEngine, GestureEvent } from '../gestures/gestureEngine'

const MAX_ENTRIES = 8

function describe(event: GestureEvent): string {
  switch (event.type) {
    case 'gestureStart':
      return `${event.hand} ▶ ${event.gesture.replace('_', ' ')}`
    case 'gestureEnd':
      return `${event.hand} ■ ${event.gesture.replace('_', ' ')}`
    case 'push':
      return `${event.hand} PUSH ×${event.growth.toFixed(2)}`
    case 'handsApart':
      return `Hands apart (${event.speed.toFixed(0)}/s)`
    case 'handsTogether':
      return `Hands together (${event.speed.toFixed(0)}/s)`
    case 'gestureHold':
      return ''
  }
}

/** Debug list of recent gesture events. Holds fire every frame, so they are left out. */
export function EventLog({ gestures }: { gestures: GestureEngine }) {
  const [entries, setEntries] = useState<{ id: number; text: string }[]>([])

  useEffect(() => {
    let id = 0
    return gestures.on((event) => {
      if (event.type === 'gestureHold') return
      const entry = { id: id++, text: describe(event) }
      setEntries((list) => [entry, ...list].slice(0, MAX_ENTRIES))
    })
  }, [gestures])

  if (entries.length === 0) return null
  return (
    <ul className="pointer-events-none rounded-lg bg-black/60 px-3 py-2 font-mono text-xs leading-5 backdrop-blur">
      {entries.map((entry, i) => (
        <li key={entry.id} style={{ opacity: 1 - i / MAX_ENTRIES }}>
          {entry.text}
        </li>
      ))}
    </ul>
  )
}
