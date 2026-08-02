import type { TooltipContentProps, TooltipValueType } from 'recharts'

interface ChartTooltipProps
  extends TooltipContentProps<TooltipValueType, string | number> {
  suffix: string
  seriesLabels: Readonly<Record<string, string>>
  seriesSuffixes?: Readonly<Record<string, string>>
}

function logicalSeriesKey(dataKey: unknown): string {
  return String(dataKey ?? '').replace(/^(history|forecast|[hf](?=[A-Z]))/, '')
}

export default function ChartTooltip({
  active,
  label,
  payload,
  suffix,
  seriesLabels,
  seriesSuffixes,
}: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null

  const visible = new Map<
    string,
    { name: string; value: number; colour: string; suffix: string }
  >()

  for (const item of payload) {
    if (typeof item.value !== 'number') continue
    const key = logicalSeriesKey(item.dataKey)
    if (visible.has(key)) continue
    visible.set(key, {
      name: seriesLabels[key] ?? String(item.name ?? key),
      value: item.value,
      colour: item.color ?? item.stroke ?? 'var(--cp-link)',
      suffix: seriesSuffixes?.[key] ?? suffix,
    })
  }

  if (visible.size === 0) return null

  return (
    <div className="chart-tooltip">
      <strong>{label}</strong>
      {Array.from(visible.values()).map((item) => (
        <span key={item.name}>
          <i style={{ background: item.colour }} aria-hidden="true" />
          <b>{item.name}</b>
          {`: ${item.value.toFixed(1)}${item.suffix}`}
        </span>
      ))}
    </div>
  )
}
