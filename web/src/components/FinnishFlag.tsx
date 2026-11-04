import { useLang } from '../i18n'

/** Flag of Finland: Pantone 294 C blue (#002F6C) Nordic cross on white, 18:11 proportions,
 *  cross arms 3 units wide (vertical bar at x=5, horizontal bar at y=4). */
export default function FinnishFlag({ className, decorative = false }: { className?: string; decorative?: boolean }) {
  const { t } = useLang()
  return (
    <svg
      className={className}
      viewBox="0 0 18 11"
      {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': t.flag })}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="18" height="11" fill="#ffffff" />
      <rect x="5" width="3" height="11" fill="#002f6c" />
      <rect y="4" width="18" height="3" fill="#002f6c" />
    </svg>
  )
}
