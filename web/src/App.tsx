import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import MapView from './components/Map'
import Footer from './components/Footer'
import AboutPage from './components/AboutPage'
import Legend from './components/Legend'
import DelayTrends from './components/DelayTrends'
import PeriodSummary from './components/PeriodSummary'
import LangSwitch from './components/LangSwitch'
import RouteDetails from './components/RouteDetails'
import RouteFinder from './components/RouteFinder'
import SideColumn from './components/SideColumn'
import StationPanel from './components/StationPanel'
import StationSelect from './components/StationSelect'
import LiveCard from './components/LiveCard'
import LiveChart from './components/LiveChart'
import LiveDelayChart from './components/LiveDelayChart'
import WeatherStationDetails from './components/WeatherStationDetails'
import DelayPredictor from './components/DelayPredictor'
import PhoneTopBar from './components/phone/PhoneTopBar'
import Dock, { type PhoneSheetName } from './components/phone/Dock'
import Sheet from './components/phone/Sheet'
import RoutePeek from './components/phone/RoutePeek'
import LegendPill from './components/phone/LegendPill'
import LiveCharts from './components/phone/LiveCharts'
import type { MapInsets } from './components/Map'
import { useIsPhone } from './lib/useIsPhone'
import { useElementHeight } from './lib/useElementHeight'
import { PREDICTOR_CODES } from './lib/predictor'
import { findRoutes, pickRandomRoute, toHighlight } from './lib/routeFinder'
import { PRESENT } from './lib/presentation'
import { buildLiveRoute, buildTimeline, type LiveTimeline } from './lib/liveTrain'
import { buildDelayProfile, buildLiveProfile } from './lib/liveProfile'
import { routeStationValues, routeWeatherPins, summarizeRoute, type StationValue } from './lib/routeStats'
import { defaultPeriod, periodLabel, periodShort, scopeOf, type Period } from './lib/period'
import { useLang } from './i18n'
import type { ConnectionFeature, EmsStationFile, FinlandGeoJSON, PredictorFile, RoutePattern, RouteStatsFile, RouteTrendsFile, StationFeature, StationStats, SummaryFile, WeatherPin } from './lib/types'

const NO_VALUES = new Map<string, StationValue>()
// A kiosk left alone this long goes back to the start view (see the idle effect in App).
const IDLE_RESET_MS = 90_000
const NO_YEARS: number[] = []

