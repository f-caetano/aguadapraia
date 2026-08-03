import type { BeachViewModel, DailyBeachForecast } from '../types'
import type { Language } from '../i18n'

export type SortKey =
  | 'name'
  | 'district'
  | 'municipality'
  | 'waterMin'
  | 'waterMax'
  | 'airMin'
  | 'airMax'
  | 'windAvg'

type SortDir = 'asc' | 'desc'

export interface TableSortState {
  key: SortKey
  dir: SortDir
}

export interface TableFilterState {
  query: string
  district: string
  municipality: string
}

export function defaultSortState(): TableSortState {
  return { key: 'name', dir: 'asc' }
}

const DEFAULT_DIR: Record<SortKey, SortDir> = {
  name: 'asc',
  district: 'asc',
  municipality: 'asc',
  waterMin: 'asc',
  waterMax: 'desc',
  airMin: 'asc',
  airMax: 'desc',
  windAvg: 'asc',
}

export function toggleSort(current: TableSortState, key: SortKey): TableSortState {
  if (current.key === key) {
    return { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
  }
  return { key, dir: DEFAULT_DIR[key] }
}

function getForecast(beach: BeachViewModel, date: string): DailyBeachForecast {
  return beach.daily.find((f) => f.date === date) ?? beach.daily[0]!
}

export function filterBeaches(
  beaches: BeachViewModel[],
  filter: TableFilterState & { language: Language },
): BeachViewModel[] {
  const { query, district, municipality, language } = filter
  const normalized = query.trim().toLocaleLowerCase(language)
  return beaches.filter((beach) => {
    if (district && beach.district !== district) return false
    if (municipality && beach.municipality !== municipality) return false
    if (normalized) {
      const hay = `${beach.name} ${beach.district} ${beach.municipality}`.toLocaleLowerCase(language)
      if (!hay.includes(normalized)) return false
    }
    return true
  })
}

export function sortBeaches(
  beaches: BeachViewModel[],
  sort: TableSortState,
  activeDate: string,
  language: Language,
): BeachViewModel[] {
  const m = sort.dir === 'asc' ? 1 : -1
  return [...beaches].sort((a, b) => {
    const fa = getForecast(a, activeDate)
    const fb = getForecast(b, activeDate)
    let r: number
    switch (sort.key) {
      case 'waterMin': r = fa.waterMin - fb.waterMin; break
      case 'waterMax': r = fa.waterMax - fb.waterMax; break
      case 'airMin': r = fa.airMin - fb.airMin; break
      case 'airMax': r = fa.airMax - fb.airMax; break
      case 'windAvg': r = fa.windAverageKnots - fb.windAverageKnots; break
      case 'district':
        r = a.district.localeCompare(b.district, language)
        if (r === 0) r = a.name.localeCompare(b.name, language)
        break
      case 'municipality':
        r = a.municipality.localeCompare(b.municipality, language)
        if (r === 0) r = a.name.localeCompare(b.name, language)
        break
      default: // 'name'
        r = a.name.localeCompare(b.name, language)
    }
    return r * m
  })
}
