import { useLang } from '../i18n'

interface LiveCardProps {
  /** The station the train is at (or last left); null before it has started. */
  stopName: string | null
  delay: number | null
  temp: number | null
  snow: number | null
  /** Passenger stations reached so far, and how many there are. */
  reached: number
  total: number
  onStop: () => void
}

/**
 * The now-playing card for a Live run: where the train is and that stop's figures, as the quick
 * read from across the room (the markers on the map stay the main thing). Honest about what this
 * is: a time-lapse of a typical trip built from averages, not real time.
 */
export default function LiveCard({ stopName, delay, temp, snow, reached, total, onStop }: LiveCardProps) {
  const { t } = useLang()
  const figures = [
    delay === null ? null : t.live.lateAvg(delay),
    temp === null ? null : t.pinTemp(temp),
    snow === null ? null : t.snowOf(snow),
  ].filter((x): x is string => x !== null)

  return (
    <div className="pointer-events-auto shrink-0 rounded-[10px] border border-(--line) bg-(--surface) px-(--live-pad) py-3.5 backdrop-blur-[8px]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-(length:--live-small) text-(--muted)">{t.live.typical}</div>
          <div className="font-board mt-0.5 truncate text-(length:--live-name) leading-tight font-semibold text-(--text)">
            {stopName ?? t.live.ready}
          </div>
          <div className="min-h-5 text-(length:--live-body) text-(--muted)">{figures.join(', ')}</div>
        </div>
        <button
          type="button"
          onClick={onStop}
          className="min-h-11 shrink-0 cursor-pointer rounded-lg border border-(--line) px-4 text-(length:--live-body) text-(--text) hover:bg-[rgba(156,195,232,0.12)]"
        >
          {t.live.stop}
        </button>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[rgba(156,195,232,0.18)]">
          <div
            className="h-full rounded-full bg-(--ice) transition-[width] duration-[900ms] ease-out"
            style={{ width: `${total > 0 ? Math.round((reached / total) * 100) : 0}%` }}
          />
        </div>
        <div className="text-(length:--live-small) text-(--muted)">{t.live.progress(Math.max(reached, 0), total)}</div>
      </div>
    </div>
  )
}
