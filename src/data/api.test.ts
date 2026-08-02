import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  dataUrl,
  evolutionDefaultRange,
  loadBackgroundHistory,
  loadBeachDataset,
  loadBeachDayDetail,
  loadTimelineMonth,
  loadTimelineRange,
  resetDayDetailCache,
  resetTimelineMonthCache,
  resolveDateIndex,
} from './api'

afterEach(() => {
  vi.unstubAllGlobals()
  resetDayDetailCache()
  resetTimelineMonthCache()
})

beforeEach(() => {
  resetDayDetailCache()
  resetTimelineMonthCache()
})

function rawAir(forecastDate: string) {
  return {
    locationId: 1110600,
    beachId: '10',
    forecastDate,
    locationName: 'Lisboa',
    distanceKm: 1,
    minimumCelsius: 18,
    maximumCelsius: 28,
    locationLatitude: 38.766,
    locationLongitude: -9.1286,
    weatherTypeId: 1,
  }
}

function latestPayload() {
  return {
    generatedAt: '2026-07-26T10:00:00.000Z',
    forecastUpdatedAt: '2026-07-26T09:00:00.000Z',
    displayForecastDates: ['2026-07-26', '2026-07-27', '2026-07-28'],
    catalogSize: 155,
    availableBeachCount: 1,
    unavailableLocations: [],
    beaches: [{ id: '10', name: 'Carcavelos, Cascais', latitude: 38.68, longitude: -9.33 }],
    summaries: ['2026-07-26', '2026-07-27', '2026-07-28'].map((forecastDate) => ({
      beachId: '10',
      forecastDate,
      waterMinCelsius: 18,
      waterMinHour: 8,
      waterMaxCelsius: 21,
      waterMaxHour: 16,
      daytimeWindMinKnots: 5,
      daytimeWindMinHour: 9,
      daytimeWindMaxKnots: 12,
      daytimeWindMaxHour: 15,
      daytimeWindAverageKnots: 8,
      windAt13Knots: 9,
    })),
    airTemperatures: ['2026-07-26', '2026-07-27', '2026-07-28'].map(rawAir),
    districtWeather: [
      {
        locationId: 1110600,
        locationName: 'Lisboa',
        latitude: 38.766,
        longitude: -9.1286,
        forecastDate: '2026-07-26',
        minimumCelsius: 18,
        maximumCelsius: 28,
        weatherTypeId: 1,
      },
    ],
  }
}

function metadataPayload() {
  return [
    {
      id: '10',
      territory: 'mainland',
      district: 'Lisboa',
      municipality: 'Cascais',
      sourceLatitude: 38.68,
      sourceLongitude: -9.33,
      displayLatitude: 38.68,
      displayLongitude: -9.33,
    },
  ]
}

