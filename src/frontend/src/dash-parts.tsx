// Drobne części pulpitu i panelu HR v2: mini-stepper etapów, odznaka arkusza, dzwonek przypomnienia, licznik KPI.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Avatar } from './Avatar'
import './ml-motion.css'

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Licznik KPI: przy pierwszym wejściu liczba dochodzi od 0 do wartości (ok. 500 ms, ease-out), potem już stoi.
 * Czytnik ekranu dostaje od razu wartość końcową; ograniczony ruch = wartość od pierwszej klatki.
 */
export function CountUp({ value, duration = 500 }: { value: number; duration?: number }) {
  const played = useRef(false)
  const [shown, setShown] = useState(() => (reducedMotion() || value === 0 ? value : 0))
  useEffect(() => {
    // `played` = animacja doszła do końca; przerwana (StrictMode, zmiana wartości) zaczyna się od nowa.
    if (played.current || reducedMotion() || value === 0) { setShown(value); return }
    let raf = 0
    const t0 = performance.now()
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / duration)
      setShown(Math.round(value * (1 - (1 - k) ** 3)))
      if (k < 1) raf = requestAnimationFrame(tick)
      else played.current = true
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, duration])
  return (
    <>
      <span className="ml-count" aria-hidden="true">{shown}</span>
      <span className="sr-only">{value}</span>
    </>
  )
}
import { sheetOf, stagePos } from './dash-model'
import type { Progress } from './evaluation/types'

/** 5 kropek etapów v5 (4 przy pierwszej ocenie, romb na końcu); podpis tylko pod bieżącą. */
export function MiniStepper({ progress, caption = 'label', size = 'md' }: {
  progress: Progress
  /** 'label' = „Start cyklu”, 'count' = „Start cyklu · 1/5”, 'none' = bez podpisu. */
  caption?: 'label' | 'count' | 'none'
  size?: 'md' | 'lg'
}) {
  const s = stagePos(progress)
  const total = s.labels.length
  const now = s.done ? null : s.labels[s.index]
  const text = s.done ? 'Zakończona' : caption === 'count' ? `${now} · ${s.index + 1}/${total}` : now
  return (
    <span className={`dash-steps dash-steps-${size}${s.first ? ' first' : ''}`}
      role="img" aria-label={s.done ? 'Ocena zakończona' : `Etap ${s.index + 1} z ${total}: ${now}`}>
      <span className="dash-steps-dots" aria-hidden="true">
        {s.labels.map((l, i) => (
          <span key={l} className={i < s.index ? 'done' : i === s.index ? 'now' : undefined} />
        ))}
      </span>
      {caption !== 'none' && <span className="dash-steps-caption" aria-hidden="true">{text}</span>}
    </span>
  )
}

/** Arkusz jako odznaka „B”/„C”; pierwsza ocena jako granatowy romb ◆ (lawenda tylko dla AI). */
export function SheetMark({ code }: { code: string }) {
  const sheet = sheetOf(code)
  return sheet
    ? <span className="dash-sheet" title={`Arkusz ${sheet}`}><span aria-hidden="true">{sheet}</span><span className="sr-only">arkusz {sheet}</span></span>
    : <span className="dash-first" title="Pierwsza ocena"><span aria-hidden="true">◆</span><span className="sr-only">pierwsza ocena</span></span>
}

