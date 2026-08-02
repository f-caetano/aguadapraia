import { describe, expect, it } from 'vitest'
import { recentHistory } from './chart-history'

describe('recentHistory', () => {
  const points = [
    { date: '2026-07-01', kind: 'history' as const },
    { date: '2026-07-10', kind: 'history' as const },
    { date: '2026-07-20', kind: 'history' as const },
    { date: '2026-07-26', kind: 'current' as const },
    { date: '2026-07-27', kind: 'forecast' as const },
  ]

  it('keeps only archived history points', () => {
    const result = recentHistory(points, 30)
    expect(result.every((p) => p.kind === 'history')).toBe(true)
  })

  it('returns at most count points', () => {
    const result = recentHistory(points, 2)
    expect(result).toHaveLength(2)
    expect(result[0].date).toBe('2026-07-10')
    expect(result[1].date).toBe('2026-07-20')
  })

  it('returns all archived points when fewer than count', () => {
    const result = recentHistory(points, 30)
    expect(result).toHaveLength(3)
  })

  it('returns empty array for empty input', () => {
    expect(recentHistory([], 30)).toEqual([])
  })
})
