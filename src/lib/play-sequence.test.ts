import { describe, expect, it } from 'vitest'
import { canPlaySequence, nextPlayIndex, playIntervalMs } from './play-sequence'

describe('canPlaySequence', () => {
  it('requires more than one day', () => {
    expect(canPlaySequence(0)).toBe(false)
    expect(canPlaySequence(1)).toBe(false)
    expect(canPlaySequence(2)).toBe(true)
  })
})

describe('nextPlayIndex', () => {
  it('returns null at the end of the sequence', () => {
    expect(nextPlayIndex(4, 5, false)).toBeNull()
  })

  it('returns null when playback has fewer than two dates', () => {
    expect(nextPlayIndex(0, 1, false)).toBeNull()
  })

  it('advances one step during normal playback', () => {
    expect(nextPlayIndex(1, 5, false)).toBe(2)
  })

  it('jumps to the end for reduced motion', () => {
    expect(nextPlayIndex(1, 5, true)).toBe(4)
  })
})

describe('playIntervalMs', () => {
  it('returns the normal interval when motion is allowed', () => {
    expect(playIntervalMs(false)).toBe(800)
  })

  it('returns zero when reduced motion is preferred', () => {
    expect(playIntervalMs(true)).toBe(0)
  })
})
