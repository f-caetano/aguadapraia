import { zoomIdentity } from 'd3-zoom'
import { describe, expect, it } from 'vitest'
import {
  adaptiveClusterRadius,
  clusterZoomLevel,
  initialMapTransform,
  mapHeight,
  mapWidth,
  territoryClusterProfile,
} from './map-transform'

describe('initialMapTransform', () => {
  it('returns zoomIdentity for desktop', () => {
    expect(initialMapTransform(false)).toEqual(zoomIdentity)
  })

  it('returns 1.35x zoom centered on viewport for mobile', () => {
    const t = initialMapTransform(true)
    expect(t.k).toBeCloseTo(1.35, 5)
    expect(t.x).toBeCloseTo((mapWidth / 2) * (1 - 1.35), 4)
    expect(t.y).toBeCloseTo((mapHeight / 2) * (1 - 1.35), 4)
  })

  it('mobile transform x/y are within translateExtent bounds', () => {
    const t = initialMapTransform(true)
    expect(t.x).toBeGreaterThanOrEqual(-mapWidth * 0.35)
    expect(t.y).toBeGreaterThanOrEqual(-mapHeight * 0.35)
  })
})

describe('clusterZoomLevel', () => {
  it('does not count the responsive initial scale as user zoom', () => {
    expect(clusterZoomLevel(1.35, 1.35, 6, 1.65)).toBe(6)
  })

  it('reveals one additional cluster level per zoom button click', () => {
    const initialScale = 1.35
    expect(clusterZoomLevel(initialScale * 1.45, initialScale, 6, 1.65)).toBe(7)
    expect(clusterZoomLevel(initialScale * 1.45 ** 2, initialScale, 6, 1.65)).toBe(8)
    expect(clusterZoomLevel(initialScale * 1.45 ** 3, initialScale, 6, 1.65)).toBe(9)
  })
})

describe('adaptiveClusterRadius', () => {
  it('keeps the base radius at reset and grows through the first zoom clicks', () => {
    const initialScale = 1.35
    expect(adaptiveClusterRadius(18, initialScale, initialScale)).toBe(18)
    expect(adaptiveClusterRadius(18, initialScale * 1.45, initialScale)).toBe(22)
    expect(adaptiveClusterRadius(18, initialScale * 1.45 ** 2, initialScale)).toBe(34)
    expect(adaptiveClusterRadius(18, initialScale * 1.45 ** 3, initialScale)).toBe(50)
    expect(adaptiveClusterRadius(18, initialScale * 1.45 ** 5, initialScale)).toBe(50)
  })

  describe('territoryClusterProfile', () => {
    it('leaves single-territory views unchanged', () => {
      expect(territoryClusterProfile('mainland', 'mainland', 0)).toEqual({
        radiusMultiplier: 1,
        zoomOffset: 0,
      })
    })

    it('groups the mainland and expands islands sooner in the all view', () => {
      expect(territoryClusterProfile('all', 'mainland', 0)).toEqual({
        radiusMultiplier: 2,
        zoomOffset: -1,
      })
      expect(territoryClusterProfile('all', 'madeira', 0)).toEqual({
        radiusMultiplier: 0.65,
        zoomOffset: 1,
      })
      expect(territoryClusterProfile('all', 'azores', 1)).toEqual({
        radiusMultiplier: 0.75,
        zoomOffset: 1,
      })
    })

    it('converges toward the normal profile at later zoom', () => {
      expect(territoryClusterProfile('all', 'mainland', 3)).toEqual({
        radiusMultiplier: 1.1,
        zoomOffset: 0,
      })
      expect(territoryClusterProfile('all', 'madeira', 3)).toEqual({
        radiusMultiplier: 1,
        zoomOffset: 0,
      })
    })
  })
})
