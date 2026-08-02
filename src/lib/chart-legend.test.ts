import { describe, expect, it } from 'vitest'
import { resetHiddenSeries, toggleSeriesKey } from './chart-legend'

describe('toggleSeriesKey', () => {
  it('adds a key when not hidden', () => {
    const result = toggleSeriesKey(new Set(), 'Min')
    expect(result).toEqual(new Set(['Min']))
  })

  it('removes a key when already hidden', () => {
    const result = toggleSeriesKey(new Set(['Min', 'Max']), 'Min')
    expect(result).toEqual(new Set(['Max']))
  })

  it('does not mutate the original set', () => {
    const original = new Set(['Min'])
    toggleSeriesKey(original, 'Max')
    expect(original.size).toBe(1)
  })
})

describe('resetHiddenSeries', () => {
  it('removes keys no longer available', () => {
    const result = resetHiddenSeries(new Set(['Min', 'compare0']), ['Min', 'Max'])
    expect(result).toEqual(new Set(['Min']))
  })

  it('returns empty set when all would be hidden', () => {
    const result = resetHiddenSeries(new Set(['Min', 'Max']), ['Min', 'Max'])
    expect(result).toEqual(new Set())
  })

  it('returns empty set when available is empty', () => {
    const result = resetHiddenSeries(new Set(['Min']), [])
    expect(result).toEqual(new Set())
  })

  it('preserves valid hidden keys', () => {
    const result = resetHiddenSeries(new Set(['Min']), ['Min', 'Max', 'Average'])
    expect(result).toEqual(new Set(['Min']))
  })
})