describe('published data loading', () => {
  it('uses rolling metadata and cache policies with legacy-compatible payloads', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      const body = url === '/data/latest.json'
        ? latestPayload()
        : metadataPayload()
      return new Response(JSON.stringify(body))
    })
    vi.stubGlobal('fetch', fetchMock)

    const dataset = await loadBeachDataset()

    expect(dataset.forecastDates).toEqual([
      '2026-07-26',
      '2026-07-27',
      '2026-07-28',
    ])
    expect(dataset).toMatchObject({
      generatedAt: '2026-07-26T10:00:00.000Z',
      forecastUpdatedAt: '2026-07-26T09:00:00.000Z',
      historyDates: [],
    })
    expect(fetchMock.mock.calls).toEqual([
      ['/data/latest.json', { cache: 'default' }],
      ['/data/beach-metadata.json', { cache: 'force-cache' }],
    ])
  })

  it('derives display dates from air forecasts for older payloads', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url === '/data/latest.json') {
        return new Response(
          JSON.stringify({
            generatedAt: '2026-07-25T10:00:00.000Z',
            catalogSize: 155,
            availableBeachCount: 0,
            unavailableLocations: [],
            beaches: [],
            summaries: [],
            airTemperatures: [
              rawAir('2026-07-27'),
              rawAir('2026-07-25'),
              rawAir('2026-07-26'),
              rawAir('2026-07-28'),
            ],
          }),
        )
      }
      return new Response('[]')
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(loadBeachDataset()).resolves.toMatchObject({
      forecastDates: ['2026-07-25', '2026-07-26', '2026-07-27'],
      forecastUpdatedAt: '2026-07-25T10:00:00.000Z',
    })
  })

  it('loadBeachDataset does not fetch history index or history files', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) =>
      new Response(
        JSON.stringify(
          String(input) === '/data/latest.json' ? latestPayload() : metadataPayload(),
        ),
      ))
    vi.stubGlobal('fetch', fetchMock)

    const dataset = await loadBeachDataset()

    expect(dataset.historyDates).toEqual([])
    expect(
      fetchMock.mock.calls.some(([input]) => String(input).includes('/data/history/')),
    ).toBe(false)
  })

  it('loadBackgroundHistory populates historyDates from timeline and merges beach histories', async () => {
    const timelineShard = {
      schemaVersion: 1,
      month: '2026-07',
      dates: ['2026-07-24', '2026-07-25'],
      points: [
        { beachId: '10', date: '2026-07-24', waterMin: 17, waterMax: 20, airMin: 16, airMax: 26, windMinKnots: 4, windAverageKnots: 7, windMaxKnots: 10 },
        { beachId: '10', date: '2026-07-25', waterMin: 17, waterMax: 20, airMin: 16, airMax: 26, windMinKnots: 4, windAverageKnots: 7, windMaxKnots: 10 },
      ],
      generatedAt: '2026-07-25T10:00:00.000Z',
    }
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url === '/data/latest.json') return new Response(JSON.stringify(latestPayload()))
      if (url === '/data/beach-metadata.json') {
        return new Response(JSON.stringify(metadataPayload()))
      }
      if (url === '/data/timeline/index.json') {
        return new Response(JSON.stringify({
          schemaVersion: 1,
          dates: ['2026-07-24', '2026-07-25'],
          months: ['2026-07'],
          generatedAt: '2026-07-25T10:00:00.000Z',
        }))
      }
      if (url === '/data/timeline/2026-07.json') {
        return new Response(JSON.stringify(timelineShard))
      }
      return new Response('', { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const initial = await loadBeachDataset()
    const hydrated = await loadBackgroundHistory(initial)

    expect(hydrated.historyDates).toEqual(['2026-07-24', '2026-07-25'])
    expect(hydrated.beaches[0].history.map((point) => point.date)).toEqual([
      '2026-07-24',
      '2026-07-25',
      '2026-07-26',
      '2026-07-27',
      '2026-07-28',
    ])
  })

  it('loadBackgroundHistory hydrates at most 30 archive dates from timeline index', async () => {
    const allDates = Array.from({ length: 35 }, (_, i) => {
      const d = new Date('2026-06-24T12:00:00Z')
      d.setUTCDate(d.getUTCDate() + i)
      return d.toISOString().slice(0, 10)
    })
    const months = [...new Set(allDates.map((d) => d.slice(0, 7)))]
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url === '/data/latest.json') return new Response(JSON.stringify(latestPayload()))
      if (url === '/data/beach-metadata.json') {
        return new Response(JSON.stringify(metadataPayload()))
      }
      if (url === '/data/timeline/index.json') {
        return new Response(JSON.stringify({
          schemaVersion: 1,
          dates: allDates,
          months,
          generatedAt: '2026-07-28T10:00:00.000Z',
        }))
      }
      for (const month of months) {
        if (url === `/data/timeline/${month}.json`) {
          return new Response(JSON.stringify({
            schemaVersion: 1,
            month,
            dates: allDates.filter((d) => d.startsWith(month)),
            points: allDates
              .filter((d) => d.startsWith(month))
              .map((date) => ({ beachId: '10', date, waterMin: 17, waterMax: 20 })),
            generatedAt: '2026-07-28T10:00:00.000Z',
          }))
        }
      }
      return new Response('', { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const initial = await loadBeachDataset()
    const hydrated = await loadBackgroundHistory(initial)

    expect(hydrated.historyDates).toHaveLength(35)
    const historyDates = hydrated.beaches[0].history
      .filter((p) => p.kind === 'history')
      .map((p) => p.date)
    expect(historyDates.length).toBeLessThanOrEqual(30)
    const expected30 = allDates.slice(-30)
    expect(historyDates[0]).toBe(expected30[0])
  })

  it('rejects invalid published timestamps and empty display windows', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url === '/data/latest.json') {
        return new Response(
          JSON.stringify({
            generatedAt: 'invalid',
            displayForecastDates: [],
            catalogSize: 0,
            availableBeachCount: 0,
            unavailableLocations: [],
            beaches: [],
            summaries: [],
            airTemperatures: [],
          }),
        )
      }
      return new Response('[]')
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(loadBeachDataset()).rejects.toThrow()
  })
})


