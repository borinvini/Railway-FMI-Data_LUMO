/** Per-station numbers for one period ("all" years or one year), see scripts/build_data.py
 *  `station_stats`. Station files for a single year hold exactly this, keyed by station code. */
export interface StationStats {
  avgDelay: number
  onTimePct: number
  runs: number
  appearances: number
  distinctRoutes: number
  cancelledPct: number
  /** Weather at this station at train arrival times (null if no readings). */
  weather: StationWeather | null
}

/** One passenger station, with its own delay stats for the whole period (see
 *  scripts/build_data.py, scripts/routes_lib.py `station_summary`). The page swaps in a single
 *  year's `StationStats` when the year picker is used. */
export interface StationFeature extends StationStats {
  code: string
  name: string
  lat: number
  lon: number
  /** The weather station shown for this station (null if none could be placed). */
  ems: StationEms | null
}

/** A weather station (FMI "EMS") shown on the map for a selected train station. `closest` is set
 *  only when a different, nearer station is the top-5 rank 1 but has no train readings in the
 *  data (see scripts/build_data.py `build_station_ems`). `file` is its detail file in data/ems/. */
export interface StationEms {
  name: string
  lat: number
  lon: number
  km: number
  closest: { name: string; km: number | null } | null
  file: string
}

/** One weather station's statistics for one period, from the readings taken when trains were
 *  nearby. */
export interface EmsScope {
  readings: number
  slotShare: number | null
  days: number
  temp: { avg: number | null; min: number | null; minAt: string | null; max: number | null; maxAt: string | null }
  snow: { max: number | null; maxAt: string | null; daysWithSnow: number; avg: number | null }
  gust: { max: number | null; maxAt: string | null }
  visibility: { min: number | null; minAt: string | null }
}

/** data/ems/<file>.json: one weather station. `scopes` is keyed "all" or "2018"...; `monthly` rows
 *  align with `months` ("YYYY-MM"). */
export interface EmsStationFile {
  months: string[]
  scopes: Record<string, EmsScope>
  monthly: {
    /** [min, mean, max] air temperature in the month, null = no readings. */
    temp: ([number, number, number] | null)[]
    /** Deepest snow (cm) and strongest gust (m/s) in the month. */
    snow: (number | null)[]
    gust: (number | null)[]
    /** Readings in the month. */
    n: number[]
  }
}

/** One weather pin on the map: a weather station, with the figures written inside it. In a route
 *  (`scope: 'route'`) the numbers are those of the route's own trains at the stops the station
 *  serves; for a single selected station (`scope: 'station'`) they are the station's average at
 *  train times. `own: false` = the route's trains had no figure, so the station average is shown. */
export interface WeatherPin {
  key: string
  /** Location, plus `km` to the nearest train station it serves on the route. */
  ems: StationEms
  scope: 'route' | 'station'
  stationNames: string[]
  stationCodes: string[]
  temp: number | null
  snow: number | null
  own: boolean
  /** Serves the route's start or end station: always shown, first in line. */
  isEnd: boolean
}

/** [arrivals, share more than 5 min late (%), extra late trains per 100 than is usual for the same
 *  station, month and part of the day]. */
export type ConditionCell = [number, number, number]
/** Weather conditions (keys from `SummaryFile.conditions`) with enough arrivals to show. */
export type Conditions = Record<string, ConditionCell | undefined>

export interface StationWeather {
  /** Mean air temperature (°C) and mean snow depth (cm) at arrival times. */
  avgTemp: number | null
  avgSnow: number | null
  conditions: Conditions | null
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

/** One distinct full stop sequence a train ran (see scripts/build_data.py `build_route_patterns`):
 *  every station it stops at, in order, plus how many runs of each train type followed it, one
 *  count per year (aligned with `SummaryFile.years`). */
export interface RoutePattern {
  stops: string[]
  runsByType: Record<string, number[]>
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

/** Delay statistics for one train service (origin -> destination x train type) in one period, see
 *  scripts/build_data.py `build_route_stats_payload`. */
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
  /** [station code, trains, average minutes late, % on time, mean air temperature (°C), mean snow
   *  depth (cm), readings behind the two weather numbers]. The weather is that of this service's own
   *  trains at the stop (arrivals and departures); null / 0 when there were too few readings. */
  stops: [string, number, number | null, number | null, number | null, number | null, number][]
  /** This service's arrivals by weather condition; null when no condition had enough arrivals. */
  w: Conditions | null
}
export type RouteStatsFile = Record<string, RouteStat>

/** route_trends.json: for each train service, delay per month (aligned with `months`). */
export interface RouteTrendsFile {
  months: string[]
  services: Record<string, { /** tenths of a minute; null = no trains */ avg: (number | null)[]; n: number[] }>
}

/** Landing-card numbers for one period ("all" or one year). */
export interface Headline {
  firstDate: string | null
  lastDate: string | null
  trains: number
  stations: number
  onTimePct: number | null
  typicalDelay: number | null
  worstDay: { date: string; typicalDelay: number | null } | null
  conditions: Conditions | null
}

export interface ConditionDef {
  key: string
  label: string
  detail: string
}

/** summary.json, see scripts/build_data.py `main`. */
export interface SummaryFile {
  years: number[]
  /** "YYYY-MM" for every month of data; `trend` rows align with it. */
  months: string[]
  conditions: ConditionDef[]
  minConditionArrivals: number
  scopes: Record<string, Headline>
  /** Per condition: [years in which trains ran later than usual, years with enough data]. */
  yearsAbove: Record<string, [number, number]>
  trend: { avg: (number | null)[]; onTime: (number | null)[]; arrivals: (number | null)[] }
}

/** One station of predictor.json (scripts/build_predictor.py): its trained model's chance of a
 *  disruption for every month, day and time of day. */
export interface PredictorStation {
  /** Feature scenario of the paper: "S1", "S5" or "S11". */
  scenario: string
  /** What the model was given, in plain words. */
  uses: string
  testAuc: number
  /** Share of events that were disrupted at this station in the training years (%). */
  usualPct: number
  events: number
  /** Share of the station's events in each time slot of the day (%). */
  slotShare: number[]
  /** Chance in per mille, [month 0-11][day Mon=0..Sun=6][slot]. */
  p: number[][][]
  /** 1 where fewer than 10 real trains ran in that month/day/slot (the answer is a rough guess). */
  few: number[][][]
}

export interface PredictorFile {
  definition: string
  period: string
  stepMinutes: number
  stations: Record<string, PredictorStation>
}