export default function App() {
  const { t, f, setLang } = useLang()
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
  // The picked period (all years, a year, or a month over all years). Every number and colour on the
  // page follows it. Opens By month, on the current month.
  const [periodPick, setPeriodPick] = useState<Period>(() => defaultPeriod())
  const [trendsOpen, setTrendsOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
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
  // "Ask the AI model" pop-up for the selected station (one of PREDICTOR_CODES); predictor.json loads
  // the first time it opens.
  const [predictorOpen, setPredictorOpen] = useState(false)
  const [predictorFile, setPredictorFile] = useState<PredictorFile | null>(null)
  const [predictorFailed, setPredictorFailed] = useState(false)
  // Live: the run in progress (a train riding the busiest variant of the route) and the index of
  // the passenger stop it is at, for the now-playing card.
  const [live, setLive] = useState<LiveTimeline | null>(null)
  const [liveAt, setLiveAt] = useState(-1)
  // Presentation mode: the camera flies a looping tour over Finland (lib/presentation.ts). `armed`
  // stays true after the button is pressed until Stop or Esc: a visitor's touch only ends the flight,
  // and the idle timer then resets the page and starts it again (an unattended screen at an event).
  const [presenting, setPresenting] = useState(false)
  const armedRef = useRef(false)
  // The show's cycle: one aerial tour, a random route held for a moment ('route'), the journey played on it
  // ('journey'), the arrived route held ('arrived'), then the next tour. `presentCycle` restarts the flight.
  type ShowPhase = 'aerial' | 'route' | 'journey' | 'arrived'
  const [showPhase, setShowPhase] = useState<ShowPhase>('aerial')
  const [presentCycle, setPresentCycle] = useState(0)

  // Phone layout (see CLAUDE.md "Phone layout"): the map fills the screen and the panels are sheets
  // over its lower part, one at a time, opened from the dock.
  const phone = useIsPhone()
  const [sheet, setSheet] = useState<PhoneSheetName | null>(null)

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

  const scope = scopeOf(periodPick)
  const whole = periodPick.kind === 'all'
  const years = summary?.years ?? NO_YEARS
  const period = periodLabel(summary?.years ?? null, periodPick, f) ?? t.allYears
  const periodShortLabel = periodShort(summary?.years ?? null, periodPick, f) ?? t.allYears

  // A picked year's or month's station figures load once; until they arrive the whole-period
  // figures stay.
  useEffect(() => {
    if (whole || yearStations[scope]) return
    let cancelled = false
    fetch(`data/scope/${scope}/stations_stats.json`)
      .then((r) => r.json() as Promise<Record<string, StationStats>>)
      .then((data) => { if (!cancelled) setYearStations((prev) => ({ ...prev, [scope]: data })) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [whole, scope, yearStations])

  // The stations as drawn: the whole period's figures, or the picked year's or month's. A station no
  // train stopped at in that period is left out, so it is neither drawn nor offered in the pickers.
  const stations = useMemo(() => {
    const stats = yearStations[scope]
    if (whole || !stats) return baseStations
    return baseStations.flatMap((s) => (stats[s.code] ? [{ ...s, ...stats[s.code] }] : []))
  }, [baseStations, whole, scope, yearStations])
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

  // The AI model pop-up belongs to the selected station: another station (or none) closes it. Keyed on
  // the code, so a year change, which refreshes the station's figures, does not.
  const selectedCode = selected?.code ?? null
  useEffect(() => { setPredictorOpen(false) }, [selectedCode])
  useEffect(() => {
    if (!predictorOpen || predictorFile) return
    let cancelled = false
    setPredictorFailed(false)
    fetch('data/predictor.json')
      .then((r) => r.json() as Promise<PredictorFile>)
      .then((data) => { if (!cancelled) setPredictorFile(data) })
      .catch(() => { if (!cancelled) setPredictorFailed(true) })
    return () => { cancelled = true }
  }, [predictorOpen, predictorFile])

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
    () => (routeStart && routeEnd ? findRoutes(patterns, routeStart.code, routeEnd.code, periodPick, years, coords) : null),
    [patterns, routeStart, routeEnd, periodPick, years, coords],
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

  // A random pair of stations a real train connects, in the picked period, other than the pair on
  // show: the "Random route" button and the presentation show both use it.
  const pickRandomPair = useCallback(() => {
    const pick = pickRandomRoute(
      patterns,
      new Map(stations.map((s) => [s.code, { lat: s.lat, lon: s.lon }])),
      routeStart && routeEnd ? { start: routeStart.code, end: routeEnd.code } : null,
      periodPick,
      years,
    )
    if (!pick) return null
    return {
      start: stations.find((s) => s.code === pick.start) ?? null,
      end: stations.find((s) => s.code === pick.end) ?? null,
    }
  }, [patterns, stations, routeStart, routeEnd, periodPick, years])

  const startLive = useCallback(() => {
    const path = routeResult?.paths[0]
    if (!path) return false
    const route = buildLiveRoute(path.stops, coords, stationNames)
    if (route.stops.length < 2) return false
    setSelected(null)
    setWeatherPin(null)
    setDetailIndex(null)
    setLiveAt(-1)
    setLive(buildTimeline(route))
    return true
  }, [routeResult, coords, stationNames])

  // The run ends with a different route, with Esc, and with Reset view (resetAll below).
  useEffect(() => { setLive(null) }, [routeStart, routeEnd])
  useEffect(() => {
    if (!live) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setLive(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [live])

  // Presentation mode starts from a clean map: no journey, selection, route or open pop-up (the picked
  // period stays).
  const startPresenting = useCallback(() => {
    setLive(null)
    setSelected(null)
    setRouteStart(null)
    setRouteEnd(null)
    setDetailIndex(null)
    setWeatherPin(null)
    setTrendsOpen(false)
    setAboutOpen(false)
    setPredictorOpen(false)
    armedRef.current = true
    setShowPhase('aerial')
    setPresentCycle((n) => n + 1)
    setPresenting(true)
  }, [])

  // While it flies, any touch, wheel or key ends it (the touch still reaches the map, so it starts a
  // normal drag). Esc also disarms the automatic restart; so does the button (see its handler).
  useEffect(() => {
    if (!presenting) return
    const stop = (e: Event) => {
      if ((e.target as Element | null)?.closest?.('[data-presentation-toggle]')) return
      if (e instanceof KeyboardEvent && e.key === 'Escape') armedRef.current = false
      setPresenting(false)
      setLive(null) // a journey the show started ends too; the route stays for the visitor to explore
    }
    const events = ['pointerdown', 'touchstart', 'wheel', 'keydown'] as const
    for (const ev of events) window.addEventListener(ev, stop, { passive: true, capture: true })
    return () => { for (const ev of events) window.removeEventListener(ev, stop, { capture: true }) }
  }, [presenting])

  // One tour flown: pick a random route, exactly like the "Random route" button, and hold it.
  const onPresentLoop = useCallback(() => {
    const pair = pickRandomPair()
    if (!pair?.start || !pair.end) {
      // No route to show: just fly the next tour.
      setPresentCycle((n) => n + 1)
      return
    }
    setRouteStart(pair.start)
    setRouteEnd(pair.end)
    setShowPhase('route')
  }, [pickRandomPair])

  // 'route': once the route's statistics are in (the badges and the journey's charts need them), hold it
  // for a moment, then play the journey on it.
  useEffect(() => {
    if (!presenting || showPhase !== 'route' || !routeResult || !(routeStats || statsFailed)) return
    const timer = window.setTimeout(() => {
      setShowPhase('journey')
      if (!startLive()) setShowPhase('arrived')
    }, PRESENT.routeHoldSeconds * 1000)
    return () => window.clearTimeout(timer)
  }, [presenting, showPhase, routeResult, routeStats, statsFailed, startLive])

  // 'journey': when the run is over (it arrived, or Esc ended it), hold the arrived route.
  useEffect(() => {
    if (presenting && showPhase === 'journey' && live === null) setShowPhase('arrived')
  }, [presenting, showPhase, live])

  // 'arrived': clear the route and fly the next tour.
  useEffect(() => {
    if (!presenting || showPhase !== 'arrived') return
    const timer = window.setTimeout(() => {
      setRouteStart(null)
      setRouteEnd(null)
      setSelected(null)
      setDetailIndex(null)
      setWeatherPin(null)
      setShowPhase('aerial')
      setPresentCycle((n) => n + 1)
    }, PRESENT.arrivedHoldSeconds * 1000)
    return () => window.clearTimeout(timer)
  }, [presenting, showPhase])

  const resetAll = useCallback(() => {
    setLive(null)
    setSelected(null)
    setRouteStart(null)
    setRouteEnd(null)
    setDetailIndex(null)
    setWeatherPin(null)
    setTrendsOpen(false)
    setAboutOpen(false)
    setPredictorOpen(false)
    setPeriodPick(defaultPeriod())
    setSheet(null)
    setResetSignal((n) => n + 1)
  }, [])

  // Unattended kiosk: after IDLE_RESET_MS without a touch, mouse move or key press, go home, and back
  // to English (the next visitor starts from the same screen). Reset view keeps the language.
  const resetAllRef = useRef(() => { resetAll(); setLang('en') })
  resetAllRef.current = () => { resetAll(); setLang('en') }
  // A Live run has no input for a minute: that is not an absent visitor.
  const liveRef = useRef(live)
  liveRef.current = live
  // Same while the tour flies; and when the idle timer does fire with the tour armed, it restarts it.
  const presentingRef = useRef(presenting)
  presentingRef.current = presenting
  const startPresentingRef = useRef(startPresenting)
  startPresentingRef.current = startPresenting
  // A phone is someone's own device, not the kiosk: reading a panel for a while must not reset it.
  const phoneRef = useRef(phone)
  phoneRef.current = phone
  useEffect(() => {
    let timer = window.setTimeout(fire, IDLE_RESET_MS)
    function fire() {
      if (liveRef.current || presentingRef.current || phoneRef.current) { poke(); return }
      resetAllRef.current()
      if (armedRef.current) startPresentingRef.current()
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

  const showReset = !presenting && (drifted || selected !== null || routeHighlight !== null)

  // Phone: a station picked on the map (or in the search) opens the Station sheet with its figures.
  useEffect(() => { if (phone && selectedCode) setSheet('station') }, [phone, selectedCode])
  // Phone: once a pair of stations has a route, the Route sheet steps aside (it drops to the peek
  // bar) so the route and its badges are visible. With no direct train it stays open to say so.
  const routeKey = routeStart && routeEnd ? `${routeStart.code}-${routeEnd.code}` : null
  const hasRoute = routeResult !== null
  useEffect(() => {
    if (phone && routeKey && hasRoute) setSheet((s) => (s === 'route' ? null : s))
  }, [phone, routeKey, hasRoute])
  // Phone: the journey takes the whole screen.
  useEffect(() => { if (live) setSheet(null) }, [live])

  // Phone: how much of the screen the bars and the open sheet cover, so the map keeps its framing in
  // the part that is still free.
  const topRef = useRef<HTMLElement>(null)
  const dockRef = useRef<HTMLElement>(null)
  const routeSheetRef = useRef<HTMLDivElement>(null)
  const stationSheetRef = useRef<HTMLDivElement>(null)
  const overviewSheetRef = useRef<HTMLDivElement>(null)
  const peekRef = useRef<HTMLDivElement>(null)
  const liveTopRef = useRef<HTMLDivElement>(null)
  const liveBottomRef = useRef<HTMLDivElement>(null)
  const showPeek = phone && !live && sheet === null && routeHighlight !== null && routeStart !== null && routeEnd !== null
  const topH = useElementHeight(topRef, phone && !live)
  const dockH = useElementHeight(dockRef, phone && !live)
  const sheetH =
    useElementHeight(routeSheetRef, phone && sheet === 'route') +
    useElementHeight(stationSheetRef, phone && sheet === 'station') +
    useElementHeight(overviewSheetRef, phone && sheet === 'overview')
  const peekH = useElementHeight(peekRef, showPeek)
  const liveTopH = useElementHeight(liveTopRef, phone && live !== null)
  const liveBottomH = useElementHeight(liveBottomRef, phone && live !== null)
  const mapInsets = useMemo<MapInsets>(
    () =>
      !phone
        ? { top: 0, bottom: 0 }
        : live
          ? { top: liveTopH + 16, bottom: liveBottomH + 16 }
          : { top: topH, bottom: dockH + (sheet ? sheetH : showPeek ? peekH : 0) },
    [phone, live, liveTopH, liveBottomH, topH, dockH, sheet, sheetH, showPeek, peekH],
  )

  const routeFinder = (
    <RouteFinder
      stations={stations}
      start={routeStart}
      end={routeEnd}
      result={routeResult}
      onStart={setRouteStart}
      onEnd={setRouteEnd}
      onSwap={() => { setRouteStart(routeEnd); setRouteEnd(routeStart) }}
      onRandom={() => {
        const pair = pickRandomPair()
        if (!pair) return
        setRouteStart(pair.start)
        setRouteEnd(pair.end)
      }}
      onClear={() => { setRouteStart(null); setRouteEnd(null) }}
      onLive={() => (live ? setLive(null) : startLive())}
      liveRunning={live !== null}
      period={period}
    />
  )
  const stationPanel = selected && (
    <StationPanel
      station={selected}
      onClose={() => setSelected(null)}
      onShowWeather={() => selectedPin && setWeatherPin(selectedPin)}
      period={period}
      conditionDefs={summary?.conditions ?? null}
      onAskModel={PREDICTOR_CODES.has(selected.code) ? () => setPredictorOpen(true) : undefined}
    />
  )
  const liveStop = live && liveAt >= 0 ? live.route.stops[live.passengerIndexes[liveAt]] : null
  const liveStopPin = liveStop ? routePins.find((p) => p.stationCodes.includes(liveStop.code)) : undefined
  const liveCard = live && (
    <LiveCard
      stopName={liveStop?.name ?? null}
      delay={liveStop ? routeValues.get(liveStop.code)?.avg ?? null : null}
      temp={liveStopPin?.temp ?? null}
      snow={liveStopPin?.snow ?? null}
      reached={liveAt + 1}
      total={live.passengerIndexes.length}
      onStop={() => setLive(null)}
    />
  )
  const stripAsema = (s: string) => s.replace(/ asema$/, '')

  return (
    <div
      className="relative h-screen w-screen overflow-hidden"
      data-phone={phone || undefined}
      // Phone: the dynamic viewport height, so the dock is not hidden behind the browser's own bars;
      // the two lengths place MapLibre's compass and attribution clear of the bars (index.css).
      style={phone ? ({ height: '100dvh', '--phone-top': `${live ? liveTopH + 16 : topH}px`, '--phone-bottom': `${live ? liveBottomH + 16 : dockH + (showPeek ? peekH : 0)}px` } as React.CSSProperties) : undefined}
    >
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
        presenting={presenting && showPhase === 'aerial'}
        presentCycle={presentCycle}
        onPresentLoop={onPresentLoop}
        phone={phone}
        insets={mapInsets}
      />

      {phone ? (
        <>
          {!live && (
            <>
              <PhoneTopBar ref={topRef} period={periodShortLabel} onPeriod={() => setSheet('overview')} showReset={showReset} onReset={resetAll} />
              <Sheet ref={routeSheetRef} open={sheet === 'route'} label={t.phone.sheetRoute} onClose={() => setSheet(null)} bottom={dockH} top={topH} maxHeight="68dvh">
                {routeFinder}
              </Sheet>
              <Sheet ref={stationSheetRef} open={sheet === 'station'} label={t.phone.sheetStation} onClose={() => setSheet(null)} bottom={dockH} top={topH} maxHeight="56dvh">
                <StationSelect stations={stations} selected={selected} onSelect={setSelected} />
                {stationPanel && <div className="relative mt-3 border-t border-(--card-line) pt-3">{stationPanel}</div>}
              </Sheet>
              <Sheet ref={overviewSheetRef} open={sheet === 'overview'} label={t.phone.sheetOverview} onClose={() => setSheet(null)} bottom={dockH} top={topH} maxHeight="76dvh">
                <PeriodSummary summary={summary} period={periodPick} onPeriod={setPeriodPick} onOpenTrends={() => setTrendsOpen(true)} />
                <Footer embedded onAbout={() => setAboutOpen(true)} />
              </Sheet>
              {showPeek && routeStart && routeEnd && routeResult && (
                <RoutePeek
                  ref={peekRef}
                  startName={stripAsema(routeStart.name)}
                  endName={stripAsema(routeEnd.name)}
                  paths={routeResult.paths.length}
                  bottom={dockH}
                  onExpand={() => setSheet('route')}
                  onDetails={() => setDetailIndex(0)}
                  onPlay={() => startLive()}
                />
              )}
              {sheet === null && (
                <LegendPill
                  routeMode={routeHighlight !== null}
                  weatherShown={showWeather && routePins.length > 0}
                  bottom={dockH + (showPeek ? peekH : 0) + 10}
                  weatherToggle={routeHighlight !== null && routePins.length > 0 ? { shown: showWeather, onToggle: () => setShowWeather((v) => !v) } : null}
                />
              )}
              <Dock ref={dockRef} open={sheet} onOpen={setSheet} routeActive={routeHighlight !== null} stationActive={selected !== null} />
            </>
          )}
          {live && (
            <>
              <div ref={liveTopRef} className="pointer-events-none absolute inset-x-2 z-30" style={{ top: 'calc(8px + env(safe-area-inset-top))' }}>
                {liveCard}
              </div>
              <LiveCharts ref={liveBottomRef} delay={liveDelayProfile} weather={liveProfile} />
            </>
          )}
        </>
      ) : (
      <>
      {/* While the journey plays the three left cards are hidden; the run's own card (with Stop) and
          the weather chart take the left edge instead. */}
      {!live && (
      <SideColumn>
        <PeriodSummary summary={summary} period={periodPick} onPeriod={setPeriodPick} onOpenTrends={() => setTrendsOpen(true)} />
        {routeFinder}
        <StationSelect stations={stations} selected={selected} onSelect={setSelected} />
      </SideColumn>
      )}

      {live && (
        // The now-playing card with the weather chart under it, in the empty area west of Finland.
        <div className="pointer-events-none absolute top-5 left-5 z-30 flex w-[min(380px,calc(100vw-40px))] flex-col gap-3">
          {liveCard}
          {liveDelayProfile && <LiveDelayChart profile={liveDelayProfile} />}
          {liveProfile && <LiveChart profile={liveProfile} />}
        </div>
      )}

      {/* Legend and Reset view share one row, so the button never overlaps the legend. The row
          starts to the right of the left column (not under it): the column can be tall, and the
          legend grows when a route is shown. */}
      <div className={`pointer-events-none absolute bottom-[calc(var(--footer-h)+16px)] z-30 flex items-end gap-3 ${live ? 'left-5' : 'left-[calc(clamp(300px,26vw,400px)+40px)]'}`}>
        {/* While the journey plays the map has no badges or pins to explain: the charts carry the colours. */}
        {!live && <Legend routeMode={routeHighlight !== null} weatherShown={showWeather && routePins.length > 0} />}
        {!live && routeHighlight !== null && routePins.length > 0 && (
          <button
            type="button"
            onClick={() => setShowWeather((v) => !v)}
            aria-pressed={showWeather}
            className="pointer-events-auto flex min-h-11 items-center gap-2 rounded-[10px] border border-(--line) bg-(--surface) px-4 text-[15px] text-(--muted) backdrop-blur-[8px] hover:text-(--text)"
          >
            {showWeather ? t.shell.hideWeather : t.shell.showWeather}
          </button>
        )}
        {(!live || presenting) && (
          <button
            type="button"
            data-presentation-toggle
            aria-pressed={presenting}
            onClick={() => {
              if (presenting) { armedRef.current = false; setPresenting(false) } else startPresenting()
            }}
            className={`pointer-events-auto flex min-h-11 items-center gap-2 rounded-[10px] border bg-(--surface) px-4 text-[15px] backdrop-blur-[8px] hover:text-(--text) ${
              presenting ? 'border-(--text) text-(--text)' : 'border-(--line) text-(--muted)'
            }`}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden="true">
              {presenting ? <rect x="6" y="6" width="12" height="12" rx="1.5" /> : <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" />}
            </svg>
            {presenting ? t.shell.stopPresentation : t.shell.presentation}
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
          {t.shell.resetView}
        </button>
      </div>

      {stationPanel}

      {/* Language: one flag button in the top-right corner, like the phone's top bar. The compass sits
          under it (index.css) and the station panel opens below it, so it is always reachable. */}
      <LangSwitch compact framed className="absolute top-5 right-5 z-[55]" />

      {/* Credit and the About link: always on screen, also while presenting or playing a journey. */}
      <Footer onAbout={() => setAboutOpen(true)} />
      </>
      )}

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
          periodPick={periodPick}
          conditionDefs={summary?.conditions ?? null}
          trends={routeTrends}
          onClose={() => setDetailIndex(null)}
        />
      )}

      {predictorOpen && selected && (
        <DelayPredictor
          code={selected.code}
          stationName={selected.name.replace(/ asema$/, '')}
          file={predictorFile}
          loadFailed={predictorFailed}
          onClose={() => setPredictorOpen(false)}
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
              ? t.weather.routeNote(weatherPin.temp, weatherPin.snow)
              : undefined
          }
          onClose={() => setWeatherPin(null)}
        />
      )}

      {trendsOpen && summary &&<DelayTrends summary={summary} period={periodPick} onPeriod={setPeriodPick} onClose={() => setTrendsOpen(false)} />}

      {aboutOpen && <AboutPage onClose={() => setAboutOpen(false)} />}

      {/* Until the first tiles arrive the basemap is flat navy, which reads as broken. */}
      <div
        aria-hidden={mapReady}
        className={`pointer-events-none absolute inset-0 z-[70] flex items-center justify-center bg-(--bg) transition-opacity duration-300 ${
          mapReady ? 'opacity-0' : 'opacity-100'
        }`}
      >
        <p className="font-board m-0 text-2xl font-medium text-(--muted)">{t.loadingMap}</p>
      </div>
    </div>
  )
}
