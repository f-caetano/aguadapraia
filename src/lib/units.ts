export type WindUnit = 'kmh' | 'knots'

const knotsToKilometresPerHour = 1.852

export function convertWind(value: number, unit: WindUnit) {
  return unit === 'kmh' ? value * knotsToKilometresPerHour : value
}

export function formatWind(value: number, unit: WindUnit) {
  const converted = convertWind(value, unit)
  const suffix = unit === 'kmh' ? 'km/h' : 'kn'
  return `${converted.toFixed(1)} ${suffix}`
}

export function formatDistance(distanceKm: number) {
  if (distanceKm === 0) return '0 km'
  return distanceKm < 1
    ? `${distanceKm.toFixed(1)} km`
    : `${Math.round(distanceKm)} km`
}
