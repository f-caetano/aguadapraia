import type {
  BeachDataset,
  BeachDayAir,
  BeachDayDetail,
  BeachDaySummary,
  BeachViewModel,
  DailyBeachForecast,
  DistrictWeatherForecast,
  HistoryPoint,
  HourlyBeachReading,
  Territory,
} from '../types'
import { z } from 'zod'
import { classifyDate, lisbonDate } from '../lib/date-classification'
import { canonicalBeachName } from '../lib/beach-name'
import { publicAssetUrl } from '../lib/public-asset'

function dataUrl(
  subpath: string,
  apiBase: string | undefined = import.meta.env.VITE_DATA_API_BASE as string | undefined,
  baseUrl: string = import.meta.env.BASE_URL,
): string {
  if (apiBase) {
    const base = apiBase.endsWith('/') ? apiBase.slice(0, -1) : apiBase
    return `${base}/${subpath.replace(/\.json$/, '')}`
  }
  return publicAssetUrl(`data/${subpath}`, baseUrl)
}

export { dataUrl }

interface RawBeach {
  id: string
  name: string
  latitude: number
  longitude: number
}

interface RawSummary {
  beachId: string
  forecastDate: string
  waterMinCelsius: number | null
  waterMinHour: number | null
  waterMaxCelsius: number | null
  waterMaxHour: number | null
  daytimeWindMinKnots: number | null
  daytimeWindMinHour: number | null
  daytimeWindMaxKnots: number | null
  daytimeWindMaxHour: number | null
  daytimeWindAverageKnots: number | null
  windAt13Knots: number | null
}

interface RawAirTemperature {
  locationId: number
  beachId: string
  forecastDate: string
  locationName: string
  weatherMatchType?:
    | 'exact-beach'
    | 'exact-location'
    | 'nearby-beach'
    | 'municipality'
    | 'fallback'
  physicalDistanceKm?: number
  distanceKm: number
  minimumCelsius: number
  maximumCelsius: number
  minimumHourUtc?: number | null
  maximumHourUtc?: number | null
  locationLatitude: number
  locationLongitude: number
  weatherTypeId: number
}

interface RawDistrictWeather {
  locationId: number
  locationName: string
  latitude: number
  longitude: number
  forecastDate: string
  minimumCelsius: number
  maximumCelsius: number
  weatherTypeId: number
}

interface RawPayload {
  schemaVersion?: number
  generatedAt: string
  forecastUpdatedAt?: string
  displayForecastDates?: string[]
  catalogSize: number
  availableBeachCount: number
  unavailableLocations: {
    beach: { id: string; name: string }
  }[]
  beaches: RawBeach[]
  summaries: RawSummary[]
  airTemperatures: RawAirTemperature[]
  districtWeather?: RawDistrictWeather[]
}

interface BeachMetadata {
  id: string
  territory: Territory
  district: string
  municipality: string
  sourceLatitude: number
  sourceLongitude: number
  displayLatitude: number
  displayLongitude: number
}

export interface TimelinePoint {
  beachId: string
  date: string
  waterMin?: number
  waterMax?: number
  airMin?: number
  airMax?: number
  windMinKnots?: number
  windAverageKnots?: number
  windMaxKnots?: number
}

export interface TimelineIndexData {
  schemaVersion: number
  dates: string[]
  months: string[]
  generatedAt: string
}

export interface TimelineMonthData {
  schemaVersion: number
  month: string
  dates: string[]
  points: TimelinePoint[]
  generatedAt: string
}

interface TimelineMonthCacheEntry {
  promise: Promise<TimelineMonthData>
  expiresAt: number
}

interface DayDetailCacheEntry {
  promise: Promise<BeachDayDetail>
  expiresAt: number
}

const monthlyCache = new Map<string, TimelineMonthCacheEntry>()
const CURRENT_MONTH_CACHE_MS = 60_000

function lisbonMonth(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Lisbon',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date)
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ''
  return `${value('year')}-${value('month')}`
}

