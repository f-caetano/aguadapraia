import { describe, expect, it } from 'vitest'
import { formatFreshnessTimestamp } from './freshness'

describe('formatFreshnessTimestamp', () => {
  it('formats a localized full timestamp for the tooltip', () => {
    expect(formatFreshnessTimestamp('2026-07-27T09:10:00Z', 'en')).toBe(
      '2026-07-27 10H',
    )
    expect(formatFreshnessTimestamp('2026-07-27T09:10:00Z', 'pt')).toBe(
      '2026-07-27 10H',
    )
  })

  it('rejects invalid timestamps', () => {
    expect(() => formatFreshnessTimestamp('invalid', 'en')).toThrow(
      'Invalid forecast timestamp',
    )
  })
})
