import { describe, expect, it } from 'vitest'
import { formatDistance } from './units'

describe('distance formatting', () => {
  it('formats exact, sub-kilometre, and kilometre distances', () => {
    expect(formatDistance(0)).toBe('0 km')
    expect(formatDistance(0.36)).toBe('0.4 km')
    expect(formatDistance(1)).toBe('1 km')
    expect(formatDistance(12.6)).toBe('13 km')
  })
})