const rawBeachSchema: z.ZodType<RawBeach> = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  latitude: z.number(),
  longitude: z.number(),
})

const rawSummarySchema: z.ZodType<RawSummary> = z.object({
  beachId: z.string().min(1),
  forecastDate: z.string().date(),
  waterMinCelsius: z.number().nullable(),
  waterMinHour: z.number().int().min(0).max(23).nullable(),
  waterMaxCelsius: z.number().nullable(),
  waterMaxHour: z.number().int().min(0).max(23).nullable(),
  daytimeWindMinKnots: z.number().nullable(),
  daytimeWindMinHour: z.number().int().min(0).max(23).nullable(),
  daytimeWindMaxKnots: z.number().nullable(),
  daytimeWindMaxHour: z.number().int().min(0).max(23).nullable(),
  daytimeWindAverageKnots: z.number().nullable(),
  windAt13Knots: z.number().nullable(),
})

const rawAirTemperatureSchema: z.ZodType<RawAirTemperature> = z.object({
  locationId: z.number().int(),
  beachId: z.string().min(1),
  forecastDate: z.string().date(),
  locationName: z.string().min(1),
  weatherMatchType: z
    .enum([
      'exact-beach',
      'exact-location',
      'nearby-beach',
      'municipality',
      'fallback',
    ])
    .optional(),
  physicalDistanceKm: z.number().nonnegative().optional(),
  distanceKm: z.number().nonnegative(),
  minimumCelsius: z.number(),
  maximumCelsius: z.number(),
  minimumHourUtc: z.number().int().min(0).max(23).nullable().optional(),
  maximumHourUtc: z.number().int().min(0).max(23).nullable().optional(),
  locationLatitude: z.number(),
  locationLongitude: z.number(),
  weatherTypeId: z.number().int(),
})

const rawDistrictWeatherSchema: z.ZodType<RawDistrictWeather> = z.object({
  locationId: z.number().int(),
  locationName: z.string().min(1),
  latitude: z.number(),
  longitude: z.number(),
  forecastDate: z.string().date(),
  minimumCelsius: z.number(),
  maximumCelsius: z.number(),
  weatherTypeId: z.number().int(),
})

const rawPayloadSchema: z.ZodType<RawPayload> = z.object({
  schemaVersion: z.number().int().optional(),
  generatedAt: z.string().datetime({ offset: true }),
  forecastUpdatedAt: z.string().datetime({ offset: true }).optional(),
  displayForecastDates: z.array(z.string().date()).min(1).optional(),
  catalogSize: z.number().int().nonnegative(),
  availableBeachCount: z.number().int().nonnegative(),
  unavailableLocations: z.array(
    z.object({
      beach: z.object({
        id: z.string().min(1),
        name: z.string().min(1),
      }),
    }),
  ),
  beaches: z.array(rawBeachSchema),
  summaries: z.array(rawSummarySchema),
  airTemperatures: z.array(rawAirTemperatureSchema),
  districtWeather: z.array(rawDistrictWeatherSchema).optional(),
})

const beachMetadataSchema: z.ZodType<BeachMetadata> = z.object({
  id: z.string().min(1),
  territory: z.enum(['mainland', 'madeira', 'azores']),
  district: z.string().min(1),
  municipality: z.string().min(1),
  sourceLatitude: z.number(),
  sourceLongitude: z.number(),
  displayLatitude: z.number(),
  displayLongitude: z.number(),
})

const timelinePointSchema: z.ZodType<TimelinePoint> = z.object({
  beachId: z.string().min(1),
  date: z.string().date(),
  waterMin: z.number().optional(),
  waterMax: z.number().optional(),
  airMin: z.number().optional(),
  airMax: z.number().optional(),
  windMinKnots: z.number().optional(),
  windAverageKnots: z.number().optional(),
  windMaxKnots: z.number().optional(),
})

