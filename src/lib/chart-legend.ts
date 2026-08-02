/**
 * Toggles a key in/out of a hidden series set.
 * Returns a new Set.
 */
export function toggleSeriesKey(
  hidden: ReadonlySet<string>,
  key: string,
): Set<string> {
  const next = new Set(hidden)
  if (next.has(key)) {
    next.delete(key)
  } else {
    next.add(key)
  }
  return next
}

/**
 * Resets hidden series by removing keys that are no longer in the available list.
 * If all series would be hidden after the reset, clears the set entirely.
 */
export function resetHiddenSeries(
  hidden: ReadonlySet<string>,
  availableKeys: readonly string[],
): Set<string> {
  const next = new Set([...hidden].filter((k) => availableKeys.includes(k)))
  if (availableKeys.length > 0 && next.size === availableKeys.length) {
    return new Set()
  }
  return next
}
