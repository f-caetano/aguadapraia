import { useEffect, useMemo, useState } from 'react'
import { Droplets, ThermometerSun, Wind } from 'lucide-react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { getCopy, type Language } from '../i18n'
import { beachColor } from '../lib/beach-palette'
import { shortBeachName } from '../lib/beach-name'
import { resetHiddenSeries, toggleSeriesKey } from '../lib/chart-legend'
import { bridgeForecastSeries } from '../lib/chart-series'
import { convertWind, type WindUnit } from '../lib/units'
import type { BeachViewModel, DailyBeachForecast, HistoryPoint } from '../types'
import ChartLegend from './ChartLegend'
import ChartTooltip from './ChartTooltip'

type Metric = 'water' | 'air' | 'wind'

interface MetricHistoryChartProps {
  history: HistoryPoint[]
  forecasts: DailyBeachForecast[]
  language: Language
  windUnit: WindUnit
  compareHistories?: {
    beach: BeachViewModel
    history: HistoryPoint[]
    displayName?: string
  }[]
  recentCount?: number
  controlledMetric?: Metric
  hideTabs?: boolean
  primaryBeach?: BeachViewModel
  primaryDisplayName?: string
}

interface ChartPoint {
  date: string
  label: string
  historyMin?: number
  historyAverage?: number
  historyMax?: number
  forecastMin?: number
  forecastAverage?: number
  forecastMax?: number
  [key: string]: string | number | undefined
}

interface RawChartPoint {
  date: string
  historyMin?: number
  historyAverage?: number
  historyMax?: number
  forecastMin?: number
  forecastAverage?: number
  forecastMax?: number
  [key: string]: string | number | undefined
}

interface DotProps {
  cx?: number
  cy?: number
  index?: number
  key?: string | number | bigint | null
}

const colours = ['var(--cp-link)', 'var(--cp-accent)', 'var(--cp-orange)'] as const

function formatDateLabel(date: string, language: Language): string {
  return new Intl.DateTimeFormat(language === 'pt' ? 'pt-PT' : 'en-GB', {
    day: '2-digit',
    month: 'short',
  }).format(new Date(`${date}T12:00:00Z`))
}

function historyValue(
  point: HistoryPoint,
  metric: Metric,
  windUnit: WindUnit,
): number | undefined {
  if (metric === 'water') return point.waterMax
  if (metric === 'air') return point.airMax
  return point.windMaxKnots === undefined
    ? undefined
    : convertWind(point.windMaxKnots, windUnit)
}

function comparisonValue(
  point: HistoryPoint,
  metric: Metric,
  windUnit: WindUnit,
): number | undefined {
  if (metric !== 'wind') return historyValue(point, metric, windUnit)
  return point.windAverageKnots === undefined
    ? undefined
    : convertWind(point.windAverageKnots, windUnit)
}

function hiddenDefaults(metric: Metric): Set<string> {
  return metric === 'wind'
    ? new Set(['Min', 'Max'])
    : new Set(['Min'])
}

function paddedDomain(values: readonly number[], padding: number): [number, number] {
  if (values.length === 0) return [0, 1]
  const min = Math.min(...values)
  const max = Math.max(...values)
  if (min === max) return [min - padding, max + padding]
  return [Math.floor(min - padding), Math.ceil(max + padding)]
}

function recentHistoryDot(colour: string, visibleFromIndex: number) {
  return function HistoryDot({ cx, cy, index, key }: DotProps) {
    const safeIndex = index ?? -1
    const dotKey = String(key ?? `dot-${colour}-${safeIndex}`)
    if (safeIndex < visibleFromIndex || cx === undefined || cy === undefined) {
      return <g key={dotKey} />
    }
    return <circle key={dotKey} cx={cx} cy={cy} r={2} fill={colour} />
  }
}

function numericChartValues(point: ChartPoint): number[] {
  const values: number[] = []
  for (const value of Object.values(point)) {
    if (typeof value === 'number') values.push(value)
  }
  return values
}

