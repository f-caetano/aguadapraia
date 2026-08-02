import type { BeachViewModel, DateKind, TerritoryAggregate } from '../types'

interface MetricBucket {
  mins: number[]
  maxs: number[]
  avgs: number[]
}

function numericStats(values: number[]): { min: number; avg: number; max: number } | null {
  if (values.length === 0) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length
  return { min, avg, max }
}

export function computeTerritoryAggregate(
  beaches: BeachViewModel[],
  date: string,
  kind: DateKind,
): TerritoryAggregate {
  const water: MetricBucket = { mins: [], maxs: [], avgs: [] }
  const air: MetricBucket = { mins: [], maxs: [], avgs: [] }
  const wind: MetricBucket = { mins: [], maxs: [], avgs: [] }

  for (const beach of beaches) {
    const point = beach.history.find((item) => item.date === date)
    if (point) {
      if (point.waterMin !== undefined) water.mins.push(point.waterMin)
      if (point.waterMax !== undefined) water.maxs.push(point.waterMax)
      if (point.waterMin !== undefined || point.waterMax !== undefined) {
        water.avgs.push(
          point.waterMin !== undefined && point.waterMax !== undefined
            ? (point.waterMin + point.waterMax) / 2
            : (point.waterMin ?? point.waterMax)!,
        )
      }
      if (point.airMin !== undefined) air.mins.push(point.airMin)
      if (point.airMax !== undefined) air.maxs.push(point.airMax)
      if (point.airMin !== undefined || point.airMax !== undefined) {
        air.avgs.push(
          point.airMin !== undefined && point.airMax !== undefined
            ? (point.airMin + point.airMax) / 2
            : (point.airMin ?? point.airMax)!,
        )
      }
      if (point.windMinKnots !== undefined) wind.mins.push(point.windMinKnots)
      if (point.windMaxKnots !== undefined) wind.maxs.push(point.windMaxKnots)
      if (point.windAverageKnots !== undefined) wind.avgs.push(point.windAverageKnots)
      continue
    }

    if (kind !== 'forecast') continue

    const daily = beach.daily.find((item) => item.date === date)
    if (!daily) continue
    water.mins.push(daily.waterMin)
    water.maxs.push(daily.waterMax)
    water.avgs.push((daily.waterMin + daily.waterMax) / 2)
    air.mins.push(daily.airMin)
    air.maxs.push(daily.airMax)
    air.avgs.push((daily.airMin + daily.airMax) / 2)
    wind.mins.push(daily.windMinKnots)
    wind.maxs.push(daily.windMaxKnots)
    wind.avgs.push(daily.windAverageKnots)
  }

  const total = beaches.length
  const waterMinStats = numericStats(water.mins)
  const waterAvgStats = numericStats(water.avgs)
  const waterMaxStats = numericStats(water.maxs)
  const airMinStats = numericStats(air.mins)
  const airAvgStats = numericStats(air.avgs)
  const airMaxStats = numericStats(air.maxs)
  const windMinStats = numericStats(wind.mins)
  const windAvgStats = numericStats(wind.avgs)
  const windMaxStats = numericStats(wind.maxs)

  return {
    date,
    kind,
    water: waterMaxStats && waterAvgStats
      ? {
          min: waterMinStats?.min ?? waterMaxStats.min,
          avg: waterAvgStats.avg,
          max: waterMaxStats.max,
          coverage: total > 0 ? water.avgs.length / total : 0,
        }
      : null,
    air: airMaxStats && airAvgStats
      ? {
          min: airMinStats?.min ?? airMaxStats.min,
          avg: airAvgStats.avg,
          max: airMaxStats.max,
          coverage: total > 0 ? air.avgs.length / total : 0,
        }
      : null,
    wind: windAvgStats
      ? {
          min: windMinStats?.min ?? windAvgStats.min,
          avg: windAvgStats.avg,
          max: windMaxStats?.max ?? windAvgStats.max,
          coverage: total > 0 ? wind.avgs.length / total : 0,
        }
      : null,
  }
}
