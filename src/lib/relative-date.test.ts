import { describe, expect, it } from 'vitest'
import { getRelativeLabel } from './relative-date'

const forecastDates = ['2026-07-29', '2026-07-30', '2026-07-31'] as const
const now = new Date('2026-07-29T12:00:00Z')

describe('getRelativeLabel', () => {
  it.each([
    ['pt', '2026-07-29', 'Hoje'],
    ['pt', '2026-07-30', 'Amanhã'],
    ['pt', '2026-07-31', 'Depois'],
    ['pt', '2026-07-28', 'Histórico'],
    ['pt', '2026-08-01', 'Previsão'],
    ['en', '2026-07-29', 'Today'],
    ['en', '2026-07-30', 'Tomorrow'],
    ['en', '2026-07-31', 'Day 3'],
    ['en', '2026-07-28', 'Historical'],
    ['en', '2026-08-01', 'Forecast'],
  ] as const)('returns %s label for %s', (language, date, relative) => {
    expect(getRelativeLabel(date, forecastDates, language, now).relative).toBe(relative)
  })

  it.each([
    ['pt', '2026-07-29'],
    ['en', '2026-07-29'],
  ] as const)('formats compact dates for %s', (language, date) => {
    expect(getRelativeLabel(date, forecastDates, language, now).compactDate).toBe(
      new Intl.DateTimeFormat(language === 'pt' ? 'pt-PT' : 'en-GB', {
        day: '2-digit',
        month: 'short',
      }).format(new Date(`${date}T12:00:00Z`)),
    )
  })

  it.each([
    ['pt', 'Histórico'],
    ['en', 'Historical'],
  ] as const)('uses historical when forecast dates are empty for %s', (language, relative) => {
    expect(getRelativeLabel('2026-07-29', [], language).relative).toBe(relative)
  })

  it('does not label a stale first forecast date as today', () => {
    expect(
      getRelativeLabel(
        '2026-07-28',
        ['2026-07-28', '2026-07-29', '2026-07-30'],
        'pt',
        now,
      ).relative,
    ).toBe('Histórico')
  })
})
