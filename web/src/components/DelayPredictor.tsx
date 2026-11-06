import { useEffect, useState, type ReactNode } from 'react'
import { useLang } from '../i18n'
import { chanceAt, fewAt, nowPick, rangeValues, shifted, slotMinutes, weatherShift, type PickedWeather } from '../lib/predictor'
import type { PredictorFile, PredictorWeatherMonth } from '../lib/types'

interface DelayPredictorProps {
  code: string
  stationName: string
  /** predictor.json; null while it is still loading. */
  file: PredictorFile | null
  loadFailed: boolean
  onClose: () => void
}

const chip = (on: boolean) =>
  `min-h-11 cursor-pointer rounded-full border px-1 py-1 text-[15px] ${
    on ? 'border-(--card-ink) bg-(--card-ink) text-white' : 'border-[rgba(0,47,108,0.3)] text-(--card-ink-2) hover:bg-[rgba(0,47,108,0.1)]'
  }`

/**
 * "Ask the AI model": the visitor picks a month, a day and a time, and the station's trained model
 * (the paper's best configuration) gives the chance that a train is disrupted -- late by 1 min or
 * more, or cancelled. Every answer was computed ahead of time by scripts/build_predictor.py, with
 * the weather set to a typical day of that month. Same shell and Esc handling as
 * WeatherStationDetails.
 */
