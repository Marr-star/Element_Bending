import { ELEMENT_STYLES, type ElementKind } from './start/elementStyles'
import { ElementGlyph } from './start/emblems'

const ORDER: ElementKind[] = ['fire', 'water', 'lightning', 'air']

/** Picks the element your hands control (also keys 1-4), with its gestures listed underneath. */
export function ElementSwitcher({ element, onChange }: { element: ElementKind; onChange(element: ElementKind): void }) {
  const active = ELEMENT_STYLES[element]
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex gap-2 rounded-full bg-black/55 p-1.5 backdrop-blur">
        {ORDER.map((kind) => {
          const style = ELEMENT_STYLES[kind]
          const selected = kind === element
          return (
            <button
              key={kind}
              type="button"
              onClick={() => onChange(kind)}
              title={`${style.label} (${style.key})`}
              aria-pressed={selected}
              className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold tracking-wider uppercase transition"
              style={{
                borderColor: selected ? style.color : 'transparent',
                color: selected ? style.color : '#9ca3af',
                background: selected ? `radial-gradient(circle at 50% 30%, ${style.deep}, transparent 80%)` : 'transparent',
                boxShadow: selected ? `0 0 16px ${style.glow}` : 'none',
              }}
            >
              <svg viewBox="0 0 48 48" className="size-5" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <ElementGlyph kind={kind} />
              </svg>
              <span className="hidden sm:inline">{style.label}</span>
              <kbd className="rounded bg-white/10 px-1 text-[10px] font-normal">{style.key}</kbd>
            </button>
          )
        })}
      </div>
      <p className="max-w-[92vw] rounded-full bg-black/55 px-3 py-1 text-center text-xs backdrop-blur" style={{ color: active.color }}>
        {active.hint}
      </p>
    </div>
  )
}
