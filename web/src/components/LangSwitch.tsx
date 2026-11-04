import { useLang, type Lang } from '../i18n'
import FinnishFlag from './FinnishFlag'
import UKFlag from './UKFlag'

const LANGS: Lang[] = ['en', 'fi']
/** What the compact button says it switches to, in that language. */
const SWITCH_TO: Record<Lang, string> = { en: 'In English', fi: 'Suomeksi' }

/** The flag that stands for a language, at one height (the widths follow each flag's own shape). */
function Flag({ lang }: { lang: Lang }) {
  const size = 'h-[15px] w-auto rounded-[2px] ring-1 ring-black/15'
  return lang === 'en' ? <UKFlag className={size} /> : <FinnishFlag decorative className={size} />
}

/**
 * The language switch, as flags: UK for English, Finland for Finnish, named in words for screen
 * readers. The site uses `compact`: one button showing the other language's flag (phone top bar;
 * `framed` in the desktop top-right corner). The two-segment form (picked flag lit, the other
 * dimmed; `card` or `dark` surface) is kept for a place with room for both. Every target is 44 px.
 */
export default function LangSwitch({ tone = 'card', compact = false, framed = false, className = '' }: {
  tone?: 'card' | 'dark'
  compact?: boolean
  /** Compact only: on its own over the map (desktop top-right corner), with the dark surface frame. */
  framed?: boolean
  className?: string
}) {
  const { lang, setLang, t } = useLang()

  if (compact) {
    const other: Lang = lang === 'en' ? 'fi' : 'en'
    const frame = framed
      ? 'rounded-[10px] border border-(--line) bg-(--surface) backdrop-blur-[8px] hover:border-(--muted)'
      : 'rounded-lg'
    return (
      <button
        type="button"
        lang={other}
        onClick={() => setLang(other)}
        aria-label={SWITCH_TO[other]}
        title={SWITCH_TO[other]}
        className={`flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center ${frame} ${className}`}
      >
        <Flag lang={other} />
      </button>
    )
  }

  const frame = tone === 'card' ? 'border-[rgba(0,47,108,0.3)]' : 'border-(--line)'
  const seg = (on: boolean) =>
    on
      ? tone === 'card' ? 'bg-[rgba(0,47,108,0.16)]' : 'bg-[rgba(156,195,232,0.18)]'
      : 'opacity-45 grayscale-[60%] hover:opacity-80 hover:grayscale-0'
  return (
    <div role="group" aria-label={t.lang.label} className={`flex shrink-0 overflow-hidden rounded-full border ${frame} ${className}`}>
      {LANGS.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          title={t.lang[l]}
          aria-label={t.lang[l]}
          aria-pressed={lang === l}
          onClick={() => setLang(l)}
          className={`flex h-11 w-11 cursor-pointer items-center justify-center transition-opacity duration-150 ${seg(lang === l)}`}
        >
          <Flag lang={l} />
        </button>
      ))}
    </div>
  )
}
