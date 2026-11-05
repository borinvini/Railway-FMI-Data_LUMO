import type { Fmt } from './format'
import type { Period } from '../lib/period'
import { formatSnow, formatTemp } from '../lib/weatherFormat'

/**
 * Every visitor-facing English string, grouped by where it shows. `fi.ts` must give the same keys
 * (TypeScript checks it): a string added here without its Finnish twin fails the build.
 * Text with numbers or names is a small function, so word order and plurals stay per language.
 */
export const en = (f: Fmt) => ({
  docTitle: 'Finnish long-distance trains · 2018–2025',
  loadingMap: 'Loading the map…',
  lang: { label: 'Language', en: 'English', fi: 'Suomi' },
  allYears: 'all years',
  close: 'Close',
  flag: 'Flag of Finland',
  trains: (n: number) => `${f.int(n)} ${n === 1 ? 'train' : 'trains'}`,
  /** "4.2 min" */
  min: (v: number) => `${f.dec(v, 1)} min`,
  /** A weather pin's temperature with the unit, as in the map tooltips: "−3°C". */
  pinTemp: (v: number | null) => `${formatTemp(v)}C`,
  snowOf: (v: number | null) => `${formatSnow(v)} of snow`,

  /** Plain-language names for the train-type codes in the data (Digitraffic's metadata has only the
   *  code). Only add a name once it is confirmed; any other code gets the fallback, never a guess.
   *  Still unconfirmed: HDM, MV, PVV, V. HSM is a loose label: a 2021 Sweco noise study for Tampere
   *  lists it as electric multiple units (Sm2/Sm4) and once as a diesel railcar (Dm12). */
  trainType: (code: string) =>
    ({ IC: 'InterCity', S: 'Pendolino', AE: 'Allegro (to St Petersburg)', PYO: 'Night train', HSM: 'Multiple-unit train' } as Record<string, string>)[code] ??
    'Other long-distance',

  shell: {
    presentation: 'Presentation mode',
    stopPresentation: 'Stop presentation',
    resetView: 'Reset view',
    hideWeather: 'Hide weather stations',
    showWeather: 'Show weather stations',
  },

  summary: {
    title: 'Long-distance trains in Finland',
    tapHint: (period: string) => `${period}. Tap any station on the map.`,
    allYearsChip: 'All years',
    yearGroup: 'Year',
    monthGroup: 'Month',
    modeGroup: 'Show figures',
    byYear: 'By year',
    byMonth: 'By month',
    trainsRan: 'trains ran',
    onTime: 'on time (up to 5 min late)',
    trendsLink: 'How delays changed, and the weather',
  },

  finder: {
    title: 'Find a route',
    clear: 'Clear route',
    from: 'From',
    to: 'To',
    fromPlaceholder: 'Start station…',
    toPlaceholder: 'End station…',
    swap: 'Swap direction',
    random: 'Random route',
    play: 'Play the journey',
    stop: 'Stop',
    pickTwo: 'Pick two stations to see which trains connect them.',
    noDirect: (period: string) => `No direct train between these stations, ${period}.`,
    direct: (period: string, from: string, to: string) => `Direct trains, ${period}, from ${from} to ${to}`,
  },

  combobox: { placeholder: 'Select or type a station…', none: 'No station found' },

  station: {
    jump: 'Jump to a station',
    minutesLate: 'minutes late, on average',
    within5: 'Arrived within 5 min',
    stopping: 'Trains stopping here',
    routes: 'Routes served',
    cancelled: 'Cancelled',
    aiQuestion: 'Will a train here be late?',
    aiIntro: 'An AI model learned from 7 years of trains at this station. Pick a day and a time to see its guess.',
    askModel: 'Try the AI forecast',
    weatherStation: (name: string, km: number) => `Weather station: ${name}, ${f.dec(km, 1)} km away`,
    seeWeather: 'See the weather here',
    weatherHere: (temp: number, snow: number | null) =>
      `Weather here when trains arrived: ${f.temp(temp)} on average${snow === null ? '' : snow >= 0.5 ? `, ${f.dec(snow, 0)} cm of snow` : ', no snow'}.`,
    badWeather: 'Late trains in bad weather',
  },

  conditions: {
    /** Finnish names by condition key; English reads the names in summary.json. */
    names: {} as Record<string, { label: string; detail: string }>,
    counts: (n: number, latePct: number) => ` · ${f.int(n)} arrivals, ${f.pct(latePct, 0)} late`,
    yearsAbove: (a: number, b: number) => ` · more than usual in ${a} of ${b} years`,
    aria: (signed: string) => `${signed} more late trains per 100`,
    key: 'Extra late trains per 100 (more than 5 min late), compared with the same station, month and time of day.',
    caveat: 'This shows what happened, not exactly why: bad weather comes with other things, such as winter nights.',
  },

  legend: {
    station: 'Average delay at this station',
    onTime: 'on time',
    late8: '8+ min late',
    stop: 'Average delay at this stop on the route',
    /** The three badge ranges, in ROUTE_BADGE_STEPS order (lib/colors.ts). */
    badges: ['Under 2 min late', '2–5 min late', 'Over 5 min late'],
    noFigure: 'No figure',
    weatherStation: 'Weather station',
    temperature: 'Temperature',
    snowDepth: 'Snow depth',
    whenThere: "When this route's trains were there",
    ai: 'AI forecast at this station',
    pill: 'Legend',
    pillHide: 'Hide',
    show: 'Show the legend',
    hide: 'Hide the legend',
  },

  map: {
    routeClick: 'Click for route details',
    /** The tag on the pins of the stations with an AI model, and the tooltip line for them. */
    aiTag: 'AI',
    aiHint: 'AI forecast: open the station to try it',
    /** MapLibre's own wording for the compass button. */
    compass: 'Drag to rotate map, click to reset north',
    noSnowFigure: 'no snow figure',
    stationPin: (name: string, km: number, temp: string, snow: string) =>
      `${name} weather station\n${f.dec(km, 1)} km away\nAverage at train times: ${temp}, ${snow}\nClick for the weather`,
    routePin: (name: string, own: boolean, temp: string, snow: string, serves: string[]) =>
      `${name} weather station\n${
        own ? `${temp} on average, ${snow},\nwhen this route's trains were there` : `Average at nearby stations: ${temp}, ${snow}\n(no figure for this route's own trains)`
      }\nServes ${serves.join(', ')}\nClick for the weather`,
    badgeNone: (name: string) => `${name}\nNo saved figure for this station`,
    badgeOwn: (name: string, v: number) => `${name}\n${f.dec(v, 1)} min late on this route`,
    badgeFallback: (name: string, v: number) => `${name}\n${f.dec(v, 1)} min late (station average:\nno figure for this route's own trains)`,
    station: (name: string, v: number) => `${name}\n${f.dec(v, 1)} min late on average`,
  },

  charts: {
    minutesLate: 'Minutes late',
    noTrains: 'No trains',
    lateAvg: (v: number) => `${f.dec(v, 1)} min late on average`,
  },

  route: {
    routeOf: (i: number, n: number) => `Route ${i} of ${n}: `,
    tab: (i: number, label: string, trains: number) => `Route ${i}: ${label}, ${f.int(trains)} ${trains === 1 ? 'train' : 'trains'}`,
    direct: 'direct',
    via: (names: string[]) => `via ${names.join(', ')}`,
    stops: (n: number) => ` (${n} stops)`,
    pickOne: (n: number) => `The trains run ${n} ways. Pick one:`,
    tabsAria: 'Routes between these stations',
    loading: 'Loading statistics…',
    failed: 'Could not load the statistics. Please try again.',
    tileTrains: (period: string) => `Trains, ${period}`,
    tileLate: 'Typically late at stops',
    tileOnTime: 'On time (up to 5 min late)',
    tileCancelled: 'Cancelled',
    stopsTitle: 'How late trains are at each stop',
    stopsIntro: (from: string, to: string) => `Typical minutes late when trains arrive at each stop, from ${from} to ${to}.`,
    stopsShown: (x: number, y: number) =>
      `Showing ${x} of ${y} stops: the rest have no saved figures, because these trains usually run a different way.`,
    insightJump: (from: string, to: string, by: number) => `Delay grows most between ${from} and ${to} (+${f.dec(by, 1)} min).`,
    insightLatest: (name: string, avg: number) => `Latest-running stop: ${name}, ${f.dec(avg, 1)} min late on average.`,
    stopNumbers: 'Show the stop-by-stop numbers',
    colStop: 'Stop',
    colLate: 'Typically late',
    colTrains: 'Trains',
    runTitle: 'How trains run',
    runIntro: 'Share of trains by how late they were on average along their journey.',
    onTime: 'On time (up to 5 min late)',
    bitLate: 'A bit late (5–15 min)',
    veryLate: 'Very late (over 15 min)',
    noArrivals: 'No arrival data.',
    overTitle: 'Over the years',
    overIntro: (p: Period) =>
      `Typical minutes late for this route's trains, for each month${p.kind === 'year' ? `; ${p.year} is picked out` : p.kind === 'month' ? `; every ${f.months[p.month - 1]} is picked out` : ''}.`,
    overAria: 'Line chart of the typical minutes late on this route in each month',
    seasonIntro: (year: number | null) => (year === null ? 'And through the year, with all the years put together.' : `And through ${year}, month by month.`),
    seasonAria: 'Bar chart of the typical minutes late on this route in each calendar month',
    weatherTitle: 'Delay and weather',
    weatherNone: (period: string) => `No kind of bad weather happened often enough along this route, ${period}, to compare.`,
    weatherIntro: "How many more of this route's trains than usual were more than 5 minutes late in each kind of weather.",
    weatherSource: 'Weather is from the nearest weather station.',
    servicesTitle: 'Train services on this route',
    colTrain: 'Train',
    colJourney: 'Journey',
    colOnTime: 'On time',
    moreNumbers: 'More numbers',
    colWorst: 'Worst 10% of trips late by',
    colCancelled: 'Cancelled',
    footnote: (period: string) =>
      `${period}. Headline numbers and the table cover the whole journeys of the trains that run this route, which may start before or continue past it; the stop-by-stop figures use each stop's own arrivals.`,
    missing: (n: number) => ` ${n} service(s) have no saved statistics.`,
    stopTip: (avg: number, trains: number) => `${f.dec(avg, 1)} min late · ${f.int(trains)} trains`,
    stopAria: 'Bar chart of the typical minutes late at each stop along the route',
  },

  trends: {
    title: 'How delays changed',
    intro: (period: string, p: Period) =>
      `Every long-distance train, ${period}.${p.kind === 'year' ? ` ${p.year} is picked out below.` : p.kind === 'month' ? ` Every ${f.months[p.month - 1]} is picked out below.` : ''}`,
    monthTitle: 'Month by month',
    monthIntro: 'Typical minutes late when trains arrived, for each month.',
    monthAria: 'Line chart of the typical minutes late in each month',
    seasonTitle: 'Through the year',
    seasonIntro: (year: number | null) =>
      year === null ? 'The same, for each calendar month, with all the years put together.' : `The same, for each calendar month of ${year}.`,
    seasonAria: (year: number | null) => `Bar chart of the typical minutes late in each calendar month${year === null ? '' : ` of ${year}`}`,
    seasonLine: (year: number | null, worst: number, worstV: number, best: number, bestV: number) =>
      `${year === null ? 'Trains run' : `In ${year} trains ran`} latest in ${f.monthIn[worst]} (${f.dec(worstV, 1)} min on average) and least late in ${f.monthIn[best]} (${f.dec(bestV, 1)} min).`,
    yearLine: (worst: number, worstV: number, best: number, bestV: number) =>
      `${worst} was the latest year (${f.dec(worstV, 1)} min on average), ${best} the least late (${f.dec(bestV, 1)} min).`,
    fewestLine: (month: string, pct: number) => `The fewest trains ran in ${f.monthTitle(month)}: ${f.pct(pct, 0)} of a typical month.`,
    badWeather: 'Late trains in bad weather',
    footnote: (arrivals: number) =>
      `Delay is the minutes late at each arrival (early arrivals count as 0), averaged over ${f.int(arrivals)} arrivals.`,
  },

  weather: {
    title: (name: string) => `${name} weather station`,
    intro: (km: number, station: string, period: string) => `${f.dec(km, 1)} km from ${station}. ${period}, at the times trains were nearby.`,
    routeNote: (temp: number | null, snow: number | null) =>
      `When this route's trains were there: average ${formatTemp(temp)}C${snow === null ? '' : `, ${formatSnow(snow)} of snow`}.`,
    closer: (name: string, km: number | null) =>
      `A closer station, ${name}${km !== null ? ` (${f.dec(km, 1)} km)` : ''}, has no train readings in the data, so this one is used.`,
    loading: 'Loading the weather…',
    failed: 'Could not load the weather. Please try again.',
    none: (period: string | null) => `No train readings at this weather station ${period === null ? 'at all' : `in ${period}`}.`,
    tooFew: (period: string, n: number) => `Too few train readings to summarise ${period}: ${f.int(n)} in total.`,
    avgTemp: 'Average temperature',
    coldest: 'Coldest',
    warmest: 'Warmest',
    deepestSnow: 'Deepest snow',
    strongestGust: 'Strongest gust of wind',
    worstVisibility: 'Worst visibility',
    noReading: 'No reading',
    noSnow: 'No snow',
    tabs: { temp: 'Temperature', snow: 'Snow', wind: 'Wind' },
    tabsAria: 'Weather by month',
    tempIntro: 'Each bar runs from the coldest to the warmest reading in that month. Months with no bar had no readings.',
    tempAxis: 'Air temperature (°C)',
    tempAria: 'Bar chart of the coldest and warmest temperature reading in each month',
    tempTip: (low: number, avg: number, high: number) => `${f.temp(low)} to ${f.temp(high)}, average ${f.temp(avg)}`,
    noReadings: 'No readings',
    snowIntro: (daysWithSnow: number, days: number) =>
      `The deepest snow measured in each month.${
        daysWithSnow > 0
          ? ` Snow lay on the ground on ${f.int(daysWithSnow)} of the ${f.int(days)} days with readings.`
          : ' There was no snow on the ground at any reading.'
      }`,
    snowAxis: 'Snow on the ground (cm)',
    snowAria: 'Bar chart of the deepest snow measured in each month',
    snowTip: (cm: number) => `${f.dec(cm, 0)} cm of snow`,
    windIntro: `The strongest gust of wind measured in each month, in metres per second (1 m/s is ${f.dec(3.6, 1)} km/h).`,
    windAxis: 'Strongest gust (m/s)',
    windAria: 'Bar chart of the strongest gust of wind measured in each month',
    windTip: (ms: number) => `${f.dec(ms, 0)} m/s (${f.dec(ms * 3.6, 0)} km/h)`,
    footnote: (readings: number, slotPct: number | null, period: string) =>
      `Based on ${f.int(readings)} readings${slotPct !== null ? ` (${f.pct(slotPct, 0)} of the 10-minute slots in ${period})` : ''}, taken when trains were nearby. Highs and lows are from those times, so a cold night with no trains is not in them. If this station does not measure something, the data takes it from the next closest one.`,
  },

  predictor: {
    title: (station: string) => `AI forecast: ${station}`,
    intro: (period: string) =>
      `It learned from the trains that stopped here in ${period} and the weather they had. Pick a month, a day and a time to see how likely a train is to be late or cancelled.`,
    loading: 'Loading the model…',
    failed: 'Could not load the model. Please try again.',
    noModel: 'No model for this station.',
    month: 'Month',
    day: 'Day',
    dayAria: 'Day of the week',
    time: 'Time',
    timeAria: 'Time of day',
    weather: 'Weather',
    noWeather: "This station's model does not use the weather.",
    chance: 'chance that a train here runs late (by 1 min or more) or is cancelled',
    change: (chance: number, usual: number) => {
      const d = Math.round(chance - usual)
      if (d === 0) return `About the same as usual here (${Math.round(usual)}%)`
      return `${Math.abs(d)} ${Math.abs(d) === 1 ? 'point' : 'points'} ${d > 0 ? 'higher' : 'lower'} than usual here (${Math.round(usual)}%)`
    },
    effect: (effect: number) => {
      const n = Math.round(Math.abs(effect))
      return Math.abs(effect) < 1 ? 'your weather hardly changes it' : `your weather ${effect > 0 ? 'adds' : 'takes off'} ${n} ${n === 1 ? 'point' : 'points'}`
    },
    rough: 'Rough guess: few or no trains stopped here then.',
    /** The footnote under the answer. `weather`: the visitor's weather, the trains' own, or a model without weather. */
    footnote: (o: { few: boolean; station: string; period: string; day: number; month: number; time: string; weather: 'picked' | 'real' | 'none'; knows: string; auc: number }) =>
      `${
        o.few
          ? `The AI model's answer for a typical train at ${o.station} then`
          : `The AI model's average answer for the ${o.period} trains at ${o.station} on ${f.dayPlural[o.day]} in ${f.monthIn[o.month]} around ${o.time}`
      }${
        o.weather === 'picked' ? ', given your weather (the last 3 days of temperature move with it).' : o.weather === 'real' ? ', with the weather they had.' : '.'
      } It knows ${o.knows}, and tells a late train from an on-time one about ${o.auc} times in 10. A guess from past patterns, not a timetable.`,
    knows: {
      S1: 'only the time, the day and the month (no weather)',
      S5: 'the time, the day, the month and the last 3 days of weather',
      S11: 'the time, the day, the month, the last 3 days of weather and the type of weather (rain, snow, fog…)',
    } as Record<string, string>,
    tempAria: 'Air temperature',
    snowAria: 'Snow depth',
    snowValue: (cm: number) => `${cm} cm of snow`,
    noSnowMonth: (month: number) => `No snow on the ground in ${f.monthIn[month]}`,
    rangeNote: (picked: boolean, low: number, high: number, snowMax: number | null, month: number) =>
      `${picked ? 'Your weather' : "Now: each train's real weather. Move a slider to pick your own"} (${f.temp(low)} to ${f.temp(high)}${
        snowMax !== null ? `, 0 to ${snowMax} cm of snow` : ''
      }, as seen in ${f.monthIn[month]}).`,
    useReal: 'Use the real weather',
    dayStrip: (usual: number) =>
      `Through the day (tap a bar to pick its time). Faint bars: few or no trains. Dashed line: the usual ${f.pct(Math.round(usual), 0)}.`,
  },

  live: {
    typical: 'A typical trip, built from averages',
    ready: 'Getting ready…',
    lateAvg: (v: number) => `${f.dec(v, 1)} min late on average`,
    stop: 'Stop',
    progress: (a: number, b: number) => `Stop ${a} of ${b}`,
    delayTitle: 'Delay at each station, average',
    delayAria: 'Line chart of the average delay at each station along the route, drawn as the train moves',
    weatherTitle: 'Temperature and snow along the way',
    weatherAria: 'Chart of temperature and snow depth along the route, drawn as the train moves',
    temperature: 'Temperature',
    snowDepth: 'Snow depth',
    tabDelay: 'Delay',
    tabWeather: 'Weather',
    tabsAria: 'Chart',
  },

  phone: {
    title: 'Trains in Finland',
    periodAria: (p: string) => `Period shown: ${p}. Change it in Overview`,
    dockAria: 'Panels',
    route: 'Route',
    station: 'Station',
    overview: 'Overview',
    sheetRoute: 'Find a route',
    sheetStation: 'Station',
    sheetOverview: 'Overview',
    hideSheet: (label: string) => `Hide ${label.toLowerCase()}`,
    showFinder: 'Show the route finder',
    details: (paths: number) => (paths > 1 ? `Details (${paths} ways)` : 'Details'),
  },

  footer: {
    builtBy: 'Built by',
    about: 'About',
    aboutLong: 'About this site',
  },

  about: {
    title: 'About this site',
    intro:
      'This site is a window into FI-TW, an open dataset that joins every long-distance train in Finland with the weather at the nearest weather station. The dataset is published in Open Research Europe, and the paper describes it in full.',
    paperLabel: 'The paper',
    readPaper: 'Read the paper',
    authorLead: 'Made by',
    author:
      'as part of doctoral research at the University of Oulu, Centre for Wireless Communications (CWC).',
    profile: 'Researcher profile',
    fundingTitle: 'Funding',
    funding:
      'This research was partially supported in Finland and Sweden by the European Union through the Interreg Aurora project ENSURE-6G (Grant Number: 20361812); and in Finland by the Research Council of Finland through the project 6G Flagship (Grant Number: 369116).',
    dataTitle: 'Data',
    data: 'Trains: Fintraffic (Digitraffic). Weather: Finnish Meteorological Institute. Both under CC BY 4.0.',
    partnersTitle: 'Partners',
    uoulu: 'University of Oulu',
    uouluHref: 'https://www.oulu.fi/en',
    interreg: 'Interreg Aurora, co-funded by the European Union',
    oulu2026: 'Oulu2026, European Capital of Culture',
    oulu2026Href: 'https://oulu2026.eu/en',
  },
})

export type Dict = ReturnType<typeof en>
