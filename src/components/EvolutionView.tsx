import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ArrowUp, Droplets, Pause, Play, Plus, ThermometerSun, Wind, X } from 'lucide-react'
import {
  evolutionDefaultRange,
  historyPointFromTimeline,
  loadBeachDayDetail,
  loadEvolutionBeachHistories,
  loadEvolutionDate,
  loadEvolutionSummary,
  loadTimelineIndex,
  resolveDateIndex,
  type TimelinePoint,
} from '../data/api'
import { getCopy, type Language } from '../i18n'
import { beachColor } from '../lib/beach-palette'
import { shortBeachName, uniqueShortBeachName } from '../lib/beach-name'
import { bridgeForecastSeries } from '../lib/chart-series'
import {
  classifyDate,
  preferredForecastDate,
} from '../lib/date-classification'
import { daytimeReadings } from '../lib/daytime-hours'
import { canPlaySequence, nextPlayIndex, playIntervalMs } from '../lib/play-sequence'
import { getRelativeLabel } from '../lib/relative-date'
import { computeTerritoryAggregate } from '../lib/territory-aggregate'
import { convertWind, type WindUnit } from '../lib/units'
import { windDirectionDegrees } from '../lib/wind-direction'
import type {
  BeachDataset,
  BeachDayDetail,
  BeachViewModel,
  HistoryPoint,
  MapMetric,
  SettingsMapMetric,
  TerritoryAggregate,
  TerritoryFilter,
  Theme,
} from '../types'
import ChartTooltip from './ChartTooltip'
import LoadingIndicator from './LoadingIndicator'
import MapLegend from './MapLegend'
import TerritorySelect from './TerritorySelect'

const PortugalMap = lazy(() => import('./PortugalMap'))
const MetricHistoryChart = lazy(() => import('./MetricHistoryChart'))

interface RangeResult {
  start: string
  end: string
  dates: string[]
  aggregates: Array<Omit<TerritoryAggregate, 'kind'>>
}

function beachForDate(
  beach: BeachViewModel,
  date: string,
  metric: MapMetric,
): BeachViewModel | null {
  const point = beach.history.find((item) => item.date === date)
  if (!point) return null
  const hasData =
    metric === 'water'
      ? point.waterMax !== undefined
      : metric === 'air'
        ? point.airMax !== undefined
        : point.windAverageKnots !== undefined
  if (!hasData) return null

  const daily = beach.daily.find((item) => item.date === date)
  if (daily) {
    return { ...beach, daily: [daily] }
  }

  const waterMin = point.waterMin ?? point.waterMax ?? Number.NaN
  const airMin = point.airMin ?? point.airMax ?? Number.NaN
  return {
    ...beach,
    daily: [{
      date: point.date,
      waterMin,
      waterMax: point.waterMax ?? waterMin,
      waterMinHour: null,
      waterMaxHour: null,
      windMinKnots: point.windMinKnots ?? Number.NaN,
      windMaxKnots: point.windMaxKnots ?? Number.NaN,
      windMinHour: null,
      windMaxHour: null,
      windAverageKnots: point.windAverageKnots ?? Number.NaN,
      windAt13Knots: point.windAverageKnots ?? Number.NaN,
      airMin,
      airMax: point.airMax ?? airMin,
      airMinHour: null,
      airMaxHour: null,
      airLocation: '',
      airDistanceKm: 0,
    }],
  }
}

function formatDate(
  date: string,
  language: Language,
  options: Intl.DateTimeFormatOptions = {},
) {
  return new Intl.DateTimeFormat(language === 'pt' ? 'pt-PT' : 'en-GB', {
    day: '2-digit',
    month: 'short',
    ...options,
  }).format(new Date(`${date}T12:00:00Z`))
}

function aggregateMetric(
  aggregate: TerritoryAggregate | null,
  metric: MapMetric,
) {
  if (!aggregate) return null
  if (metric === 'water') return aggregate.water
  if (metric === 'air') return aggregate.air
  return aggregate.wind
}

function formatMetricValue(metric: MapMetric, value: number, windUnit: WindUnit) {
  if (metric === 'wind') {
    const unit = windUnit === 'kmh' ? 'km/h' : 'kn'
    return `${convertWind(value, windUnit).toFixed(1)} ${unit}`
  }
  return `${value.toFixed(1)}°C`
}

function formatDirectionValue(value: string | null | undefined): string {
  return value && value.trim() ? value : '--'
}

function formatTemperatureNumber(value: number | null | undefined): string {
  return value === null || value === undefined ? '--' : value.toFixed(1)
}

function formatWindNumber(
  value: number | null | undefined,
  windUnit: WindUnit,
): string {
  return value === null || value === undefined
    ? '--'
    : convertWind(value, windUnit).toFixed(1)
}

function formatWinningDelta(
  value: number | null | undefined,
  other: number | null | undefined,
  windUnit?: WindUnit,
): string {
  if (
    value === null ||
    value === undefined ||
    other === null ||
    other === undefined
  ) {
    return ''
  }
  const displayValue = windUnit ? convertWind(value, windUnit) : value
  const displayOther = windUnit ? convertWind(other, windUnit) : other
  const delta = Math.abs(displayValue - displayOther)
  if (delta < 0.05) return ''
  return `(+${delta.toFixed(1)})`
}

function WindReading({
  knots,
  direction,
  windUnit,
  colour,
}: {
  knots: number | null | undefined
  direction: string | null | undefined
  windUnit: WindUnit
  colour: string
}) {
  const label = formatDirectionValue(direction)
  const degrees = windDirectionDegrees(direction)
  return (
    <span
      className="daily-wind-reading"
      style={{ '--beach-series-colour': colour } as CSSProperties}
    >
      <span>{formatWindNumber(knots, windUnit)}</span>
      {label !== '--' && (
        <small title={label}>
          (
          {label}
          {degrees !== null && (
            <ArrowUp
              size={10}
              aria-hidden="true"
              style={{ transform: `rotate(${degrees}deg)` }}
            />
          )}
          )
        </small>
      )}
    </span>
  )
}

interface EvolutionViewProps {
  dataset: BeachDataset
  language: Language
  windUnit: WindUnit
  theme: Theme
  territory: TerritoryFilter
  onTerritoryChange: (territory: TerritoryFilter) => void
  initialMapMetric: SettingsMapMetric
  onMapMetricChange: (metric: SettingsMapMetric) => void
}

