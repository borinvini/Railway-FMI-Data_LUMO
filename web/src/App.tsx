import { useEffect, useMemo, useState } from 'react'
import MapView from './components/Map'
import FinnishFlag from './components/FinnishFlag'
import Legend from './components/Legend'
import RouteDetails from './components/RouteDetails'
import RouteFinder from './components/RouteFinder'
import StationPanel from './components/StationPanel'
import StationSelect from './components/StationSelect'
import { findRoutes, pickRandomRoute, toHighlight } from './lib/routeFinder'
import type { ConnectionFeature, FinlandGeoJSON, RoutePattern, RouteStatsFile, StationFeature } from './lib/types'

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

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetch('data/stations.json').then((r) => r.json() as Promise<StationFeature[]>),
      fetch('data/connections.json').then((r) => r.json() as Promise<ConnectionFeature[]>),
      fetch('data/finland.geojson').then((r) => r.json() as Promise<FinlandGeoJSON>),
      fetch('data/route_patterns.json').then((r) => r.json() as Promise<RoutePattern[]>),
    ]).then(([stationsData, connectionsData, finlandData, patternsData]) => {
      if (cancelled) return
      setStations(stationsData)
      setConnections(connectionsData)
      setFinland(finlandData)
      setPatterns(patternsData)
    })
    return () => { cancelled = true }
  }, [])

  // A different pair of stations (or clearing/swapping) means the open details no longer apply.
  useEffect(() => { setDetailIndex(null) }, [routeStart, routeEnd])

  useEffect(() => {
    if (detailIndex === null || routeStats) return
    let cancelled = false
    setStatsFailed(false)
    fetch('data/route_stats.json')
      .then((r) => r.json() as Promise<RouteStatsFile>)
      .then((data) => { if (!cancelled) setRouteStats(data) })
      .catch(() => { if (!cancelled) setStatsFailed(true) })
    return () => { cancelled = true }
  }, [detailIndex, routeStats])

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

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      <MapView
        stations={stations}
        connections={connections}
        finland={finland}
        selected={selected}
        onSelect={setSelected}
        routeHighlight={routeHighlight}
        onRouteClick={setDetailIndex}
        activeRoute={detailIndex}
      />

      <div className="absolute top-5 left-5 flex items-center gap-3.5 rounded-[10px] border border-(--line) bg-(--surface) px-[18px] py-4 backdrop-blur-[8px]">
        <FinnishFlag className="h-[26px] w-auto shrink-0 rounded-[2px] ring-1 ring-(--line)" />
        <div>
          <h1 className="m-0 text-lg font-light tracking-wide">Finnish long-distance trains · January 2020</h1>
          <p className="mt-0.5 mb-0 text-[13px] text-(--muted)">Click a station to see how late long-distance trains run</p>
        </div>
      </div>

      <StationSelect stations={stations} selected={selected} onSelect={setSelected} />

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
      />

      <Legend />

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
          onClose={() => setDetailIndex(null)}
        />
      )}

      {selected && <StationPanel station={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