export default function MetricHistoryChart({
  history,
  forecasts,
  language,
  windUnit,
  compareHistories = [],
  recentCount = 15,
  controlledMetric,
  hideTabs = false,
  primaryBeach,
  primaryDisplayName,
}: MetricHistoryChartProps) {
  const copy = getCopy(language)
  const [metric, setMetric] = useState<Metric>('water')
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(
    () => hiddenDefaults('water'),
  )
  const activeMetric = controlledMetric ?? metric

  useEffect(() => {
    if (controlledMetric) setMetric(controlledMetric)
  }, [controlledMetric])

  const data = useMemo(() => {
    const points = new Map<string, RawChartPoint>()

    for (const point of history) {
      if (point.kind !== 'history') continue
      points.set(point.date, {
        ...(points.get(point.date) ?? { date: point.date }),
        historyMin:
          activeMetric === 'water'
            ? point.waterMin
            : activeMetric === 'air'
              ? point.airMin
              : point.windMinKnots === undefined
                ? undefined
                : convertWind(point.windMinKnots, windUnit),
        historyAverage:
          activeMetric === 'wind' && point.windAverageKnots !== undefined
            ? convertWind(point.windAverageKnots, windUnit)
            : undefined,
        historyMax: historyValue(point, activeMetric, windUnit),
      })
    }

    for (const forecast of forecasts) {
      points.set(forecast.date, {
        ...(points.get(forecast.date) ?? { date: forecast.date }),
        forecastMin:
          activeMetric === 'water'
            ? forecast.waterMin
            : activeMetric === 'air'
              ? forecast.airMin
              : convertWind(forecast.windMinKnots, windUnit),
        forecastAverage:
          activeMetric === 'wind'
            ? convertWind(forecast.windAverageKnots, windUnit)
            : undefined,
        forecastMax:
          activeMetric === 'water'
            ? forecast.waterMax
            : activeMetric === 'air'
              ? forecast.airMax
              : convertWind(forecast.windMaxKnots, windUnit),
      })
    }

    compareHistories.slice(0, 3).forEach((comparison, index) => {
      comparison.history.forEach((point) => {
        const value = comparisonValue(point, activeMetric, windUnit)
        if (value === undefined) return
        points.set(point.date, {
          ...(points.get(point.date) ?? { date: point.date }),
          [`compare${index}`]: value,
        })
      })
    })

    const sorted = [...points.values()]
      .sort((first, second) => first.date.localeCompare(second.date))
      .map((point) => ({
        ...point,
        label: formatDateLabel(point.date, language),
      }))

    return bridgeForecastSeries(sorted, [
      { historyKey: 'historyMin', forecastKey: 'forecastMin' },
      { historyKey: 'historyAverage', forecastKey: 'forecastAverage' },
      { historyKey: 'historyMax', forecastKey: 'forecastMax' },
    ])
  }, [activeMetric, compareHistories, forecasts, history, language, windUnit])

  const comparisonFocus = hideTabs && primaryBeach !== undefined
  const series = useMemo(
    () =>
      comparisonFocus
        ? [
            {
              key: activeMetric === 'wind' ? 'Average' : 'Max',
              label: primaryDisplayName ?? shortBeachName(primaryBeach.name),
              fullLabel: primaryBeach.name,
              colour: beachColor(0),
            },
          ]
        : [
            { key: 'Min', label: copy.minimum, colour: colours[0] },
            ...(activeMetric === 'wind'
              ? [{ key: 'Average', label: copy.average, colour: colours[1] }]
              : []),
            {
              key: 'Max',
              label: copy.maximum,
              colour: activeMetric === 'wind' ? colours[2] : colours[1],
            },
          ],
    [
      activeMetric,
      comparisonFocus,
      copy.average,
      copy.maximum,
      copy.minimum,
      primaryBeach,
      primaryDisplayName,
    ],
  )
  const comparisonSeries = useMemo(
    () =>
      compareHistories.slice(0, 3).map((comparison, index) => ({
        key: `compare${index}`,
        label:
          comparison.displayName ?? shortBeachName(comparison.beach.name),
        fullLabel: comparison.beach.name,
        colour: beachColor(index + 1),
      })),
    [compareHistories],
  )
  const legendSeries = useMemo(
    () => [...series, ...comparisonSeries],
    [comparisonSeries, series],
  )
  const legendKeys = useMemo(
    () => legendSeries.map((item) => item.key),
    [legendSeries],
  )

  useEffect(() => {
    setHiddenSeries(hiddenDefaults(activeMetric))
  }, [activeMetric])

  useEffect(() => {
    setHiddenSeries((current) => {
      const next = resetHiddenSeries(current, legendKeys)
      const unchanged =
        next.size === current.size && [...next].every((key) => current.has(key))
      return unchanged ? current : next
    })
  }, [legendKeys])

  const values = data.flatMap(numericChartValues)
  const domain = paddedDomain(values, activeMetric === 'wind' ? 2 : 1)
  const suffix = activeMetric === 'wind'
    ? ` ${windUnit === 'kmh' ? 'km/h' : 'kn'}`
    : ' °C'
  const recentStartIndex = Math.max(0, data.length - recentCount)

  return (
    <div className={`metric-chart${hideTabs ? ' metric-chart--tabs-hidden' : ''}`}>
      {!hideTabs && (
        <div className="metric-chart-tabs seg-control" role="tablist" aria-label={copy.mapMetric}>
          {([
            ['water', copy.water, <Droplets key="water-icon" size={14} />],
            ['air', copy.air, <ThermometerSun key="air-icon" size={14} />],
            ['wind', copy.wind, <Wind key="wind-icon" size={14} />],
          ] as const).map(([value, label, icon]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={activeMetric === value}
              className={`metric-tab metric-tab--${value}`}
              onClick={() => setMetric(value)}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>
      )}
      <div className="metric-chart-canvas">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -12 }}>
            <CartesianGrid stroke="var(--cp-border)" vertical={false} />
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              minTickGap={20}
              tick={{ fill: 'var(--cp-text-muted)', fontSize: 10 }}
            />
            <YAxis
              domain={domain}
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'var(--cp-text-muted)', fontSize: 10 }}
              width={44}
              tickFormatter={(value) => `${value}${activeMetric === 'wind' ? '' : '°'}`}
            />
            <Tooltip
              content={(props) => (
                <ChartTooltip
                  {...props}
                  suffix={suffix}
                  seriesLabels={Object.fromEntries(
                    legendSeries.map(({ key, label }) => [key, label]),
                  )}
                />
              )}
            />
            {series
              .filter(({ key }) => !hiddenSeries.has(key))
              .flatMap(({ key, label, colour }) => [
                <Line
                  key={`history${key}`}
                  connectNulls={false}
                  dataKey={`history${key}`}
                  name={`${copy.historyLabel} · ${label}`}
                  stroke={colour}
                  strokeWidth={key === 'Max' ? 2.4 : 2}
                  dot={recentHistoryDot(colour, recentStartIndex)}
                  activeDot={{ r: 4 }}
                />,
                <Line
                  key={`forecast${key}`}
                  connectNulls={false}
                  dataKey={`forecast${key}`}
                  name={`${copy.forecastLabel} · ${label}`}
                  stroke={colour}
                  strokeWidth={key === 'Max' ? 2.4 : 2}
                  strokeDasharray="6 5"
                  dot={{ r: 2, fill: colour }}
                  activeDot={{ r: 4 }}
                />,
              ])}
            {comparisonSeries
              .filter(({ key }) => !hiddenSeries.has(key))
              .map(({ key, label, colour }) => (
                <Line
                  key={key}
                  connectNulls={false}
                  dataKey={key}
                  name={label}
                  stroke={colour}
                  strokeWidth={2.2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <ChartLegend
        series={legendSeries}
        hidden={hiddenSeries}
        ariaLabel={copy.toggleSeriesVisibility}
        onToggle={(key) =>
          setHiddenSeries((current) => toggleSeriesKey(current, key))
        }
      />
    </div>
  )
}
