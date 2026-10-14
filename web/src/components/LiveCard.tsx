import { formatSnow, formatTemp } from '../lib/weatherFormat'

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
 * is: a time-lapse of a typical trip built from January averages, not real time.
 */
export default function LiveCard({ stopName, delay, temp, snow, reached, total, onStop }: LiveCardProps) {
  const figures = [
    delay === null ? null : `${delay.toFixed(1)} min late on average`,
    temp === null ? null : `${formatTemp(temp)}C`,
    snow === null ? null : `${formatSnow(snow)} of snow`,
  ].filter((f): f is string => f !== null)

  return (
    <div className="pointer-events-auto absolute top-5 left-[calc(clamp(300px,26vw,400px)+40px)] z-30 w-[min(380px,calc(100vw-460px))] rounded-[10px] border border-(--line) bg-(--surface) px-[18px] py-3.5 backdrop-blur-[8px]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm text-(--muted)">A typical trip, January averages</div>
          <div className="font-board mt-0.5 truncate text-[28px] leading-tight font-semibold text-(--text)">
            {stopName ?? 'Getting ready…'}
          </div>
          <div className="min-h-5 text-[15px] text-(--muted)">{figures.join(', ')}</div>
        </div>
        <button
          type="button"
          onClick={onStop}
          className="min-h-11 shrink-0 cursor-pointer rounded-lg border border-(--line) px-4 text-[15px] text-(--text) hover:bg-[rgba(156,195,232,0.12)]"
        >
          Stop
        </button>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[rgba(156,195,232,0.18)]">
          <div
            className="h-full rounded-full bg-(--ice) transition-[width] duration-[900ms] ease-out"
            style={{ width: `${total > 0 ? Math.round((reached / total) * 100) : 0}%` }}
          />
        </div>
        <div className="text-sm text-(--muted)">Stop {Math.max(reached, 0)} of {total}</div>
      </div>
    </div>
  )
}
