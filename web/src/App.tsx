import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import MapView from './components/Map'
import Legend from './components/Legend'
import MonthSummary from './components/MonthSummary'
import RouteDetails from './components/RouteDetails'
import RouteFinder from './components/RouteFinder'
import SideColumn from './components/SideColumn'
import StationPanel from './components/StationPanel'
import StationSelect from './components/StationSelect'
import LiveCard from './components/LiveCard'
import WeatherStationDetails from './components/WeatherStationDetails'
import { findRoutes, pickRandomRoute, toHighlight } from './lib/routeFinder'
import { buildLiveRoute, buildTimeline, type LiveTimeline } from './lib/liveTrain'
import { routeStationValues, routeWeatherPins, type StationValue } from './lib/routeStats'
import { formatSnow, formatTemp } from './lib/weatherFormat'
import type { ConnectionFeature, EmsWeatherFile, FinlandGeoJSON, RoutePattern, RouteStatsFile, StationFeature, SummaryFile, WeatherPin } from './lib/types'

const NO_VALUES = new Map<string, StationValue>()
// A kiosk left alone this long goes back to the start view (see the idle effect in App).
const IDLE_RESET_MS = 90_000

export default function App() {
  const [stations, setStations] = useState<StationFeature[]>([])
  const [connections, setConnections] = useState<ConnectionFeature[]>([])
  const [finland, setFinland] = useState<FinlandGeoJSON | null>(null)
  const [selected, setSelected] = useState<StationFeature | null>(null)
  const [patterns, setPatterns] = useState<RoutePattern[]>([])
  const [routeStart, setRouteStart] = useState<StationFeature | null>(null)
  const [routeEnd, setRouteEnd] = useState<StationFeature | null>(null)
  // Which highlighted route's details pop-up is open (index into the route result), if any.
  const [detailIndex, setDetailIndex] = useState<number | null>(null)
  // route_stats.json is loaded lazily, the first time a route's details are opened.
  const [routeStats, setRouteStats] = useState<RouteStatsFile | null>(null)
  const [statsFailed, setStatsFailed] = useState(false)
  const [summary, setSummary] = useState<SummaryFile | null>(null)
  // Reset view: App clears the selection, Map flies home when `resetSignal` changes.
  const [resetSignal, setResetSignal] = useState(0)
  const [drifted, setDrifted] = useState(false)
  const [mapReady, setMapReady] = useState(false)
  // The weather station whose January pop-up is open (a pin on the map, or the selected station's
  // via the station panel). ems_weather.json loads as soon as any weather pin is on screen.
  const [weatherPin, setWeatherPin] = useState<WeatherPin | null>(null)
  // The "Hide weather stations" switch (route mode); the pins are shown by default.
  const [showWeather, setShowWeather] = useState(true)
  const [emsWeather, setEmsWeather] = useState<EmsWeatherFile | null>(null)
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
      // The month numbers are nice-to-have: a missing summary.json must not block the map.
      fetch('data/summary.json').then((r) => r.json() as Promise<SummaryFile>).catch(() => null),
    ]).then(([stationsData, connectionsData, finlandData, patternsData, summaryData]) => {
      if (cancelled) return
      setStations(stationsData)
      setConnections(connectionsData)
      setFinland(finlandData)
      setPatterns(patternsData)
      setSummary(summaryData)
    })
    return () => { cancelled = true }
  }, [])

  // A different station or route means the open weather pop-up no longer applies.
  useEffect(() => { setWeatherPin(null) }, [selected, routeStart, routeEnd])

  const needsEmsWeather = weatherPin !== null || selected?.ems != null || (routeStart !== null && routeEnd !== null)
  useEffect(() => {
    if (!needsEmsWeather || emsWeather) return
    let cancelled = false
    setEmsFailed(false)
    fetch('data/ems_weather.json')
      .then((r) => r.json() as Promise<EmsWeatherFile>)
      .then((data) => { if (!cancelled) setEmsWeather(data) })
      .catch(() => { if (!cancelled) setEmsFailed(true) })
    return () => { cancelled = true }
  }, [needsEmsWeather, emsWeather])

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
    () => (routeStart && routeEnd ? findRoutes(patterns, routeStart.code, routeEnd.code) : null),
    [patterns, routeStart, routeEnd],
  )
  const routeHighlight = useMemo(
    () => (routeStart && routeEnd && routeResult ? toHighlight(routeResult, routeStart.code, routeEnd.code, coords) : null),
    [routeResult, routeStart, routeEnd, coords],
  )

  // route_stats.json is loaded lazily, the first time a route appears: the map badges and the
  // route details pop-up both need it.
  useEffect(() => {
    if (routeResult === null || routeStats) return
    let cancelled = false
    setStatsFailed(false)
    fetch('data/route_stats.json')
      .then((r) => r.json() as Promise<RouteStatsFile>)
      .then((data) => { if (!cancelled) setRouteStats(data) })
      .catch(() => { if (!cancelled) setStatsFailed(true) })
    return () => { cancelled = true }
  }, [routeResult, routeStats])

  // Typical delay at each station of the highlighted routes, for the map badges (empty until the
  // statistics have loaded, so badges first show "–" and then fill in).
  const routeValues = useMemo(() => {
    if (!routeResult || !routeStats) return NO_VALUES
    const names = new Map(stations.map((s) => [s.code, s.name.replace(/ asema$/, '')]))
    return routeStationValues(routeResult.paths, routeStats, names)
  }, [routeResult, routeStats, stations])

  // Weather pins. Route mode: one per weather station on the route, with the route's own trains'
  // temperature and snow depth. Otherwise the selected station's weather station, January average.
  const stationNames = useMemo(() => new Map(stations.map((s) => [s.code, s.name.replace(/ asema$/, '')])), [stations])
  const routePins = useMemo(
    () =>
      routeResult && routeStats && routeHighlight
        ? routeWeatherPins(routeResult.paths, routeStats, stations, stationNames, emsWeather, routeHighlight.start, routeHighlight.end)
        : [],
    [routeResult, routeStats, routeHighlight, stations, stationNames, emsWeather],
  )
  const selectedPin = useMemo<WeatherPin | null>(() => {
    if (!selected?.ems) return null
    const january = emsWeather?.stations[selected.ems.name]
    return {
      key: selected.ems.name,
      ems: selected.ems,
      scope: 'month',
      stationNames: [stationNames.get(selected.code) ?? selected.name],
      stationCodes: [selected.code],
      temp: january?.temp.avg ?? null,
      snow: january?.snow.avg ?? null,
      own: true,
      isEnd: false,
    }
  }, [selected, emsWeather, stationNames])

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

      <SideColumn>
        <MonthSummary summary={summary} />
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
            )
            if (!pick) return
            setRouteStart(stations.find((s) => s.code === pick.start) ?? null)
            setRouteEnd(stations.find((s) => s.code === pick.end) ?? null)
          }}
          onClear={() => { setRouteStart(null); setRouteEnd(null) }}
          onLive={() => (live ? setLive(null) : startLive())}
          liveRunning={live !== null}
        />
        <StationSelect stations={stations} selected={selected} onSelect={setSelected} />
      </SideColumn>

      {live && (() => {
        const stop = liveAt >= 0 ? live.route.stops[live.passengerIndexes[liveAt]] : null
        const pin = stop ? routePins.find((p) => p.stationCodes.includes(stop.code)) : undefined
        return (
          <LiveCard
            stopName={stop?.name ?? null}
            delay={stop ? routeValues.get(stop.code)?.avg ?? null : null}
            temp={pin?.temp ?? null}
            snow={pin?.snow ?? null}
            reached={liveAt + 1}
            total={live.passengerIndexes.length}
            onStop={() => setLive(null)}
          />
        )
      })()}

      {/* Legend and Reset view share one row, so the button never overlaps the legend. The row
          starts to the right of the left column (not under it): the column can be tall, and the
          legend grows when a route is shown. */}
      <div className="pointer-events-none absolute bottom-6 left-[calc(clamp(300px,26vw,400px)+40px)] z-30 flex items-end gap-3">
        <Legend routeMode={routeHighlight !== null} weatherShown={showWeather && routePins.length > 0} />
        {routeHighlight !== null && routePins.length > 0 && (
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
          weatherBands={summary?.weather?.bands ?? null}
          onClose={() => setDetailIndex(null)}
        />
      )}

      {selected && <StationPanel station={selected} onClose={() => setSelected(null)} onShowWeather={() => selectedPin && setWeatherPin(selectedPin)} />}

      {weatherPin && (
        <WeatherStationDetails
          ems={weatherPin.ems}
          stationName={weatherPin.stationNames[0]}
          weather={emsWeather?.stations[weatherPin.ems.name] ?? null}
          dates={emsWeather?.dates ?? []}
          loadFailed={emsFailed}
          routeNote={
            weatherPin.scope === 'route' && weatherPin.own
              ? `When this route's trains were there: average ${formatTemp(weatherPin.temp)}C${weatherPin.snow === null ? '' : `, ${formatSnow(weatherPin.snow)} of snow`}.`
              : undefined
          }
          onClose={() => setWeatherPin(null)}
        />
      )}

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
