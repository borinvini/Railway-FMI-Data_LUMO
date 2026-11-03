import { useEffect, useState } from 'react'

/** Below this width the page uses the phone layout (components/phone/*): map first, a dock at the
 *  bottom and panels as sheets. Tablets and larger keep the desktop layout. */
export const PHONE_QUERY = '(max-width: 767px)'

export function useIsPhone(): boolean {
  const [phone, setPhone] = useState(() => typeof window !== 'undefined' && window.matchMedia(PHONE_QUERY).matches)
  useEffect(() => {
    const mq = window.matchMedia(PHONE_QUERY)
    const onChange = () => setPhone(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return phone
}
