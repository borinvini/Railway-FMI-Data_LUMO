import { useEffect } from 'react'
import uoulu from '../assets/logos/uoulu.png'
import flagship from '../assets/logos/6g-flagship.png'
import interreg from '../assets/logos/interreg-aurora.png'
import oulu2026 from '../assets/logos/oulu2026.png'
import { GITHUB_URL, GithubMark } from './Footer'
import { useLang } from '../i18n'

const PROFILE_URL = 'https://www.oulu.fi/en/researchers/vinicius-pozzobon-borin'

/** The dataset paper. Proper names, so not translated. */
const PAPER = {
  title: 'FI-TW: An open train–weather dataset for railway delay analysis in Finland',
  authors: "Vinicius Pozzobon Borin, Jean Michel de Souza Sant'Ana, Usama Raheel, Nurul Huda Mahmood",
  venue: 'Open Research Europe, 2026',
  doi: '10.12688/openreseurope.24750.1',
  href: 'https://ore.eu/article/view/1519',
}

const linkCls =
  'inline-flex items-center py-1 max-md:min-h-11 gap-1.5 font-medium text-(--card-ink) underline decoration-(--card-ink-3)/50 underline-offset-4 hover:decoration-(--card-ink)'

function External() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-3.5 w-3.5" aria-hidden="true">
      <path d="M6 3H3v10h10v-3M9 3h4v4M13 3 7 9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/**
 * About the site: the dataset paper, who made it and where, the funding, the data credit and the
 * partner logos. Same pop-up shell and Esc handling as DelayTrends. The logos are white (made by
 * scripts/make_logos.py), so they sit on a dark plate at the end.
 */
export default function AboutPage({ onClose }: { onClose: () => void }) {
  const { t } = useLang()
  const a = t.about

  // Esc closes just this pop-up: capture on window so the page-wide Esc handler never sees it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  // One-line logos are shorter than the two-line lockups, so they look the same size.
  const logos = [
    { src: uoulu, alt: a.uoulu, href: a.uouluHref, h: 'h-[50px] max-md:h-10' },
    { src: flagship, alt: '6G Flagship', href: 'https://www.6gflagship.com/', h: 'h-10 max-md:h-9' },
    { src: oulu2026, alt: a.oulu2026, href: a.oulu2026Href, h: 'h-[58px] max-md:h-[50px]' },
    { src: interreg, alt: a.interreg, href: 'https://www.interregaurora.eu/', h: 'h-[66px] max-md:h-[54px]' },
  ]

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(2,6,13,0.55)] p-4 max-md:p-0" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-title"
        onClick={(e) => e.stopPropagation()}
        className="card relative max-h-[92vh] w-[min(760px,100%)] overflow-y-auto !rounded-xl !p-0 !shadow-[0_20px_60px_rgba(0,0,0,0.5)] max-md:h-full max-md:max-h-none max-md:w-full max-md:!rounded-none"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={t.close}
          className="absolute top-2 right-2 flex h-11 w-11 cursor-pointer items-center justify-center text-lg text-(--card-ink-3) hover:text-(--card-ink) max-md:fixed max-md:top-[calc(6px+env(safe-area-inset-top))] max-md:right-2 max-md:z-10 max-md:rounded-full max-md:bg-(--card) max-md:text-(--card-ink) max-md:shadow-[0_2px_10px_rgba(0,0,0,0.25)]"
        >
          ✕
        </button>

        <div className="px-7 pt-5 pb-4 text-[15px] leading-snug text-(--card-ink-2) max-md:px-4 max-md:pt-[calc(14px+env(safe-area-inset-top))]">
          <h2 id="about-title" className="font-board m-0 pr-10 text-[32px] leading-tight font-semibold text-(--card-ink)">
            {a.title}
          </h2>
          <p className="m-0 mt-1 text-[16px] leading-normal">{a.intro}</p>

          <div className="mt-4 rounded-lg border border-(--card-line) bg-white/35 px-4 py-3">
            <div className="text-[13px] font-medium tracking-wide text-(--card-ink-3) uppercase">{a.paperLabel}</div>
            <div className="mt-0.5 font-semibold text-(--card-ink)">{PAPER.title}</div>
            <div className="text-[14px]">{PAPER.authors}</div>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 text-[14px]">
              <span>
                {PAPER.venue} · DOI {PAPER.doi}
              </span>
              <a href={PAPER.href} target="_blank" rel="noopener noreferrer" className={linkCls}>
                {a.readPaper}
                <External />
              </a>
            </div>
          </div>

          <p className="m-0 mt-4">
            {a.authorLead} <strong className="font-semibold text-(--card-ink)">Vinicius Pozzobon Borin</strong> {a.author}
          </p>
          <div className="mt-1 flex flex-wrap gap-x-5">
            <a href={PROFILE_URL} target="_blank" rel="noopener noreferrer" className={linkCls}>
              {a.profile}
              <External />
            </a>
            <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className={linkCls}>
              <GithubMark />
              GitHub
            </a>
          </div>

          <div className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-[3fr_2fr]">
            <section>
              <h3 className="font-board m-0 text-[20px] font-semibold text-(--card-ink)">{a.fundingTitle}</h3>
              <p className="m-0 mt-0.5 text-[14px]">{a.funding}</p>
            </section>
            <section>
              <h3 className="font-board m-0 text-[20px] font-semibold text-(--card-ink)">{a.dataTitle}</h3>
              <p className="m-0 mt-0.5 text-[14px]">{a.data}</p>
            </section>
          </div>
        </div>

        <section aria-label={a.partnersTitle} className="bg-(--bg) px-7 py-4 max-md:px-4 max-md:py-5 max-md:pb-[calc(24px+env(safe-area-inset-bottom))]">
          <ul className="m-0 grid list-none grid-cols-2 items-center justify-items-center gap-x-8 gap-y-3 p-0 max-md:gap-y-5">
            {logos.map((l) => (
              <li key={l.alt} className="min-w-0">
                <a href={l.href} target="_blank" rel="noopener noreferrer" className="block rounded-sm">
                  <img src={l.src} alt={l.alt} className={`${l.h} w-auto max-w-full`} />
                </a>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}
