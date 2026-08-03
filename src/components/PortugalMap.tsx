import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Minus,
  Plus,
  RotateCcw,
  Sun,
} from 'lucide-react'
import { geoCentroid, geoMercator, geoPath } from 'd3-geo'
import { select } from 'd3-selection'
import 'd3-transition'
import {
  zoom as createZoom,
  zoomIdentity,
  type ZoomBehavior,
  type ZoomTransform,
} from 'd3-zoom'
import Supercluster from 'supercluster'
import type {
  Feature,
  FeatureCollection,
  Geometry,
} from 'geojson'
import { getCopy, type Language } from '../i18n'
import type {
  BeachViewModel,
  DailyBeachForecast,
  DistrictWeatherForecast,
  MapMetric,
  Territory,
  TerritoryFilter,
  Theme,
} from '../types'
import { publicAssetUrl } from '../lib/public-asset'
import {
  formatMapMetricValue,
  isPreferredMetricValue,
  mapMetricValue,
  windColourClass,
} from '../lib/map-metric'
import {
  adaptiveClusterRadius,
  clusterZoomLevel,
  initialMapTransform,
  mapHeight,
  mapWidth,
  territoryClusterProfile,
} from '../lib/map-transform'
import { convertWind, formatWind, type WindUnit } from '../lib/units'
import { Button } from './ui/button'

interface PortugalMapProps {
  beaches: BeachViewModel[]
  districtWeather: DistrictWeatherForecast[]
  activeDate: string
  language: Language
  selectedId: string
  territory: TerritoryFilter
  theme: Theme
  windUnit: WindUnit
  mapMetric?: MapMetric
  isMobile?: boolean
  clusterRadius?: number
  clusterBaseZoom?: number
  clusterZoomRate?: number
  onSelect: (id: string) => void
  onClearSelection: () => void
}

interface BeachPointProperties {
  id: string
  metricValue: number
  territory: Territory
}

interface ClusterProperties {
  bestMetricValue: number
  bestBeachId: string
  clusterTerritory: Territory
}

type WeatherKind =
  | 'clear'
  | 'partial'
  | 'cloudy'
  | 'fog'
  | 'snow'
  | 'storm'
  | 'rain'

const maxZoom = 16

const districtFeatureIndexByLocation = new Map<number, number>([
  [1010500, 2],
  [1020500, 3],
  [1030300, 4],
  [1040200, 5],
  [1050200, 6],
  [1060300, 7],
  [1070500, 8],
  [1080500, 9],
  [1090700, 10],
  [1100900, 11],
  [1110600, 12],
  [1121400, 13],
  [1131200, 14],
  [1141600, 15],
  [1151200, 16],
  [1160900, 17],
  [1171400, 18],
  [1182300, 19],
])

const districtDisplayLocationIds = new Set([
  ...districtFeatureIndexByLocation.keys(),
  2310300,
  2320100,
  3410100,
  3420300,
  3430100,
  3440100,
  3450200,
  3460200,
  3470100,
  3480200,
  3490100,
])

function temperatureClass(temperature: number) {
  if (temperature < 18) return 'cold'
  if (temperature < 19.5) return 'cool'
  if (temperature < 21) return 'warm'
  if (temperature < 22.5) return 'hot'
  return 'very-hot'
}

function airTemperatureClass(temperature: number) {
  if (temperature < 20) return 'cold'
  if (temperature < 24) return 'cool'
  if (temperature < 28) return 'warm'
  if (temperature < 32) return 'hot'
  return 'very-hot'
}

function displayMetricClass(value: number, metric: MapMetric) {
  if (metric === 'wind') return windColourClass(value)
  return metric === 'air'
    ? airTemperatureClass(value)
    : temperatureClass(value)
}