const timelineIndexSchema: z.ZodType<TimelineIndexData> = z.object({
  schemaVersion: z.number().int(),
  dates: z.array(z.string().date()),
  months: z.array(z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)),
  generatedAt: z.string().datetime({ offset: true }),
})

const timelineMonthSchema: z.ZodType<TimelineMonthData> = z.object({
  schemaVersion: z.number().int(),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  dates: z.array(z.string().date()),
  points: z.array(timelinePointSchema),
  generatedAt: z.string().datetime({ offset: true }),
})


const hourlyReadingSchema: z.ZodType<HourlyBeachReading> = z.object({
  hour: z.number().int().min(0).max(23),
  waterTemperatureCelsius: z.number().nullable(),
  windKnots: z.number().nullable(),
  windDirection: z.string().min(1).nullable(),
})

const beachDayAirSchema: z.ZodType<BeachDayAir> = z.object({
  minimumCelsius: z.number(),
  maximumCelsius: z.number(),
})

const beachDaySummarySchema: z.ZodType<BeachDaySummary> = z.object({
  waterMinCelsius: z.number().nullable(),
  waterMaxCelsius: z.number().nullable(),
  daytimeWindMinKnots: z.number().nullable(),
  daytimeWindAverageKnots: z.number().nullable(),
  daytimeWindMaxKnots: z.number().nullable(),
})

const beachDayDetailSchema: z.ZodType<BeachDayDetail> = z.object({
  schemaVersion: z.number().int(),
  beachId: z.string().min(1),
  date: z.string().date(),
  updatedAt: z.string().datetime({ offset: true }),
  air: beachDayAirSchema.nullable(),
  summary: beachDaySummarySchema.nullable(),
  hourly: z.array(hourlyReadingSchema),
})

const dayDetailCache = new Map<string, DayDetailCacheEntry>()
const CURRENT_DAY_DETAIL_CACHE_MS = 60_000

