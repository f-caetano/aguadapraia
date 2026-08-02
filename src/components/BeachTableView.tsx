import { Fragment, useId, useMemo, useRef, useState } from 'react'
import { Droplets, Map, Search, ThermometerSun, Wind, X } from 'lucide-react'
import { getCopy, type Language } from '../i18n'
import { formatDistance, formatWind, type WindUnit } from '../lib/units'
import {
  defaultSortState,
  filterBeaches,
  sortBeaches,
  toggleSort,
  type SortKey,
  type TableSortState,
} from '../lib/beach-table'
import { Button } from './ui/button'
import type { BeachViewModel } from '../types'

interface BeachTableViewProps {
  beaches: BeachViewModel[]
  activeDate: string
  language: Language
  windUnit: WindUnit
  onSelect: (beach: BeachViewModel) => void
}

function getForecast(beach: BeachViewModel, date: string) {
  return beach.daily.find((f) => f.date === date) ?? beach.daily[0]!
}

function fmtHour(h: number | null, utc = false): string {
  if (h === null) return '—'
  return `${String(h).padStart(2, '0')}:00${utc ? ' UTC' : ''}`
}

const MOBILE_SORT_KEYS: Array<{ value: `${SortKey}:${'asc' | 'desc'}`; labelKey: keyof ReturnType<typeof getCopy> }> = [
  { value: 'name:asc', labelKey: 'nameAsc' },
  { value: 'name:desc', labelKey: 'nameDesc' },
  { value: 'district:asc', labelKey: 'districtAsc' },
  { value: 'municipality:asc', labelKey: 'municipalityAsc' },
  { value: 'waterMin:asc', labelKey: 'waterMinAsc' },
  { value: 'waterMax:desc', labelKey: 'waterMaxDesc' },
  { value: 'airMin:asc', labelKey: 'airMinAsc' },
  { value: 'airMax:desc', labelKey: 'airMaxDesc' },
  { value: 'windAvg:asc', labelKey: 'windAvgAsc' },
  { value: 'windAvg:desc', labelKey: 'windAvgDesc' },
]

