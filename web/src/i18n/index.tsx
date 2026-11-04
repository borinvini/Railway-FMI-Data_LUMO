import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { en, type Dict } from './en'
import { fi } from './fi'
import { makeFmt, type Fmt, type Lang } from './format'

export type { Dict } from './en'
export type { Fmt, Lang } from './format'

const STORAGE_KEY = 'lang'
const isLang = (v: string | null): v is Lang => v === 'en' || v === 'fi'

/** English unless the address asks for Finnish (`?lang=fi`, for posters and QR codes) or this browser
 *  picked it before. Storage can be missing or blocked (private windows, previews): then English. */
function initialLang(): Lang {
  try {
    const q = new URLSearchParams(window.location.search).get('lang')
    if (isLang(q)) return q
  } catch { /* no URL access */ }
  try {
    const s = window.localStorage.getItem(STORAGE_KEY)
    if (isLang(s)) return s
  } catch { /* storage blocked */ }
  return 'en'
}

interface LangValue {
  lang: Lang
  setLang: (lang: Lang) => void
  t: Dict
  f: Fmt
}

const LangContext = createContext<LangValue | null>(null)

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang)
  const setLang = useCallback((next: Lang) => {
    setLangState(next)
    try { window.localStorage.setItem(STORAGE_KEY, next) } catch { /* storage blocked */ }
  }, [])
  // One dictionary object per language, so `t` and `f` stay stable between renders (chart effects
  // list them as dependencies and redraw only when the language changes).
  const value = useMemo<LangValue>(() => {
    const f = makeFmt(lang)
    return { lang, setLang, f, t: lang === 'fi' ? fi(f) : en(f) }
  }, [lang, setLang])

  useEffect(() => {
    document.documentElement.lang = lang
    document.title = value.t.docTitle
  }, [lang, value])

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>
}

export function useLang(): LangValue {
  const v = useContext(LangContext)
  if (!v) throw new Error('useLang outside LangProvider')
  return v
}
