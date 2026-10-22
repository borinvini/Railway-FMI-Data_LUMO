import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import MapView from './components/Map'
import Legend from './components/Legend'
import DelayTrends from './components/DelayTrends'
import PeriodSummary from './components/PeriodSummary'
import RouteDetails from './components/RouteDetails'
import RouteFinder from './components/RouteFinder'
import SideColumn from './components/SideColumn'
import StationPanel from './components/StationPanel'
import StationSelect from './components/StationSelect'
import LiveCard from './components/LiveCard'
import LiveChart from './components/LiveChart'
import LiveDelayChart from './components/LiveDelayChart'
import WeatherStationDetails from './components/WeatherStationDetails'
import { findRoutes, pickRandomRoute, toHighlight } from './lib/routeFinder'
import { buildLiveRoute, buildTimeline, type LiveTimeline } from './lib/liveTrain'
import { buildDelayProfile, buildLiveProfile } from './lib/liveProfile'
import { routeStationValues, routeWeatherPins, summarizeRoute, type StationValue } from './lib/routeStats'
import { formatSnow, formatTemp } from './lib/weatherFormat'
import { periodLabel, scopeOf } from './lib/period'
import type { ConnectionFeature, EmsStationFile, FinlandGeoJSON, RoutePattern, RouteStatsFile, RouteTrendsFile, StationFeature, StationStats, SummaryFile, WeatherPin } from './lib/types'

const NO_VALUES = new Map<string, StationValue>()
// A kiosk left alone this long goes back to the start view (see the idle effect in App).
const IDLE_RESET_MS = 90_000

