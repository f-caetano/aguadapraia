import { describe, expect, it } from 'vitest'
import { daytimeReadings } from './daytime-hours'

describe('daytimeReadings', () => {
  it('keeps the inclusive 08:00-18:00 window', () => {
    const readings = [7, 8, 12, 18, 19].map((hour) => ({
      hour,
      waterTemperatureCelsius: 19,
      windKnots: 8,
      windDirection: 'N',
    }))

    expect(daytimeReadings(readings).map((reading) => reading.hour)).toEqual([
      8,
      12,
      18,
    ])
  })

  it('preserves nullable values within the daytime window', () => {
    expect(
      daytimeReadings([
        {
          hour: 10,
          waterTemperatureCelsius: null,
          windKnots: null,
          windDirection: null,
        },
      ]),
    ).toHaveLength(1)
  })
})