function lisbonCalendarDate(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Lisbon',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

function dateLabel(date: string) {
  return new Intl.DateTimeFormat('pt-PT', {
    day: '2-digit',
    month: 'short',
  }).format(new Date(`${date}T12:00:00Z`))
}

function requiredNumber(value: number | null, context: string) {
  if (value === null || !Number.isFinite(value)) {
    throw new Error(`Published beach data is missing ${context}`)
  }
  return value
}

function previousDate(date: string): string {
  const value = new Date(`${date}T12:00:00Z`)
  value.setUTCDate(value.getUTCDate() - 1)
  return value.toISOString().slice(0, 10)
}

function monthFromDate(date: string): string {
  return date.slice(0, 7)
}

function monthsForRange(startDate: string, endDate: string): string[] {
  if (startDate > endDate) return []
  const months: string[] = []
  const cursor = new Date(`${monthFromDate(startDate)}-01T12:00:00Z`)
  const endMonth = monthFromDate(endDate)
  while (true) {
    const month = cursor.toISOString().slice(0, 7)
    months.push(month)
    if (month >= endMonth) break
    cursor.setUTCMonth(cursor.getUTCMonth() + 1)
  }
  return months
}

function mergeHistoryPoints(
  basePoints: readonly HistoryPoint[],
  nextPoints: readonly HistoryPoint[],
  forecastDates: readonly string[],
): HistoryPoint[] {
  const merged = new Map<string, HistoryPoint>()
  for (const point of basePoints) merged.set(point.date, point)
  for (const point of nextPoints) {
    merged.set(point.date, {
      ...point,
      label: dateLabel(point.date),
      kind: classifyDate(point.date, forecastDates),
    })
  }
  return [...merged.values()].sort((first, second) => first.date.localeCompare(second.date))
}

function historyPointFromDaily(
  forecast: DailyBeachForecast,
  forecastDates: readonly string[],
): HistoryPoint {
  return {
    date: forecast.date,
    label: dateLabel(forecast.date),
    kind: classifyDate(forecast.date, forecastDates),
    waterMin: forecast.waterMin,
    waterMax: forecast.waterMax,
    airMin: forecast.airMin,
    airMax: forecast.airMax,
    windMinKnots: forecast.windMinKnots,
    windAverageKnots: forecast.windAverageKnots,
    windMaxKnots: forecast.windMaxKnots,
  }
}

function historyPointFromTimeline(
  point: TimelinePoint,
  forecastDates: readonly string[],
): HistoryPoint {
  return {
    date: point.date,
    label: dateLabel(point.date),
    kind: classifyDate(point.date, forecastDates),
    ...(point.waterMin === undefined ? {} : { waterMin: point.waterMin }),
    ...(point.waterMax === undefined ? {} : { waterMax: point.waterMax }),
    ...(point.airMin === undefined ? {} : { airMin: point.airMin }),
    ...(point.airMax === undefined ? {} : { airMax: point.airMax }),
    ...(point.windMinKnots === undefined ? {} : { windMinKnots: point.windMinKnots }),
    ...(point.windAverageKnots === undefined
      ? {}
      : { windAverageKnots: point.windAverageKnots }),
    ...(point.windMaxKnots === undefined ? {} : { windMaxKnots: point.windMaxKnots }),
  }
}

function createDailyForecast(
  beachId: string,
  date: string,
  summaries: Map<string, RawSummary>,
  airTemperatures: Map<string, RawAirTemperature>,
): DailyBeachForecast {
  const key = `${beachId}|${date}`
  const summary = summaries.get(key)
  const air = airTemperatures.get(key)
  if (!summary || !air) {
    throw new Error(`Published beach data is incomplete for ${key}`)
  }

  const windMin = requiredNumber(summary.daytimeWindMinKnots, `${key} wind minimum`)
  const windMax = requiredNumber(summary.daytimeWindMaxKnots, `${key} wind maximum`)

  return {
    date,
    waterMin: requiredNumber(summary.waterMinCelsius, `${key} water minimum`),
    waterMax: requiredNumber(summary.waterMaxCelsius, `${key} water maximum`),
    waterMinHour: summary.waterMinHour,
    waterMaxHour: summary.waterMaxHour,
    windMinKnots: windMin,
    windMaxKnots: windMax,
    windMinHour: summary.daytimeWindMinHour,
    windMaxHour: summary.daytimeWindMaxHour,
    windAverageKnots: requiredNumber(
      summary.daytimeWindAverageKnots,
      `${key} wind average`,
    ),
    windAt13Knots: summary.windAt13Knots ?? (windMin + windMax) / 2,
    airMin: air.minimumCelsius,
    airMax: air.maximumCelsius,
    airMinHour: air.minimumHourUtc ?? null,
    airMaxHour: air.maximumHourUtc ?? null,
    airLocation: air.locationName,
    airDistanceKm: air.distanceKm,
  }
}

function districtWeatherFromPayload(payload: RawPayload): DistrictWeatherForecast[] {
  return (payload.districtWeather ?? []).map(
    (weather): DistrictWeatherForecast => ({
      locationId: weather.locationId,
      locationName: weather.locationName,
      latitude: weather.latitude,
      longitude: weather.longitude,
      date: weather.forecastDate,
      minimumCelsius: weather.minimumCelsius,
      maximumCelsius: weather.maximumCelsius,
      weatherTypeId: weather.weatherTypeId,
    }),
  )
}

function buildBeaches(
  payload: RawPayload,
  metadata: BeachMetadata[],
): BeachViewModel[] {
  const metadataById = new Map(metadata.map((item) => [item.id, item]))
  const summaries = new Map(
    payload.summaries.map((summary) => [
      `${summary.beachId}|${summary.forecastDate}`,
      summary,
    ]),
  )
  const airTemperatures = new Map(
    payload.airTemperatures.map((air) => [
      `${air.beachId}|${air.forecastDate}`,
      air,
    ]),
  )
  const forecastDates =
    payload.displayForecastDates ??
    [...new Set(payload.airTemperatures.map((air) => air.forecastDate))]
      .sort()
      .slice(0, 3)

  return payload.beaches.map((beach) => {
    const location = metadataById.get(beach.id)
    if (!location) throw new Error(`Missing administrative metadata for ${beach.id}`)

    const daily = forecastDates.map((date) =>
      createDailyForecast(beach.id, date, summaries, airTemperatures),
    )
    const history = daily.map((forecast) => historyPointFromDaily(forecast, forecastDates))

    return {
      ...beach,
      name: canonicalBeachName(beach.name, location.municipality),
      sourceLatitude: location.sourceLatitude,
      sourceLongitude: location.sourceLongitude,
      latitude: location.displayLatitude,
      longitude: location.displayLongitude,
      territory: location.territory,
      district: location.district,
      municipality: location.municipality,
      daily,
      history,
    }
  })
}

function forecastDatesFromPayload(payload: RawPayload): string[] {
  const forecastDates =
    payload.displayForecastDates ??
    [...new Set(payload.airTemperatures.map((air) => air.forecastDate))]
      .sort()
      .slice(0, 3)
  if (forecastDates.length === 0) {
    throw new Error('Published data has no forecast dates')
  }
  return forecastDates
}

export async function loadTimelineIndex(): Promise<TimelineIndexData> {
  const response = await fetch(dataUrl('timeline/index.json'), {
    cache: 'default',
  })
  if (!response.ok) {
    throw new Error('Published timeline index is unavailable')
  }
  return timelineIndexSchema.parse(await response.json())
}

export async function loadTimelineMonth(month: string): Promise<TimelineMonthData> {
  const cached = monthlyCache.get(month)
  if (cached && cached.expiresAt > Date.now()) return cached.promise
  if (cached) monthlyCache.delete(month)

  const request = (async () => {
    const response = await fetch(dataUrl(`timeline/${month}.json`), {
      cache: 'default',
    })
    if (!response.ok) {
      throw new Error(`Published timeline is unavailable for ${month}`)
    }
    return timelineMonthSchema.parse(await response.json())
  })()

  const entry = {
    promise: request,
    expiresAt:
      month < lisbonMonth() ? Number.POSITIVE_INFINITY : Date.now() + CURRENT_MONTH_CACHE_MS,
  }
  monthlyCache.set(month, entry)
  request.catch(() => {
    if (monthlyCache.get(month) === entry) {
      monthlyCache.delete(month)
    }
  })
  return request
}


export function resetDayDetailCache(): void {
  dayDetailCache.clear()
}

export async function loadBeachDayDetail(
  beachId: string,
  date: string,
): Promise<BeachDayDetail> {
  const key = `${beachId}/${date}`
  const cached = dayDetailCache.get(key)
  if (cached && cached.expiresAt > Date.now()) return cached.promise
  if (cached) dayDetailCache.delete(key)

  const subpath = `beach/${encodeURIComponent(beachId)}/day/${date}.json`
  const request = (async () => {
    const response = await fetch(dataUrl(subpath), { cache: 'default' })
    if (!response.ok) {
      throw new Error(`Beach day detail unavailable: ${beachId}/${date} (${response.status})`)
    }
    return beachDayDetailSchema.parse(await response.json())
  })()

  const entry = {
    promise: request,
    expiresAt:
      date < lisbonCalendarDate()
        ? Number.POSITIVE_INFINITY
        : Date.now() + CURRENT_DAY_DETAIL_CACHE_MS,
  }
  dayDetailCache.set(key, entry)
  request.catch(() => {
    if (dayDetailCache.get(key) === entry) {
      dayDetailCache.delete(key)
    }
  })
  return request
}

export function resetTimelineMonthCache(): void {
  monthlyCache.clear()
}

export function resolveDateIndex(
  allDates: readonly string[],
  today: string,
  rangeEnd: string,
): number {
  const todayIdx = allDates.indexOf(today)
  if (todayIdx >= 0) return todayIdx
  const endIdx = allDates.indexOf(rangeEnd)
  if (endIdx >= 0) return endIdx
  return Math.max(0, allDates.length - 1)
}

export async function loadBeachDataset(): Promise<BeachDataset> {
  const [latestResponse, metadataResponse] = await Promise.all([
    fetch(dataUrl('latest.json'), { cache: 'default' }),
    fetch(publicAssetUrl('data/beach-metadata.json'), { cache: 'force-cache' }),
  ])
  if (!latestResponse.ok || !metadataResponse.ok) {
    throw new Error('Published beach data is unavailable')
  }

  const payload = rawPayloadSchema.parse(await latestResponse.json())
  const metadata = z.array(beachMetadataSchema).parse(await metadataResponse.json())
  const forecastDates = forecastDatesFromPayload(payload)

  return {
    generatedAt: payload.generatedAt,
    forecastUpdatedAt: payload.forecastUpdatedAt ?? payload.generatedAt,
    catalogSize: payload.catalogSize,
    availableCount: payload.availableBeachCount,
    forecastDates,
    historyDates: [],
    beaches: buildBeaches(payload, metadata),
    districtWeather: districtWeatherFromPayload(payload),
    unavailableLocations: payload.unavailableLocations.map(({ beach }) => beach),
  }
}

export async function loadBackgroundHistory(
  dataset: BeachDataset,
): Promise<BeachDataset> {
  const indexResponse = await fetch(dataUrl('timeline/index.json'), { cache: 'default' })
  if (!indexResponse.ok) {
    throw new Error('Published timeline index is unavailable')
  }
  const index = timelineIndexSchema.parse(await indexResponse.json())

  const archiveDates = index.dates.slice(-30)
  if (archiveDates.length === 0) {
    return { ...dataset, historyDates: index.dates }
  }

  const startDate = archiveDates[0]!
  const endDate = dataset.forecastDates[dataset.forecastDates.length - 1] ?? startDate
  const result = await loadTimelineRange(dataset, startDate, endDate)

  return { ...result, historyDates: index.dates }
}

export async function loadTimelineRange(
  dataset: BeachDataset,
  startDate: string,
  endDate: string,
  now = new Date(),
): Promise<BeachDataset> {
  if (startDate > endDate) {
    throw new Error('Invalid range')
  }

  const today = lisbonDate(now)
  const historyEnd = endDate < today ? endDate : previousDate(today)
  const months = startDate <= historyEnd
    ? monthsForRange(startDate, historyEnd)
    : []
  const shards = await Promise.all(months.map((month) => loadTimelineMonth(month)))
  const pointsByBeach = new Map<string, HistoryPoint[]>()

  for (const shard of shards) {
    for (const point of shard.points) {
      if (point.date < startDate || point.date > historyEnd) continue
      const points = pointsByBeach.get(point.beachId) ?? []
      points.push(historyPointFromTimeline(point, dataset.forecastDates))
      pointsByBeach.set(point.beachId, points)
    }
  }

  return {
    ...dataset,
    beaches: dataset.beaches.map((beach) => ({
      ...beach,
      history: mergeHistoryPoints(
        beach.history.filter(
          (point) =>
            point.kind !== 'history' ||
            (point.date >= startDate && point.date <= historyEnd),
        ),
        pointsByBeach.get(beach.id) ?? [],
        dataset.forecastDates,
      ),
    })),
  }
}

export function evolutionDefaultRange(
  historyDates: readonly string[],
  forecastDates: readonly string[],
): { startDate: string; endDate: string } {
  const startDate =
    historyDates.length >= 15
      ? (historyDates[historyDates.length - 15] ?? '')
      : (historyDates[0] ?? forecastDates[0] ?? '')
  const endDate =
    forecastDates[forecastDates.length - 1] ??
    forecastDates[0] ??
    historyDates[historyDates.length - 1] ??
    startDate
  return { startDate, endDate }
}