export default function DelayPredictor({ code, stationName, file, loadFailed, onClose }: DelayPredictorProps) {
  const { t, f } = useLang()
  const p = t.predictor
  const step = file?.stepMinutes ?? 30
  const slotLabel = (s: number) => f.clock(slotMinutes(s, step))
  const [pick, setPick] = useState(() => nowPick(step))
  // null = the real weather the trains had; a value once the visitor moves a weather slider.
  const [weather, setWeather] = useState<PickedWeather | null>(null)
  const st = file?.stations[code] ?? null
  const wm = st?.weather?.[pick.month - 1]
  const shift = weatherShift(wm, weather)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  const slots = (24 * 60) / step
  const slot = Math.min(pick.slot, slots - 1)
  const realChance = st ? chanceAt(st, pick.month, pick.day, slot) : null
  const chance = realChance === null ? null : shifted(realChance, shift)
  const effect = chance !== null && realChance !== null ? chance - realChance : 0
  const fewTrains = st ? fewAt(st, pick.month, pick.day, slot) : false
  const dayCurve = st ? st.p[pick.month - 1][pick.day].map((v) => shifted(v / 10, shift)) : []
  const dayFew = st ? st.few[pick.month - 1][pick.day].map((v) => v === 1) : []

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(2,6,13,0.55)] p-4 max-md:p-0" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="predictor-title"
        onClick={(e) => e.stopPropagation()}
        className="card relative max-h-[94vh] w-[min(780px,100%)] overflow-y-auto !rounded-xl !px-6 !py-4!shadow-[0_20px_60px_rgba(0,0,0,0.5)] max-md:h-full max-md:max-h-none max-md:w-full max-md:!rounded-none max-md:!px-4 max-md:!pt-[calc(14px+env(safe-area-inset-top))] max-md:!pb-[calc(24px+env(safe-area-inset-bottom))]"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={t.close}
          className="absolute top-2 right-2 flex h-11 w-11 cursor-pointer items-center justify-center text-lg text-(--card-ink-3) hover:text-(--card-ink) max-md:fixed max-md:top-[calc(6px+env(safe-area-inset-top))] max-md:right-2 max-md:z-10 max-md:rounded-full max-md:bg-(--card) max-md:text-(--card-ink) max-md:shadow-[0_2px_10px_rgba(0,0,0,0.25)]"
        >
          ✕
        </button>

        <h2 id="predictor-title" className="font-board m-0 pr-10 text-[32px] leading-tight font-semibold">
          {p.title(stationName)}
        </h2>

        {!st && (
          <p className="mt-6 mb-2 text-[15px] text-(--card-ink-2)">
            {loadFailed ? p.failed : file ? p.noModel : p.loading}
          </p>
        )}

        {st && file && chance !== null && (
          <>
            {/* What this is, before the controls: a visitor may arrive here without any context. */}
            <p className="m-0 mt-1 text-[15px] text-(--card-ink-2)">{p.intro(file.period.replace('-', '–'))}</p>
            <div className="mt-2 flex flex-col gap-1.5">
              <Field label={p.month}>
                {/* One joined bar: a single choice out of twelve, read as one control. */}
                <div
                  role="group"
                  aria-label={p.month}
                  className="grid grid-cols-6 overflow-hidden rounded-lg border border-[rgba(0,47,108,0.3)] bg-[rgba(255,255,255,0.3)] sm:grid-cols-12"
                >
                  {f.monthsShort.map((m, i) => {
                    const on = pick.month === i + 1
                    return (
                      <button
                        key={m}
                        type="button"
                        aria-pressed={on}
                        onClick={() => { setPick((p) => ({ ...p, month: i + 1 })); setWeather(null) }}
                        className={`min-h-11 cursor-pointer border-[rgba(0,47,108,0.18)] text-[15px] not-last:border-r max-sm:nth-[6]:border-r-0 max-sm:nth-[-n+6]:border-b ${
                          on ? 'bg-(--card-ink) font-medium text-white' : 'text-(--card-ink-2) hover:bg-[rgba(0,47,108,0.1)]'
                        }`}
                      >
                        {m}
                      </button>
                    )
                  })}
                </div>
              </Field>
              <Field label={p.day}>
                {/* Separate round pills, the weekend set a little apart. */}
                <div role="group" aria-label={p.dayAria} className="flex items-center gap-1 sm:gap-1.5">
                  {f.dayShort.map((d, i) => (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={pick.day === i}
                      onClick={() => setPick((p) => ({ ...p, day: i }))}
                      className={`${chip(pick.day === i)} min-w-0 flex-1 !px-0 sm:w-[54px] sm:flex-none ${i === 5 ? 'ml-2 sm:ml-3' : ''}`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label={p.time}>
                <div className="flex items-center gap-4">
                  <span className="font-board w-[84px] text-[34px] leading-none font-semibold tabular-nums">{slotLabel(slot)}</span>
                  <input
                    type="range"
                    min={0}
                    max={slots - 1}
                    step={1}
                    value={slot}
                    aria-label={p.timeAria}
                    aria-valuetext={slotLabel(slot)}
                    onChange={(e) => setPick((p) => ({ ...p, slot: Number(e.target.value) }))}
                    className="h-11 flex-1 cursor-pointer accent-(--card-ink)"
                  />
                </div>
              </Field>
              <Field label={p.weather}>
                {wm ? (
                  <WeatherControls month={wm} monthIndex={pick.month - 1} value={weather} onChange={setWeather} />
                ) : (
                  <p className="m-0 flex min-h-11 items-center text-[15px] text-(--card-ink-2)">{p.noWeather}</p>
                )}
              </Field>
            </div>

            <div className={`mt-2 border-t border-(--card-line) pt-2.5 ${fewTrains ? 'opacity-60' : ''}`}>
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <span data-chance className="font-board text-[56px] leading-none font-semibold tabular-nums">{f.pct(Math.round(chance), 0)}</span>
                <span className="text-[17px] leading-snug">{p.chance}</span>
              </div>
              <p className="m-0 mt-1.5 text-[17px]">
                <span className="font-medium">{p.change(chance, st.usualPct)}</span>
                {weather && (
                  <span className="text-(--card-ink-2)">
                    {' · '}
                    {p.effect(effect)}
                  </span>
                )}
              </p>
            </div>
            {fewTrains && (
              <p className="m-0 mt-0.5 text-[15px] text-(--card-ink-2)">{p.rough}</p>
            )}

            <DayStrip
              values={dayCurve}
              few={dayFew}
              usual={st.usualPct}
              selected={slot}
              slotLabel={slotLabel}
              onPick={(s) => setPick((prev) => ({ ...prev, slot: s }))}
            />

            <p className="m-0 mt-2 text-sm text-(--card-ink-3)">
              {p.footnote({
                few: fewTrains,
                station: stationName,
                period: file.period.replace('-', '–'),
                day: pick.day,
                month: pick.month - 1,
                time: slotLabel(slot),
                weather: weather ? 'picked' : st.weather ? 'real' : 'none',
                knows: p.knows[st.scenario] ?? st.uses,
                auc: Math.round(st.testAuc * 10),
              })}
            </p>
          </>
        )}
      </div>
    </div>
  )
}

interface WeatherControlsProps {
  month: PredictorWeatherMonth
  /** 0 = January. */
  monthIndex: number
  value: PickedWeather | null
  onChange: (w: PickedWeather | null) => void
}

/** Temperature and snow depth sliders over the month's real range. Untouched they sit at the
 *  month's typical values and the answer uses the real weather; moving one sets both. */
function WeatherControls({ month, monthIndex, value, onChange }: WeatherControlsProps) {
  const { t, f } = useLang()
  const p = t.predictor
  // Slider values are whole degrees (2 °C steps), so rounding changes nothing; a real minus sign.
  const degrees = f.temp
  const temps = rangeValues(month.temps)
  const snows = rangeValues(month.snows)
  const cur = value ?? { temp: month.temp0, snow: month.snow0 }
  const ti = Math.max(0, temps.indexOf(cur.temp))
  const si = Math.max(0, snows.indexOf(cur.snow))
  const figure = `font-board w-[76px] shrink-0 text-[26px] leading-none font-semibold tabular-nums ${value ? '' : 'text-(--card-ink-3)'}`
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-col gap-2 sm:flex-row sm:gap-5">
        <label className="flex min-w-0 flex-1 items-center gap-3" title={p.tempAria}>
          <span className="flex shrink-0 items-center gap-1.5">
            <ThermometerIcon />
            <span className={figure}>{degrees(cur.temp)}</span>
          </span>
          <input
            type="range"
            min={0}
            max={temps.length - 1}
            value={ti}
            aria-label={p.tempAria}
            aria-valuetext={degrees(cur.temp)}
            onChange={(e) => onChange({ ...cur, temp: temps[Number(e.target.value)] })}
            className="h-11 min-w-0 flex-1 cursor-pointer accent-(--card-ink)"
          />
        </label>
        {snows.length > 1 ? (
          <label className="flex min-w-0 flex-1 items-center gap-3" title={p.snowAria}>
            <span className="flex shrink-0 items-center gap-1.5">
              <SnowflakeIcon />
              <span className={figure}>{cur.snow} cm</span>
            </span>
            <input
              type="range"
              min={0}
              max={snows.length - 1}
              value={si}
              aria-label={p.snowAria}
              aria-valuetext={p.snowValue(cur.snow)}
              onChange={(e) => onChange({ ...cur, snow: snows[Number(e.target.value)] })}
              className="h-11 min-w-0 flex-1 cursor-pointer accent-(--card-ink)"
            />
          </label>
        ) : (
          <span className="flex min-h-11 flex-1 items-center text-[15px] text-(--card-ink-2)">{p.noSnowMonth(monthIndex)}</span>
        )}
      </div>
      <div className="-mt-1 flex items-center justify-between gap-3 text-sm text-(--card-ink-3)">
        <span>
          {p.rangeNote(value !== null, temps[0], temps[temps.length - 1], snows.length > 1 ? snows[snows.length - 1] : null, monthIndex)}
        </span>
        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="-my-2.5 min-h-11 shrink-0 cursor-pointer px-1 text-[15px] font-medium text-(--card-ink) underline underline-offset-2"
          >
            {p.useReal}
          </button>
        )}
      </div>
    </div>
  )
}

