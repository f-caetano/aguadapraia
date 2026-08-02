import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import {
  CalendarDays,
  ChevronRight,
  Droplets,
  ExternalLink,
  Feather,
  List,
  ListFilter,
  Map,
  Search,
  ThermometerSun,
  TrendingUp,
  Wind,
  X,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import BeachTableView from './components/BeachTableView'
import BrandMark from './components/BrandMark'
import SettingsPanel from './components/SettingsPanel'
import TerritorySelect from './components/TerritorySelect'
import MapLegend from './components/MapLegend'
import LoadingIndicator from './components/LoadingIndicator'
import { Button } from './components/ui/button'
import { loadBackgroundHistory, loadBeachDataset } from './data/api'
import { getCopy } from './i18n'
import { recentHistory } from './lib/chart-history'
import { lisbonDate, preferredForecastDate } from './lib/date-classification'
import { formatFreshnessTimestamp } from './lib/freshness'
import { getRelativeLabel } from './lib/relative-date'
import {
  loadSettings,
  saveSettings,
  type Settings as AppSettings,
} from './lib/settings'
import { formatDistance, formatWind } from './lib/units'
import {
  canonicalUrlForView,
  pathForView,
  viewFromPath,
  type AppViewMode,
} from './lib/view-route'
import type { BeachDataset, BeachViewModel, TerritoryFilter } from './types'

const PortugalMap = lazy(() => import('./components/PortugalMap'))
const MetricHistoryChart = lazy(() => import('./components/MetricHistoryChart'))
const EvolutionView = lazy(() => import('./components/EvolutionView'))

function formatHour(hour: number | null) {
  return hour === null ? '--' : `${hour.toString().padStart(2, '0')}:00`
}

function locationPath(beach: BeachViewModel) {
  return `${beach.district} › ${beach.municipality}`
}

function currentForecast(beach: BeachViewModel, date: string) {
  return beach.daily.find((forecast) => forecast.date === date) ?? beach.daily[0]
}

function GithubMark({ size = 12 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M15 22v-4a3.5 3.5 0 0 0-.78-2.2c3.26-.36 6.68-1.6 6.68-7.3A5.7 5.7 0 0 0 19.5 4.3 5.4 5.4 0 0 0 19.41.28S18.28-.08 15 2.2a13.4 13.4 0 0 0-6 0C5.72-.08 4.59.28 4.59.28A5.4 5.4 0 0 0 4.5 4.3 5.7 5.7 0 0 0 3 8.5c0 5.66 3.42 6.9 6.68 7.3A3.5 3.5 0 0 0 9 18v4" />
      <path d="M9 18c-4.5 2-5-2-7-2" />
    </svg>
  )
}

function App() {
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings())
  const { language, theme, windUnit, mapMetric, territory } = settings
  const [dataset, setDataset] = useState<BeachDataset | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState('10')
  const [activeDate, setActiveDate] = useState('')
  const [search, setSearch] = useState('')
  const [district, setDistrict] = useState('')
  const [municipality, setMunicipality] = useState('')
  const [locationsOpen, setLocationsOpen] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [selectionActive, setSelectionActive] = useState(false)
  const [viewMode, setViewMode] = useState<AppViewMode>(() =>
    viewFromPath(window.location.pathname),
  )
  const [sortMode, setSortMode] = useState<
    | 'name'
    | 'water-warm'
    | 'water-cold'
    | 'air-warm'
    | 'air-cold'
    | 'wind-calm'
    | 'wind-strong'
  >('name')
  const [mobileLayout, setMobileLayout] = useState(
    window.matchMedia('(max-width: 760px)').matches,
  )
  const mountedRef = useRef(true)
  const copy = getCopy(language)
  const visibleForecastDates = useMemo(() => {
    if (!dataset) return []
    const today = lisbonDate()
    return dataset.forecastDates
      .filter(
        (date) =>
          date >= today &&
          dataset.beaches.some((beach) => {
            const forecast = beach.daily.find((item) => item.date === date)
            return (
              forecast !== undefined &&
              [
                forecast.waterMax,
                forecast.airMax,
                forecast.windAverageKnots,
              ].some(Number.isFinite)
            )
          }),
      )
      .slice(0, 3)
  }, [dataset])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  function scheduleBackgroundHydration(initial: BeachDataset) {
    const run = () => {
      loadBackgroundHistory(initial)
        .then((hydrated) => {
          if (mountedRef.current) setDataset(hydrated)
        })
        .catch((error) => {
          console.warn('Background history hydration failed:', error)
        })
    }

    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      window.requestIdleCallback(run, { timeout: 3000 })
    } else {
      setTimeout(run, 100)
    }
  }

  function updateTerritory(nextTerritory: TerritoryFilter) {
    setSettings((current) => ({ ...current, territory: nextTerritory }))
  }

  function navigateToView(nextView: AppViewMode) {
    setViewMode(nextView)
    const nextPath = pathForView(nextView)
    if (window.location.pathname !== nextPath) {
      window.history.pushState(null, '', nextPath)
    }
  }

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  useEffect(() => {
    const viewLabel =
      viewMode === 'map'
        ? copy.mapView
        : viewMode === 'table'
          ? copy.tableView
          : copy.evolutionView
    const title = `${viewLabel} - ÁguaDaPraia`
    const canonicalUrl = canonicalUrlForView(viewMode)
    document.title = title
    document
      .querySelector<HTMLLinkElement>('link[rel="canonical"]')
      ?.setAttribute('href', canonicalUrl)
    document
      .querySelector<HTMLMetaElement>('meta[property="og:url"]')
      ?.setAttribute('content', canonicalUrl)
    document
      .querySelector<HTMLMetaElement>('meta[property="og:title"]')
      ?.setAttribute('content', title)
    document
      .querySelector<HTMLMetaElement>('meta[name="twitter:title"]')
      ?.setAttribute('content', title)
  }, [copy.evolutionView, copy.mapView, copy.tableView, viewMode])

  useEffect(() => {
    saveSettings(settings)
  }, [settings])

  useEffect(() => {
    const media = window.matchMedia('(max-width: 760px)')
    const update = () => setMobileLayout(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    const handlePopState = () => setViewMode(viewFromPath(window.location.pathname))
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    loadBeachDataset()
      .then((loaded) => {
        if (!mountedRef.current) return
        setDataset(loaded)
        setActiveDate(preferredForecastDate(loaded.forecastDates))
        if (!loaded.beaches.some((beach) => beach.id === '10')) {
          setSelectedId(loaded.beaches[0]?.id ?? '')
        }
        scheduleBackgroundHydration(loaded)
      })
      .catch((error) => {
        if (mountedRef.current) {
          setLoadError(error instanceof Error ? error.message : String(error))
        }
      })
  }, [])

  useEffect(() => {
    if (viewMode !== 'map') {
      setLocationsOpen(false)
      setDetailsOpen(false)
    }
  }, [viewMode])

  const territoryBeaches = useMemo(() => {
    if (!dataset) return []
    return territory === 'all'
      ? dataset.beaches
      : dataset.beaches.filter((beach) => beach.territory === territory)
  }, [dataset, territory])

  const districts = useMemo(
    () => [...new Set(territoryBeaches.map((beach) => beach.district))].sort(),
    [territoryBeaches],
  )
  const municipalities = useMemo(
    () =>
      [
        ...new Set(
          territoryBeaches
            .filter((beach) => !district || beach.district === district)
            .map((beach) => beach.municipality),
        ),
      ].sort(),
    [district, territoryBeaches],
  )
  const normalizedSearch = search.trim().toLocaleLowerCase(language)
  const searchMatches = useMemo(() => {
    if (!normalizedSearch) return []
    return territoryBeaches
      .filter((beach) =>
        `${beach.name} ${beach.district} ${beach.municipality}`
          .toLocaleLowerCase(language)
          .includes(normalizedSearch),
      )
      .slice(0, 8)
  }, [language, normalizedSearch, territoryBeaches])
  const directoryBeaches = useMemo(() => {
    const filtered = territoryBeaches
      .filter((beach) => !district || beach.district === district)
      .filter((beach) => !municipality || beach.municipality === municipality)
      .filter(
        (beach) =>
          !normalizedSearch ||
          `${beach.name} ${beach.district} ${beach.municipality}`
            .toLocaleLowerCase(language)
            .includes(normalizedSearch),
      )

    const value = (beach: BeachViewModel) => currentForecast(beach, activeDate)
    return filtered.sort((first, second) => {
      if (sortMode === 'water-warm') {
        return value(second).waterMax - value(first).waterMax
      }
      if (sortMode === 'water-cold') {
        return value(first).waterMin - value(second).waterMin
      }
      if (sortMode === 'air-warm') {
        return value(second).airMax - value(first).airMax
      }
      if (sortMode === 'air-cold') {
        return value(first).airMin - value(second).airMin
      }
      if (sortMode === 'wind-calm') {
        return value(first).windAverageKnots - value(second).windAverageKnots
      }
      if (sortMode === 'wind-strong') {
        return value(second).windMaxKnots - value(first).windMaxKnots
      }
      return `${first.district}${first.municipality}${first.name}`.localeCompare(
        `${second.district}${second.municipality}${second.name}`,
        language,
      )
    })
  }, [
    activeDate,
    district,
    language,
    municipality,
    normalizedSearch,
    sortMode,
    territoryBeaches,
  ])

  useEffect(() => {
    setDistrict('')
    setMunicipality('')
  }, [territory])

  useEffect(() => {
    const first = territoryBeaches[0]
    if (first && !territoryBeaches.some((beach) => beach.id === selectedId)) {
      setSelectedId(first.id)
    }
  }, [selectedId, territoryBeaches])

  function selectBeach(beach: BeachViewModel, openDetails = true) {
    updateTerritory(beach.territory)
    setSelectedId(beach.id)
    setSelectionActive(true)
    setSearch('')
    setLocationsOpen(false)
    setDetailsOpen(openDetails)
  }

  function clearSelection() {
    setSelectionActive(false)
    setDetailsOpen(false)
  }

  if (loadError) {
    return (
      <main className="app-state">
        <BrandMark size={38} />
        <h1>{copy.dataUnavailable}</h1>
        <p>{loadError}</p>
      </main>
    )
  }

  if (!dataset || !activeDate) {
    return (
      <main className="app-state">
        <LoadingIndicator label={copy.loading} />
      </main>
    )
  }

  const selectedBeach =
    dataset.beaches.find((beach) => beach.id === selectedId) ??
    territoryBeaches[0] ??
    dataset.beaches[0] ??
    null

  if (!selectedBeach) {
    return (
      <main className="app-state">
        <BrandMark size={38} />
        <p>{copy.dataUnavailable}</p>
      </main>
    )
  }

  const forecast = currentForecast(selectedBeach, activeDate)
  const comparisonBeaches =
    territoryBeaches.length > 0 ? territoryBeaches : dataset.beaches
  const warmestWaterBeach = comparisonBeaches.reduce((selected, beach) =>
    currentForecast(beach, activeDate).waterMax >
    currentForecast(selected, activeDate).waterMax
      ? beach
      : selected,
  )
  const hottestAirBeach = comparisonBeaches.reduce((selected, beach) =>
    currentForecast(beach, activeDate).airMax >
    currentForecast(selected, activeDate).airMax
      ? beach
      : selected,
  )
  const calmestWindBeach = comparisonBeaches.reduce((selected, beach) =>
    currentForecast(beach, activeDate).windAverageKnots <
    currentForecast(selected, activeDate).windAverageKnots
      ? beach
      : selected,
  )
  const warmestWater = currentForecast(warmestWaterBeach, activeDate)
  const hottestAir = currentForecast(hottestAirBeach, activeDate)
  const calmestWind = currentForecast(calmestWindBeach, activeDate)
  const updatedAt = dataset.forecastUpdatedAt || dataset.generatedAt
  const updatedTimestamp = formatFreshnessTimestamp(updatedAt, language)
  return (
    <div className="map-app">
      <header className="site-header">
        <a className="brand" href="#app-content" aria-label="ÁguaDaPraia">
          <span className="brand-mark">
            <BrandMark size={36} />
          </span>
          <span>ÁguaDaPraia</span>
        </a>

        <div role="tablist" className="tab-nav" aria-label={copy.viewNavigation}>
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'map'}
            onClick={() => navigateToView('map')}
          >
            <Map size={16} />
            {copy.mapView}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'table'}
            onClick={() => navigateToView('table')}
          >
            <List size={16} />
            {copy.tableView}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'evolution'}
            onClick={() => navigateToView('evolution')}
          >
            <TrendingUp size={16} />
            {copy.evolutionView}
          </button>
        </div>

        {viewMode !== 'evolution' && (
          <div className="app-controls">
            <TerritorySelect
              value={territory}
              language={language}
              onChange={(value) => {
                clearSelection()
                updateTerritory(value)
              }}
            />

            <div className="date-switch" aria-label={copy.forecastDays}>
              {visibleForecastDates.map((date) => {
                const label = getRelativeLabel(date, dataset.forecastDates, language)
                return (
                  <Button
                    key={date}
                    className={activeDate === date ? 'active' : ''}
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setActiveDate(date)}
                    title={`${label.relative} · ${label.compactDate}`}
                  >
                    <CalendarDays size={15} />
                    <span>{label.relative}</span>
                  </Button>
                )
              })}
            </div>
          </div>
        )}

        <div className="header-right">
          <SettingsPanel
            settings={settings}
            onSettingsChange={setSettings}
            isMobile={mobileLayout}
          />
        </div>
      </header>

      {viewMode === 'map' ? (
        <main id="app-content" className="map-stage">
          <Suspense fallback={<div className="map-loading" aria-label={copy.loading} />}>
            <PortugalMap
              beaches={territoryBeaches}
              districtWeather={dataset.districtWeather}
              activeDate={activeDate}
              language={language}
              selectedId={selectionActive ? selectedBeach.id : ''}
              territory={territory}
              theme={theme}
              windUnit={windUnit}
              mapMetric={mapMetric}
              isMobile={mobileLayout}
              clusterRadius={18}
              clusterZoomRate={1.65}
              onSelect={(id) => {
                const beach = dataset.beaches.find((item) => item.id === id)
                if (beach) selectBeach(beach)
              }}
              onClearSelection={clearSelection}
            />
          </Suspense>

          <div className="map-top-dock">
            <div className="map-command-bar">
              <div className="typeahead">
                <Search size={18} aria-hidden="true" />
                {selectionActive && (
                  <span className="map-selection-chip" title={selectedBeach.name}>
                    <span>{selectedBeach.name}</span>
                    <button
                      type="button"
                      aria-label={copy.clearSelection}
                      onClick={clearSelection}
                    >
                      <X size={13} />
                    </button>
                  </span>
                )}
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={copy.search}
                  aria-label={copy.search}
                />
                {search && (
                  <button
                    type="button"
                    aria-label={copy.clear}
                    onClick={() => setSearch('')}
                  >
                    <X size={16} />
                  </button>
                )}
                <button
                  type="button"
                  className="typeahead-locations"
                  aria-label={`${territoryBeaches.length} ${copy.locations}`}
                  onClick={() => setLocationsOpen(true)}
                >
                  <ListFilter size={16} />
                  <strong>{territoryBeaches.length}</strong>
                  <span>{copy.locations}</span>
                </button>
                {searchMatches.length > 0 && !locationsOpen && (
                  <div className="search-suggestions">
                    {searchMatches.map((beach) => (
                      <button
                        key={beach.id}
                        type="button"
                        onClick={() => selectBeach(beach)}
                      >
                        <span>
                          <strong>{beach.name}</strong>
                          <small>{locationPath(beach)}</small>
                          <em>
                            {copy.water}{' '}
                            {currentForecast(beach, activeDate).waterMax.toFixed(1)}°
                            {' · '}
                            {copy.air}{' '}
                            {currentForecast(beach, activeDate).airMax.toFixed(0)}°
                          </em>
                        </span>
                        <ChevronRight size={15} />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="context-kpis" aria-label={copy.overview}>
              <button type="button" onClick={() => selectBeach(warmestWaterBeach)}>
                <Droplets size={15} />
                <span>
                  <small>MAX · {copy.water}</small>
                  <strong>{warmestWater.waterMax.toFixed(1)}°</strong>
                  <em>{warmestWaterBeach.name}</em>
                </span>
              </button>
              <button type="button" onClick={() => selectBeach(hottestAirBeach)}>
                <ThermometerSun size={15} />
                <span>
                  <small>MAX · {copy.air}</small>
                  <strong>{hottestAir.airMax.toFixed(0)}°</strong>
                  <em>{hottestAirBeach.name}</em>
                </span>
              </button>
              <button type="button" onClick={() => selectBeach(calmestWindBeach)}>
                <Feather size={15} />
                <span>
                  <small>{copy.calmestWind}</small>
                  <strong>{formatWind(calmestWind.windAverageKnots, windUnit)}</strong>
                  <em>
                    {calmestWindBeach.name} · MIN {formatHour(calmestWind.windMinHour)}
                  </em>
                </span>
              </button>
            </div>
          </div>

          <MapLegend language={language} metric={mapMetric} windUnit={windUnit} />

          <AnimatePresence>
            {locationsOpen && (
              <motion.aside
                className="locations-sheet"
                initial={mobileLayout ? { y: '105%' } : { x: '-105%' }}
                animate={mobileLayout ? { y: 0 } : { x: 0 }}
                exit={mobileLayout ? { y: '105%' } : { x: '-105%' }}
                transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              >
                <div className="sheet-heading">
                  <div>
                    <strong>{copy.locations}</strong>
                    <span>
                      {directoryBeaches.length} / {territoryBeaches.length}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={copy.close}
                    onClick={() => setLocationsOpen(false)}
                  >
                    <X size={19} />
                  </Button>
                </div>
                <label className="sheet-search">
                  <Search size={17} />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder={copy.search}
                  />
                </label>
                <div className="admin-filters">
                  <label>
                    <span>{copy.district}</span>
                    <select
                      value={district}
                      onChange={(event) => {
                        setDistrict(event.target.value)
                        setMunicipality('')
                      }}
                    >
                      <option value="">{copy.all}</option>
                      {districts.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>{copy.municipality}</span>
                    <select
                      value={municipality}
                      onChange={(event) => setMunicipality(event.target.value)}
                    >
                      <option value="">{copy.all}</option>
                      {municipalities.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="sort-control">
                  <span>{copy.orderBy}</span>
                  <select
                    value={sortMode}
                    onChange={(event) =>
                      setSortMode(event.target.value as typeof sortMode)
                    }
                  >
                    <option value="name">{copy.alphabetical}</option>
                    <option value="water-warm">{copy.warmestWater}</option>
                    <option value="water-cold">{copy.coldestWater}</option>
                    <option value="air-warm">{copy.hottestAir}</option>
                    <option value="air-cold">{copy.coldestAir}</option>
                    <option value="wind-calm">{copy.calmestWind}</option>
                    <option value="wind-strong">{copy.strongestWind}</option>
                  </select>
                </label>
                <div className="locations-list">
                  {[...new Set(directoryBeaches.map((beach) => beach.district))]
                    .sort((first, second) => first.localeCompare(second, language))
                    .map((districtName) => (
                      <details key={districtName} open>
                        <summary>
                          <span>{districtName}</span>
                          <small>
                            {
                              directoryBeaches.filter(
                                (beach) => beach.district === districtName,
                              ).length
                            }
                          </small>
                        </summary>
                        {directoryBeaches
                          .filter((beach) => beach.district === districtName)
                          .map((beach) => {
                            const itemForecast = currentForecast(beach, activeDate)
                            return (
                              <button
                                key={beach.id}
                                className={
                                  selectionActive && beach.id === selectedBeach.id
                                    ? 'selected'
                                    : ''
                                }
                                type="button"
                                onClick={() => selectBeach(beach)}
                              >
                                <span>
                                  <strong>{beach.name}</strong>
                                  <small>{locationPath(beach)}</small>
                                </span>
                                <span className="location-temperatures">
                                  <span className="location-water">
                                    <Droplets size={13} aria-hidden="true" />
                                    <b>
                                      {copy.water} {itemForecast.waterMax.toFixed(1)} °C
                                    </b>
                                  </span>
                                  <span className="location-air">
                                    <ThermometerSun size={13} aria-hidden="true" />
                                    <b>
                                      {copy.air} {itemForecast.airMax.toFixed(0)} °C
                                    </b>
                                  </span>
                                </span>
                              </button>
                            )
                          })}
                      </details>
                    ))}
                </div>
                {dataset.unavailableLocations.length > 0 && (
                  <p className="unavailable-note">
                    {dataset.unavailableLocations.length} {copy.unavailable}:{' '}
                    {dataset.unavailableLocations.map((item) => item.name).join(', ')}
                  </p>
                )}
              </motion.aside>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {detailsOpen && (
              <motion.aside
                className="details-sheet"
                initial={mobileLayout ? { y: '105%' } : { x: '105%' }}
                animate={mobileLayout ? { y: 0 } : { x: 0 }}
                exit={mobileLayout ? { y: '105%' } : { x: '105%' }}
                transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              >
                <div className="sheet-heading">
                  <div className="detail-sheet-title">
                    <small>{locationPath(selectedBeach)}</small>
                    <strong>{selectedBeach.name}</strong>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={copy.close}
                    onClick={clearSelection}
                  >
                    <X size={19} />
                  </Button>
                </div>

                <div className="detail-dates">
                  {selectedBeach.daily.map((item) => {
                    const label = getRelativeLabel(item.date, dataset.forecastDates, language)
                    return (
                      <button
                        key={item.date}
                        className={item.date === activeDate ? 'active' : ''}
                        type="button"
                        onClick={() => setActiveDate(item.date)}
                        title={`${label.relative} · ${label.compactDate}`}
                      >
                        <span>{label.relative}</span>
                        <small>{label.compactDate}</small>
                      </button>
                    )
                  })}
                </div>

                <div className="detail-metrics">
                  <article className="detail-metric water-metric">
                    <Droplets size={20} />
                    <span>{copy.waterTemperature}</span>
                    <div className="metric-primary">
                      <strong>{forecast.waterMax.toFixed(1)} °C</strong>
                      <small>MAX · {formatHour(forecast.waterMaxHour)}</small>
                    </div>
                    <div className="metric-secondary">
                      <b>{forecast.waterMin.toFixed(1)} °C</b>
                      <small>MIN · {formatHour(forecast.waterMinHour)}</small>
                    </div>
                  </article>
                  <article className="detail-metric wind-metric">
                    <Wind size={20} />
                    <span>{copy.windAverage}</span>
                    <div className="metric-primary">
                      <strong>{formatWind(forecast.windAverageKnots, windUnit)}</strong>
                      <small>08:00–18:00</small>
                    </div>
                    <div className="metric-secondary">
                      <b>{formatWind(forecast.windMinKnots, windUnit)}</b>
                      <small>MIN · {formatHour(forecast.windMinHour)}</small>
                    </div>
                  </article>
                  <article className="detail-metric air-metric">
                    <ThermometerSun size={20} />
                    <span>{copy.airTemperature}</span>
                    <div className="metric-primary">
                      <strong>{forecast.airMax.toFixed(0)} °C</strong>
                      <small>
                        MAX
                        {forecast.airMaxHour === null
                          ? ''
                          : ` · ${formatHour(forecast.airMaxHour)} UTC`}
                      </small>
                    </div>
                    <div className="metric-secondary">
                      <b>{forecast.airMin.toFixed(0)} °C</b>
                      <small>
                        MIN
                        {forecast.airMinHour === null
                          ? ''
                          : ` · ${formatHour(forecast.airMinHour)} UTC`}
                      </small>
                    </div>
                    <em className="metric-source">
                      {forecast.airLocation} · {formatDistance(forecast.airDistanceKm)}
                    </em>
                  </article>
                </div>

                <div className="history-heading">
                  <div className="history-heading-title">
                    <strong>{copy.history}</strong>
                    <span>
                      {selectedBeach.history.length} {copy.daysLoaded}
                    </span>
                  </div>
                  <div className="history-line-key" aria-label={copy.historyStatus}>
                    <span><i className="solid" />{copy.historyLabel}</span>
                    <span><i className="dotted" />{copy.forecastLabel}</span>
                  </div>
                </div>
                <div className="history-chart">
                  <Suspense fallback={<div className="chart-loading" />}>
                    <MetricHistoryChart
                      history={recentHistory(selectedBeach.history, 30)}
                      forecasts={selectedBeach.daily}
                      language={language}
                      windUnit={windUnit}
                      recentCount={30}
                    />
                  </Suspense>
                </div>
                <a
                  className="detail-data-source"
                  href={`https://www.ipma.pt/pt/maritima/costeira/index.jsp?selLocal=${encodeURIComponent(selectedBeach.id)}&idLocal=${encodeURIComponent(selectedBeach.id)}`}
                  target="_blank"
                  rel="noreferrer noopener"
                  aria-label={`${copy.ipmaForecast}: ${selectedBeach.name}. ${copy.opensNewWindow}`}
                >
                  {copy.ipmaForecast}
                  <ExternalLink size={11} aria-hidden="true" />
                </a>
              </motion.aside>
            )}
          </AnimatePresence>
        </main>
      ) : viewMode === 'table' ? (
        <BeachTableView
          beaches={territoryBeaches}
          activeDate={activeDate}
          language={language}
          windUnit={windUnit}
          onSelect={(beach) => {
            navigateToView('map')
            selectBeach(beach)
          }}
        />
      ) : (
        <Suspense fallback={<main className="app-state"><LoadingIndicator label={copy.loadingHistory} /></main>}>
          <EvolutionView
            dataset={dataset}
            language={language}
            windUnit={windUnit}
            theme={theme}
            territory={territory}
            onTerritoryChange={updateTerritory}
            initialMapMetric={mapMetric}
            onMapMetricChange={(metric) =>
              setSettings((current) => ({ ...current, mapMetric: metric }))
            }
          />
        </Suspense>
      )}

      <div className="attribution-bar">
        <a className="attribution-source" href="https://www.ipma.pt/" target="_blank" rel="noreferrer">
          {copy.attribution} IPMA.pt
          <span>
            &nbsp;· {copy.freshness}{' '}
            <time dateTime={updatedAt}>{updatedTimestamp}</time>
          </span>
        </a>
        <span className="attribution-credit">
          <a
            href="https://github.com/f-caetano/aguadapraia"
            target="_blank"
            rel="noreferrer noopener"
            className="attribution-github"
            title="GitHub · f-caetano/aguadapraia"
            aria-label={`GitHub · f-caetano/aguadapraia (${copy.opensNewWindow})`}
          >
            <GithubMark size={12} />
          </a>
          <span>Filipe Caetano @ 2026</span>
        </span>
      </div>
    </div>
  )
}

export default App
