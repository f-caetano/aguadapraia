import type { DailyBeachForecast, MapMetric } from '../types'
import { convertWind, type WindUnit } from './units'

export type MetricColourClass = 'cold' | 'cool' | 'warm' | 'hot' | 'very-hot'

export function windColourClass(knots: number): MetricColourClass {
  if (knots < 5) return 'cold'
  if (knots < 10) return 'cool'
  if (knots < 15) return 'warm'
  if (knots < 20) return 'hot'
  return 'very-hot'
}

export function mapMetricValue(
  forecast: DailyBeachForecast,
  metric: MapMetric,
): number {
  if (metric === 'air') return forecast.airMax
  if (metric === 'wind') return forecast.windAverageKnots
  return forecast.waterMax
}

export function isPreferredMetricValue(
  candidate: number,
  current: number,
  metric: MapMetric,
): boolean {
  return metric === 'wind' ? candidate < current : candidate > current
}

export function formatMapMetricValue(
  value: number,
  metric: MapMetric,
  windUnit: WindUnit,
): string {
  if (metric === 'wind') {
    return `${convertWind(value, windUnit).toFixed(1)} ${windUnit === 'kmh' ? 'km/h' : 'kn'}`
  }
  return `${value.toFixed(metric === 'air' ? 0 : 1)} °C`
}

export function windLegendLabels(windUnit: WindUnit): string[] {
  const unit = windUnit === 'kmh' ? 'km/h' : 'kn'
  const boundaries = [5, 10, 15, 20].map((knots) => {
    const converted = convertWind(knots, windUnit)
    return windUnit === 'kmh' ? converted.toFixed(1) : String(converted)
  })
  return [
    `<${boundaries[0]} ${unit}`,
    `${boundaries[0]}–<${boundaries[1]} ${unit}`,
    `${boundaries[1]}–<${boundaries[2]} ${unit}`,
    `${boundaries[2]}–<${boundaries[3]} ${unit}`,
    `${boundaries[3]}+ ${unit}`,
  ]
}
