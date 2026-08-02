import { describe, expect, it } from 'vitest'
import {
  classifyDate,
  evolutionDates,
  preferredForecastDate,
} from './date-classification'

describe('classifyDate', () => {
  const now = new Date('2026-07-26T12:00:00Z')

  it('returns history for dates before today', () => {
    expect(classifyDate('2026-07-25', ['2026-07-26', '2026-07-27'], now)).toBe('history')
  })

  it('returns current for today', () => {
    expect(classifyDate('2026-07-26', ['2026-07-26', '2026-07-27'], now)).toBe('current')
  })

  it('returns forecast for dates after today', () => {
    expect(classifyDate('2026-07-27', ['2026-07-26', '2026-07-27'], now)).toBe('forecast')
  })

  it('classifies a stale first forecast date as history', () => {
    expect(
      classifyDate(
        '2026-07-25',
        ['2026-07-25', '2026-07-26', '2026-07-27'],
        now,
      ),
    ).toBe('history')
  })

  it('returns history when forecast dates are empty', () => {
    expect(classifyDate('2026-07-27', [])).toBe('history')
  })
})

describe('preferredForecastDate', () => {
  const now = new Date('2026-07-26T12:00:00Z')

  it('selects today when the published window includes it', () => {
    expect(
      preferredForecastDate(['2026-07-25', '2026-07-26', '2026-07-27'], now),
    ).toBe('2026-07-26')
  })

  it('falls back to the first published date', () => {
    expect(preferredForecastDate(['2026-07-24', '2026-07-25'], now)).toBe(
      '2026-07-24',
    )
  })
})

describe('evolutionDates', () => {
  it('dedupes, sorts, and merges history with forecast dates', () => {
    expect(
      evolutionDates(
        ['2026-07-24', '2026-07-26', '2026-07-25'],
        ['2026-07-26', '2026-07-27', '2026-07-28'],
      ),
    ).toEqual([
      '2026-07-24',
      '2026-07-25',
      '2026-07-26',
      '2026-07-27',
      '2026-07-28',
    ])
  })
})
