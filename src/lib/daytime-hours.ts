import type { HourlyBeachReading } from '../types'

export function daytimeReadings(
  readings: readonly HourlyBeachReading[],
): HourlyBeachReading[] {
  return readings.filter((reading) => reading.hour >= 8 && reading.hour <= 18)
}
