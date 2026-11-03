import { useEffect, useState, type ReactNode } from 'react'
import { DAY_SHORT, changeWords, chanceAt, fewAt, nowPick, slotLabel } from '../lib/predictor'
import { MONTH_SHORT } from '../lib/trends'
import type { PredictorFile } from '../lib/types'

interface DelayPredictorProps {
  code: string
  stationName: string
  /** predictor.json; null while it is still loading. */
  file: PredictorFile | null
  loadFailed: boolean
  onClose: () => void
}

const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DAY_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
// What each feature scenario of the paper gives the model, in plain words.
const KNOWS: Record<string, string> = {
  S1: 'only the time, the day and the month (no weather)',
  S5: 'the time, the day, the month and the last 3 days of weather',
  S11: 'the time, the day, the month, the last 3 days of weather and the type of weather (rain, snow, fog…)',
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
  const step = file?.stepMinutes ?? 30
  const [pick, setPick] = useState(() => nowPick(step))
  const st = file?.stations[code] ?? null

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
  const chance = st ? chanceAt(st, pick.month, pick.day, slot) : null
  const fewTrains = st ? fewAt(st, pick.month, pick.day, slot) : false
  const dayCurve = st ? st.p[pick.month - 1][pick.day].map((v) => v / 10) : []
  const dayFew = st ? st.few[pick.month - 1][pick.day].map((v) => v === 1) : []

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(2,6,13,0.55)] p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="predictor-title"
        onClick={(e) => e.stopPropagation()}
        className="card relative max-h-[94vh] w-[min(780px,100%)] overflow-y-auto !rounded-xl !px-6 !py-5 !shadow-[0_20px_60px_rgba(0,0,0,0.5)]"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-2 right-2 flex h-11 w-11 cursor-pointer items-center justify-center text-lg text-(--card-ink-3) hover:text-(--card-ink)"
        >
          ✕
        </button>

        <h2 id="predictor-title" className="font-board m-0 pr-10 text-[32px] leading-tight font-semibold">
          Ask the AI model: {stationName}
        </h2>
        <p className="m-0 mt-0.5 text-[15px] text-(--card-ink-2)">
          Pick a month, a day and a time. A model trained on this station's trains says how likely a train is to run
          late.
        </p>

        {!st && (
          <p className="mt-6 mb-2 text-[15px] text-(--card-ink-2)">
            {loadFailed ? 'Could not load the model. Please try again.' : file ? 'No model for this station.' : 'Loading the model…'}
          </p>
        )}

        {st && file && chance !== null && (
          <>
            <div className="mt-4 flex flex-col gap-3.5">
              <Field label="Month">
                {/* One joined bar: a single choice out of twelve, read as one control. */}
                <div
                  role="group"
                  aria-label="Month"
                  className="grid grid-cols-6 overflow-hidden rounded-lg border border-[rgba(0,47,108,0.3)] bg-[rgba(255,255,255,0.3)] sm:grid-cols-12"
                >
                  {MONTH_SHORT.map((m, i) => {
                    const on = pick.month === i + 1
                    return (
                      <button
                        key={m}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setPick((p) => ({ ...p, month: i + 1 }))}
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
              <Field label="Day">
                {/* Separate round pills, the weekend set a little apart. */}
                <div role="group" aria-label="Day of the week" className="flex items-center gap-1 sm:gap-1.5">
                  {DAY_SHORT.map((d, i) => (
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
              <Field label="Time">
                <div className="flex items-center gap-4">
                  <span className="font-board w-[84px] text-[34px] leading-none font-semibold tabular-nums">{slotLabel(slot, step)}</span>
                  <input
                    type="range"
                    min={0}
                    max={slots - 1}
                    step={1}
                    value={slot}
                    aria-label="Time of day"
                    aria-valuetext={slotLabel(slot, step)}
                    onChange={(e) => setPick((p) => ({ ...p, slot: Number(e.target.value) }))}
                    className="h-11 flex-1 cursor-pointer accent-(--card-ink)"
                  />
                </div>
              </Field>
            </div>

            <div className={`mt-3 border-t border-(--card-line) pt-3 ${fewTrains ? 'opacity-60' : ''}`}>
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <span className="font-board text-[64px] leading-none font-semibold tabular-nums">{Math.round(chance)}%</span>
                <span className="max-w-[360px] text-[17px] leading-snug">
                  chance that a train here runs late (by 1 min or more) or is cancelled
                </span>
              </div>
              <p className="m-0 mt-1.5 text-[17px] font-medium">{changeWords(chance, st.usualPct)}</p>
            </div>
            {fewTrains && (
              <p className="m-0 mt-1 text-[15px] text-(--card-ink-2)">
                Few or no trains stopped here at this time, so this is a rough guess.
              </p>
            )}

            <DayStrip
              values={dayCurve}
              few={dayFew}
              usual={st.usualPct}
              selected={slot}
              step={step}
              onPick={(s) => setPick((p) => ({ ...p, slot: s }))}
            />

            <p className="m-0 mt-3 text-sm text-(--card-ink-3)">
              {fewTrains
                ? `Few trains stopped at ${stationName} on ${DAY_LONG[pick.day]}s in ${MONTH_LONG[pick.month - 1]} around ${slotLabel(slot, step)}, so this is the AI model's answer for a typical train then, in that month's usual weather.`
                : `The AI model's average answer for the trains that stopped at ${stationName} on ${DAY_LONG[pick.day]}s in ${MONTH_LONG[pick.month - 1]} around ${slotLabel(slot, step)} in ${file.period.replace('-', '–')}, with the weather they had.`}{' '}
              It knows {KNOWS[st.scenario] ?? st.uses}. Shown one train that ran late and one that did not, it picks the late one
              about {Math.round(st.testAuc * 10)} times in 10. A guess from past patterns, not a timetable.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

/** One labelled input row: the label sits left of the control on wide screens, above it on phones. */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
      <span className="w-[62px] shrink-0 text-[13px] font-medium tracking-[0.08em] text-(--card-ink-3) uppercase">{label}</span>
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
  step: number
  onPick: (slot: number) => void
}

/** The chance through the picked day, one bar per time slot; a bar is also a way to pick the time. */
function DayStrip({ values, few, usual, selected, step, onPick }: DayStripProps) {
  const ticks = [0, 6, 12, 18, 24]
  return (
    <div className="mt-4">
      <p className="m-0 mb-1.5 text-[15px] text-(--card-ink-2)">
        Through the day (tap a bar to pick its time). Faint bars: few or no trains. Dashed line: the usual{' '}
        {Math.round(usual)}%.
      </p>
      <div className="relative h-[96px]">
        <div className="absolute inset-0 flex items-end gap-px">
          {values.map((v, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onPick(i)}
              aria-label={`${slotLabel(i, step)}: ${Math.round(v)}%`}
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
            {String(h).padStart(2, '0')}:00
          </span>
        ))}
      </div>
    </div>
  )
}
