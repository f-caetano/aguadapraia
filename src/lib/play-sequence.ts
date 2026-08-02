export function canPlaySequence(totalDates: number): boolean {
  return totalDates > 1
}

/**
 * Returns the next date index to step to during playback.
 * With reduced motion, jumps directly to the last date.
 * Returns null when the sequence is complete.
 */
export function nextPlayIndex(
  currentIndex: number,
  totalDates: number,
  prefersReducedMotion: boolean,
): number | null {
  if (!canPlaySequence(totalDates) || currentIndex >= totalDates - 1) return null
  return prefersReducedMotion ? totalDates - 1 : currentIndex + 1
}

/** Interval in ms between play steps. 0 means call immediately (for reduced motion). */
export function playIntervalMs(prefersReducedMotion: boolean): number {
  return prefersReducedMotion ? 0 : 800
}
