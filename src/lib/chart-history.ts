/**
 * Selects the most recent `count` archived history points.
 */
export function recentHistory<T extends { kind: string }>(
  history: T[],
  count: number,
): T[] {
  return history.filter((point) => point.kind === 'history').slice(-count)
}
