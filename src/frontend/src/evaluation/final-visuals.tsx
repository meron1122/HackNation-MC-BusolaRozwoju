// Obrazy ekranów H10–H12: ikony, kłódka z animacją, miniatura arkusza, osie „Co dalej”, jednorazowa animacja Lottie.
import { useEffect, useRef, type ReactNode } from 'react'
import type { AnimationItem } from 'lottie-web'
import { Avatar } from '../Avatar'
import animationUrl from './final-wspolny-kierunek.json?url'

const PATHS = {
  pencil: <path d="M3 13h2.4L12.6 5.8a1.7 1.7 0 0 0-2.4-2.4L3 10.6zM9.2 4.4l2.4 2.4" />,
  calendar: <><rect x="2.4" y="3.4" width="11.2" height="10.4" rx="1.6" /><path d="M2.4 6.8h11.2M5.4 2v2.8M10.6 2v2.8" /></>,
  check: <path d="M3 8.5l3.2 3L13 4.5" />,
  alert: <path d="M8 3.6v5.6M8 12.2v.2" />,
  minus: <path d="M4 8h8" />,
  book: <><path d="M8 4.2C6.6 3.2 4.6 3 2.6 3.2v9c2-.2 4 0 5.4 1 1.4-1 3.4-1.2 5.4-1v-9c-2-.2-4 0-5.4 1z" /><path d="M8 4.2v8.8" /></>,
  task: <><rect x="3" y="2.6" width="10" height="11.4" rx="1.6" /><path d="M5.6 8.4l1.6 1.6 3.2-3.4" /></>,
  people: <><circle cx="5.8" cy="5.6" r="2" /><circle cx="11" cy="6.2" r="1.6" /><path d="M2 13c.4-2.2 2-3.4 3.8-3.4s3.4 1.2 3.8 3.4M10 9.6c1.8-.2 3.4.8 3.8 3" /></>,
  download: <path d="M8 2.6v7.6M4.8 7.2 8 10.4l3.2-3.2M3 13.4h10" />,
  arrow: <path d="M3 8h9.6M8.8 4.2 12.6 8l-3.8 3.8" />,
  up: <path d="M8 13V3.4M4.6 6.8 8 3.4l3.4 3.4" />,
  eye: <><path d="M1.6 8s2.4-4.4 6.4-4.4S14.4 8 14.4 8 12 12.4 8 12.4 1.6 8 1.6 8z" /><circle cx="8" cy="8" r="2" /></>,
}
export type FinalIconName = keyof typeof PATHS

export function FIcon({ name, size = 16 }: { name: FinalIconName; size?: number }) {
  return (
    <svg className="final-icon" viewBox="0 0 16 16" width={size} height={size} aria-hidden="true" focusable="false"
      fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {PATHS[name]}
    </svg>
  )
}

/** Kłódka: zamknięta albo otwarta (pałąk unosi się i obraca w 200 ms; bez ruchu przy prefers-reduced-motion). */
export function Lock({ open = false, size = 16 }: { open?: boolean; size?: number }) {
  return (
    <svg className={`final-lock${open ? ' open' : ''}`} viewBox="0 0 16 16" width={size} height={size} aria-hidden="true" focusable="false"
      fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <rect x="3" y="7.2" width="10" height="6.8" rx="1.6" />
      <path className="final-lock-shackle" d="M5.4 7.2V5.2a2.6 2.6 0 0 1 5.2 0v2" />
    </svg>
  )
}

/** Miniatura strony arkusza (szkic układu, nie render PDF): nagłówek, wiersze pól, kolumna ocen, podpis. */
export function SheetThumb() {
  return (
    <svg className="final-thumb" viewBox="0 0 150 190" aria-hidden="true" focusable="false">
      <rect x="10" y="8" width="136" height="178" rx="4" className="final-thumb-back" />
      <rect x="4" y="2" width="136" height="178" rx="4" className="final-thumb-page" />
      <rect x="18" y="16" width="68" height="6" rx="3" className="final-thumb-ink" />
      {[36, 50, 64, 78, 92, 106].map((y) => (
        <g key={y}>
          <rect x="18" y={y} width="72" height="3" rx="1.5" className="final-thumb-line" />
          <rect x="106" y={y - 2} width="22" height="7" rx="1.5" className="final-thumb-cell" />
        </g>
      ))}
      <rect x="18" y="136" width="36" height="8" rx="2" className="final-thumb-ink" />
      <path d="M84 162h44" className="final-thumb-sign" />
    </svg>
  )
}