/** Small line icons that say which weather slider is which (temperature, snow depth). Decorative:
 *  the sliders carry their names in aria-label, and the row's title shows them on hover. */
const iconProps = {
  width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
  strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  'aria-hidden': true, className: 'shrink-0 text-(--card-ink-2)',
}

function ThermometerIcon() {
  return (
    <svg {...iconProps}>
      <path d="M10 13.5V5a2 2 0 0 1 4 0v8.5a4 4 0 1 1-4 0Z" />
      <path d="M12 9v7.5" />
      <circle cx="12" cy="17" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  )
}

function SnowflakeIcon() {
  return (
    <svg {...iconProps}>
      <path d="M12 2.5v19M3.8 7.25l16.4 9.5M3.8 16.75l16.4-9.5" />
      <path d="m9.5 4 2.5 2 2.5-2M9.5 20l2.5-2 2.5 2" />
      <path d="m4.6 10.4 3.1-.6-1-3M19.4 13.6l-3.1.6 1 3" />
      <path d="m4.6 13.6 3.1.6-1 3M19.4 10.4l-3.1-.6 1-3" />
    </svg>
  )
}

/** One labelled input row: the label sits left of the control on wide screens, above it on phones. */
function Field({ label, children }: { label: string; children: ReactNode }) {
  // Label lined up with the first line of the control (a 44 px row), even when the control wraps.
  // The Finnish labels are longer ("KUUKAUSI"), so the label column is wider there.
  const { lang } = useLang()
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-3">
      <span className={`${lang === 'fi' ? 'w-[80px]' : 'w-[62px]'} shrink-0 text-[13px] font-medium tracking-[0.08em] text-(--card-ink-3) uppercase sm:leading-11`}>{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

interface DayStripProps {
  values: number[]
  /** Slots with few or no real trains: drawn faint. */
  few: boolean[]
  usual: number
  selected: number
  /** "08:30" / "08.30" for a slot index. */
  slotLabel: (slot: number) => string
  onPick: (slot: number) => void
}

/** The chance through the picked day, one bar per time slot; a bar is also a way to pick the time. */
function DayStrip({ values, few, usual, selected, slotLabel, onPick }: DayStripProps) {
  const { t, f } = useLang()
  const ticks = [0, 6, 12, 18, 24]
  return (
    <div className="mt-2">
      <p className="m-0 mb-1 text-[15px] text-(--card-ink-2)">{t.predictor.dayStrip(usual)}</p>
      <div className="relative h-[56px]">
        <div className="absolute inset-0 flex items-end gap-px">
          {values.map((v, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onPick(i)}
              aria-label={`${slotLabel(i)}: ${f.pct(Math.round(v), 0)}`}
              className="flex h-full flex-1 cursor-pointer items-end"
            >
              <span
                className="block w-full rounded-t-[2px]"
                style={{
                  height: `${v}%`,
                  background: i === selected ? '#002f6c' : few[i] ? 'rgba(0,47,108,0.14)' : 'rgba(0,47,108,0.38)',
                }}
              />
            </button>
          ))}
        </div>
        <div className="pointer-events-none absolute right-0 left-0 border-t-2 border-dashed border-(--card-ink-2)" style={{ bottom: `${usual}%` }} />
      </div>
      <div className="relative mt-1 h-5 text-sm text-(--card-ink-3)">
        {ticks.map((h) => (
          <span
            key={h}
            className={`absolute tabular-nums ${h === 0 ? '' : h === 24 ? '-translate-x-full' : '-translate-x-1/2'}`}
            style={{ left: `${(h / 24) * 100}%` }}
          >
            {f.clock(h * 60)}
          </span>
        ))}
      </div>
    </div>
  )
}
