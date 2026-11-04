import { forwardRef, useState } from 'react'
import { useLang } from '../../i18n'
import type { DelayProfile, LiveProfile } from '../../lib/liveProfile'
import LiveChart from '../LiveChart'
import LiveDelayChart from '../LiveDelayChart'

interface LiveChartsProps {
  delay: DelayProfile | null
  weather: LiveProfile | null
}

/** Phone layout, Play the journey: the two charts share one box at the bottom of the screen, with a
 *  tab for each, so the map keeps the middle. The chart cards themselves are the desktop ones. */
const LiveCharts = forwardRef<HTMLDivElement, LiveChartsProps>(function LiveCharts({ delay, weather }, ref) {
  const { t } = useLang()
  const [tab, setTab] = useState<'delay' | 'weather'>('delay')
  const tabs = [
    { id: 'delay' as const, label: t.live.tabDelay, on: delay !== null },
    { id: 'weather' as const, label: t.live.tabWeather, on: weather !== null },
  ].filter((x) => x.on)
  const shown = tabs.some((x) => x.id === tab) ? tab : tabs[0]?.id
  if (!shown) return null
  return (
    <div ref={ref} className="pointer-events-auto absolute inset-x-2 z-30 flex flex-col gap-1.5" style={{ bottom: 'calc(8px + env(safe-area-inset-bottom))' }}>
      {tabs.length > 1 && (
        <div role="tablist" aria-label={t.live.tabsAria} className="flex gap-1.5">
          {tabs.map((x) => (
            <button
              key={x.id}
              type="button"
              role="tab"
              aria-selected={shown === x.id}
              onClick={() => setTab(x.id)}
              className={`min-h-9 cursor-pointer rounded-full border px-4 text-[15px] backdrop-blur-[8px] ${
                shown === x.id ? 'border-(--text) bg-(--surface) text-(--text)' : 'border-(--line) bg-(--surface) text-(--muted)'
              }`}
            >
              {x.label}
            </button>
          ))}
        </div>
      )}
      {shown === 'delay' && delay && <LiveDelayChart profile={delay} chartHeight={112} title={false} />}
      {shown === 'weather' && weather && <LiveChart profile={weather} chartHeight={112} title={false} />}
    </div>
  )
})

export default LiveCharts