describe('beach day detail loading', () => {
  it('returns parsed data on a valid response', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          schemaVersion: 1,
          beachId: '10',
          date: '2026-07-29',
          updatedAt: '2026-07-29T08:00:00.000Z',
          air: { minimumCelsius: 18, maximumCelsius: 27 },
          summary: {
            waterMinCelsius: 18.5,
            waterMaxCelsius: 21.2,
            daytimeWindMinKnots: 4,
            daytimeWindAverageKnots: 8,
            daytimeWindMaxKnots: 12,
          },
          hourly: [
            {
              hour: 9,
              waterTemperatureCelsius: 19.2,
              windKnots: 7,
              windDirection: 'NW',
            },
          ],
        }),
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(loadBeachDayDetail('10', '2026-07-29')).resolves.toMatchObject({
      beachId: '10',
      date: '2026-07-29',
      hourly: [{ hour: 9, windDirection: 'NW' }],
    })
    expect(fetchMock).toHaveBeenCalledWith('/data/beach/10/day/2026-07-29.json', {
      cache: 'default',
    })
  })

  it('throws on non-ok response with beach id, date, and status', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })))

    await expect(loadBeachDayDetail('10', '2026-07-29')).rejects.toThrow(
      'Beach day detail unavailable: 10/2026-07-29 (404)',
    )
  })

  it('throws on schema validation failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            schemaVersion: 1,
            beachId: '10',
            date: '2026-07-29',
            updatedAt: '2026-07-29T08:00:00.000Z',
            air: null,
            summary: null,
            hourly: [{ hour: 25, waterTemperatureCelsius: null, windKnots: null, windDirection: null }],
          }),
        ),
      ),
    )

    await expect(loadBeachDayDetail('10', '2026-07-29')).rejects.toThrow()
  })

  it('deduplicates concurrent requests for the same day detail', async () => {
    let calls = 0
    const fetchMock = vi.fn(async () => {
      calls += 1
      await Promise.resolve()
      return new Response(
        JSON.stringify({
          schemaVersion: 1,
          beachId: '10',
          date: '2026-07-29',
          updatedAt: '2026-07-29T08:00:00.000Z',
          air: null,
          summary: null,
          hourly: [],
        }),
      )
    })
    vi.stubGlobal('fetch', fetchMock)

    const [first, second] = await Promise.all([
      loadBeachDayDetail('10', '2026-07-29'),
      loadBeachDayDetail('10', '2026-07-29'),
    ])

    expect(first).toEqual(second)
    expect(calls).toBe(1)
  })

  it('evicts failed requests so a retry works', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 500 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            schemaVersion: 1,
            beachId: '10',
            date: '2026-07-29',
            updatedAt: '2026-07-29T08:00:00.000Z',
            air: null,
            summary: null,
            hourly: [],
          }),
        ),
      )
    vi.stubGlobal('fetch', fetchMock)

    await expect(loadBeachDayDetail('10', '2026-07-29')).rejects.toThrow(
      'Beach day detail unavailable: 10/2026-07-29 (500)',
    )
    await expect(loadBeachDayDetail('10', '2026-07-29')).resolves.toMatchObject({
      date: '2026-07-29',
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('refreshes current and future detail after sixty seconds', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-29T12:00:00.000Z'))
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          schemaVersion: 1,
          beachId: '10',
          date: '2026-07-29',
          updatedAt: '2026-07-29T08:00:00.000Z',
          air: null,
          summary: null,
          hourly: [],
        }),
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    await loadBeachDayDetail('10', '2026-07-29')
    vi.advanceTimersByTime(60_001)
    await loadBeachDayDetail('10', '2026-07-29')

    expect(fetchMock).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })
})