function SortArrow({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  if (!active) return <span className="th-sort-icon th-sort-icon--idle" aria-hidden="true">⇅</span>
  return (
    <span className={`th-sort-icon th-sort-icon--${dir}`} aria-hidden="true">
      {dir === 'asc' ? '▲' : '▼'}
    </span>
  )
}

export default function BeachTableView({
  beaches,
  activeDate,
  language,
  windUnit,
  onSelect,
}: BeachTableViewProps) {
  const uid = useId()
  const [query, setQuery] = useState('')
  const [district, setDistrict] = useState('')
  const [municipality, setMunicipality] = useState('')
  const [sort, setSort] = useState<TableSortState>(defaultSortState())
  const [expandedId, setExpandedId] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const copy = getCopy(language)

  const districts = useMemo(
    () => [...new Set(beaches.map((b) => b.district))].sort(),
    [beaches],
  )
  const municipalities = useMemo(
    () =>
      [...new Set(beaches.filter((b) => !district || b.district === district).map((b) => b.municipality))].sort(),
    [beaches, district],
  )

  const filtered = useMemo(
    () => filterBeaches(beaches, { query, district, municipality, language }),
    [beaches, query, district, municipality, language],
  )

  const sorted = useMemo(
    () => sortBeaches(filtered, sort, activeDate, language),
    [filtered, sort, activeDate, language],
  )

  const hasFilters = Boolean(query || district || municipality)

  function handleSortClick(key: SortKey) {
    setSort((prev) => toggleSort(prev, key))
  }

  function clearAll() {
    setQuery('')
    setDistrict('')
    setMunicipality('')
    searchRef.current?.focus()
  }

  function ariaSort(key: SortKey): 'ascending' | 'descending' | 'none' {
    if (sort.key !== key) return 'none'
    return sort.dir === 'asc' ? 'ascending' : 'descending'
  }

  const mobileSortValue = `${sort.key}:${sort.dir}` as `${SortKey}:${'asc' | 'desc'}`

  return (
    <main className="btv-root" id="app-content">
      <div className="btv-toolbar" role="toolbar" aria-label={copy.beachList}>
        <div className="btv-count">
          <strong>{copy.beachList}</strong>
          <span>{sorted.length} {copy.results}</span>
        </div>

        <label className="btv-search-label">
          <Search size={15} aria-hidden="true" />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={copy.search}
            aria-label={copy.search}
          />
          {query && (
            <button type="button" aria-label={copy.clear} className="btv-search-clear" onClick={() => setQuery('')}>
              <X size={13} />
            </button>
          )}
        </label>

        <label className="btv-filter-label">
          <span className="btv-filter-name">{copy.district}</span>
          <select
            value={district}
            onChange={(e) => { setDistrict(e.target.value); setMunicipality('') }}
            aria-label={copy.district}
          >
            <option value="">{copy.all}</option>
            {districts.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>

        <label className="btv-filter-label">
          <span className="btv-filter-name">{copy.municipality}</span>
          <select
            value={municipality}
            onChange={(e) => setMunicipality(e.target.value)}
            aria-label={copy.municipality}
          >
            <option value="">{copy.all}</option>
            {municipalities.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>

        {hasFilters && (
          <button type="button" className="btv-clear-btn" onClick={clearAll}>
            <X size={13} />
            <span>{copy.clearFilters}</span>
          </button>
        )}

        <label className="btv-mobile-sort">
          <span className="btv-filter-name">{copy.orderBy}</span>
          <select
            value={mobileSortValue}
            onChange={(e) => {
              const [key, dir] = e.target.value.split(':') as [SortKey, 'asc' | 'desc']
              setSort({ key, dir })
            }}
          >
            {MOBILE_SORT_KEYS.map(({ value, labelKey }) => (
              <option key={value} value={value}>
                {String(copy[labelKey])}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="btv-scroll">
        <table className="btv-table">
          <thead>
            <tr>
              <th scope="col" aria-sort={ariaSort('name')}>
                <button type="button" className="th-sort-btn" onClick={() => handleSortClick('name')}>
                  {copy.beach}
                  <SortArrow active={sort.key === 'name'} dir={sort.dir} />
                </button>
              </th>
              <th scope="col" className="btv-col-district" aria-sort={ariaSort('district')}>
                <button type="button" className="th-sort-btn" onClick={() => handleSortClick('district')}>
                  {copy.district}
                  <SortArrow active={sort.key === 'district'} dir={sort.dir} />
                </button>
              </th>
              <th scope="col" className="btv-col-municipality" aria-sort={ariaSort('municipality')}>
                <button type="button" className="th-sort-btn" onClick={() => handleSortClick('municipality')}>
                  {copy.municipality}
                  <SortArrow active={sort.key === 'municipality'} dir={sort.dir} />
                </button>
              </th>
              <th scope="col" className="btv-col-num btv-col-hide-mobile" aria-sort={ariaSort('waterMin')}>
                <button type="button" className="th-sort-btn" onClick={() => handleSortClick('waterMin')}>
                  {copy.waterMin}
                  <SortArrow active={sort.key === 'waterMin'} dir={sort.dir} />
                </button>
              </th>
              <th scope="col" className="btv-col-num btv-col-water-max" aria-sort={ariaSort('waterMax')}>
                <button type="button" className="th-sort-btn" onClick={() => handleSortClick('waterMax')}>
                  {copy.waterMax}
                  <SortArrow active={sort.key === 'waterMax'} dir={sort.dir} />
                </button>
              </th>
              <th scope="col" className="btv-col-num btv-col-hide-mobile" aria-sort={ariaSort('airMin')}>
                <button type="button" className="th-sort-btn" onClick={() => handleSortClick('airMin')}>
                  {copy.airMin}
                  <SortArrow active={sort.key === 'airMin'} dir={sort.dir} />
                </button>
              </th>
              <th scope="col" className="btv-col-num btv-col-air-max" aria-sort={ariaSort('airMax')}>
                <button type="button" className="th-sort-btn" onClick={() => handleSortClick('airMax')}>
                  {copy.airMax}
                  <SortArrow active={sort.key === 'airMax'} dir={sort.dir} />
                </button>
              </th>
              <th scope="col" className="btv-col-num btv-col-wind-avg" aria-sort={ariaSort('windAvg')}>
                <button type="button" className="th-sort-btn" onClick={() => handleSortClick('windAvg')}>
                  {copy.windAverage}
                  <SortArrow active={sort.key === 'windAvg'} dir={sort.dir} />
                </button>
              </th>
              <th scope="col" className="btv-col-expand">
                <span className="sr-only">{copy.details}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((beach) => {
              const fc = getForecast(beach, activeDate)
              const expanded = expandedId === beach.id
              const detailId = `${uid}detail${beach.id}`
              const toggleBtnId = `${uid}toggle${beach.id}`

              return (
                <Fragment key={beach.id}>
                  <tr
                    className={expanded ? 'btv-row btv-row--expanded' : 'btv-row'}
                    onClick={() => setExpandedId((c) => (c === beach.id ? '' : beach.id))}
                  >
                    <td className="btv-cell-name">
                      <button
                        id={toggleBtnId}
                        type="button"
                        className="btv-name-btn"
                        aria-expanded={expanded}
                        aria-controls={detailId}
                        onClick={(e) => {
                          e.stopPropagation()
                          setExpandedId((c) => (c === beach.id ? '' : beach.id))
                        }}
                      >
                        <strong>{beach.name}</strong>
                        <small className="btv-location-hint">{beach.district} · {beach.municipality}</small>
                      </button>
                    </td>
                    <td className="btv-col-district">{beach.district}</td>
                    <td className="btv-col-municipality">{beach.municipality}</td>
                    <td className="btv-col-num btv-col-hide-mobile">
                      {fc.waterMin.toFixed(1)} °C
                    </td>
                    <td className="btv-col-num btv-col-water-max">
                      <span className="btv-mobile-label"><Droplets size={10} />MAX</span>
                      <strong>{fc.waterMax.toFixed(1)} °C</strong>
                    </td>
                    <td className="btv-col-num btv-col-hide-mobile">
                      {fc.airMin.toFixed(0)} °C
                    </td>
                    <td className="btv-col-num btv-col-air-max">
                      <span className="btv-mobile-label"><ThermometerSun size={10} />MAX</span>
                      <strong>{fc.airMax.toFixed(0)} °C</strong>
                    </td>
                    <td className="btv-col-num btv-col-wind-avg">
                      <span className="btv-mobile-label"><Wind size={10} />AVG</span>
                      {formatWind(fc.windAverageKnots, windUnit)}
                    </td>
                    <td className="btv-col-expand" aria-hidden="true">
                      <span className={expanded ? 'btv-chevron btv-chevron--open' : 'btv-chevron'}>›</span>
                    </td>
                  </tr>
                  {expanded && (
                    <tr
                      id={detailId}
                      role="row"
                      className="btv-detail-row"
                      aria-labelledby={toggleBtnId}
                    >
                      <td colSpan={9} className="btv-detail-cell">
                        <div className="btv-detail-card">
                          <div className="btv-detail-head">
                            <div>
                              <strong>{beach.name}</strong>
                              <span>{beach.district} › {beach.municipality}</span>
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation()
                                onSelect(beach)
                              }}
                            >
                              <Map size={13} />
                              {language === 'pt' ? 'Ver no mapa' : 'View on map'}
                            </Button>
                          </div>
                          <div className="btv-detail-metrics">
                            <article className="btv-metric-card">
                              <header className="btv-metric-header">
                                <Droplets size={13} />
                                {copy.waterTemperature}
                              </header>
                              <div className="btv-metric-row">
                                <span className="btv-metric-label">MIN</span>
                                <strong>{fc.waterMin.toFixed(1)} °C</strong>
                                <span className="btv-metric-hour">{fmtHour(fc.waterMinHour)}</span>
                              </div>
                              <div className="btv-metric-row">
                                <span className="btv-metric-label">MAX</span>
                                <strong>{fc.waterMax.toFixed(1)} °C</strong>
                                <span className="btv-metric-hour">{fmtHour(fc.waterMaxHour)}</span>
                              </div>
                            </article>
                            <article className="btv-metric-card">
                              <header className="btv-metric-header">
                                <ThermometerSun size={13} />
                                {copy.airTemperature}
                              </header>
                              <div className="btv-metric-row">
                                <span className="btv-metric-label">MIN</span>
                                <strong>{fc.airMin.toFixed(0)} °C</strong>
                                <span className="btv-metric-hour">{fmtHour(fc.airMinHour, true)}</span>
                              </div>
                              <div className="btv-metric-row">
                                <span className="btv-metric-label">MAX</span>
                                <strong>{fc.airMax.toFixed(0)} °C</strong>
                                <span className="btv-metric-hour">{fmtHour(fc.airMaxHour, true)}</span>
                              </div>
                              <p className="btv-source-line">
                                {copy.source} {fc.airLocation} · {formatDistance(fc.airDistanceKm)}
                              </p>
                            </article>
                            <article className="btv-metric-card">
                              <header className="btv-metric-header">
                                <Wind size={13} />
                                {copy.windAverage}
                              </header>
                              <div className="btv-metric-row">
                                <span className="btv-metric-label">MIN</span>
                                <strong>{formatWind(fc.windMinKnots, windUnit)}</strong>
                                <span className="btv-metric-hour">{fmtHour(fc.windMinHour)}</span>
                              </div>
                              <div className="btv-metric-row">
                                <span className="btv-metric-label">AVG</span>
                                <strong>{formatWind(fc.windAverageKnots, windUnit)}</strong>
                                <span className="btv-metric-hour">09–18h</span>
                              </div>
                              <div className="btv-metric-row">
                                <span className="btv-metric-label">MAX</span>
                                <strong>{formatWind(fc.windMaxKnots, windUnit)}</strong>
                                <span className="btv-metric-hour">{fmtHour(fc.windMaxHour)}</span>
                              </div>
                            </article>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </main>
  )
}