function weatherKind(weatherTypeId: number): WeatherKind {
  if (weatherTypeId === 1) return 'clear'
  if ([2, 3, 5, 25].includes(weatherTypeId)) return 'partial'
  if ([4, 24, 27].includes(weatherTypeId)) return 'cloudy'
  if ([16, 17, 26].includes(weatherTypeId)) return 'fog'
  if ([18, 28, 29, 30].includes(weatherTypeId)) return 'snow'
  if ([19, 20, 23].includes(weatherTypeId)) return 'storm'
  return 'rain'
}

function weatherIcon(kind: WeatherKind) {
  if (kind === 'clear') return Sun
  if (kind === 'partial') return CloudSun
  if (kind === 'cloudy') return Cloud
  if (kind === 'fog') return CloudFog
  if (kind === 'snow') return CloudSnow
  if (kind === 'storm') return CloudLightning
  return CloudRain
}

function weatherLabel(kind: WeatherKind, language: Language) {
  const copy = getCopy(language)
  const labels: Record<WeatherKind, string> = {
    clear: copy.weatherClear,
    partial: copy.weatherPartial,
    cloudy: copy.weatherCloudy,
    fog: copy.weatherFog,
    snow: copy.weatherSnow,
    storm: copy.weatherStorm,
    rain: copy.weatherRain,
  }
  return labels[kind]
}

function coordinateTerritory(longitude: number, latitude: number) {
  if (longitude < -20) return 'azores'
  if (latitude < 34) return 'madeira'
  return 'mainland'
}

function filterDistricts(
  features: Feature<Geometry>[],
  territory: TerritoryFilter,
) {
  if (territory === 'all') return features
  if (territory === 'madeira') return features.slice(0, 1)
  if (territory === 'azores') return features.slice(1, 2)
  return features.slice(2)
}

function rewindGeometry(geometry: Geometry): Geometry {
  if (geometry.type === 'Polygon') {
    return {
      ...geometry,
      coordinates: geometry.coordinates.map((ring) => [...ring].reverse()),
    }
  }
  if (geometry.type === 'MultiPolygon') {
    return {
      ...geometry,
      coordinates: geometry.coordinates.map((polygon) =>
        polygon.map((ring) => [...ring].reverse()),
      ),
    }
  }
  return geometry
}

function prepareDistricts(collection: FeatureCollection<Geometry>) {
  return {
    ...collection,
    features: collection.features.map((feature) => ({
      ...feature,
      geometry: rewindGeometry(feature.geometry),
    })),
  }
}