/** Dzwonek z mini-awatarem adresata przypomnienia. */
export function BellButton({ name, avatarPath, disabled, busy, sentAt, justSent, onClick }: {
  name: string
  avatarPath: string | null
  disabled?: boolean
  busy?: boolean
  sentAt?: string | null
  /** Przed chwilą wysłano: dzwonek kołysze się raz, w rogu „✓” (komunikat dla czytnika podaje toast panelu). */
  justSent?: boolean
  onClick: () => void
}) {
  const label = `Przypomnij: ${name}${sentAt ? ` (ostatnio ${sentAt})` : ''}`
  return (
    <button type="button" className={`dash-bell${sentAt ? ' sent' : ''}${justSent ? ' ml-just-sent' : ''}`} disabled={disabled} aria-label={label} title={label}
      aria-busy={busy || undefined} onClick={onClick}>
      <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
        <path d="M10 2.5a5 5 0 0 0-5 5v3.2L3.6 13.4a.8.8 0 0 0 .7 1.2h11.4a.8.8 0 0 0 .7-1.2L15 10.7V7.5a5 5 0 0 0-5-5Z"
          fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M8 16.6a2 2 0 0 0 4 0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      <Avatar path={avatarPath} name={name} size={26} decorative />
      {justSent && <span className="ml-bell-check" aria-hidden="true">✓</span>}
    </button>
  )
}

/* ------------------------------------------------------------------ Ładowanie (pulpity i listy) */

/**
 * Wczytanie danych ekranu: `loading` także przy ponowieniu (wtedy `error` zostaje do odpowiedzi, a ErrorState pokazuje kropki).
 * `refetch()` odświeża w tle (dane zostają na ekranie), `retry()` = refetch po błędzie.
 */
export function useLoad<T>(load: () => Promise<T>, deps: readonly unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [n, setN] = useState(0)
  useEffect(() => {
    let active = true
    setLoading(true)
    load().then(
      (d) => { if (active) { setData(d); setError(''); setLoading(false) } },
      (e: Error) => { if (active) { setError(e?.message || 'Spróbuj ponownie za chwilę.'); setLoading(false) } },
    )
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, n])
  const refetch = () => setN((x) => x + 1)
  return { data, error, loading, setData, refetch, retry: refetch }
}

const sk = (w: string | number, h?: number, cls = '') => <span className={`m-skel${cls ? ` ${cls}` : ''}`} style={{ width: w, height: h }} />
const SkelRows = ({ n, avatar = 40 }: { n: number; avatar?: number }) => (
  <>
    {Array.from({ length: n }, (_, i) => (
      <div key={i} className="m-skel-row ml-skel-line">
        {sk(avatar, avatar, 'm-skel--circle')}
        <div className="m-skel-stack">{sk(['46%', '58%', '38%', '52%', '42%', '60%'][i % 6])}{sk('28%', 10)}</div>
        {sk(96, 24, 'm-skel--pill')}
      </div>
    ))}
  </>
)

function SkelFrame({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={`m-skeleton ml-skel${className ? ` ${className}` : ''}`} aria-busy="true" role="status">
      <span className="m-skel-note m-sr">Wczytuję…</span>
      {children}
    </div>
  )
}

/** Szkielet pulpitu przełożonej: „Następny krok” z pierścieniem, kolejka, asystent, oś zespołu. */
export function DashSkeleton() {
  return (
    <SkelFrame>
      <div className="dash-top">
        <div className="m-skel-panel ml-skel-hero">
          {sk('18%', 12)}
          <div className="m-skel-row" style={{ gap: 20 }}>
            {sk(88, 88, 'm-skel--circle')}
            <div className="m-skel-stack">{sk('62%', 26, 'm-skel--title')}{sk('44%')}</div>
            {sk(128, 128, 'm-skel--circle')}
          </div>
          <div className="m-skel-row" style={{ justifyContent: 'space-between' }}>{sk('34%', 14)}{sk(180, 44, 'm-skel--pill')}</div>
        </div>
        <div className="dash-side">
          <div className="m-skel-panel">{sk('40%', 20, 'm-skel--title')}<SkelRows n={2} /></div>
          <div className="m-skel-panel">{sk('52%', 20, 'm-skel--title')}<div className="m-skel-row">{sk('46%', 34, 'm-skel--pill')}{sk('40%', 34, 'm-skel--pill')}</div></div>
        </div>
      </div>
      <div className="m-skel-panel">{sk('16%', 20, 'm-skel--title')}<SkelRows n={4} avatar={32} /></div>
    </SkelFrame>
  )
}