export default function EvolutionView({
  dataset,
  language,
  windUnit,
  theme,
  territory,
  onTerritoryChange,
  initialMapMetric,
  onMapMetricChange,
}: EvolutionViewProps) {
  const copy = getCopy(language)
  const playRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeRef = useRef(true)
  const dayDetailTokenRef = useRef(0)
  const compareDayTokenRef = useRef(0)
  const dateRequestRef = useRef<AbortController | null>(null)
  const historyRequestRef = useRef<AbortController | null>(null)
  const datePrefetchesRef = useRef(new Set<string>())
  const isPlayingRef = useRef(false)
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)
  const [isMobile, setIsMobile] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(max-width: 760px)').matches,
  )
  const [viewMode, setViewMode] = useState<'one-day' | 'range'>('range')
  const [dateIndex, setDateIndex] = useState(() =>
    Math.max(
      0,
      dataset.forecastDates.indexOf(
        preferredForecastDate(dataset.forecastDates),
      ),
    ),
  )
  const [isPlaying, setIsPlaying] = useState(false)
  const [mapMetric, setMapMetric] = useState<MapMetric>(initialMapMetric)
  const [selectedId, setSelectedId] = useState('')
  const [compareIds, setCompareIds] = useState<string[]>([])
  const [compareQuery, setCompareQuery] = useState('')
  const [compareSearchOpen, setCompareSearchOpen] = useState(false)
  const [activeCompareIndex, setActiveCompareIndex] = useState(0)
  const [pendingDay, setPendingDay] = useState('')
  const [pendingStart, setPendingStart] = useState('')
  const [pendingEnd, setPendingEnd] = useState('')
  const [rangeResult, setRangeResult] = useState<RangeResult | null>(null)
  const [rangeLoading, setRangeLoading] = useState(false)
  const [rangeError, setRangeError] = useState<string | null>(null)
  const [dayDetail, setDayDetail] = useState<BeachDayDetail | null>(null)
  const [dayDetailLoading, setDayDetailLoading] = useState(false)
  const [dayDetailError, setDayDetailError] = useState(false)
  const [compareDayDetails, setCompareDayDetails] = useState<
    ReadonlyMap<string, BeachDayDetail>
  >(new Map())
  const [compareDayLoading, setCompareDayLoading] = useState(false)
  const [datePointsByKey, setDatePointsByKey] = useState<
    ReadonlyMap<string, TimelinePoint[]>
  >(new Map())
  const [historyByBeachId, setHistoryByBeachId] = useState<
    ReadonlyMap<string, HistoryPoint[]>
  >(new Map())
  const [dateLoading, setDateLoading] = useState(false)
  const [rangeHistoryLoading, setRangeHistoryLoading] = useState(false)
  const initializedRef = useRef(false)
  const lastAppliedTerritoryRef = useRef(territory)
  const tokenRef = useRef(0)
  const [availableHistoryDates, setAvailableHistoryDates] = useState<string[]>([])
  const [availableHistoryLoaded, setAvailableHistoryLoaded] = useState(false)

  useEffect(() => {
    isPlayingRef.current = isPlaying
  }, [isPlaying])

  useEffect(() => {
    activeRef.current = true
    return () => {
      activeRef.current = false
      dateRequestRef.current?.abort()
      historyRequestRef.current?.abort()
    }
  }, [])

  useEffect(() => {
    let active = true
    setAvailableHistoryLoaded(false)
    loadTimelineIndex()
      .then((index) => {
        if (!active) return
        setAvailableHistoryDates(index.dates)
        setAvailableHistoryLoaded(true)
      })
      .catch(() => {
        if (!active) return
        setAvailableHistoryDates(dataset.historyDates)
        setAvailableHistoryLoaded(true)
      })
    return () => {
      active = false
    }
  }, [dataset.historyDates])

  const applyRange = useCallback(async (start: string, end: string) => {
    setIsPlaying(false)
    if (start > end) {
      setRangeError(copy.invalidRange)
      return
    }

    const token = ++tokenRef.current
    setRangeLoading(true)
    setRangeError(null)
    try {
      const loaded = await loadEvolutionSummary(start, end, territory)
      if (token !== tokenRef.current || !activeRef.current) return

      const sortedDates = [
        ...new Set([
          ...loaded.dates,
          ...dataset.forecastDates.filter(
            (date) => date >= start && date <= end,
          ),
        ]),
      ].sort()
      const today = preferredForecastDate(dataset.forecastDates)
      const newIndex = resolveDateIndex(sortedDates, today, end)

      setRangeResult({
        start,
        end,
        dates: sortedDates,
        aggregates: loaded.aggregates,
      })
      setHistoryByBeachId(new Map())
      setDateIndex(newIndex)
    } catch {
      if (token !== tokenRef.current || !activeRef.current) return
      setRangeError(copy.dataUnavailable)
    } finally {
      if (token === tokenRef.current && activeRef.current) {
        setRangeLoading(false)
      }
    }
  }, [copy.dataUnavailable, copy.invalidRange, dataset.forecastDates, territory])

  useEffect(() => {
    if (!availableHistoryLoaded || initializedRef.current) return
    initializedRef.current = true
    lastAppliedTerritoryRef.current = territory
    const defaults = evolutionDefaultRange(availableHistoryDates, dataset.forecastDates)
    setPendingDay(preferredForecastDate(dataset.forecastDates) || defaults.endDate)
    setPendingStart(defaults.startDate)
    setPendingEnd(defaults.endDate)
    if (defaults.startDate && defaults.endDate) {
      void applyRange(defaults.startDate, defaults.endDate)
    }
  }, [applyRange, availableHistoryDates, availableHistoryLoaded, dataset.forecastDates])

  useEffect(() => {
    if (
      !initializedRef.current ||
      lastAppliedTerritoryRef.current === territory
    ) {
      return
    }
    lastAppliedTerritoryRef.current = territory
    if (pendingStart && pendingEnd && pendingStart <= pendingEnd) {
      void applyRange(pendingStart, pendingEnd)
    }
  }, [applyRange, pendingEnd, pendingStart, territory])

  const rangeStart = rangeResult?.start ?? ''
  const rangeEnd = rangeResult?.end ?? ''
  const allDates = rangeResult?.dates ?? dataset.forecastDates

  const activeDate = allDates[dateIndex] ?? ''
  const activeKind = classifyDate(activeDate, dataset.forecastDates)
  const territoryBeaches = useMemo(
    () =>
      territory === 'all'
        ? dataset.beaches
        : dataset.beaches.filter((beach) => beach.territory === territory),
    [dataset.beaches, territory],
  )

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const media = window.matchMedia('(max-width: 760px)')
    const update = () => setIsMobile(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setPrefersReducedMotion(mediaQuery.matches)
    update()
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', update)
      return () => mediaQuery.removeEventListener('change', update)
    }
    mediaQuery.addListener(update)
    return () => mediaQuery.removeListener(update)
  }, [])

  useEffect(() => {
    setDateIndex((current) => Math.min(current, Math.max(0, allDates.length - 1)))
  }, [allDates.length])

  useEffect(() => {
    setMapMetric(initialMapMetric)
  }, [initialMapMetric])

  const activeDateCacheKey = `${territory}|${activeDate}`
  const prefetchFollowingDates = useCallback(() => {
    const nextDates = allDates
      .slice(dateIndex + 1, dateIndex + 3)
      .filter(
        (date) =>
          classifyDate(date, dataset.forecastDates) === 'history' &&
          !datePointsByKey.has(`${territory}|${date}`) &&
          !datePrefetchesRef.current.has(`${territory}|${date}`),
      )

    for (const date of nextDates) {
      const key = `${territory}|${date}`
      datePrefetchesRef.current.add(key)
      void loadEvolutionDate(date, territory)
        .then((prefetched) => {
          if (!activeRef.current) return
          setDatePointsByKey((current) => {
            const next = new Map(current)
            next.set(key, prefetched.points)
            return next
          })
        })
        .catch(() => {
          if (activeRef.current && isPlayingRef.current) {
            setIsPlaying(false)
            setRangeError(copy.dataUnavailable)
          }
        })
        .finally(() => {
          datePrefetchesRef.current.delete(key)
        })
    }
  }, [
    allDates,
    dateIndex,
    dataset.forecastDates,
    datePointsByKey,
    territory,
    copy.dataUnavailable,
  ])

  useEffect(() => {
    if (isPlaying) prefetchFollowingDates()
  }, [isPlaying, prefetchFollowingDates])

  useEffect(() => {
    if (!activeDate || activeKind !== 'history') {
      setDateLoading(false)
      return
    }
    if (datePointsByKey.has(activeDateCacheKey)) {
      setDateLoading(false)
      prefetchFollowingDates()
      return
    }

    dateRequestRef.current?.abort()
    const controller = new AbortController()
    dateRequestRef.current = controller
    setDateLoading(true)

    loadEvolutionDate(activeDate, territory, controller.signal)
      .then((result) => {
        if (controller.signal.aborted || !activeRef.current) return
        setDatePointsByKey((current) => {
          const next = new Map(current)
          next.set(activeDateCacheKey, result.points)
          return next
        })

        prefetchFollowingDates()
      })
      .catch((error: unknown) => {
        if (
          error instanceof DOMException &&
          error.name === 'AbortError'
        ) {
          return
        }
        if (activeRef.current) setRangeError(copy.dataUnavailable)
      })
      .finally(() => {
        if (!controller.signal.aborted && activeRef.current) {
          setDateLoading(false)
        }
      })

    return () => controller.abort()
  }, [
    activeDate,
    activeDateCacheKey,
    activeKind,
    copy.dataUnavailable,
    datePointsByKey,
    prefetchFollowingDates,
    territory,
  ])

  useEffect(() => {
    if (selectedId && !territoryBeaches.some((beach) => beach.id === selectedId)) {
      setSelectedId('')
      setCompareIds([])
      return
    }

    setCompareIds((current) =>
      current.filter((id) => territoryBeaches.some((beach) => beach.id === id)),
    )
  }, [selectedId, territoryBeaches])

  const historicalBeaches = useMemo((): BeachViewModel[] => {
    if (!activeDate) return []
    const historicalPoints = new Map(
      (datePointsByKey.get(activeDateCacheKey) ?? []).map((point) => [
        point.beachId,
        point,
      ]),
    )
    return territoryBeaches.flatMap((beach) => {
      const historicalPoint = historicalPoints.get(beach.id)
      const candidate =
        activeKind === 'history'
          ? historicalPoint
            ? beachForDate(
                {
                  ...beach,
                  history: [
                    historyPointFromTimeline(
                      historicalPoint,
                      dataset.forecastDates,
                    ),
                  ],
                },
                activeDate,
                mapMetric,
              )
            : null
          : beachForDate(beach, activeDate, mapMetric)
      return candidate ? [candidate] : []
    })
  }, [
    activeDate,
    activeDateCacheKey,
    activeKind,
    dataset.forecastDates,
    datePointsByKey,
    mapMetric,
    territoryBeaches,
  ])

  const territoryAggregates = useMemo(() => {
    const serverAggregates = new Map(
      (rangeResult?.aggregates ?? []).map((aggregate) => [
        aggregate.date,
        aggregate,
      ]),
    )
    return allDates.map((date) => {
      const kind = classifyDate(date, dataset.forecastDates)
      const serverAggregate = serverAggregates.get(date)
      return serverAggregate
        ? { ...serverAggregate, kind }
        : computeTerritoryAggregate(territoryBeaches, date, kind)
    })
  }, [
    allDates,
    dataset.forecastDates,
    rangeResult?.aggregates,
    territoryBeaches,
  ])

  const aggregateByDate = useMemo(
    () => new Map(territoryAggregates.map((aggregate) => [aggregate.date, aggregate])),
    [territoryAggregates],
  )

  const activeAggregate = aggregateByDate.get(activeDate) ?? null
  const activeMetricAggregate = aggregateMetric(activeAggregate, mapMetric)
  const selectedBeach = territoryBeaches.find((beach) => beach.id === selectedId) ?? null
  const shortNameById = useMemo(
    () =>
      new Map(
        territoryBeaches.map((beach) => [
          beach.id,
          uniqueShortBeachName(beach, territoryBeaches),
        ]),
      ),
    [territoryBeaches],
  )
  const compareBeaches = useMemo(
    () =>
      compareIds.flatMap((id) => {
        const beach = territoryBeaches.find((item) => item.id === id)
        return beach ? [beach] : []
      }),
    [compareIds, territoryBeaches],
  )
  const selectedHistory = selectedBeach
    ? historyByBeachId.get(selectedBeach.id) ?? []
    : []

  useEffect(() => {
    if (
      viewMode === 'one-day' ||
      !rangeStart ||
      !rangeEnd ||
      !selectedBeach
    ) {
      setRangeHistoryLoading(false)
      return
    }
    const requestedIds = [
      selectedBeach.id,
      ...compareBeaches.slice(0, 3).map((beach) => beach.id),
    ]
    const missingIds = requestedIds.filter(
      (id) => !historyByBeachId.has(id),
    )
    if (missingIds.length === 0) {
      setRangeHistoryLoading(false)
      return
    }

    historyRequestRef.current?.abort()
    const controller = new AbortController()
    historyRequestRef.current = controller
    setRangeHistoryLoading(true)

    loadEvolutionBeachHistories(
      missingIds,
      rangeStart,
      rangeEnd,
      controller.signal,
    )
      .then((result) => {
        if (controller.signal.aborted || !activeRef.current) return
        setHistoryByBeachId((current) => {
          const next = new Map(current)
          for (const history of result.histories) {
            next.set(
              history.beachId,
              history.points.map((point) =>
                historyPointFromTimeline(point, dataset.forecastDates),
              ),
            )
          }
          return next
        })
      })
      .catch((error: unknown) => {
        if (
          error instanceof DOMException &&
          error.name === 'AbortError'
        ) {
          return
        }
        if (activeRef.current) setRangeError(copy.dataUnavailable)
      })
      .finally(() => {
        if (!controller.signal.aborted && activeRef.current) {
          setRangeHistoryLoading(false)
        }
      })

    return () => controller.abort()
  }, [
    compareBeaches,
    copy.dataUnavailable,
    dataset.forecastDates,
    historyByBeachId,
    rangeEnd,
    rangeStart,
    selectedBeach,
    viewMode,
  ])

  const compareHistories = useMemo(
    () =>
      compareBeaches.map((beach) => ({
        beach,
        history: historyByBeachId.get(beach.id) ?? [],
        displayName: shortNameById.get(beach.id),
      })),
    [compareBeaches, historyByBeachId, shortNameById],
  )
  const singleDayMode = allDates.length === 1 || viewMode === 'one-day'
  const comparisonLimit = singleDayMode ? 1 : 3
  const canPlay = canPlaySequence(allDates.length)
  useEffect(() => {
    if (!selectedBeach || !singleDayMode || !activeDate) {
      setDayDetail(null)
      setDayDetailLoading(false)
      setDayDetailError(false)
      return
    }

    const token = ++dayDetailTokenRef.current
    setDayDetail(null)
    setDayDetailLoading(true)
    setDayDetailError(false)

    loadBeachDayDetail(selectedBeach.id, activeDate)
      .then((detail) => {
        if (token !== dayDetailTokenRef.current || !activeRef.current) return
        setDayDetail(detail)
      })
      .catch(() => {
        if (token !== dayDetailTokenRef.current || !activeRef.current) return
        setDayDetail(null)
        setDayDetailError(true)
      })
      .finally(() => {
        if (token === dayDetailTokenRef.current && activeRef.current) {
          setDayDetailLoading(false)
        }
      })
  }, [activeDate, selectedBeach, singleDayMode])

  useEffect(() => {
    if (singleDayMode && compareIds.length > 1) {
      setCompareIds((current) => current.slice(0, 1))
    }
  }, [compareIds.length, singleDayMode])

  const singleCompareId = singleDayMode ? compareIds[0] ?? '' : ''

  useEffect(() => {
    if (!singleCompareId || !activeDate) {
      setCompareDayDetails(new Map())
      setCompareDayLoading(false)
      return
    }

    const token = ++compareDayTokenRef.current
    setCompareDayDetails(new Map())
    setCompareDayLoading(true)

    loadBeachDayDetail(singleCompareId, activeDate)
      .then((detail) => {
        if (token !== compareDayTokenRef.current || !activeRef.current) return
        setCompareDayDetails(new Map([[singleCompareId, detail]]))
      })
      .catch(() => {
        if (token !== compareDayTokenRef.current || !activeRef.current) return
        setCompareDayDetails(new Map())
      })
      .finally(() => {
        if (token === compareDayTokenRef.current && activeRef.current) {
          setCompareDayLoading(false)
        }
      })
  }, [activeDate, singleCompareId])

  const chartData = useMemo(() => {
    const bridged = bridgeForecastSeries(
        territoryAggregates.map((aggregate) => {
          const metricData = aggregateMetric(aggregate, mapMetric)
          return {
            date: aggregate.date,
            label: formatDate(aggregate.date, language),
            kind: aggregate.kind,
            historyMin:
              metricData && aggregate.kind === 'history'
                ? mapMetric === 'wind'
                  ? convertWind(metricData.min, windUnit)
                  : metricData.min
                : undefined,
            historyAvg:
              metricData && aggregate.kind === 'history'
                ? mapMetric === 'wind'
                  ? convertWind(metricData.avg, windUnit)
                  : metricData.avg
                : undefined,
            historyMax:
              metricData && aggregate.kind === 'history'
                ? mapMetric === 'wind'
                  ? convertWind(metricData.max, windUnit)
                  : metricData.max
                : undefined,
            forecastMin:
              metricData && aggregate.kind !== 'history'
                ? mapMetric === 'wind'
                  ? convertWind(metricData.min, windUnit)
                  : metricData.min
                : undefined,
            forecastAvg:
              metricData && aggregate.kind !== 'history'
                ? mapMetric === 'wind'
                  ? convertWind(metricData.avg, windUnit)
                  : metricData.avg
                : undefined,
            forecastMax:
              metricData && aggregate.kind !== 'history'
                ? mapMetric === 'wind'
                  ? convertWind(metricData.max, windUnit)
                  : metricData.max
                : undefined,
            coverage: metricData?.coverage,
          }
        }),
        [
          { historyKey: 'historyMin', forecastKey: 'forecastMin' },
          { historyKey: 'historyAvg', forecastKey: 'forecastAvg' },
          { historyKey: 'historyMax', forecastKey: 'forecastMax' },
        ],
      )
    return bridged.map((point) => ({
      ...point,
      historyRange:
        typeof point.historyMin === 'number' &&
        typeof point.historyMax === 'number'
          ? [point.historyMin, point.historyMax]
          : undefined,
      forecastRange:
        typeof point.forecastMin === 'number' &&
        typeof point.forecastMax === 'number'
          ? [point.forecastMin, point.forecastMax]
          : undefined,
    }))
  }, [language, mapMetric, territoryAggregates, windUnit])

  const chartValues = chartData.flatMap((point) =>
    [
      point.historyMin,
      point.historyAvg,
      point.historyMax,
      point.forecastMin,
      point.forecastAvg,
      point.forecastMax,
    ].filter((value): value is number => value !== undefined),
  )
  const chartDomain: [number, number] = chartValues.length
    ? [
        Math.floor(Math.min(...chartValues) - (mapMetric === 'wind' ? 2 : 1)),
        Math.ceil(Math.max(...chartValues) + (mapMetric === 'wind' ? 2 : 1)),
      ]
    : [0, 1]
  const forecastLabels = chartData
    .filter((point) => point.kind !== 'history')
    .map((point) => point.label)

  const compareOptions = useMemo(
    () =>
      territoryBeaches
        .filter(
          (beach) =>
            beach.id !== selectedId &&
            !compareIds.includes(beach.id),
        )
        .sort((first, second) => first.name.localeCompare(second.name, language)),
    [compareIds, language, selectedId, territoryBeaches],
  )
  const compareMatches = useMemo(() => {
    const normalized = compareQuery.trim().toLocaleLowerCase(language)
    if (!normalized) return compareOptions.slice(0, 8)
    return compareOptions
      .filter((beach) =>
        `${beach.name} ${beach.municipality} ${beach.district}`
          .toLocaleLowerCase(language)
          .includes(normalized),
      )
      .slice(0, 8)
  }, [compareOptions, compareQuery, language])

  const comparisonRows = useMemo(
    () =>
      selectedBeach
        ? [selectedBeach, ...compareBeaches.slice(0, comparisonLimit)].map((beach) => {
            const cachedPoint = (
              datePointsByKey.get(activeDateCacheKey) ?? []
            ).find((entry) => entry.beachId === beach.id)
            const point =
              (historyByBeachId.get(beach.id) ?? []).find(
                (entry) => entry.date === activeDate,
              ) ??
              (cachedPoint
                ? historyPointFromTimeline(
                    cachedPoint,
                    dataset.forecastDates,
                  )
                : beach.history.find(
                    (entry) => entry.date === activeDate,
                  )) ??
              null
            const isSelected = beach.id === selectedId
            const detail = isSelected ? dayDetail : compareDayDetails.get(beach.id)
            return {
              beach,
              shortName:
                shortNameById.get(beach.id) ?? shortBeachName(beach.name),
              waterMax: detail?.summary?.waterMaxCelsius ?? point?.waterMax,
              airMax: detail?.air?.maximumCelsius ?? point?.airMax,
              windAverageKnots:
                detail?.summary?.daytimeWindAverageKnots ??
                point?.windAverageKnots,
            }
          })
        : [],
    [
      activeDate,
      compareBeaches,
      compareDayDetails,
      comparisonLimit,
      activeDateCacheKey,
      dataset.forecastDates,
      datePointsByKey,
      dayDetail,
      historyByBeachId,
      selectedBeach,
      selectedId,
      shortNameById,
    ],
  )
  const hourlyBeachDetails = useMemo(
    () =>
      selectedBeach
        ? [selectedBeach, ...compareBeaches.slice(0, comparisonLimit)].map(
            (beach) => ({
              beach,
              detail:
               beach.id === selectedId
                 ? dayDetail
                 : compareDayDetails.get(beach.id) ?? null,
              shortName:
                shortNameById.get(beach.id) ?? shortBeachName(beach.name),
            }),
          )
        : [],
    [
      compareBeaches,
      compareDayDetails,
      comparisonLimit,
      dayDetail,
      selectedBeach,
      selectedId,
      shortNameById,
    ],
  )
  const hourlyComparisonRows = useMemo(
    () =>
      Array.from({ length: 11 }, (_, index) => {
        const hour = index + 8
        return {
          hour,
          readings: hourlyBeachDetails.map(({ detail }) =>
            daytimeReadings(detail?.hourly ?? []).find(
              (reading) => reading.hour === hour,
            ),
          ),
        }
      }),
    [hourlyBeachDetails],
  )

  useEffect(() => {
    if (!isPlaying) {
      if (playRef.current) clearTimeout(playRef.current)
      return
    }

    playRef.current = setTimeout(() => {
      setDateIndex((current) => {
        const next = nextPlayIndex(current, allDates.length, prefersReducedMotion)
        if (next === null) {
          setIsPlaying(false)
          return current
        }
        const nextDate = allDates[next]
        const nextKey = `${territory}|${nextDate}`
        if (
          classifyDate(nextDate, dataset.forecastDates) === 'history' &&
          !datePointsByKey.has(nextKey)
        ) {
          if (!datePrefetchesRef.current.has(nextKey)) {
            setIsPlaying(false)
            setRangeError(copy.dataUnavailable)
          }
          return current
        }
        if (next >= allDates.length - 1) {
          setIsPlaying(false)
        }
        return next
      })
    }, playIntervalMs(prefersReducedMotion))

    return () => {
      if (playRef.current) clearTimeout(playRef.current)
    }
  }, [
    allDates,
    copy.dataUnavailable,
    dataset.forecastDates,
    dateIndex,
    datePointsByKey,
    isPlaying,
    prefersReducedMotion,
    territory,
  ])

  function handleSelect(id: string) {
    if (selectedId && id !== selectedId) {
      if (compareIds.includes(id)) {
        setCompareIds((current) => current.filter((value) => value !== id))
      } else if (compareIds.length < comparisonLimit) {
        setCompareIds((current) => [...current, id])
      }
      return
    }

    if (selectedId === id) {
      setSelectedId('')
      setCompareIds([])
      return
    }

    setSelectedId(id)
  }

  function addComparison(id: string) {
    if (
      !id ||
      compareIds.includes(id) ||
      id === selectedId ||
      compareIds.length >= comparisonLimit
    ) {
      return
    }
    setCompareIds((current) => [...current, id])
  }

  function removeComparison(id: string) {
    setCompareIds((current) => current.filter((value) => value !== id))
  }

  function addComparisonFromSearch() {
    const normalized = compareQuery.trim().toLocaleLowerCase(language)
    const match =
      compareOptions.find((beach) =>
        [
          beach.name,
          shortNameById.get(beach.id) ?? shortBeachName(beach.name),
        ].some(
          (name) => name.toLocaleLowerCase(language) === normalized,
        ),
      ) ?? compareMatches[0]
    if (!match) return
    addComparison(match.id)
    setCompareQuery('')
    setCompareSearchOpen(false)
    setActiveCompareIndex(0)
  }

  function selectCompareBeach(id: string) {
    addComparison(id)
    setCompareQuery('')
    setCompareSearchOpen(false)
    setActiveCompareIndex(0)
  }

  if (allDates.length === 0) {
    return (
      <main className="evolution-empty">
        <p>{copy.noHistoryAvailable}</p>
      </main>
    )
  }

  const invalidPendingRange = pendingStart > pendingEnd && pendingStart !== '' && pendingEnd !== ''
  const timelineError = invalidPendingRange ? copy.invalidRange : rangeError
  const windUnitLabel = windUnit === 'kmh' ? 'km/h' : 'kn'
  const metricColor = mapMetric === 'water'
    ? 'var(--metric-water)'
    : mapMetric === 'air'
      ? 'var(--metric-air)'
      : 'var(--metric-wind)'
  const metricMinColor = `color-mix(in srgb, ${metricColor} 45%, var(--cp-surface))`
  const metricAvgColor = metricColor
  const metricMaxColor = `color-mix(in srgb, ${metricColor} 72%, var(--cp-text))`
  const territoryRange = activeMetricAggregate
    ? activeMetricAggregate.max - activeMetricAggregate.min
    : 0
  const territoryAvgPosition =
    activeMetricAggregate && territoryRange > 0
      ? ((activeMetricAggregate.avg - activeMetricAggregate.min) /
          territoryRange) *
        100
      : 50
  const territoryDistStyle = {
    '--metric-color': metricColor,
    '--metric-min-color': metricMinColor,
    '--metric-avg-color': metricAvgColor,
    '--metric-max-color': metricMaxColor,
    '--avg-position': `${Math.max(0, Math.min(100, territoryAvgPosition))}%`,
  } as CSSProperties
  const metricEvolutionTitle =
    mapMetric === 'water'
      ? copy.waterEvolution
      : mapMetric === 'air'
        ? copy.airEvolution
        : copy.windEvolution
  const metricUnit = mapMetric === 'wind' ? windUnitLabel : '°C'
  const comparisonGridStyle = {
    gridTemplateColumns: `minmax(90px, 1.2fr) repeat(${Math.max(1, comparisonRows.length)}, minmax(70px, 1fr))`,
  } as CSSProperties
  const hourlyGroupGridStyle = {
    gridTemplateColumns: `48px repeat(${Math.max(1, hourlyBeachDetails.length)}, minmax(0, 2fr))`,
  } as CSSProperties
  const hourlyMetricGridStyle = {
    gridTemplateColumns: `48px ${Array.from(
      { length: Math.max(1, hourlyBeachDetails.length) },
      () => 'minmax(44px, 0.85fr) minmax(72px, 1.15fr)',
    ).join(' ')}`,
  } as CSSProperties
  const comparisonMetrics = [
    {
      key: 'water' as const,
      label: copy.waterMax,
      values: comparisonRows.map((row) => row.waterMax),
      format: formatTemperatureNumber,
    },
    {
      key: 'air' as const,
      label: copy.airMax,
      values: comparisonRows.map((row) => row.airMax),
      format: formatTemperatureNumber,
    },
    {
      key: 'wind' as const,
      label: copy.windAvgShort,
      values: comparisonRows.map((row) => row.windAverageKnots),
      format: (value: number | null | undefined) =>
        formatWindNumber(value, windUnit),
    },
  ]
  const comparisonMetricsWithWinner = comparisonMetrics.map((metric) => {
    if (metric.values.length < 2) return { ...metric, winnerIndex: -1 }
    const first = metric.values[0]
    const second = metric.values[1]
    if (
      first === null ||
      first === undefined ||
      second === null ||
      second === undefined ||
      Math.abs(first - second) < 0.05
    ) {
      return { ...metric, winnerIndex: -1 }
    }
    return {
      ...metric,
      winnerIndex:
        metric.key === 'wind'
          ? first < second
            ? 0
            : 1
          : first > second
            ? 0
            : 1,
    }
  })
  const playTitle = canPlay
    ? isPlaying
      ? copy.pause
      : copy.play
    : copy.playbackRequiresMultipleDays
  const relativeLabel = activeDate
    ? getRelativeLabel(activeDate, dataset.forecastDates, language)
    : null
  const comparisonControls = (
    <div className="evolution-compare-controls">
      <div className="compare-heading">
        <strong>{copy.compareTitle}</strong>
        <span>{compareIds.length} / {comparisonLimit}</span>
      </div>
      <div
        className="evolution-compare-form"
        onBlur={(event) => {
          if (
            !event.relatedTarget ||
            !event.currentTarget.contains(event.relatedTarget)
          ) {
            setCompareSearchOpen(false)
          }
        }}
      >
        <div className="compare-chip-list">
          {compareBeaches.map((beach, index) => (
            <span key={beach.id} className="compare-chip">
              <span
                className="beach-swatch"
                style={{ background: beachColor(index + 1) }}
                aria-hidden="true"
              />
              <span title={beach.name}>
                {shortNameById.get(beach.id) ?? shortBeachName(beach.name)}
              </span>
              <button
                type="button"
                aria-label={`${copy.removeComparison}: ${beach.name}`}
                onClick={() => removeComparison(beach.id)}
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
        <input
          type="search"
          value={compareQuery}
          placeholder={copy.searchBeach}
          aria-label={copy.searchBeach}
          role="combobox"
          aria-expanded={compareSearchOpen}
          aria-controls="evolution-compare-results"
          aria-activedescendant={
            compareSearchOpen && compareMatches[activeCompareIndex]
              ? `compare-option-${compareMatches[activeCompareIndex].id}`
              : undefined
          }
          autoComplete="off"
          onFocus={() => setCompareSearchOpen(true)}
          onChange={(event) => {
            setCompareQuery(event.target.value)
            setCompareSearchOpen(true)
            setActiveCompareIndex(0)
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setCompareSearchOpen(true)
              setActiveCompareIndex((current) =>
                Math.min(current + 1, compareMatches.length - 1),
              )
            } else if (event.key === 'ArrowUp') {
              event.preventDefault()
              setActiveCompareIndex((current) => Math.max(0, current - 1))
            } else if (event.key === 'Enter') {
              event.preventDefault()
              const match = compareMatches[activeCompareIndex]
              if (match) selectCompareBeach(match.id)
            } else if (event.key === 'Escape') {
              setCompareSearchOpen(false)
            }
          }}
          disabled={
            compareIds.length >= comparisonLimit || compareOptions.length === 0
          }
        />
        <button
          type="button"
          className="compare-add-btn"
          aria-label={copy.addComparison}
          disabled={
            compareIds.length >= comparisonLimit || compareMatches.length === 0
          }
          onClick={addComparisonFromSearch}
        >
          <Plus size={15} />
        </button>
        {compareSearchOpen &&
          compareIds.length < comparisonLimit &&
          compareMatches.length > 0 && (
            <div
              id="evolution-compare-results"
              className="compare-search-results"
              role="listbox"
            >
              {compareMatches.map((beach, index) => (
                <button
                  key={beach.id}
                  id={`compare-option-${beach.id}`}
                  type="button"
                  role="option"
                  aria-selected={index === activeCompareIndex}
                  title={beach.name}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActiveCompareIndex(index)}
                  onClick={() => selectCompareBeach(beach.id)}
                >
                  <span
                    className="beach-swatch"
                    style={{ background: beachColor(compareIds.length + 1) }}
                    aria-hidden="true"
                  />
                  <span>
                    <strong>
                      {shortNameById.get(beach.id) ??
                        shortBeachName(beach.name)}
                    </strong>
                    <small>
                      {beach.district} › {beach.municipality}
                    </small>
                  </span>
                </button>
              ))}
            </div>
          )}
      </div>
    </div>
  )

  return (
    <main className={`evolution-view${selectedBeach ? ' has-selection' : ''}`}>
      <section className="evolution-map-section">
        <div className="evolution-map">
          <Suspense
            fallback={(
              <div className="map-loading">
                <LoadingIndicator variant="compact" label={copy.loadingHistory} />
              </div>
            )}
          >
            <PortugalMap
              beaches={historicalBeaches}
              districtWeather={[]}
              activeDate={activeDate}
              language={language}
              selectedId={selectedId}
              territory={territory}
              theme={theme}
              windUnit={windUnit}
              mapMetric={mapMetric}
              isMobile={isMobile}
              clusterRadius={36}
              clusterBaseZoom={6}
              clusterZoomRate={1.65}
              onSelect={handleSelect}
              onClearSelection={() => {
                setSelectedId('')
                setCompareIds([])
              }}
            />
          </Suspense>
          {(rangeLoading || dateLoading) && (
            <div className="map-loading evolution-range-loading">
              <LoadingIndicator
                variant="compact"
                label={rangeLoading ? copy.loadingRange : copy.loading}
              />
            </div>
          )}

          <div className="evolution-map-controls">
            <div
              className="evolution-metric-tabs seg-control"
              role="tablist"
              aria-label={copy.mapMetric}
            >
              {([
                ['water', copy.water, <Droplets key="water-icon" size={14} />],
                ['air', copy.air, <ThermometerSun key="air-icon" size={14} />],
                ['wind', copy.wind, <Wind key="wind-icon" size={14} />],
              ] as const).map(([metric, label, icon]) => (
                <button
                  key={metric}
                  role="tab"
                  type="button"
                  aria-selected={mapMetric === metric}
                  className={`metric-tab metric-tab--${metric}${mapMetric === metric ? ' active' : ''}`}
                  onClick={() => {
                    setMapMetric(metric)
                    if (metric !== 'wind') onMapMetricChange(metric)
                  }}
                >
                  {icon}
                  {label}
                </button>
              ))}
            </div>

            <TerritorySelect
              value={territory}
              language={language}
              onChange={onTerritoryChange}
              className="evolution-territory-select"
              elevated
            />
          </div>
          <MapLegend language={language} metric={mapMetric} windUnit={windUnit} />
        </div>

        <div
          className={`evolution-timeline-bar evolution-timeline-bar--${
            viewMode === 'range' ? 'range' : 'day'
          }`}
        >
          <div
            className="evolution-mode-selector seg-control"
            role="tablist"
            aria-label={copy.evolutionModeSelector}
          >
            {(['one-day', 'range'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                role="tab"
                aria-selected={viewMode === mode}
                className={viewMode === mode ? 'active' : ''}
                onClick={() => {
                  setIsPlaying(false)
                  setViewMode(mode)
                  if (mode === 'one-day' && activeDate) {
                    setPendingDay(activeDate)
                  } else if (
                    mode === 'range' &&
                    pendingStart &&
                    pendingEnd &&
                    pendingStart <= pendingEnd
                  ) {
                    void applyRange(pendingStart, pendingEnd)
                  }
                }}
              >
                {mode === 'one-day' ? copy.oneDayMode : copy.rangeMode}
              </button>
            ))}
          </div>
          {viewMode === 'one-day' ? (
            <>
              <label className="timeline-field">
                <span>{copy.rangeStart}</span>
                <input
                  type="date"
                  value={pendingDay || activeDate}
                  min={availableHistoryDates[0] ?? dataset.forecastDates[0]}
                  max={dataset.forecastDates[dataset.forecastDates.length - 1]}
                  onChange={(event) => {
                    const nextDate = event.target.value
                    setIsPlaying(false)
                    setPendingDay(nextDate)
                    const nextIndex = allDates.indexOf(nextDate)
                    if (nextIndex >= 0) {
                      setRangeError(null)
                      setDateIndex(nextIndex)
                    } else if (nextDate) {
                      void applyRange(nextDate, nextDate)
                    }
                  }}
                />
              </label>
              <div className="evolution-single-date-meta">
                {relativeLabel && (
                  <span
                    className={`date-kind-badge ${activeKind}`}
                    title={`${relativeLabel.relative} · ${relativeLabel.compactDate}`}
                    aria-label={relativeLabel.relative}
                  >
                    {relativeLabel.relative}
                  </span>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="evolution-range-fields" role="group" aria-label={copy.rangeMode}>
                <label className="timeline-field">
                  <span>{copy.rangeStart}</span>
                  <input
                    type="date"
                    value={pendingStart}
                    min={availableHistoryDates[0] ?? dataset.forecastDates[0]}
                    max={pendingEnd || dataset.forecastDates[dataset.forecastDates.length - 1]}
                    onChange={(event) => setPendingStart(event.target.value)}
                  />
                </label>
                <label className="timeline-field">
                  <span>{copy.rangeEnd}</span>
                  <input
                    type="date"
                    value={pendingEnd}
                    min={pendingStart || availableHistoryDates[0] || dataset.forecastDates[0]}
                    max={dataset.forecastDates[dataset.forecastDates.length - 1]}
                    onChange={(event) => setPendingEnd(event.target.value)}
                  />
                </label>
              </div>
              <button
                type="button"
                className="timeline-apply-btn"
                disabled={rangeLoading || !pendingStart || !pendingEnd || invalidPendingRange}
                onClick={() => {
                  setIsPlaying(false)
                  void applyRange(pendingStart, pendingEnd)
                }}
              >
                {rangeLoading ? copy.loadingRange : copy.applyRange}
              </button>
              <span className="evolution-range-status">
                <strong>{allDates.length} {copy.daysLoaded}</strong>
                <small>{copy.historyLabel} + {copy.forecastLabel}</small>
              </span>
              <div className="evolution-playback">
                <button
                  type="button"
                  className="play-btn"
                  aria-label={isPlaying ? copy.pause : copy.play}
                  title={playTitle}
                  disabled={!canPlay}
                  onClick={() => {
                    if (!canPlay) return
                    if (!isPlaying && dateIndex >= allDates.length - 1) setDateIndex(0)
                    setIsPlaying((value) => !value)
                  }}
                >
                  {isPlaying ? <Pause size={18} /> : <Play size={18} />}
                </button>
                <div className="timeline-track">
                  <input
                    type="range"
                    className="date-slider"
                    min={0}
                    max={Math.max(0, allDates.length - 1)}
                    value={dateIndex}
                    disabled={!canPlay}
                    onChange={(event) => {
                      setIsPlaying(false)
                      setDateIndex(Number(event.target.value))
                    }}
                    aria-label={copy.historicalDate}
                    aria-valuetext={
                      activeDate
                        ? `${formatDate(activeDate, language, { year: 'numeric' })}, ${relativeLabel?.relative ?? ''}`
                        : ''
                    }
                  />
                  <div className="timeline-track-labels">
                    <span>
                      {allDates[0]
                        ? formatDate(allDates[0], language, { year: '2-digit' })
                        : ''}
                    </span>
                    <div className="evolution-active-date">
                      <strong>
                        {activeDate
                          ? formatDate(activeDate, language, { year: 'numeric' })
                          : ''}
                      </strong>
                      <span
                        className={`date-kind-badge ${activeKind}`}
                        title={
                          relativeLabel
                            ? `${relativeLabel.relative} · ${relativeLabel.compactDate}`
                            : undefined
                        }
                        aria-label={relativeLabel?.relative}
                      >
                        {relativeLabel?.relative}
                      </span>
                    </div>
                    <span>
                      {formatDate(
                        allDates[allDates.length - 1] ?? activeDate,
                        language,
                        { year: '2-digit' },
                      )}
                    </span>
                  </div>
                </div>
              </div>
            </>
          )}
          {timelineError && (
            <span
              className={invalidPendingRange ? 'range-error' : 'history-load-error'}
              role="alert"
            >
              {timelineError}
            </span>
          )}
        </div>

        <div className="evolution-aggregate">
          <div className="evolution-aggregate-header">
            <div>
              <strong>{copy.scopeAggregateTitle}</strong>
            </div>
            {activeMetricAggregate && !singleDayMode ? (
              <div className="evolution-aggregate-summary">
                <span>
                  <strong>{copy.minimum}</strong>
                  {formatMetricValue(mapMetric, activeMetricAggregate.min, windUnit)}
                </span>
                <span>
                  <strong>{copy.average}</strong>
                  {formatMetricValue(mapMetric, activeMetricAggregate.avg, windUnit)}
                </span>
                <span>
                  <strong>{copy.maximum}</strong>
                  {formatMetricValue(mapMetric, activeMetricAggregate.max, windUnit)}
                </span>
                {!singleDayMode && activeMetricAggregate.coverage < 1 && (
                  <span>
                    <strong>{copy.coverageLabel}</strong>
                    {`${Math.round(activeMetricAggregate.coverage * 100)}%`}
                  </span>
                )}
              </div>
            ) : (
              <p className="aggregate-empty">{copy.noAggregateData}</p>
            )}
          </div>

          {singleDayMode ? (
            <div className="territory-dist">
              {activeMetricAggregate ? (
                <>
                  <div className="territory-dist-track" style={territoryDistStyle}>
                    <span className="territory-dist-line" aria-hidden="true" />
                    <div className="territory-dist-point territory-dist-point--min">
                      <span className="dist-marker dist-marker--min" />
                      <strong>
                        {formatMetricValue(
                          mapMetric,
                          activeMetricAggregate.min,
                          windUnit,
                        )}
                      </strong>
                      <small>{copy.minimum}</small>
                    </div>
                    <div className="territory-dist-point territory-dist-point--avg">
                      <span className="dist-marker dist-marker--avg" />
                      <strong>
                        {formatMetricValue(
                          mapMetric,
                          activeMetricAggregate.avg,
                          windUnit,
                        )}
                      </strong>
                      <small>{copy.average}</small>
                    </div>
                    <div className="territory-dist-point territory-dist-point--max">
                      <span className="dist-marker dist-marker--max" />
                      <strong>
                        {formatMetricValue(
                          mapMetric,
                          activeMetricAggregate.max,
                          windUnit,
                        )}
                      </strong>
                      <small>{copy.maximum}</small>
                    </div>
                  </div>
                  {activeMetricAggregate.coverage < 1 && (
                    <p className="territory-coverage-note">
                      {copy.dataCoverage
                        .replace(
                          '{count}',
                          Math.round(activeMetricAggregate.coverage * territoryBeaches.length).toString(),
                        )
                        .replace('{total}', territoryBeaches.length.toString())}
                    </p>
                  )}
                </>
              ) : (
                <p className="aggregate-empty">{copy.noAggregateData}</p>
              )}
            </div>
          ) : (
            <>
              <div className="evolution-aggregate-chart">
                {chartValues.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                      <CartesianGrid stroke="var(--cp-border)" vertical={false} />
                      <XAxis
                        dataKey="label"
                        axisLine={false}
                        tickLine={false}
                        minTickGap={20}
                        tick={{ fill: 'var(--cp-text-muted)', fontSize: 10 }}
                      />
                      <YAxis
                        domain={chartDomain}
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: 'var(--cp-text-muted)', fontSize: 10 }}
                        width={44}
                        tickFormatter={(value) => `${value}${mapMetric === 'wind' ? '' : '°'}`}
                      />
                      <Tooltip
                        content={(props) => (
                          <ChartTooltip
                            {...props}
                            suffix={mapMetric === 'wind' ? ` ${windUnitLabel}` : ' °C'}
                            seriesLabels={{
                              Min: copy.minimum,
                              Avg: copy.average,
                              Max: copy.maximum,
                            }}
                            seriesSuffixes={{
                              Min: mapMetric === 'wind' ? ` ${windUnitLabel}` : ' °C',
                              Avg: mapMetric === 'wind' ? ` ${windUnitLabel}` : ' °C',
                              Max: mapMetric === 'wind' ? ` ${windUnitLabel}` : ' °C',
                            }}
                          />
                        )}
                      />
                      {forecastLabels.length > 0 && (
                        <ReferenceArea
                          x1={forecastLabels[0]}
                          x2={forecastLabels[forecastLabels.length - 1]}
                          fill={metricColor}
                          fillOpacity={0.035}
                          strokeOpacity={0}
                        />
                      )}
                      <Area
                        type="monotone"
                        dataKey="historyRange"
                        fill={metricAvgColor}
                        fillOpacity={0.14}
                        stroke={metricAvgColor}
                        strokeOpacity={0.22}
                        activeDot={false}
                        isAnimationActive={false}
                      />
                      <Line
                        type="monotone"
                        connectNulls={false}
                        dataKey="historyMin"
                        stroke={metricMinColor}
                        strokeWidth={1.2}
                        dot={false}
                        activeDot={{
                          r: 4,
                          fill: metricMinColor,
                          stroke: metricMinColor,
                        }}
                      />
                      <Line
                        type="monotone"
                        connectNulls={false}
                        dataKey="historyAvg"
                        stroke={metricAvgColor}
                        strokeWidth={2}
                        dot={false}
                        activeDot={{
                          r: 4.5,
                          fill: metricAvgColor,
                          stroke: metricAvgColor,
                        }}
                      />
                      <Line
                        type="monotone"
                        connectNulls={false}
                        dataKey="historyMax"
                        stroke={metricMaxColor}
                        strokeWidth={1.2}
                        dot={false}
                        activeDot={{
                          r: 5,
                          fill: metricMaxColor,
                          stroke: metricMaxColor,
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="forecastRange"
                        fill={metricAvgColor}
                        fillOpacity={0.09}
                        stroke={metricAvgColor}
                        strokeOpacity={0.18}
                        activeDot={false}
                        isAnimationActive={false}
                      />
                      <Line
                        type="monotone"
                        connectNulls={false}
                        dataKey="forecastMin"
                        stroke={metricMinColor}
                        strokeWidth={1.2}
                        strokeDasharray="6 4"
                        dot={false}
                        activeDot={{
                          r: 4,
                          fill: metricMinColor,
                          stroke: metricMinColor,
                        }}
                      />
                      <Line
                        type="monotone"
                        connectNulls={false}
                        dataKey="forecastAvg"
                        stroke={metricAvgColor}
                        strokeWidth={2}
                        strokeDasharray="6 4"
                        dot={false}
                        activeDot={{
                          r: 4.5,
                          fill: metricAvgColor,
                          stroke: metricAvgColor,
                        }}
                      />
                      <Line
                        type="monotone"
                        connectNulls={false}
                        dataKey="forecastMax"
                        stroke={metricMaxColor}
                        strokeWidth={1.2}
                        strokeDasharray="6 4"
                        dot={false}
                        activeDot={{
                          r: 5,
                          fill: metricMaxColor,
                          stroke: metricMaxColor,
                        }}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="aggregate-empty">{copy.noAggregateData}</p>
                )}
              </div>
              <div className="agg-chart-key">
                <span><i className="agg-key-band" style={{ background: metricColor }} />{copy.historyLabel}</span>
                <span><i className="agg-key-band agg-key-band--dashed" style={{ borderColor: metricColor }} />{copy.forecastLabel}</span>
              </div>
            </>
          )}
        </div>
      </section>

      {selectedBeach && (
        <aside
          className={`evolution-chart-panel ${
            singleDayMode ? 'evolution-chart-panel--day' : 'evolution-chart-panel--range'
          }`}
          aria-label={copy.evolutionTitle}
        >
          <div className="evolution-chart-header">
            <div>
              <span className="evolution-panel-path">
                {selectedBeach.district} › {selectedBeach.municipality}
              </span>
              <strong className="panel-beach-title">
                <span
                  className="beach-swatch"
                  style={{ background: beachColor(0) }}
                  aria-hidden="true"
                />
                {selectedBeach.name}
              </strong>
              {!singleDayMode && activeKind === 'history' && (
                <span className="evolution-archive-notice">
                  <strong>{copy.archiveNoticeTitle}</strong>
                  <span className="date-kind-badge history" title={copy.archivedForecast}>
                    {copy.archivedBadge}
                  </span>
                </span>
              )}
            </div>
            <button
              type="button"
              aria-label={copy.close}
              onClick={() => {
                setSelectedId('')
                setCompareIds([])
              }}
            >
              <X size={16} />
            </button>
          </div>

          {!singleDayMode && comparisonControls}

          <div className="evolution-chart-canvas">
            {singleDayMode ? (
              <div className="daily-detail">
                {comparisonControls}
                <section className="daily-comparison-section">
                  <div className="daily-section-header">
                    <strong>{copy.comparisonTable}</strong>
                  </div>
                  {compareDayLoading && (
                    <LoadingIndicator variant="compact" label={copy.loading} />
                  )}
                  <div className="daily-comparison-table" role="table" aria-label={copy.comparisonTable}>
                    <div
                      className="daily-comparison-row daily-comparison-row--head"
                      role="row"
                      style={comparisonGridStyle}
                    >
                      <span role="columnheader">{copy.metric}</span>
                      {comparisonRows.map(({ beach, shortName }, index) => (
                        <span
                          key={beach.id}
                          role="columnheader"
                          className="beach-name-cell"
                          title={beach.name}
                        >
                          <i
                            className="beach-swatch"
                            style={{ background: beachColor(index) }}
                            aria-hidden="true"
                          />
                          {shortName}
                        </span>
                      ))}
                    </div>
                    {comparisonMetricsWithWinner.map((metric) => (
                      <div
                        key={metric.key}
                        className={`daily-comparison-row${mapMetric === metric.key ? ' metric-row-active' : ''}`}
                        role="row"
                        style={comparisonGridStyle}
                      >
                        <span role="rowheader">{metric.label}</span>
                        {metric.values.map((value, index) => (
                          <span key={`${metric.key}-${comparisonRows[index]?.beach.id ?? index}`} role="cell">
                            <b>{metric.format(value)}</b>
                            {index === metric.winnerIndex && (
                              <small className="comparison-win-delta">
                                {formatWinningDelta(
                                  value,
                                  metric.values[index === 0 ? 1 : 0],
                                  metric.key === 'wind' ? windUnit : undefined,
                                )}
                              </small>
                            )}
                          </span>
                        ))}
                      </div>
                    ))}
                  </div>
                </section>

                <section className="daily-hourly-section daily-hourly-section--primary">
                  <div className="daily-section-header">
                    <strong>{copy.hourlyTitle}</strong>
                    <span>08:00–18:00 · °C · {windUnitLabel}</span>
                  </div>
                  {dayDetailLoading ? (
                    <LoadingIndicator variant="compact" label={copy.loading} />
                  ) : dayDetail && daytimeReadings(dayDetail.hourly).length > 0 ? (
                    <div
                      className={`daily-hourly-table${hourlyBeachDetails.length > 1 ? ' daily-hourly-table--compare' : ''}`}
                      role="table"
                      aria-label={copy.hourlyTitle}
                    >
                      <div
                        className="daily-hourly-group-head"
                        role="row"
                        style={hourlyGroupGridStyle}
                      >
                        <span role="columnheader">{copy.time}</span>
                        {hourlyBeachDetails.map(({ beach, shortName }, index) => (
                          <span
                            key={beach.id}
                            role="columnheader"
                            className="beach-name-cell hourly-beach-group"
                            title={beach.name}
                          >
                            <i
                              className="beach-swatch"
                              style={{ background: beachColor(index) }}
                              aria-hidden="true"
                            />
                            {shortName}
                          </span>
                        ))}
                      </div>
                      <div
                        className="daily-hourly-row daily-hourly-row--head"
                        role="row"
                        style={hourlyMetricGridStyle}
                      >
                        <span aria-hidden="true" />
                        {hourlyBeachDetails.flatMap(({ beach }, index) => [
                          <span
                            key={`${beach.id}-water`}
                            role="columnheader"
                            className={`${index > 0 ? 'hourly-beach-start ' : ''}${
                              mapMetric === 'water' ? 'metric-emphasis' : ''
                            }`}
                            title={`${beach.name} · ${copy.water}`}
                          >
                            {copy.water}
                          </span>,
                          <span
                            key={`${beach.id}-wind`}
                            role="columnheader"
                            className={mapMetric === 'wind' ? 'metric-emphasis' : undefined}
                            title={`${beach.name} · ${copy.wind}`}
                          >
                            {copy.wind}
                          </span>,
                        ])}
                      </div>
                      {hourlyComparisonRows.map(({ hour, readings }) => (
                        <div
                          key={hour}
                          className="daily-hourly-row"
                          role="row"
                          style={hourlyMetricGridStyle}
                        >
                          <span role="cell">
                            {`${hour.toString().padStart(2, '0')}:00`}
                          </span>
                          {readings.flatMap((reading, index) => {
                            const beach = hourlyBeachDetails[index]?.beach
                            const key = beach?.id ?? `missing-${index}`
                            return [
                              <span
                                key={`${key}-${hour}-water`}
                                role="cell"
                                className={`${index > 0 ? 'hourly-beach-start ' : ''}${
                                  mapMetric === 'water' ? 'metric-emphasis' : ''
                                }`}
                              >
                                {formatTemperatureNumber(
                                  reading?.waterTemperatureCelsius,
                                )}
                              </span>,
                              <span
                                key={`${key}-${hour}-wind`}
                                role="cell"
                                className={mapMetric === 'wind' ? 'metric-emphasis' : undefined}
                              >
                                <WindReading
                                  knots={reading?.windKnots}
                                  direction={reading?.windDirection}
                                  windUnit={windUnit}
                                  colour={beachColor(index)}
                                />
                              </span>,
                            ]
                          })}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="daily-empty">
                      {dayDetailError ? copy.detailUnavailable : copy.noHourlyData}
                    </p>
                  )}
                </section>
              </div>
            ) : (
              <Suspense
                fallback={(
                  <div className="chart-loading">
                    <LoadingIndicator variant="compact" label={copy.loadingHistory} />
                  </div>
                )}
              >
                <div className="side-chart-heading">
                  <strong>
                    {metricEvolutionTitle}{' '}
                    <small>({metricUnit})</small>
                  </strong>
                </div>
                {rangeHistoryLoading && (
                  <LoadingIndicator
                    variant="compact"
                    label={copy.loadingHistory}
                  />
                )}
                <MetricHistoryChart
                  history={selectedHistory}
                  forecasts={selectedBeach.daily}
                  language={language}
                  windUnit={windUnit}
                  compareHistories={compareHistories}
                  controlledMetric={mapMetric === 'wind' ? 'wind' : mapMetric}
                  hideTabs
                  primaryBeach={selectedBeach}
                  primaryDisplayName={
                    shortNameById.get(selectedBeach.id) ??
                    shortBeachName(selectedBeach.name)
                  }
                />
              </Suspense>
            )}
          </div>
        </aside>
      )}
    </main>
  )
}