export default function PortugalMap({
  beaches,
  districtWeather,
  activeDate,
  language,
  selectedId,
  territory,
  theme,
  windUnit,
  mapMetric = 'water',
  isMobile = false,
  clusterRadius = 32,
  clusterBaseZoom = 6,
  clusterZoomRate = 1,
  onSelect,
  onClearSelection,
}: PortugalMapProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const zoomBehaviorRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(
    null,
  )
  const transformRef = useRef<ZoomTransform>(zoomIdentity)
  const clusterSelectionRef = useRef(false)
  const [districts, setDistricts] =
    useState<FeatureCollection<Geometry> | null>(null)
  const [mapError, setMapError] = useState<string | null>(null)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [transform, setTransform] = useState<ZoomTransform>(zoomIdentity)
  const [svgScale, setSvgScale] = useState(1)
  const copy = getCopy(language)
  const metricLabel = mapMetric === 'air'
    ? copy.air
    : mapMetric === 'wind'
      ? copy.wind
      : copy.water

  function getDisplayValue(forecast: DailyBeachForecast) {
    return mapMetricValue(forecast, mapMetric)
  }

  function formatDisplayValue(forecast: DailyBeachForecast) {
    return formatMapMetricValue(getDisplayValue(forecast), mapMetric, windUnit)
  }

  function markerValue(value: number) {
    const displayed = mapMetric === 'wind' ? convertWind(value, windUnit) : value
    return `${Math.round(displayed)}${mapMetric === 'wind' ? '' : '°'}`
  }

  function secondaryValues(forecast: DailyBeachForecast) {
    const water = Number.isFinite(forecast.waterMax)
      ? `${copy.water} ${forecast.waterMax.toFixed(1)} °C`
      : null
    const air = Number.isFinite(forecast.airMax)
      ? `${copy.air} ${forecast.airMax.toFixed(0)} °C`
      : null
    if (mapMetric === 'wind') {
      return [water, air].filter(Boolean).join(', ')
    }
    return mapMetric === 'air'
      ? (water ?? '')
      : (air ?? '')
  }

  function accessibleMetricValues(forecast: DailyBeachForecast) {
    const secondary = secondaryValues(forecast)
    return `${metricLabel} ${formatDisplayValue(forecast)}${secondary ? `, ${secondary}` : ''}`
  }

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const updateScale = () => {
      const bounds = svg.getBoundingClientRect()
      const nextScale = Math.max(
        0.01,
        Math.min(bounds.width / mapWidth, bounds.height / mapHeight),
      )
      setSvgScale((current) =>
        Math.abs(current - nextScale) > 0.001 ? nextScale : current,
      )
    }
    const observer = new ResizeObserver(updateScale)
    updateScale()
    observer.observe(svg)
    return () => observer.disconnect()
  }, [districts])

  useEffect(() => {
    setMapError(null)
    fetch(publicAssetUrl('geo/districts.geojson'), { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) throw new Error('District map geometry is unavailable')
        return response.json() as Promise<FeatureCollection<Geometry>>
      })
      .then((collection) => setDistricts(prepareDistricts(collection)))
      .catch((error) => {
        setMapError(error instanceof Error ? error.message : String(error))
      })
  }, [loadAttempt])

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const behavior = createZoom<SVGSVGElement, unknown>()
      .scaleExtent([1, maxZoom])
      .extent([
        [0, 0],
        [mapWidth, mapHeight],
      ])
      .translateExtent([
        [-mapWidth * 0.35, -mapHeight * 0.35],
        [mapWidth * 1.35, mapHeight * 1.35],
      ])
      .wheelDelta((event) => {
        const mode = event.deltaMode === 1 ? 0.05 : event.deltaMode ? 1 : 0.002
        return -event.deltaY * mode
      })
      .on('zoom', (event) => {
        transformRef.current = event.transform
        setTransform(event.transform)
      })

    zoomBehaviorRef.current = behavior
    select(svg).call(behavior)
    const initTransform = initialMapTransform(isMobile)
    if (initTransform !== zoomIdentity) {
      select(svg).call(behavior.transform, initTransform)
    }

    return () => {
      select(svg).on('.zoom', null)
      zoomBehaviorRef.current = null
    }
  }, [districts, isMobile])

  useEffect(() => {
    const svg = svgRef.current
    const behavior = zoomBehaviorRef.current
    if (!svg || !behavior) return
    select(svg)
      .transition()
      .duration(300)
      .call(behavior.transform, initialMapTransform(isMobile))
  }, [isMobile, territory])

  const visibleDistricts = useMemo(() => {
    if (!districts) return null
    return {
      ...districts,
      features: filterDistricts(districts.features, territory),
    }
  }, [districts, territory])

  const projection = useMemo(() => {
    if (!visibleDistricts) return null
    return geoMercator().fitExtent(
      [
        [72, 112],
        [mapWidth - 72, mapHeight - 54],
      ],
      visibleDistricts,
    )
  }, [visibleDistricts])
  const path = useMemo(
    () => (projection ? geoPath(projection) : null),
    [projection],
  )
  const activeWeather = useMemo(
    () =>
      districtWeather.filter(
        (weather) =>
          weather.date === activeDate &&
          districtDisplayLocationIds.has(weather.locationId) &&
          (territory === 'all' ||
            coordinateTerritory(weather.longitude, weather.latitude) ===
              territory),
      ),
    [activeDate, districtWeather, territory],
  )
  const initialScale = initialMapTransform(isMobile).k
  const effectiveClusterRadius = adaptiveClusterRadius(
    clusterRadius,
    transform.k,
    initialScale,
  )
  const responsiveClusterBaseZoom = clusterBaseZoom
  const clusterZoom = clusterZoomLevel(
    transform.k,
    initialScale,
    responsiveClusterBaseZoom,
    clusterZoomRate,
  )
  const clusterZoomStep = Math.max(
    0,
    clusterZoom - responsiveClusterBaseZoom,
  )
  const clusterIndexes = useMemo(() => {
    const indexes = new Map<
      Territory,
      Supercluster<BeachPointProperties, ClusterProperties>
    >()
    const territories: Territory[] =
      territory === 'all'
        ? ['mainland', 'madeira', 'azores']
        : [territory]

    for (const beachTerritory of territories) {
      const profile = territoryClusterProfile(
        territory,
        beachTerritory,
        clusterZoomStep,
      )
      const territoryRadius =
        effectiveClusterRadius * profile.radiusMultiplier
      const responsiveRadius = Math.min(
        territoryRadius * 2,
        territoryRadius / Math.min(1, svgScale),
      )
      const index = new Supercluster<
        BeachPointProperties,
        ClusterProperties
      >({
        radius: responsiveRadius,
        maxZoom: 9,
        minPoints: 2,
        map: (properties) => ({
          bestMetricValue: properties.metricValue,
          bestBeachId: properties.id,
          clusterTerritory: properties.territory,
        }),
        reduce: (accumulated, properties) => {
          const candidateWins = isPreferredMetricValue(
            properties.bestMetricValue,
            accumulated.bestMetricValue,
            mapMetric,
          )
          if (candidateWins) {
            accumulated.bestMetricValue = properties.bestMetricValue
            accumulated.bestBeachId = properties.bestBeachId
          }
        },
      })
      const points: Array<
        Supercluster.PointFeature<BeachPointProperties>
      > = beaches
        .filter(
          (beach) =>
            beach.id !== selectedId && beach.territory === beachTerritory,
        )
        .map((beach) => {
        const forecast =
          beach.daily.find((item) => item.date === activeDate) ?? beach.daily[0]
        return {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [beach.longitude, beach.latitude],
          },
          properties: {
            id: beach.id,
            metricValue: getDisplayValue(forecast),
            territory: beach.territory,
          },
        }
      })
      index.load(points)
      indexes.set(beachTerritory, index)
    }

    return indexes
  }, [
    activeDate,
    beaches,
    clusterZoomStep,
    effectiveClusterRadius,
    mapMetric,
    selectedId,
    svgScale,
    territory,
  ])
  const clusteredPoints = useMemo(() => {
    return [...clusterIndexes.entries()].flatMap(
      ([beachTerritory, index]) => {
        const profile = territoryClusterProfile(
          territory,
          beachTerritory,
          clusterZoomStep,
        )
        const territoryZoom = Math.max(
          0,
          Math.min(16, clusterZoom + profile.zoomOffset),
        )
        return index.getClusters([-180, -85, 180, 85], territoryZoom)
      },
    )
  }, [
    clusterIndexes,
    clusterZoom,
    clusterZoomStep,
    territory,
  ])
  const hoveredBeach = beaches.find((beach) => beach.id === hoveredId)
  const markerScale =
    (1.14 + Math.min(0.12, Math.log2(transform.k) * 0.04)) /
    (transform.k * svgScale)
  const weatherMarkerScale = 1 / (transform.k * svgScale)

  useEffect(() => {
    if (!selectedId || !projection) return
    const selected = beaches.find((beach) => beach.id === selectedId)
    const svg = svgRef.current
    const behavior = zoomBehaviorRef.current
    if (!selected || !svg || !behavior) return
    if (clusterSelectionRef.current) {
      clusterSelectionRef.current = false
      return
    }
    const point = projection([selected.longitude, selected.latitude])
    if (!point) return
    const targetScale = Math.max(transformRef.current.k, 4)
    const target = zoomIdentity
      .translate(
        mapWidth / 2 - point[0] * targetScale,
        mapHeight / 2 - point[1] * targetScale,
      )
      .scale(targetScale)
    select(svg).transition().duration(360).call(behavior.transform, target)
  }, [beaches, projection, selectedId])

  function animateScale(factor: number) {
    const svg = svgRef.current
    const behavior = zoomBehaviorRef.current
    if (!svg || !behavior) return
    select(svg).transition().duration(240).call(behavior.scaleBy, factor)
  }

  function resetZoom() {
    const svg = svgRef.current
    const behavior = zoomBehaviorRef.current
    if (!svg || !behavior) return
    select(svg)
      .transition()
      .duration(300)
      .call(behavior.transform, initialMapTransform(isMobile))
  }

  function zoomCluster(
    clusterId: number,
    coordinates: [number, number],
    beachId: string,
    clusterTerritory: Territory,
  ) {
    const svg = svgRef.current
    const behavior = zoomBehaviorRef.current
    const clusterIndex = clusterIndexes.get(clusterTerritory)
    if (!svg || !behavior || !projection || !clusterIndex) return
    const point = projection(coordinates)
    if (!point) return
    const expansionZoom = clusterIndex.getClusterExpansionZoom(clusterId)
    const targetScale = Math.min(
      maxZoom,
      Math.max(
        transformRef.current.k * 1.6,
        2 ** (expansionZoom - responsiveClusterBaseZoom),
      ),
    )
    const target = zoomIdentity
      .translate(
        mapWidth / 2 - point[0] * targetScale,
        mapHeight / 2 - point[1] * targetScale,
      )
      .scale(targetScale)
    select(svg)
      .transition()
      .duration(280)
      .call(behavior.transform, target)
      .on('end', () => {
        clusterSelectionRef.current = true
        onSelect(beachId)
      })
  }

  if (mapError) {
    return (
      <div className="map-error" role="alert">
        <strong>{copy.mapUnavailable}</strong>
        <span>{mapError}</span>
        <Button
          type="button"
          size="sm"
          onClick={() => setLoadAttempt((value) => value + 1)}
        >
          {copy.retry}
        </Button>
      </div>
    )
  }

  if (!visibleDistricts || !projection || !path) {
    return <div className="map-loading" aria-label={copy.loading} />
  }

  return (
    <div className="svg-map-shell" data-theme={theme}>
      <svg
        ref={svgRef}
        className="svg-map"
        viewBox={`0 0 ${mapWidth} ${mapHeight}`}
        role="img"
        aria-label={`${copy.mapTitle} · ${metricLabel}`}
        onClick={(event) => {
          const target = event.target as Element
          if (
            target.closest(
              '.svg-beach-marker, .svg-beach-cluster, .district-weather-marker',
            )
          ) {
            return
          }
          onClearSelection()
        }}
      >
        <rect width={mapWidth} height={mapHeight} className="map-ocean" />
        <g transform={transform.toString()}>
          {visibleDistricts.features.map((feature, index) => (
            <path
              key={`${feature.properties?.shapeName ?? 'district'}-${index}`}
              d={path(feature) ?? undefined}
              className="district-shape"
              vectorEffect="non-scaling-stroke"
            />
          ))}

          {activeWeather.map((weather) => {
            const districtFeatureIndex =
              districtFeatureIndexByLocation.get(weather.locationId)
            const districtFeature =
              districtFeatureIndex === undefined
                ? undefined
                : districts?.features[districtFeatureIndex]
            const coordinates: [number, number] = districtFeature
              ? geoCentroid(districtFeature)
              : [weather.longitude, weather.latitude]
            const point = projection(coordinates)
            if (!point) return null
            const kind = weatherKind(weather.weatherTypeId)
            const Icon = weatherIcon(kind)
            return (
              <g
                key={`${weather.locationId}-${weather.date}`}
                className={`district-weather-marker weather-${kind}`}
                transform={`translate(${point[0]} ${point[1]}) scale(${weatherMarkerScale})`}
              >
                <title>
                  {weather.locationName}: {weatherLabel(kind, language)},{' '}
                  {weather.minimumCelsius.toFixed(0)}–
                  {weather.maximumCelsius.toFixed(0)} °C
                </title>
                <Icon
                  x={-11}
                  y={-16}
                  width={19}
                  height={19}
                  className="weather-symbol"
                />
                <g transform="translate(5 -13)">
                  <rect className="weather-max-bg" width={27} height={15} rx={4} />
                  <text
                    className="weather-value weather-max-value"
                    x={13.5}
                    y={11}
                    textAnchor="middle"
                  >
                    {weather.maximumCelsius.toFixed(0)}°
                  </text>
                  <rect
                    className="weather-min-bg"
                    y={16}
                    width={23}
                    height={12}
                    rx={3.5}
                  />
                  <text
                    className="weather-value weather-min-value"
                    x={11.5}
                    y={25}
                    textAnchor="middle"
                  >
                    {weather.minimumCelsius.toFixed(0)}°
                  </text>
                </g>
              </g>
            )
          })}

          {clusteredPoints.map((feature) => {
            const coordinates = feature.geometry.coordinates as [number, number]
            const point = projection(coordinates)
            if (!point) return null
            const properties = feature.properties
            if ('cluster' in properties && properties.cluster) {
              const representative = properties.bestMetricValue
              return (
                <g
                  key={`cluster-${properties.clusterTerritory}-${properties.cluster_id}`}
                  className={`svg-beach-cluster ${displayMetricClass(
                    representative,
                    mapMetric,
                  )}${
                    selectedId ? ' faded' : ''
                  }`}
                  transform={`translate(${point[0]} ${point[1]}) scale(${markerScale})`}
                  role="button"
                  tabIndex={0}
                  aria-label={`${properties.point_count} ${copy.locations}, ${metricLabel} ${formatMapMetricValue(representative, mapMetric, windUnit)}`}
                  onClick={() =>
                    zoomCluster(
                      properties.cluster_id,
                      coordinates,
                      properties.bestBeachId,
                      properties.clusterTerritory,
                    )
                  }
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      zoomCluster(
                        properties.cluster_id,
                        coordinates,
                        properties.bestBeachId,
                        properties.clusterTerritory,
                      )
                    }
                  }}
                >
                  <circle className="cluster-hit" r={21} />
                  <circle className="cluster-dot" r={14} />
                  <text className="cluster-temperature" textAnchor="middle" y={3}>
                    {markerValue(representative)}
                  </text>
                  <circle
                    className="cluster-indicator"
                    cx={10}
                    cy={-10}
                    r={5}
                  />
                  <text
                    className="cluster-count"
                    textAnchor="middle"
                    x={10}
                    y={-8.2}
                  >
                    {properties.point_count_abbreviated}
                  </text>
                </g>
              )
            }

            const beachProperties = properties as BeachPointProperties
            const beach = beaches.find(
              (item) => item.id === beachProperties.id,
            )
            if (!beach) return null
            const forecast =
              beach.daily.find((item) => item.date === activeDate) ??
              beach.daily[0]
            const selected = beach.id === selectedId
            const displayValue = getDisplayValue(forecast)
            return (
              <g
                key={beach.id}
                className={`svg-beach-marker ${displayMetricClass(
                  displayValue,
                  mapMetric,
                )}${selected ? ' selected' : ''}${
                  selectedId && !selected ? ' faded' : ''
                }`}
                transform={`translate(${point[0]} ${point[1]}) scale(${markerScale})`}
                role="button"
                tabIndex={0}
                aria-label={`${beach.name}, ${beach.municipality}: ${accessibleMetricValues(forecast)}`}
                onMouseEnter={() => setHoveredId(beach.id)}
                onMouseLeave={() => setHoveredId(null)}
                onFocus={() => setHoveredId(beach.id)}
                onBlur={() => setHoveredId(null)}
                onClick={() => onSelect(beach.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onSelect(beach.id)
                  }
                }}
              >
                <circle className="beach-hit" r={21} />
                <circle className="beach-dot" r={selected ? 15 : 12.5} />
                <text className="beach-temperature" textAnchor="middle" y={3.4}>
                  {markerValue(displayValue)}
                </text>
              </g>
            )
          })}

          {selectedId &&
            (() => {
              const beach = beaches.find((item) => item.id === selectedId)
              if (!beach) return null
              const point = projection([beach.longitude, beach.latitude])
              if (!point) return null
              const forecast =
                beach.daily.find((item) => item.date === activeDate) ??
                beach.daily[0]
              const displayValue = getDisplayValue(forecast)
              return (
                <g
                  className={`svg-beach-marker ${displayMetricClass(
                    displayValue,
                    mapMetric,
                  )} selected`}
                  transform={`translate(${point[0]} ${point[1]}) scale(${markerScale})`}
                  role="button"
                  tabIndex={0}
                  aria-label={`${beach.name}, ${beach.municipality}: ${accessibleMetricValues(forecast)}`}
                  onMouseEnter={() => setHoveredId(beach.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onFocus={() => setHoveredId(beach.id)}
                  onBlur={() => setHoveredId(null)}
                  onClick={() => onSelect(beach.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      onSelect(beach.id)
                    }
                  }}
                >
                  <circle className="beach-hit" r={21} />
                  <circle className="beach-dot" r={15} />
                  <text
                    className="beach-temperature"
                    textAnchor="middle"
                    y={3.4}
                  >
                    {markerValue(displayValue)}
                  </text>
                </g>
              )
            })()}
        </g>

        {hoveredBeach &&
          (() => {
            const point = projection([
              hoveredBeach.longitude,
              hoveredBeach.latitude,
            ])
            if (!point) return null
            const forecast =
              hoveredBeach.daily.find((item) => item.date === activeDate) ??
              hoveredBeach.daily[0]
            const displayValue = getDisplayValue(forecast)
            const transformedPoint = transform.apply(point)
            const tooltipX = Math.max(
              8,
              Math.min(mapWidth - 210, transformedPoint[0] + 12),
            )
            const tooltipY = Math.max(
              8,
              Math.min(mapHeight - 63, transformedPoint[1] - 64),
            )
            return (
              <g
                className="svg-map-tooltip"
                transform={`translate(${tooltipX} ${tooltipY})`}
              >
                <rect width={198} height={55} rx={9} />
                <text x={11} y={18} className="tooltip-title">
                  {hoveredBeach.name.slice(0, 28)}
                </text>
                <text x={11} y={36} className="tooltip-path">
                  {hoveredBeach.district} › {hoveredBeach.municipality}
                </text>
                <text x={11} y={49} className="tooltip-values">
                  {metricLabel} {formatMapMetricValue(displayValue, mapMetric, windUnit)}
                  {secondaryValues(forecast)
                    ? ` · ${secondaryValues(forecast).replaceAll(' °C', '°')}`
                    : ''}
                  {mapMetric !== 'wind' && Number.isFinite(forecast.windAverageKnots)
                    ? ` · ${formatWind(forecast.windAverageKnots, windUnit)}`
                    : ''}
                </text>
              </g>
            )
          })()}
      </svg>

      <div className="svg-map-controls">
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={copy.zoomIn}
          onClick={() => animateScale(1.45)}
        >
          <Plus size={17} />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={copy.zoomOut}
          onClick={() => animateScale(1 / 1.45)}
        >
          <Minus size={17} />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={copy.resetZoom}
          onClick={resetZoom}
        >
          <RotateCcw size={16} />
        </Button>
      </div>
    </div>
  )
}
