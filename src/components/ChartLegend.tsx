interface LegendSeries {
  key: string
  label: string
  colour: string
  fullLabel?: string
}

interface ChartLegendProps {
  series: LegendSeries[]
  hidden: ReadonlySet<string>
  onToggle: (key: string) => void
  ariaLabel: string
}

export default function ChartLegend({
  series,
  hidden,
  onToggle,
  ariaLabel,
}: ChartLegendProps) {
  return (
    <div className="chart-legend" role="group" aria-label={ariaLabel}>
      {series.map(({ key, label, colour, fullLabel }) => {
        const isHidden = hidden.has(key)
        return (
          <button
            key={key}
            type="button"
            className={`chart-legend-item${isHidden ? ' hidden' : ''}`}
            aria-pressed={!isHidden}
            onClick={() => onToggle(key)}
            title={fullLabel ?? label}
            aria-label={fullLabel ?? label}
          >
            <span
              className="legend-swatch"
              style={{ background: colour }}
              aria-hidden="true"
            />
            <span className="legend-label">{label}</span>
          </button>
        )
      })}
    </div>
  )
}
