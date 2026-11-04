import { useId } from 'react'

/** Union Jack, 2:1, official colours (#012169 blue, #C8102E red). Decorative: the button around it
 *  carries the name. Clip ids are per instance, so several flags can share a page. */
export default function UKFlag({ className }: { className?: string }) {
  const id = useId()
  return (
    <svg className={className} viewBox="0 0 60 30" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <clipPath id={`${id}s`}><path d="M0,0 v30 h60 v-30 z" /></clipPath>
      <clipPath id={`${id}t`}><path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z" /></clipPath>
      <g clipPath={`url(#${id}s)`}>
        <path d="M0,0 v30 h60 v-30 z" fill="#012169" />
        <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6" />
        <path d="M0,0 L60,30 M60,0 L0,30" clipPath={`url(#${id}t)`} stroke="#C8102E" strokeWidth="4" />
        <path d="M30,0 v30 M0,15 h60" stroke="#fff" strokeWidth="10" />
        <path d="M30,0 v30 M0,15 h60" stroke="#C8102E" strokeWidth="6" />
      </g>
    </svg>
  )
}
