/** One origin→destination route, aggregated over the month (see scripts/build_data.py).
 *  Not currently used by the home page (station map superseded it), kept for a possible
 *  future route-detail view. */
export interface RouteFeature {
  id: string
  from_: string
  to: string
  runs: number
  avgDelay: number
  onTimePct: number
  path: [number, number][]
}

/** One passenger station, with its own delay stats (see scripts/build_data.py,
 *  scripts/routes_lib.py `station_summary`). */
export interface StationFeature {
  code: string
  name: string
  lat: number
  lon: number
  avgDelay: number
  onTimePct: number
  runs: number
  appearances: number
  distinctRoutes: number
  cancelledPct: number
  /** Weather at this station in January (null if no readings). Each band is the share of
   *  arrivals more than 5 min late, or null when fewer than 30 arrivals fell in it. */
  weather: StationWeather | null
  /** The weather station shown for this station (null if none could be placed). */
  ems: StationEms | null
}

/** A weather station (FMI "EMS") shown on the map for a selected train station. `closest` is set
 *  only when a different, nearer station is the top-5 rank 1 but has no train readings in the
 *  data (see scripts/build_data.py `build_station_ems`). */
export interface StationEms {
  name: string
  lat: number
  lon: number
  km: number
  closest: { name: string; km: number | null } | null
}

/** One weather station's January statistics, from the readings taken when trains were nearby. */
export interface EmsWeather {
  readings: number
  slotShare: number | null
  days: number
  temp: { avg: number | null; min: number | null; minAt: string | null; max: number | null; maxAt: string | null }
  snow: { max: number | null; maxAt: string | null; daysWithSnow: number }
  gust: { max: number | null; maxAt: string | null }
  visibility: { min: number | null; minAt: string | null }
  /** [min, mean, max] air temperature per date, null on days with no readings. */
  daily: ([number, number, number] | null)[]
}

export interface EmsWeatherFile {
  dates: string[]
  stations: Record<string, EmsWeather>
}

export interface StationBand {
  n: number
  latePct: number
}

export interface StationWeather {
  /** Mean air temperature (°C) and mean snow depth (cm) at arrival times. */
  avgTemp: number | null
  avgSnow: number | null
  frost: StationBand | null
  mild: StationBand | null
  snow: StationBand | null
  noSnow: StationBand | null
}

/** One physical segment between two directly-adjacent passenger stations
 *  (see scripts/routes_lib.py `station_network_edges`). */
export interface ConnectionFeature {
  from: string
  to: string
  fromLon: number
  fromLat: number
  toLon: number
  toLat: number
  runs: number
}

/** Finland outline data — see CLAUDE.md "Highlighting Finland". */
export type FinlandFeatureKind = 'land' | 'mask' | 'outline'
export type FinlandGeoJSON = GeoJSON.FeatureCollection<GeoJSON.Geometry, { kind: FinlandFeatureKind }>

/** One distinct full stop sequence a train ran (see scripts/build_data.py
 *  `build_route_patterns_payload`): every station it stops at, in order, plus how many runs
 *  of each train type followed it. */
export interface RoutePattern {
  stops: string[]
  runsByType: Record<string, number>
}

/** What the route finder highlights on the map: one [lon, lat] path per distinct way trains
 *  get from the start station to the end station, plus the two end stations. */
export interface RouteHighlight {
  paths: [number, number][][]
  start: string
  end: string
  /** Codes of every station on any highlighted path -- the only stations whose markers show
   *  while a route is highlighted. */
  stationCodes: string[]
}

/** One distinct way trains get from the route's start to its end station: the stops in order,
 *  how many trains followed it (per train type), and which train services (route_stats.json
 *  ids, `<from>-<to>-<type>`) they belong to. */
export interface RoutePath {
  stops: string[]
  trains: number
  byType: Record<string, number>
  sources: { id: string; trains: number }[]
}

/** Delay statistics for one train service (origin -> destination x train type), see
 *  scripts/build_data.py `build_route_stats_payload`. `stops` rows are
 *  [station code, trains, average minutes late, % on time]. */
export interface RouteStat {
  from: string
  to: string
  fromName: string
  toName: string
  type: string
  trains: number
  avg: number | null
  p90: number | null
  onTime: number | null
  minor: number | null
  major: number | null
  cancelled: number | null
  stops: [string, number, number | null, number | null][]
  /** This service's arrivals by weather band: [arrivals, mean minutes late, % late] per band, null
   *  where the band had too few arrivals. `t` = frost / around freezing / mild; `s` = no snow /
   *  a little / deep. null when the service has no weather readings. */
  w: { t: (WeatherCell | null)[]; s: (WeatherCell | null)[] } | null
}
export type WeatherCell = [number, number, number]
export type RouteStatsFile = Record<string, RouteStat>

/** Month headline numbers for the landing card, see scripts/build_data.py `build_summary_payload`. */
export interface SummaryFile {
  firstDate: string | null
  lastDate: string | null
  trains: number
  stations: number
  onTimePct: number | null
  typicalDelay: number | null
  worstDay: { date: string; typicalDelay: number | null } | null
  weather: WeatherSummary | null
}

/** One weather group's pooled same-station comparison (see routes_lib.pooled_same_station). */
export interface WeatherCompare {
  harshLatePct: number
  benignLatePct: number
  harshAvg: number
  benignAvg: number
  stations: number
  worseAt: number
}

export interface WeatherBands {
  labels: string[]
  edges: number[]
}

export interface WeatherSummary {
  minArrivals: number
  bands: { t: WeatherBands; s: WeatherBands }
  compare: { temp: WeatherCompare | null; snow: WeatherCompare | null }
}
