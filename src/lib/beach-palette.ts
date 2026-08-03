const BEACH_PALETTE = [
  'var(--beach-0)',
  'var(--beach-1)',
  'var(--beach-2)',
  'var(--beach-3)',
] as const

export function beachColor(index: number): string {
  return BEACH_PALETTE[index % BEACH_PALETTE.length]
}
