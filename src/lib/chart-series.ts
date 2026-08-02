type ChartValue = string | number | undefined

export interface SeriesBridge {
  historyKey: string
  forecastKey: string
}

export function bridgeForecastSeries<T extends Record<string, ChartValue>>(
  data: readonly T[],
  bridges: readonly SeriesBridge[],
): T[] {
  const result = data.map((point) => ({ ...point }))

  for (const { historyKey, forecastKey } of bridges) {
    const firstForecastIndex = result.findIndex(
      (point) => typeof point[forecastKey] === 'number',
    )
    if (firstForecastIndex <= 0) continue

    for (let index = firstForecastIndex - 1; index >= 0; index -= 1) {
      const historyValue = result[index][historyKey]
      if (typeof historyValue !== 'number') continue
      result[index] = {
        ...result[index],
        [forecastKey]: historyValue,
      }
      break
    }
  }

  return result
}

