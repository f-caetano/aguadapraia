import { describe, expect, it } from 'vitest'
import { bridgeForecastSeries } from './chart-series'

describe('bridgeForecastSeries', () => {
  it('starts the forecast segment at the last historical value', () => {
    const result = bridgeForecastSeries(
      [
        { date: '2026-07-27', historyMin: 19 },
        { date: '2026-07-28', forecastMin: 18.8 },
      ],
      [{ historyKey: 'historyMin', forecastKey: 'forecastMin' }],
    )

    expect(result[0].forecastMin).toBe(19)
    expect(result[1].forecastMin).toBe(18.8)
  })

  it('does not mutate the input', () => {
    const input = [
      { date: '2026-07-27', historyMax: 21 },
      { date: '2026-07-28', forecastMax: 20.8 },
    ]
    bridgeForecastSeries(input, [
      { historyKey: 'historyMax', forecastKey: 'forecastMax' },
    ])
    expect(input[0].forecastMax).toBeUndefined()
  })

  it('leaves a series unchanged when either side is unavailable', () => {
    expect(
      bridgeForecastSeries(
        [{ date: '2026-07-28', forecastMin: 18.8 }],
        [{ historyKey: 'historyMin', forecastKey: 'forecastMin' }],
      ),
    ).toEqual([{ date: '2026-07-28', forecastMin: 18.8 }])
  })
})

