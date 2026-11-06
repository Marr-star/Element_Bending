export type ElementKind = 'fire' | 'water' | 'lightning' | 'air'

interface ElementStyle {
  label: string
  /** Main colour, glow colour and the deep tone used for the medallion's inner gradient. */
  color: string
  glow: string
  deep: string
  ready: boolean
}

export const ELEMENT_STYLES: Record<ElementKind, ElementStyle> = {
  fire: { label: 'Fire', color: '#ff8a3d', glow: 'rgba(255,110,40,0.55)', deep: '#3a0d05', ready: true },
  water: { label: 'Water', color: '#5cc8ff', glow: 'rgba(70,170,255,0.5)', deep: '#05203a', ready: false },
  lightning: { label: 'Lightning', color: '#c9a6ff', glow: 'rgba(170,120,255,0.55)', deep: '#1c0b3a', ready: false },
  air: { label: 'Air', color: '#b9f3e4', glow: 'rgba(170,240,220,0.45)', deep: '#0b2a26', ready: false },
}
