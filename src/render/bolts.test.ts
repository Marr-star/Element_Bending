import { describe, expect, it } from 'vitest'
import { seededRng } from '../audio/synth'
import { BOLT_POINTS, boltBranches, boltPath } from './bolts'

describe('boltPath', () => {
  const from = { x: 0, y: 0 }
  const to = { x: 400, y: 0 }

  it('always has the same number of points, from start to end', () => {
    const path = boltPath(from, to, 60, seededRng(1))
    expect(path).toHaveLength(BOLT_POINTS)
    expect(path[0]).toEqual(from)
    expect(path.at(-1)).toEqual(to)
  })

  it('is jagged but stays within the spread of the straight line', () => {
    const path = boltPath(from, to, 60, seededRng(2))
    const offsets = path.map((p) => Math.abs(p.y))
    expect(Math.max(...offsets)).toBeGreaterThan(5)
    // Spreads halve each level, so the total sideways drift is under twice the first spread.
    expect(Math.max(...offsets)).toBeLessThan(120)
  })

  it('progresses from start to end', () => {
    const path = boltPath(from, to, 20, seededRng(3))
    expect(path[16].x).toBeGreaterThan(100)
    expect(path[16].x).toBeLessThan(300)
  })
})

describe('boltBranches', () => {
  it('forks start on the main bolt and peel away from it', () => {
    const main = boltPath({ x: 0, y: 0 }, { x: 400, y: 0 }, 40, seededRng(4))
    const branches = boltBranches(main, 3, 40, seededRng(5))
    expect(branches).toHaveLength(3)
    for (const branch of branches) {
      expect(branch).toHaveLength(BOLT_POINTS)
      expect(main).toContainEqual(branch[0])
      const end = branch.at(-1)!
      expect(Math.abs(end.y - branch[0].y)).toBeGreaterThan(10)
    }
  })
})
