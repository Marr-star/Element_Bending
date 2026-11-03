import { describe, expect, it } from 'vitest'
import { coverSize, sceneToScreen, toScene } from './coords'

describe('coverSize', () => {
  it('fills a wider viewport by matching width', () => {
    expect(coverSize({ width: 1920, height: 800 }, { width: 1280, height: 720 })).toEqual({ width: 1920, height: 1080 })
  })

  it('fills a taller viewport by matching height', () => {
    expect(coverSize({ width: 400, height: 900 }, { width: 1280, height: 720 })).toEqual({ width: 1600, height: 900 })
  })
})

describe('toScene', () => {
  const plane = { width: 1600, height: 900 }

  it('maps the video center to the scene origin', () => {
    expect(toScene({ x: 0.5, y: 0.5 }, plane)).toEqual({ x: 0, y: 0 })
  })

  it('mirrors x and flips y', () => {
    // Top-left of the raw video is top-right of the mirrored view.
    expect(toScene({ x: 0, y: 0 }, plane)).toEqual({ x: 800, y: 450 })
    expect(toScene({ x: 1, y: 1 }, plane)).toEqual({ x: -800, y: -450 })
  })
})

describe('sceneToScreen', () => {
  it('maps the scene origin to the viewport center', () => {
    expect(sceneToScreen({ x: 0, y: 0 }, { width: 1000, height: 600 })).toEqual({ x: 500, y: 300 })
  })

  it('maps +y up to smaller screen y', () => {
    expect(sceneToScreen({ x: -500, y: 300 }, { width: 1000, height: 600 })).toEqual({ x: 0, y: 0 })
  })
})
