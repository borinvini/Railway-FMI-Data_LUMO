import uoulu from '../assets/logos/uoulu.png'
import flagship from '../assets/logos/6g-flagship.png'
import interreg from '../assets/logos/interreg-aurora.png'

const GITHUB_URL = 'https://github.com/borinvini'

/** Partner logos, recoloured for the dark theme by scripts/make_logos.py. All one line high, so they
 *  share one height. */
const LOGOS = [
  { src: uoulu, alt: 'University of Oulu', href: 'https://www.oulu.fi/en' },
  { src: flagship, alt: '6G Flagship', href: 'https://www.6gflagship.com/' },
  { src: interreg, alt: 'Interreg Aurora, co-funded by the European Union', href: 'https://www.interregaurora.eu/' },
]

const link = 'rounded-sm' // focus outline comes from the global :focus-visible rule in index.css

/** Bottom strip: who built it, where the data comes from, and the partners. Its height is the
 *  --footer-h token, which the bottom row, the left column and the map attribution all keep clear of. */
export default function Footer() {
  return (
    <footer className="absolute inset-x-0 bottom-0 z-30 flex h-(--footer-h) flex-col-reverse items-center justify-center gap-0border-t border-(--line) bg-[rgba(2,6,13,0.86)] px-4 backdrop-blur-[8px] lg:flex-row lg:justify-between lg:gap-6 lg:px-6">
      <p className="m-0 flex flex-wrap items-center gap-x-4 text-[13px] text-(--muted) sm:text-[15px]">
        <span>
          Built by <span className="text-(--text)">Vinicius Pozzobon Borin</span>
        </span>
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={`${link} -mx-1 inline-flex min-h-11 items-center gap-1.5 px-1 text-(--text) hover:text-(--ice)`}
        >
          <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4" aria-hidden="true">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
          </svg>
          GitHub
        </a>
        <span className="hidden xl:inline 2xl:hidden">Data: Fintraffic, FMI</span>
        <span className="hidden 2xl:inline">Data: Fintraffic, Finnish Meteorological Institute</span>
      </p>

      <ul className="m-0 flex list-none items-center gap-3 p-0 sm:gap-6">
        {LOGOS.map((l, i) => (
          <li key={l.alt} className={`flex items-center ${i > 0 ? 'border-l border-(--line) pl-3 sm:pl-6' : ''}`}>
            <a href={l.href} target="_blank" rel="noopener noreferrer" className={`${link} block`}>
              <img src={l.src} alt={l.alt} className="h-[18px] w-auto sm:h-6 lg:h-7" />
            </a>
          </li>
        ))}
      </ul>
    </footer>
  )
}
