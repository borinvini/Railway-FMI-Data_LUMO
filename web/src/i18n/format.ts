/** Numbers, dates and calendar names for each language. English output is exactly what the site
 *  showed before Finnish was added (toFixed, en-GB thousands); Finnish follows the Finnish style:
 *  decimal comma, a space before % and °C, a no-break space between thousands. */

export type Lang = 'en' | 'fi'

const NBSP = ' '
const MINUS = '−'

export interface Fmt {
  lang: Lang
  /** Chart.js `locale` for axis numbers: undefined keeps the browser's (what English always used). */
  chartLocale: string | undefined
  /** Whole number with thousands separators: 612,614 / 612 614. */
  int: (n: number) => string
  /** Fixed decimals: 4.2 / 4,2. */
  dec: (v: number, digits: number) => string
  /** Percent: 83% / 83 %. */
  pct: (v: number, digits: number) => string
  /** Rounded °C with a real minus sign and no "−0": −3°C / −3 °C. */
  temp: (t: number) => string
  /** A day: 3 Jan 2019 / 3.1.2019. */
  date: (iso: string) => string
  /** "08:30" / "08.30". */
  clock: (minutes: number) => string
  months: string[]
  monthsShort: string[]
  /** "in January" form, used inside sentences (fi: "tammikuussa"); English has no case, so it is the name. */
  monthIn: string[]
  /** Monday first, like the predictor's days. */
  dayShort: string[]
  dayLong: string[]
  /** "on Mondays" (en: "Mondays"; fi: "maanantaisin"). */
  dayPlural: string[]
  /** "March 2020" / "maaliskuu 2020" for "2020-03". */
  monthTitle: (m: string) => string
}

const EN_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const EN_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

const FI_MONTHS = ['tammikuu', 'helmikuu', 'maaliskuu', 'huhtikuu', 'toukokuu', 'kesäkuu', 'heinäkuu', 'elokuu', 'syyskuu', 'lokakuu', 'marraskuu', 'joulukuu']
const FI_DAYS = ['maanantai', 'tiistai', 'keskiviikko', 'torstai', 'perjantai', 'lauantai', 'sunnuntai']

const pad2 = (n: number) => String(n).padStart(2, '0')
const roundedDegrees = (t: number) => {
  const r = Math.round(t)
  return `${r < 0 ? MINUS : ''}${Math.abs(r)}`
}
const monthOf = (m: string) => Number(m.slice(5, 7)) - 1

function english(): Fmt {
  return {
    lang: 'en',
    chartLocale: undefined,
    int: (n) => n.toLocaleString('en-GB'),
    dec: (v, d) => v.toFixed(d),
    pct: (v, d) => `${v.toFixed(d)}%`,
    temp: (t) => `${roundedDegrees(t)}°C`,
    date: (iso) =>
      new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }),
    clock: (min) => `${pad2(Math.floor(min / 60))}:${pad2(min % 60)}`,
    months: EN_MONTHS,
    monthsShort: EN_MONTHS.map((m) => m.slice(0, 3)),
    monthIn: EN_MONTHS,
    dayShort: EN_DAYS.map((d) => d.slice(0, 3)),
    dayLong: EN_DAYS,
    dayPlural: EN_DAYS.map((d) => `${d}s`),
    monthTitle: (m) => `${EN_MONTHS[monthOf(m)]} ${m.slice(0, 4)}`,
  }
}

function finnish(): Fmt {
  const dec = (v: number, d: number) => v.toFixed(d).replace('.', ',').replace('-', MINUS)
  return {
    lang: 'fi',
    chartLocale: 'fi-FI',
    int: (n) => n.toLocaleString('fi-FI'),
    dec,
    pct: (v, d) => `${dec(v, d)}${NBSP}%`,
    temp: (t) => `${roundedDegrees(t)}${NBSP}°C`,
    date: (iso) => {
      const [y, m, d] = iso.split('-').map(Number)
      return `${d}.${m}.${y}`
    },
    clock: (min) => `${pad2(Math.floor(min / 60))}.${pad2(min % 60)}`,
    months: FI_MONTHS,
    monthsShort: ['tammi', 'helmi', 'maalis', 'huhti', 'touko', 'kesä', 'heinä', 'elo', 'syys', 'loka', 'marras', 'joulu'],
    monthIn: FI_MONTHS.map((m) => `${m}ssa`),
    dayShort: ['ma', 'ti', 'ke', 'to', 'pe', 'la', 'su'],
    dayLong: FI_DAYS,
    dayPlural: ['maanantaisin', 'tiistaisin', 'keskiviikkoisin', 'torstaisin', 'perjantaisin', 'lauantaisin', 'sunnuntaisin'],
    monthTitle: (m) => `${FI_MONTHS[monthOf(m)]} ${m.slice(0, 4)}`,
  }
}

export const makeFmt = (lang: Lang): Fmt => (lang === 'fi' ? finnish() : english())
