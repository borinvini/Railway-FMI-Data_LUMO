import { useLang } from '../i18n'

export const GITHUB_URL = 'https://github.com/borinvini'

const link = 'rounded-sm' // focus outline comes from the global :focus-visible rule in index.css

export function GithubMark() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  )
}

/** A thin strip along the bottom: who built it, GitHub, and the way into the About page (which has
 *  the paper, the funding, the data credit and the partner logos). Its height is the --footer-h
 *  token, which the bottom row, the left column and the map attribution all keep clear of.
 *  `embedded`: the phone version, one line at the end of the Overview sheet (phones have no strip). */
export default function Footer({ embedded = false, onAbout }: { embedded?: boolean; onAbout: () => void }) {
  const { t } = useLang()
  if (embedded) {
    return (
      <footer className="mt-4 flex flex-wrap items-center gap-x-4 border-t border-(--card-line) pt-2 text-[15px] text-(--card-ink-2)">
        <span>
          {t.footer.builtBy} <span className="text-(--card-ink)">Vinicius Pozzobon Borin</span>
        </span>
        <button
          type="button"
          onClick={onAbout}
          className={`${link} -mx-1 inline-flex min-h-11 cursor-pointer items-center px-1 font-medium text-(--card-ink) underline underline-offset-4`}
        >
          {t.footer.aboutLong}
        </button>
      </footer>
    )
  }
  return (
    <footer className="absolute inset-x-0 bottom-0 z-30 flex h-(--footer-h) items-center justify-end gap-5 border-t border-(--line) bg-[rgba(2,6,13,0.72)] px-5 text-[14px] text-(--muted) backdrop-blur-[8px]">
      <span>
        {t.footer.builtBy} <span className="text-(--text)">Vinicius Pozzobon Borin</span>
      </span>
      <a
        href={GITHUB_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={`${link} -mx-1 inline-flex h-full items-center gap-1.5 px-1 hover:text-(--text)`}
      >
        <GithubMark />
        GitHub
      </a>
      <button
        type="button"
        onClick={onAbout}
        className={`${link} -mx-1 inline-flex h-full cursor-pointer items-center gap-1.5 px-1 hover:text-(--text)`}
      >
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-4 w-4" aria-hidden="true">
          <circle cx="8" cy="8" r="6.5" />
          <path d="M8 7.2v4M8 4.8v.1" strokeLinecap="round" />
        </svg>
        {t.footer.aboutLong}
      </button>
    </footer>
  )
}
