import { zoomIdentity, type ZoomTransform } from 'd3-zoom'
import type { Territory, TerritoryFilter } from '../types'

export const mapWidth = 900
export const mapHeight = 680

/**
 * Returns the responsive initial ZoomTransform for the map.
 * Mobile (max-width 760px): 1.35x zoom centered on the viewport.
 * Desktop: identity (1x).
 */
export function initialMapTransform(isMobile: boolean): ZoomTransform {
  if (!isMobile) return zoomIdentity
  const k = 1.35
  const cx = mapWidth / 2
  const cy = mapHeight / 2
  return zoomIdentity.translate(cx, cy).scale(k).translate(-cx, -cy)
}

export function clusterZoomLevel(
  scale: number,
  initialScale: number,
  baseZoom: number,
  zoomRate: number,
): number {
  return Math.min(
    16,
    Math.max(
      0,
      Math.round(Math.log2(scale / initialScale) * zoomRate + baseZoom),
    ),
  )
}

export function adaptiveClusterRadius(
  baseRadius: number,
  scale: number,
  initialScale: number,
): number {
  const zoomSteps = Math.max(
    0,
    Math.round(Math.log(scale / initialScale) / Math.log(1.45)),
  )
  const radiusGrowth = [0, 4, 16, 32] as const
  return baseRadius + radiusGrowth[Math.min(3, zoomSteps)]
}

export function territoryClusterProfile(
  viewTerritory: TerritoryFilter,
  beachTerritory: Territory,
  zoomStep: number,
): { radiusMultiplier: number; zoomOffset: number } {
  if (viewTerritory !== 'all') {
    return { radiusMultiplier: 1, zoomOffset: 0 }
  }

  const step = Math.max(0, Math.min(3, zoomStep))
  if (beachTerritory === 'mainland') {
    const radiusMultipliers = [2, 1.6, 1.25, 1.1] as const
    return {
      radiusMultiplier: radiusMultipliers[step],
      zoomOffset: step < 2 ? -1 : 0,
    }
  }

  const radiusMultipliers = [0.65, 0.75, 0.9, 1] as const
  return {
    radiusMultiplier: radiusMultipliers[step],
    zoomOffset: step < 2 ? 1 : 0,
  }
}