/** Szkielet panelu HR: „Po terminie”, pasek stanu, lista „Wymaga działania”, mediana. */
export function HrSkeleton() {
  return (
    <SkelFrame>
      <div className="dash-kpi">
        <div className="m-skel-panel">{sk(72, 52, 'm-skel--block')}{sk('70%')}</div>
        <div className="m-skel-panel">{sk(90, 32, 'm-skel--block')}{sk('100%', 14, 'm-skel--pill')}{sk('80%')}</div>
      </div>
      <div className="dash-hr-grid with-radar">
        <div className="m-skel-panel">{sk('34%', 20, 'm-skel--title')}<SkelRows n={5} /></div>
        <div className="m-skel-panel" style={{ justifyItems: 'center' }}>{sk('60%', 20, 'm-skel--title')}{sk(200, 200, 'm-skel--circle')}</div>
      </div>
    </SkelFrame>
  )
}

/** Szkielet „Moja ocena”: karta z nagłówkiem, zadaniami i stopką. */
export function MySkeleton() {
  return (
    <SkelFrame>
      <div className="m-skel-panel" style={{ gap: 18 }}>
        <div className="m-skel-row">{sk(56, 56, 'm-skel--circle')}<div className="m-skel-stack">{sk('38%', 22, 'm-skel--title')}{sk('20%')}</div>{sk(160, 14, 'm-skel--pill')}</div>
        {sk('100%', 48, 'm-skel--block')}
        <div className="m-skel-row" style={{ justifyContent: 'space-between' }}>{sk('26%')}{sk(170, 42, 'm-skel--pill')}</div>
      </div>
    </SkelFrame>
  )
}

/** Szkielet listy w karcie (terminy, tabele): wiersze z awatarem, tekstem i pigułką. */
export function ListSkeleton({ rows = 6, card = true }: { rows?: number; card?: boolean }) {
  return (
    <SkelFrame className="ml-skel-list">
      {card ? <div className="m-skel-panel"><SkelRows n={rows} /></div> : <SkelRows n={rows} />}
    </SkelFrame>
  )
}

/** Szkielet kafli zespołu / struktury: korzeń i kafle. */
export function TilesSkeleton({ tiles = 6, root = true }: { tiles?: number; root?: boolean }) {
  return (
    <SkelFrame>
      {root && <div className="m-skel-panel ml-skel-root"><div className="m-skel-row">{sk(72, 72, 'm-skel--circle')}<div className="m-skel-stack">{sk('60%', 18)}{sk('40%')}</div></div></div>}
      <div className="ml-skel-tiles">
        {Array.from({ length: tiles }, (_, i) => (
          <div key={i} className="m-skel-panel">
            <div className="m-skel-row">{sk(56, 56, 'm-skel--circle')}<div className="m-skel-stack">{sk('70%')}{sk('50%', 10)}</div></div>
            {sk('90%')}{sk('64%')}
          </div>
        ))}
      </div>
    </SkelFrame>
  )
}

/** Szkielet profilu: boczna karta ze zdjęciem i zakładkami, obok formularz sekcji. */
export function ProfileSkeleton() {
  return (
    <SkelFrame className="ml-skel-profile">
      <div className="m-skel-panel" style={{ justifyItems: 'center' }}>
        {sk(136, 136, 'm-skel--circle')}{sk('70%', 18)}{sk('50%')}
        {Array.from({ length: 6 }, (_, i) => <span key={i} className="m-skel" style={{ width: '100%', height: 30, borderRadius: 8 }} />)}
      </div>
      <div className="m-skel-panel" style={{ gap: 18 }}>
        {sk('30%', 22, 'm-skel--title')}
        <div className="ml-skel-fields">
          {Array.from({ length: 6 }, (_, i) => <div key={i} className="m-skel-stack">{sk('40%', 10)}{sk('100%', 40, 'm-skel--block')}</div>)}
        </div>
      </div>
    </SkelFrame>
  )
}
