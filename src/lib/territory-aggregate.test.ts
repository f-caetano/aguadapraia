import { describe, expect, it } from 'vitest'
import type { BeachViewModel, DailyBeachForecast, HistoryPoint } from '../types'
import { computeTerritoryAggregate } from './territory-aggregate'

function createDailyForecast(
  date: string,
  overrides: Partial<DailyBeachForecast> = {},
): DailyBeachForecast {
  return {
    date,
    waterMin: 18,
    waterMax: 20,
    waterMinHour: null,
    waterMaxHour: null,
    windMinKnots: 8,
    windMaxKnots: 14,
    windMinHour: null,
    windMaxHour: null,
    windAverageKnots: 11,
    windAt13Knots: 11,
    airMin: 20,
    airMax: 26,
    airMinHour: null,
    airMaxHour: null,
    airLocation: 'Station',
    airDistanceKm: 1,
    ...overrides,
  }
}

function createHistoryPoint(
  date: string,
  overrides: Partial<HistoryPoint> = {},
): HistoryPoint {
  return {
    date,
    label: date,
    kind: 'history',
    ...overrides,
  }
}

function createBeach(
  id: string,
  history: HistoryPoint[] = [],
  daily: DailyBeachForecast[] = [],
): BeachViewModel {
  return {
    id,
    name: `Beach ${id}`,
    territory: 'mainland',
    district: 'Lisboa',
    municipality: 'Cascais',
    latitude: 0,
    longitude: 0,
    sourceLatitude: 0,
    sourceLongitude: 0,
    history,
    daily,
  }
}

describe('computeTerritoryAggregate', () => {
  it('returns null aggregates when there are no beaches', () => {
    expect(computeTerritoryAggregate([], '2026-07-27', 'history')).toEqual({
      date: '2026-07-27',
      kind: 'history',
      water: null,
      air: null,
      wind: null,
    })
  })

  it('does not invent zeroes for missing values', () => {
    const aggregate = computeTerritoryAggregate(
      [
        createBeach('a', [
          createHistoryPoint('2026-07-27', {
            waterMax: 21,
            airMax: 28,
            windAverageKnots: 12,
          }),
        ]),
        createBeach('b', [
          createHistoryPoint('2026-07-27', {
            waterMin: 18,
            waterMax: 23,
            airMin: 19,
            airMax: 25,
            windMinKnots: 7,
            windAverageKnots: 10,
            windMaxKnots: 15,
          }),
        ]),
      ],
      '2026-07-27',
      'history',
    )

    expect(aggregate.water).toEqual({
      min: 18,
      avg: 20.75,
      max: 23,
      coverage: 1,
    })
    expect(aggregate.air).toEqual({
      min: 19,
      avg: 25,
      max: 28,
      coverage: 1,
    })
    expect(aggregate.wind).toEqual({
      min: 7,
      avg: 11,
      max: 15,
      coverage: 1,
    })
  })

  it('uses daily forecasts for forecast dates missing from history', () => {
    const aggregate = computeTerritoryAggregate(
      [
        createBeach('a', [], [createDailyForecast('2026-07-28', { waterMax: 24, airMax: 29 })]),
      ],
      '2026-07-28',
      'forecast',
    )

    expect(aggregate.water).toMatchObject({ min: 18, avg: 21, max: 24, coverage: 1 })
    expect(aggregate.air).toMatchObject({ min: 20, avg: 24.5, max: 29, coverage: 1 })
  })

  it('reports coverage as the fraction of beaches with data', () => {
    const aggregate = computeTerritoryAggregate(
      [
        createBeach('a', [createHistoryPoint('2026-07-27', { waterMax: 22 })]),
        createBeach('b', [createHistoryPoint('2026-07-27', { airMax: 26 })]),
      ],
      '2026-07-27',
      'history',
    )

    expect(aggregate.water).toEqual({
      min: 22,
      avg: 22,
      max: 22,
      coverage: 0.5,
    })
    expect(aggregate.air).toEqual({
      min: 26,
      avg: 26,
      max: 26,
      coverage: 0.5,
    })
    expect(aggregate.wind).toBeNull()
  })
})