describe('timeline loading', () => {
  it('loadTimelineMonth deduplicates concurrent requests', async () => {
    let calls = 0
    const fetchMock = vi.fn(async () => {
      calls += 1
      await Promise.resolve()
      return new Response(
        JSON.stringify({
          schemaVersion: 1,
          month: '2026-07',
          dates: ['2026-07-25'],
          points: [{ beachId: '10', date: '2026-07-25', waterMax: 20 }],
          generatedAt: '2026-07-25T10:00:00.000Z',
        }),
      )
    })
    vi.stubGlobal('fetch', fetchMock)

    const [first, second] = await Promise.all([
      loadTimelineMonth('2026-07'),
      loadTimelineMonth('2026-07'),
    ])

    expect(first).toEqual(second)
    expect(calls).toBe(1)
  })

  it('loadTimelineMonth retries after rejection', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 500 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            schemaVersion: 1,
            month: '2026-07',
            dates: ['2026-07-25'],
            points: [],
            generatedAt: '2026-07-25T10:00:00.000Z',
          }),
        ),
      )
    vi.stubGlobal('fetch', fetchMock)

    await expect(loadTimelineMonth('2026-07')).rejects.toThrow(
      'Published timeline is unavailable for 2026-07',
    )
    await expect(loadTimelineMonth('2026-07')).resolves.toMatchObject({
      month: '2026-07',
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('refreshes the current month after the in-memory TTL', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-29T10:00:00Z'))
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          schemaVersion: 1,
          month: '2026-07',
          dates: ['2026-07-29'],
          points: [],
          generatedAt: new Date().toISOString(),
        }),
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    await loadTimelineMonth('2026-07')
    await loadTimelineMonth('2026-07')
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(60_001)
    await loadTimelineMonth('2026-07')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })

  it('loadTimelineRange computes correct month intersection', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.endsWith('/timeline/2026-06.json')) {
        return new Response(
          JSON.stringify({
            schemaVersion: 1,
            month: '2026-06',
            dates: ['2026-06-30'],
            points: [{ beachId: '10', date: '2026-06-30', waterMax: 19 }],
            generatedAt: '2026-07-01T10:00:00.000Z',
          }),
        )
      }
      if (url.endsWith('/timeline/2026-07.json')) {
        return new Response(
          JSON.stringify({
            schemaVersion: 1,
            month: '2026-07',
            dates: ['2026-07-01', '2026-07-14'],
            points: [
              { beachId: '10', date: '2026-07-01', waterMax: 20 },
              { beachId: '10', date: '2026-07-14', waterMax: 21 },
            ],
            generatedAt: '2026-07-14T10:00:00.000Z',
          }),
        )
      }
      return new Response('', { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const loaded = await loadTimelineRange(
      {
        generatedAt: '2026-07-15T10:00:00.000Z',
        forecastUpdatedAt: '2026-07-15T10:00:00.000Z',
        catalogSize: 1,
        availableCount: 1,
        forecastDates: ['2026-07-15', '2026-07-16', '2026-07-17'],
        historyDates: [],
        districtWeather: [],
        unavailableLocations: [],
        beaches: [{
          id: '10',
          name: 'Carcavelos',
          territory: 'mainland',
          district: 'Lisboa',
          municipality: 'Cascais',
          latitude: 0,
          longitude: 0,
          sourceLatitude: 0,
          sourceLongitude: 0,
          daily: [
            {
              date: '2026-07-15',
              waterMin: 18,
              waterMax: 21,
              waterMinHour: null,
              waterMaxHour: null,
              windMinKnots: 5,
              windMaxKnots: 10,
              windMinHour: null,
              windMaxHour: null,
              windAverageKnots: 8,
              windAt13Knots: 8,
              airMin: 17,
              airMax: 27,
              airMinHour: null,
              airMaxHour: null,
              airLocation: 'Lisboa',
              airDistanceKm: 1,
            },
          ],
          history: [{
            date: '2026-07-15',
            label: '15 Jul',
            kind: 'current',
            waterMin: 18,
            waterMax: 21,
            airMin: 17,
            airMax: 27,
            windMinKnots: 5,
            windAverageKnots: 8,
            windMaxKnots: 10,
          }],
        }],
      },
      '2026-06-30',
      '2026-07-17',
    )

    expect(
      fetchMock.mock.calls.map(([input]) => String(input)),
    ).toEqual([
      '/data/timeline/2026-06.json',
      '/data/timeline/2026-07.json',
    ])
    expect(loaded.beaches[0].history.map((point) => point.date)).toEqual([
      '2026-06-30',
      '2026-07-01',
      '2026-07-14',
      '2026-07-15',
    ])
  })

  it('one-year range issues at most 12 month loads', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      const monthMatch = /\/data\/timeline\/(\d{4}-\d{2})\.json$/.exec(url)
      if (monthMatch) {
        const month = monthMatch[1]!
        return new Response(
          JSON.stringify({
            schemaVersion: 1,
            month,
            dates: [],
            points: [],
            generatedAt: '2026-07-01T00:00:00.000Z',
          }),
        )
      }
      return new Response('', { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const dataset: Parameters<typeof loadTimelineRange>[0] = {
      generatedAt: '2026-07-01T00:00:00.000Z',
      forecastUpdatedAt: '2026-07-01T00:00:00.000Z',
      catalogSize: 0,
      availableCount: 0,
      forecastDates: ['2026-07-01', '2026-07-02', '2026-07-03'],
      historyDates: [],
      districtWeather: [],
      unavailableLocations: [],
      beaches: [],
    }
    await loadTimelineRange(
      dataset,
      '2025-07-01',
      '2026-07-03',
      new Date('2026-07-01T12:00:00Z'),
    )

    const monthUrls = fetchMock.mock.calls
      .map(([input]) => String(input))
      .filter((url) => url.includes('/timeline/') && url.endsWith('.json') && !url.includes('index'))
    expect(monthUrls).toHaveLength(12)
    expect(monthUrls[0]).toContain('2025-07')
    expect(monthUrls[11]).toContain('2026-06')
  })
})