/**
 * „Co dalej” po podpisie (H11): dwie gałęzie od podpisu — górna: zapoznanie → okno sprzeciwu (7 dni),
 * dolna: nowy cykl. Linie w SVG rozciąganym na szerokość, węzły i podpisy w HTML (czytelne 14 px).
 */
export function BranchTimeline({ person, objectionDays = 7, nextCycle, signLabel = 'dziś' }: {
  person: { id: number; name: string }
  objectionDays?: number
  nextCycle: ReactNode
  signLabel?: string
}) {
  return (
    <div className="final-branch">
      <svg className="final-branch-lines" viewBox="0 0 400 150" preserveAspectRatio="none" aria-hidden="true">
        <path d="M24 92 C 60 92, 64 44, 110 44 L 376 44" vectorEffect="non-scaling-stroke" />
        <path d="M24 92 C 60 92, 64 128, 110 128 L 376 128" vectorEffect="non-scaling-stroke" />
      </svg>
      <ol className="final-branch-nodes">
        <li className="final-bn sign">
          <span className="final-bn-dot filled"><FIcon name="pencil" size={14} /></span>
          <span className="final-bn-text"><strong>Podpis</strong><span>{signLabel}</span></span>
        </li>
        <li className="final-bn ack">
          <span className="final-bn-text top"><strong>Zapoznanie</strong></span>
          <span className="final-bn-face"><Avatar path={`org/${person.id}/avatar`} name={person.name} size={32} decorative /></span>
        </li>
        <li className="final-bn days" aria-label={`Sprzeciw: ${objectionDays} dni od zapoznania`}>
          <span aria-hidden="true">{objectionDays} dni</span>
        </li>
        <li className="final-bn objection">
          <span className="final-bn-text top end"><strong>Okno sprzeciwu</strong></span>
          <span className="final-bn-dot ring" />
        </li>
        <li className="final-bn cycle">
          <span className="final-bn-dot soft"><FIcon name="calendar" size={14} /></span>
          <span className="final-bn-text end"><strong>{nextCycle}</strong></span>
        </li>
      </ol>
    </div>
  )
}

export type TimelineItem = {
  key: string
  icon: ReactNode
  tone?: 'filled' | 'ring' | 'soft'
  title: ReactNode
  sub?: ReactNode
  extra?: ReactNode
}

/** „Co dalej” w jednej linii (H12): węzły z tytułem pod spodem, zapalane kolejno (przy reduced-motion od razu). */
export function LineTimeline({ items }: { items: TimelineItem[] }) {
  return (
    <ol className="final-line" style={{ ['--n' as string]: items.length }}>
      {items.map((it, i) => (
        <li key={it.key} className="final-line-item" style={{ ['--i' as string]: i }}>
          <span className={`final-line-dot ${it.tone ?? 'soft'}`}>{it.icon}</span>
          <span className="final-line-title"><strong>{it.title}</strong>{it.extra}</span>
          {it.sub && <span className="final-line-sub">{it.sub}</span>}
        </li>
      ))}
    </ol>
  )
}

/**
 * `wspolny-kierunek.json` raz po zapisie zapoznania (H12), bez pętli; zostaje ostatnia klatka.
 * Przy prefers-reduced-motion pokazuje od razu ostatnią klatkę.
 */
export function DirectionAnimation() {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let anim: AnimationItem | undefined
    let alive = true
    import('lottie-web/build/player/lottie_light').then(({ default: lottie }) => {
      if (!alive) return
      anim = lottie.loadAnimation({ container: el, renderer: 'svg', loop: false, autoplay: false, path: animationUrl })
      anim.addEventListener('DOMLoaded', () => {
        if (!alive || !anim) return
        if (still) anim.goToAndStop(anim.totalFrames - 1, true)
        else anim.play()
      })
    }).catch(() => undefined)
    return () => {
      alive = false
      anim?.destroy()
    }
  }, [])
  return <div className="final-lottie" ref={box} aria-hidden="true" />
}
