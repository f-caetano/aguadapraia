import { describe, expect, it } from 'vitest'
import {
  formatMapMetricValue,
  isPreferredMetricValue,
  mapMetricValue,
  windColourClass,
  windLegendLabels,
} from './map-metric'
import type { DailyBeachForecast } from '../types'

const forecast = {
  waterMax: 21.45,
  airMax: 29.4,
  windAverageKnots: 12,
} as DailyBeachForecast

describe('map metric helpers', () => {
  it('uses raw-knot wind thresholds', () => {
    expect([4.99, 5, 9.99, 10, 14.99, 15, 19.99, 20].map(windColourClass))
      .toEqual(['cold', 'cool', 'cool', 'warm', 'warm', 'hot', 'hot', 'very-hot'])
  })

  it('uses average wind while preserving temperature metrics', () => {
    expect(mapMetricValue(forecast, 'water')).toBe(21.45)
    expect(mapMetricValue(forecast, 'air')).toBe(29.4)
    expect(mapMetricValue(forecast, 'wind')).toBe(12)
  })

  it('formats each metric in its selected display unit', () => {
    expect(formatMapMetricValue(21.45, 'water', 'kmh')).toBe('21.4 °C')
    expect(formatMapMetricValue(29.4, 'air', 'kmh')).toBe('29 °C')
    expect(formatMapMetricValue(10, 'wind', 'knots')).toBe('10.0 kn')
    expect(formatMapMetricValue(10, 'wind', 'kmh')).toBe('18.5 km/h')
  })

  it('prefers warmer temperatures and calmer wind for cluster selection', () => {
    expect(isPreferredMetricValue(22, 20, 'water')).toBe(true)
    expect(isPreferredMetricValue(31, 29, 'air')).toBe(true)
    expect(isPreferredMetricValue(4, 8, 'wind')).toBe(true)
    expect(isPreferredMetricValue(10, 8, 'wind')).toBe(false)
  })

  it('converts wind legend boundaries to the selected unit', () => {
    expect(windLegendLabels('knots')).toEqual([
      '<5 kn', '5–<10 kn', '10–<15 kn', '15–<20 kn', '20+ kn',
    ])
    expect(windLegendLabels('kmh')).toEqual([
      '<9.3 km/h', '9.3–<18.5 km/h', '18.5–<27.8 km/h', '27.8–<37.0 km/h', '37.0+ km/h',
    ])
  })
})