export default function App() {
  // The stations of the whole period (stations.json); `stations` below swaps in a picked year's figures.
  const [baseStations, setBaseStations] = useState<StationFeature[]>([])
  const [connections, setConnections] = useState<ConnectionFeature[]>([])
  const [finland, setFinland] = useState<FinlandGeoJSON | null>(null)
  const [selected, setSelected] = useState<StationFeature | null>(null)
  const [patterns, setPatterns] = useState<RoutePattern[]>([])
  const [routeStart, setRouteStart] = useState<StationFeature | null>(null)
  const [routeEnd, setRouteEnd] = useState<StationFeature | null>(null)
  // Which highlighted route's details pop-up is open (index into the route result), if any.
  const [detailIndex, setDetailIndex] = useState<number | null>(null)
  // The picked year (null = all years). Every number and colour on the page follows it.
  const [year, setYear] = useState<number | null>(null)
  const [trendsOpen, setTrendsOpen] = useState(false)
  // Lazy files, loaded the first time they are needed and kept: a year's station figures, a period's
  // route statistics (data/scope/<period>/), the per-route monthly delays and each weather station.
  const [yearStations, setYearStations] = useState<Record<string, Record<string, StationStats>>>({})
  const [routeStatsByScope, setRouteStatsByScope] = useState<Record<string, RouteStatsFile>>({})
  const [statsFailed, setStatsFailed] = useState(false)
  const [routeTrends, setRouteTrends] = useState<RouteTrendsFile | null>(null)
  const [summary, setSummary] = useState<SummaryFile | null>(null)
  // Reset view: App clears the selection, Map flies home when `resetSignal` changes.
  const [resetSignal, setResetSignal] = useState(0)
  const [drifted, setDrifted] = useState(false)
  const [mapReady, setMapReady] = useState(false)
  // The weather station whose pop-up is open (a pin on the map, or the selected station's via the
  // station panel). Its file (data/ems/<file>.json) loads when the pop-up opens.
  const [weatherPin, setWeatherPin] = useState<WeatherPin | null>(null)
  // The "Hide weather stations" switch (route mode); the pins are shown by default.
  const [showWeather, setShowWeather] = useState(true)
  const [emsFiles, setEmsFiles] = useState<Record<string, EmsStationFile>>({})
  const [emsFailed, setEmsFailed] = useState(false)
  // Live: the run in progress (a train riding the busiest variant of the route) and the index of
  // the passenger stop it is at, for the now-playing card.
  const [live, setLive] = useState<LiveTimeline | null>(null)
  const [liveAt, setLiveAt] = useState(-1)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetch('data/stations.json').then((r) => r.json() as Promise<StationFeature[]>),
      fetch('data/connections.json').then((r) => r.json() as Promise<ConnectionFeature[]>),
      fetch('data/finland.geojson').then((r) => r.json() as Promise<FinlandGeoJSON>),
      fetch('data/route_patterns.json').then((r) => r.json() as Promise<RoutePattern[]>),
      // The headline numbers are nice-to-have: a missing summary.json must not block the map.
      fetch('data/summary.json').then((r) => r.json() as Promise<SummaryFile>).catch(() => null),
    ]).then(([stationsData, connectionsData, finlandData, patternsData, summaryData]) => {
      if (cancelled) return
      setBaseStations(stationsData)
      setConnections(connectionsData)
      setFinland(finlandData)
      setPatterns(patternsData)
      setSummary(summaryData)
    })
    return () => { cancelled = true }
  }, [])

  // A different station or route means the open weather pop-up no longer applies.
  useEffect(() => { setWeatherPin(null) }, [selected, routeStart, routeEnd])

  const scope = scopeOf(year)
  const yearIndex = year === null || !summary ? null : summary.years.indexOf(year)
  const period = periodLabel(summary?.years ?? null, year)

  // A picked year's station figures load once; until they arrive the whole-period figures stay.
  useEffect(() => {
    if (year === null || yearStations[scope]) return
    let cancelled = false
    fetch(`data/scope/${scope}/stations_stats.json`)
      .then((r) => r.json() as Promise<Record<string, StationStats>>)
      .then((data) => { if (!cancelled) setYearStations((prev) => ({ ...prev, [scope]: data })) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [year, scope, yearStations])

  // The stations as drawn: the whole period's figures, or the picked year's. A station no train
  // stopped at that year is left out, so it is neither drawn nor offered in the pickers.
  const stations = useMemo(() => {
    const stats = yearStations[scope]
    if (year === null || !stats) return baseStations
    return baseStations.flatMap((s) => (stats[s.code] ? [{ ...s, ...stats[s.code] }] : []))
  }, [baseStations, year, scope, yearStations])
  // A new year gives the selected station and the route ends fresh figures (or drops them).
  useEffect(() => {
    const fresh = (prev: StationFeature | null) => (prev ? stations.find((s) => s.code === prev.code) ?? null : null)
    setSelected(fresh)
    setRouteStart(fresh)
    setRouteEnd(fresh)
  }, [stations])

  // The weather station's detail file, loaded when its pop-up opens.
  const emsFile = weatherPin?.ems.file
  useEffect(() => {
    if (!emsFile || emsFiles[emsFile]) return
    let cancelled = false
    setEmsFailed(false)
    fetch(`data/ems/${emsFile}.json`)
      .then((r) => r.json() as Promise<EmsStationFile>)
      .then((data) => { if (!cancelled) setEmsFiles((prev) => ({ ...prev, [emsFile]: data })) })
      .catch(() => { if (!cancelled) setEmsFailed(true) })
    return () => { cancelled = true }
  }, [emsFile, emsFiles])

  // A different pair of stations (or clearing/swapping) means the open details no longer apply.
  useEffect(() => { setDetailIndex(null) }, [routeStart, routeEnd])

  // code -> [lon, lat] for every station, passenger or not: connection endpoints include the
  // non-passenger waypoint stations that route paths pass through.
  const coords = useMemo(() => {
    const m = new Map<string, [number, number]>()
    for (const c of connections) {
      m.set(c.from, [c.fromLon, c.fromLat])
      m.set(c.to, [c.toLon, c.toLat])
    }
    return m
  }, [connections])

  const routeResult = useMemo(
    () => (routeStart && routeEnd ? findRoutes(patterns, routeStart.code, routeEnd.code, yearIndex) : null),
    [patterns, routeStart, routeEnd, yearIndex],
  )
  const routeHighlight = useMemo(
    () => (routeStart && routeEnd && routeResult ? toHighlight(routeResult, routeStart.code, routeEnd.code, coords) : null),
    [routeResult, routeStart, routeEnd, coords],
  )

  // The route statistics of the picked period load the first time a route appears (and again, once,
  // for each other year picked): the map badges and the route details pop-up both need them.
  const routeStats = routeStatsByScope[scope] ?? null
  useEffect(() => {
    if (routeResult === null || routeStats) return
    let cancelled = false
    setStatsFailed(false)
    fetch(`data/scope/${scope}/route_stats.json`)
      .then((r) => r.json() as Promise<RouteStatsFile>)
      .then((data) => { if (!cancelled) setRouteStatsByScope((prev) => ({ ...prev, [scope]: data })) })
      .catch(() => { if (!cancelled) setStatsFailed(true) })
    return () => { cancelled = true }
  }, [routeResult, routeStats, scope])

  // Month-by-month delays of every service: only needed once the route pop-up is open.
  useEffect(() => {
    if (detailIndex === null || routeTrends) return
    let cancelled = false
    fetch('data/route_trends.json')
      .then((r) => r.json() as Promise<RouteTrendsFile>)
      .then((data) => { if (!cancelled) setRouteTrends(data) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [detailIndex, routeTrends])

  // Typical delay at each station of the highlighted routes, for the map badges (empty until the
  // statistics have loaded, so badges first show "–" and then fill in).
  const routeValues = useMemo(() => {
    if (!routeResult || !routeStats) return NO_VALUES
    const names = new Map(stations.map((s) => [s.code, s.name.replace(/ asema$/, '')]))
    return routeStationValues(routeResult.paths, routeStats, names)
  }, [routeResult, routeStats, stations])

  // Weather pins. Route mode: one per weather station on the route, with the route's own trains'
  // temperature and snow depth. Otherwise the selected station's weather station, its average.
  const stationNames = useMemo(() => new Map(stations.map((s) => [s.code, s.name.replace(/ asema$/, '')])), [stations])
  const routePins = useMemo(
    () =>
      routeResult && routeStats && routeHighlight
        ? routeWeatherPins(routeResult.paths, routeStats, stations, stationNames, routeHighlight.start, routeHighlight.end)
        : [],
    [routeResult, routeStats, routeHighlight, stations, stationNames],
  )
  const selectedPin = useMemo<WeatherPin | null>(() => {
    if (!selected?.ems) return null
    return {
      key: selected.ems.name,
      ems: selected.ems,
      scope: 'station',
      stationNames: [stationNames.get(selected.code) ?? selected.name],
      stationCodes: [selected.code],
      temp: selected.weather?.avgTemp ?? null,
      snow: selected.weather?.avgSnow ?? null,
      own: true,
      isEnd: false,
    }
  }, [selected, stationNames])

  // The temperature / snow profile the chart draws as the train runs: the route's own trains' means at
  // each passenger stop (as on the pins), the station's own average where there is none.
  const liveProfile = useMemo(() => {
    const path = routeResult?.paths[0]
    if (!live || !path || !routeStats) return null
    const byCode = new Map(summarizeRoute(path, routeStats, stationNames).stops.map((s) => [s.code, s]))
    const stationByCode = new Map(stations.map((s) => [s.code, s]))
    const values = new Map<string, { temp: number | null; snow: number | null }>()
    const stops = live.passengerIndexes.map((i) => live.route.stops[i])
    for (const stop of stops) {
      const row = byCode.get(stop.code)
      let temp = row?.temp ?? null
      let snow = row?.snow ?? null
      if (temp === null) {
        const here = stationByCode.get(stop.code)?.weather
        temp = here?.avgTemp ?? null
        snow = snow ?? here?.avgSnow ?? null
      }
      values.set(stop.code, { temp, snow })
    }
    return buildLiveProfile(stops, live.route.totalKm, values)
  }, [live, routeResult, routeStats, stationNames, stations])

  // The delay chart's bars: the same figure the delay badges showed on the map for each stop.
  const liveDelayProfile = useMemo(() => {
    if (!live) return null
    const stops = live.passengerIndexes.map((i) => live.route.stops[i])
    const values = new Map(stops.map((s) => [s.code, routeValues.get(s.code)?.avg ?? null]))
    return buildDelayProfile(stops, live.route.totalKm, values)
  }, [live, routeValues])

  const startLive = useCallback(() => {
    const path = routeResult?.paths[0]
    if (!path) return
    const route = buildLiveRoute(path.stops, coords, stationNames)
    if (route.stops.length < 2) return
    setSelected(null)
    setWeatherPin(null)
    setDetailIndex(null)
    setLiveAt(-1)
    setLive(buildTimeline(route))
  }, [routeResult, coords, stationNames])

  // The run ends with a different route, with Esc, and with Reset view (resetAll below).
  useEffect(() => { setLive(null) }, [routeStart, routeEnd])
  useEffect(() => {
    if (!live) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setLive(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [live])

  const resetAll = useCallback(() => {
    setLive(null)
    setSelected(null)
    setRouteStart(null)
    setRouteEnd(null)
    setDetailIndex(null)
    setWeatherPin(null)
    setTrendsOpen(false)
    setYear(null)
    setResetSignal((n) => n + 1)
  }, [])

  // Unattended kiosk: after IDLE_RESET_MS without a touch, mouse move or key press, go home.
  const resetAllRef = useRef(resetAll)
  resetAllRef.current = resetAll
  // A Live run has no input for a minute: that is not an absent visitor.
  const liveRef = useRef(live)
  liveRef.current = live
  useEffect(() => {
    let timer = window.setTimeout(fire, IDLE_RESET_MS)
    function fire() {
      if (liveRef.current) { poke(); return }
      resetAllRef.current()
    }
    function poke() {
      window.clearTimeout(timer)
      timer = window.setTimeout(fire, IDLE_RESET_MS)
    }
    const events = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'] as const
    for (const e of events) window.addEventListener(e, poke, { passive: true })
    return () => {
      window.clearTimeout(timer)
      for (const e of events) window.removeEventListener(e, poke)
    }
  }, [])

  const showReset = drifted || selected !== null || routeHighlight !== null

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      <MapView
        stations={stations}
        connections={connections}
        finland={finland}
        selected={selected}
        onSelect={setSelected}
        routeHighlight={routeHighlight}
        routeValues={routeValues}
        onRouteClick={setDetailIndex}
        activeRoute={detailIndex}
        resetSignal={resetSignal}
        onDriftChange={setDrifted}
        onReady={() => setMapReady(true)}
        weatherPins={routePins}
        selectedWeatherPin={selectedPin}
        showWeather={showWeather}
        onWeatherPinClick={setWeatherPin}
        live={live}
        onLiveProgress={(s) => setLiveAt(s.at)}
        onLiveEnd={() => setLive(null)}
      />

      {/* While the journey plays the three left cards are hidden; the run's own card (with Stop) and
          the weather chart take the left edge instead. */}
      {!live && (
      <SideColumn>
        <PeriodSummary summary={summary} year={year} onYear={setYear} onOpenTrends={() => setTrendsOpen(true)} />
        <RouteFinder
          stations={stations}
          start={routeStart}
          end={routeEnd}
          result={routeResult}
          onStart={setRouteStart}
          onEnd={setRouteEnd}
          onSwap={() => { setRouteStart(routeEnd); setRouteEnd(routeStart) }}
          onRandom={() => {
            const pick = pickRandomRoute(
              patterns,
              new Map(stations.map((s) => [s.code, { lat: s.lat, lon: s.lon }])),
              routeStart && routeEnd ? { start: routeStart.code, end: routeEnd.code } : null,
              yearIndex,
            )
            if (!pick) return
            setRouteStart(stations.find((s) => s.code === pick.start) ?? null)
            setRouteEnd(stations.find((s) => s.code === pick.end) ?? null)
          }}
          onClear={() => { setRouteStart(null); setRouteEnd(null) }}
          onLive={() => (live ? setLive(null) : startLive())}
          liveRunning={live !== null}
          period={period}
        />
        <StationSelect stations={stations} selected={selected} onSelect={setSelected} />
      </SideColumn>
      )}

      {live && (() => {
        const stop = liveAt >= 0 ? live.route.stops[live.passengerIndexes[liveAt]] : null
        const pin = stop ? routePins.find((p) => p.stationCodes.includes(stop.code)) : undefined
        return (
          // The now-playing card with the weather chart under it, in the empty area west of Finland.
          <div className="pointer-events-none absolute top-5 left-5 z-30 flex w-[min(380px,calc(100vw-40px))] flex-col gap-3">
            <LiveCard
              stopName={stop?.name ?? null}
              delay={stop ? routeValues.get(stop.code)?.avg ?? null : null}
              temp={pin?.temp ?? null}
              snow={pin?.snow ?? null}
              reached={liveAt + 1}
              total={live.passengerIndexes.length}
              onStop={() => setLive(null)}
            />
            {liveDelayProfile && <LiveDelayChart profile={liveDelayProfile} />}
            {liveProfile && <LiveChart profile={liveProfile} />}
          </div>
        )
      })()}

      {/* Legend and Reset view share one row, so the button never overlaps the legend. The row
          starts to the right of the left column (not under it): the column can be tall, and the
          legend grows when a route is shown. */}
      <div className={`pointer-events-none absolute bottom-6 z-30 flex items-end gap-3 ${live ? 'left-5' : 'left-[calc(clamp(300px,26vw,400px)+40px)]'}`}>
        {/* While the journey plays the map has no badges or pins to explain: the charts carry the colours. */}
        {!live && <Legend routeMode={routeHighlight !== null} weatherShown={showWeather && routePins.length > 0} />}
        {!live && routeHighlight !== null && routePins.length > 0 && (
          <button
            type="button"
            onClick={() => setShowWeather((v) => !v)}
            aria-pressed={showWeather}
            className="pointer-events-auto flex min-h-11 items-center gap-2 rounded-[10px] border border-(--line) bg-(--surface) px-4 text-[15px] text-(--muted) backdrop-blur-[8px] hover:text-(--text)"
          >
            {showWeather ? 'Hide weather stations' : 'Show weather stations'}
          </button>
        )}
        <button
          type="button"
          onClick={resetAll}
          className={`flex min-h-11 items-center gap-2 rounded-[10px] border border-(--line) bg-(--surface) px-4 text-[15px] text-(--muted) backdrop-blur-[8px] transition-opacity duration-150 hover:text-(--text) ${
            showReset ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
          }`}
          tabIndex={showReset ? 0 : -1}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <path d="M3 12a9 9 0 1 0 3-6.7" />
            <path d="M3 4v5h5" />
          </svg>
          Reset view
        </button>
      </div>

      {routeResult && routeStart && routeEnd && detailIndex !== null && (
        <RouteDetails
          routes={routeResult.paths}
          active={Math.min(detailIndex, routeResult.paths.length - 1)}
          onActive={setDetailIndex}
          startName={routeStart.name.replace(/ asema$/, '')}
          endName={routeEnd.name.replace(/ asema$/, '')}
          stations={stations}
          stats={routeStats}
          loadFailed={statsFailed}
          period={period}
          year={year}
          conditionDefs={summary?.conditions ?? null}
          trends={routeTrends}
          onClose={() => setDetailIndex(null)}
        />
      )}

      {selected && (
        <StationPanel
          station={selected}
          onClose={() => setSelected(null)}
          onShowWeather={() => selectedPin && setWeatherPin(selectedPin)}
          period={period}
          conditionDefs={summary?.conditions ?? null}
        />
      )}

      {weatherPin && (
        <WeatherStationDetails
          ems={weatherPin.ems}
          stationName={weatherPin.stationNames[0]}
          file={emsFiles[weatherPin.ems.file] ?? null}
          scope={scope}
          period={period}
          loadFailed={emsFailed}
          routeNote={
            weatherPin.scope === 'route' && weatherPin.own
              ? `When this route's trains were there: average ${formatTemp(weatherPin.temp)}C${weatherPin.snow === null ? '' : `, ${formatSnow(weatherPin.snow)} of snow`}.`
              : undefined
          }
          onClose={() => setWeatherPin(null)}
        />
      )}

      {trendsOpen && summary && <DelayTrends summary={summary} year={year} onYear={setYear} onClose={() => setTrendsOpen(false)} />}

      {/* Until the first tiles arrive the basemap is flat navy, which reads as broken. */}
      <div
        aria-hidden={mapReady}
        className={`pointer-events-none absolute inset-0 z-[70] flex items-center justify-center bg-(--bg) transition-opacity duration-300 ${
          mapReady ? 'opacity-0' : 'opacity-100'
        }`}
      >
        <p className="font-board m-0 text-2xl font-medium text-(--muted)">Loading the map…</p>
      </div>
    </div>
  )
}
