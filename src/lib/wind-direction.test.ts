import { describe, expect, it } from 'vitest'
import { windDirectionDegrees } from './wind-direction'

describe('windDirectionDegrees', () => {
  it('maps cardinal and intercardinal directions', () => {
    expect(windDirectionDegrees('N')).toBe(0)
    expect(windDirectionDegrees('NE')).toBe(45)
    expect(windDirectionDegrees('WNW')).toBe(292.5)
  })

  it('normalizes whitespace and casing', () => {
    expect(windDirectionDegrees(' nw ')).toBe(315)
  })

  it('returns null for missing or unknown directions', () => {
    expect(windDirectionDegrees(null)).toBeNull()
    expect(windDirectionDegrees('variable')).toBeNull()
  })
})