describe('evolutionDefaultRange', () => {
  it('returns correct defaults with fewer than 15 dates', () => {
    expect(
      evolutionDefaultRange(['2026-07-25', '2026-07-26'], ['2026-07-28', '2026-07-29']),
    ).toEqual({
      startDate: '2026-07-25',
      endDate: '2026-07-29',
    })
  })

  it('returns 15th-from-end date when plenty of history', () => {
    const dates = Array.from({ length: 20 }, (_, index) =>
      `2026-07-${String(index + 1).padStart(2, '0')}`,
    )
    expect(
      evolutionDefaultRange(dates, ['2026-07-21', '2026-07-22', '2026-07-23']),
    ).toEqual({
      startDate: '2026-07-06',
      endDate: '2026-07-23',
    })
  })
})

describe('dataUrl', () => {
  it('falls back to public asset path when API base is not set', () => {
    expect(dataUrl('latest.json', undefined, '/')).toBe('/data/latest.json')
    expect(dataUrl('history/index.json', undefined, '/')).toBe('/data/history/index.json')
    expect(dataUrl('history/2026-07-25.json', undefined, '/AguaDaPraia/')).toBe(
      '/AguaDaPraia/data/history/2026-07-25.json',
    )
  })

  it('strips .json suffix and prepends API base when configured', () => {
    expect(dataUrl('latest.json', '/api/data')).toBe('/api/data/latest')
    expect(dataUrl('history/index.json', '/api/data')).toBe('/api/data/history/index')
    expect(dataUrl('timeline/index.json', '/api/data')).toBe('/api/data/timeline/index')
    expect(dataUrl('history/2026-07-25.json', '/api/data')).toBe(
      '/api/data/history/2026-07-25',
    )
    expect(dataUrl('beach/10/day/2026-07-29.json', '/api/data')).toBe(
      '/api/data/beach/10/day/2026-07-29',
    )
  })

  it('handles trailing slash in API base', () => {
    expect(dataUrl('latest.json', '/api/data/')).toBe('/api/data/latest')
  })
})

describe('resolveDateIndex', () => {
  it('returns today index when today is in allDates', () => {
    const dates = ['2026-07-25', '2026-07-26', '2026-07-27', '2026-07-28']
    expect(resolveDateIndex(dates, '2026-07-26', '2026-07-28')).toBe(1)
  })

  it('returns rangeEnd index when today is not in allDates', () => {
    const dates = ['2026-07-24', '2026-07-25', '2026-07-28']
    expect(resolveDateIndex(dates, '2026-07-27', '2026-07-28')).toBe(2)
  })

  it('returns last index when neither today nor rangeEnd is in allDates', () => {
    const dates = ['2026-07-24', '2026-07-25']
    expect(resolveDateIndex(dates, '2026-07-27', '2026-07-28')).toBe(1)
  })

  it('returns 0 for empty allDates', () => {
    expect(resolveDateIndex([], '2026-07-27', '2026-07-28')).toBe(0)
  })
})
