import { describe, expect, it } from 'vitest'
import {
  defaultSortState,
  filterBeaches,
  sortBeaches,
  toggleSort,
  type TableSortState,
} from './beach-table'
import type { BeachViewModel } from '../types'

function makeBeach(
  overrides: Partial<BeachViewModel> & { name: string; district: string; municipality: string },
): BeachViewModel {
  return {
    id: overrides.name,
    territory: 'mainland',
    latitude: 0,
    longitude: 0,
    sourceLatitude: 0,
    sourceLongitude: 0,
    history: [],
    daily: [
      {
        date: '2026-07-27',
        waterMin: 18,
        waterMax: 22,
        waterMinHour: 6,
        waterMaxHour: 14,
        windMinKnots: 2,
        windMaxKnots: 12,
        windMinHour: 9,
        windMaxHour: 18,
        windAverageKnots: 7,
        windAt13Knots: 8,
        airMin: 20,
        airMax: 28,
        airMinHour: 6,
        airMaxHour: 15,
        airLocation: 'Setúbal',
        airDistanceKm: 5,
      },
    ],
    ...overrides,
  }
}

const beaches: BeachViewModel[] = [
  makeBeach({ name: 'Comporta', district: 'Setúbal', municipality: 'Alcácer do Sal' }),
  makeBeach({ name: 'Albufeira', district: 'Faro', municipality: 'Albufeira' }),
  makeBeach({ name: 'Costa Nova', district: 'Aveiro', municipality: 'Ílhavo' }),
]

const DATE = '2026-07-27'

describe('defaultSortState', () => {
  it('returns name asc', () => {
    expect(defaultSortState()).toEqual({ key: 'name', dir: 'asc' })
  })
})

describe('toggleSort', () => {
  it('reverses direction when clicking the same column', () => {
    const state: TableSortState = { key: 'name', dir: 'asc' }
    expect(toggleSort(state, 'name')).toEqual({ key: 'name', dir: 'desc' })
  })

  it('uses default direction when switching columns', () => {
    const state: TableSortState = { key: 'name', dir: 'asc' }
    expect(toggleSort(state, 'waterMax')).toEqual({ key: 'waterMax', dir: 'desc' })
    expect(toggleSort(state, 'windAvg')).toEqual({ key: 'windAvg', dir: 'asc' })
  })

  it('toggles desc→asc for same key', () => {
    const state: TableSortState = { key: 'waterMax', dir: 'desc' }
    expect(toggleSort(state, 'waterMax')).toEqual({ key: 'waterMax', dir: 'asc' })
  })
})

describe('filterBeaches', () => {
  it('returns all beaches when no filters applied', () => {
    const result = filterBeaches(beaches, { query: '', district: '', municipality: '', language: 'pt' })
    expect(result).toHaveLength(3)
  })

  it('filters by query (beach name)', () => {
    const result = filterBeaches(beaches, { query: 'comporta', district: '', municipality: '', language: 'pt' })
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Comporta')
  })

  it('filters by district', () => {
    const result = filterBeaches(beaches, { query: '', district: 'Faro', municipality: '', language: 'pt' })
    expect(result).toHaveLength(1)
    expect(result[0].district).toBe('Faro')
  })

  it('filters by municipality', () => {
    const result = filterBeaches(beaches, { query: '', district: '', municipality: 'Ílhavo', language: 'pt' })
    expect(result).toHaveLength(1)
    expect(result[0].municipality).toBe('Ílhavo')
  })

  it('returns empty when no match', () => {
    const result = filterBeaches(beaches, { query: 'xyzzy', district: '', municipality: '', language: 'pt' })
    expect(result).toHaveLength(0)
  })

  it('is case-insensitive', () => {
    const result = filterBeaches(beaches, { query: 'ALBUFEIRA', district: '', municipality: '', language: 'pt' })
    expect(result).toHaveLength(1)
  })
})

describe('sortBeaches', () => {
  it('sorts by name ascending', () => {
    const result = sortBeaches(beaches, { key: 'name', dir: 'asc' }, DATE, 'pt')
    expect(result.map((b) => b.name)).toEqual(['Albufeira', 'Comporta', 'Costa Nova'])
  })

  it('sorts by name descending', () => {
    const result = sortBeaches(beaches, { key: 'name', dir: 'desc' }, DATE, 'pt')
    expect(result.map((b) => b.name)).toEqual(['Costa Nova', 'Comporta', 'Albufeira'])
  })

  it('sorts by district ascending', () => {
    const result = sortBeaches(beaches, { key: 'district', dir: 'asc' }, DATE, 'pt')
    expect(result[0].district).toBe('Aveiro')
    expect(result[1].district).toBe('Faro')
    expect(result[2].district).toBe('Setúbal')
  })

  it('sorts by waterMax descending', () => {
    const varied = [
      makeBeach({ name: 'A', district: 'X', municipality: 'X', daily: [{ ...beaches[0].daily[0], waterMax: 20 }] }),
      makeBeach({ name: 'B', district: 'X', municipality: 'X', daily: [{ ...beaches[0].daily[0], waterMax: 25 }] }),
      makeBeach({ name: 'C', district: 'X', municipality: 'X', daily: [{ ...beaches[0].daily[0], waterMax: 18 }] }),
    ]
    const result = sortBeaches(varied, { key: 'waterMax', dir: 'desc' }, DATE, 'pt')
    expect(result.map((b) => b.name)).toEqual(['B', 'A', 'C'])
  })

  it('does not mutate input array', () => {
    const original = [...beaches]
    sortBeaches(beaches, { key: 'waterMax', dir: 'desc' }, DATE, 'pt')
    expect(beaches).toEqual(original)
  })
})
