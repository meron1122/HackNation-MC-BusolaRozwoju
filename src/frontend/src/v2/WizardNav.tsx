import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { Step } from '../evaluation/common'
import { usePrevious } from '../evaluation/mw-motion'
import '../evaluation/mw-wizard.css'
import { daysUntil, fmtDate, type Detail } from '../evaluation/types'

/** Pięć etapów v5 (H08 v2). Ostatni — okno sprzeciwu — z krokiem „Sprzeciw” (H16), gdy szablon ma etap objection. */
export const STAGES = ['Start cyklu', 'Obserwacja', 'Przygotowanie oceny', 'Czeka na zapoznanie', 'Okno sprzeciwu'] as const

/**
 * Do którego etapu v5 należy krok kreatora. Pierwsza ocena odpowiednio: elementy i rozmowa wstępna → start,
 * sprawozdanie (etap pośredni) → obserwacja, ocena → przygotowanie oceny.
 */
export function stageIndexOf(step: Step): number {
  if (['start', 'criteria', 'kickoff', 'part1', 'own-criteria'].includes(step.id)) return 0
  if (step.id === 'notes' || step.id.startsWith('stage:')) return 1
  if (step.id === 'ack' || step.id === 'own-sign') return 3
  if (step.id === 'objection') return 4
  return 2
}

const Check = () => (
  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
    <path d="M3.5 8.4l3 3 6-6.4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const Lock = () => (
  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" className="wz-lock">
    <rect x="3.2" y="7" width="9.6" height="6.6" rx="1.4" fill="none" stroke="currentColor" strokeWidth="1.5" />
    <path d="M5.4 7V5.2a2.6 2.6 0 0 1 5.2 0V7" fill="none" stroke="currentColor" strokeWidth="1.5" />
  </svg>
)

/**
 * Lewa kolumna kreatora: „ARKUSZ C”, 5 etapów, pod-kroki tylko pod bieżącym etapem.
 * `lockedAfter`: indeks bieżącego etapu v5 — etapy późniejsze mają kłódkę (treść tylko do odczytu).
 */
export function StageNav({ sheet, steps, currentId, onGo, lockedAfter = null }: {
  sheet: string
  steps: Step[]
  currentId: string
  onGo: (id: string) => void
  lockedAfter?: number | null
}) {
  const current = steps.find((s) => s.id === currentId) ?? steps[0]
  const open = current ? stageIndexOf(current) : 0
  // ✓ wskakuje (m-pop) tylko przy odhaczeniu w trakcie pracy, nie przy wejściu na ekran.
  const doneIds = steps.filter((s) => s.done).map((s) => s.id).join('|')
  const prevDone = usePrevious(doneIds)
  const fresh = (id: string) => prevDone !== undefined && !prevDone.split('|').includes(id)
  const freshStage = (i: number) => {
    const own = steps.filter((s) => stageIndexOf(s) === i)
    return own.length > 0 && own.some((s) => s.done && fresh(s.id))
  }
  return (
    <nav className="wz-nav mw-nav" aria-label="Etapy i kroki oceny">
      <p className="wz-sheet">{sheet}</p>
      <ol className="wz-stages">
        {STAGES.map((label, i) => {
          const own = steps.filter((s) => stageIndexOf(s) === i)
          const done = own.length > 0 && own.every((s) => s.done)
          const isOpen = i === open
          const locked = lockedAfter != null && i > lockedAfter && !done
          const marker = (
            <span className={`wz-mark${done ? ' done' : isOpen && !locked ? ' now' : ''}`} aria-hidden="true">
              {done ? <span className={freshStage(i) ? 'mw-mark-in m-pop' : 'mw-mark-in'}><Check /></span>
                : isOpen && !locked ? <span key={`now-${i}`} className="wz-mark-dot mw-dot-in" /> : i + 1}
            </span>
          )
          const state = done ? ' (gotowe)' : locked ? ' (jeszcze nie rozpoczęty, tylko podgląd)' : isOpen ? ' (bieżący etap)' : ''
          return (
            <li key={label} className={`wz-stage${isOpen ? ' open' : ''}${done ? ' done' : ''}${locked ? ' locked' : ''}`}>
              {own.length === 0 ? (
                <span className="wz-stage-head static">{marker}<span>{label}</span>{locked && <Lock />}</span>
              ) : (
                <button type="button" className="wz-stage-head" aria-expanded={isOpen}
                  onClick={() => !isOpen && onGo((own.find((s) => !s.done) ?? own[0]).id)}>
                  {marker}<span>{label}</span>{locked && <Lock />}<span className="sr-only">{state}</span>
                </button>
              )}
              {own.length > 0 && (
                // Pod-kroki innych etapów zostają w DOM zwinięte (inert): niewidoczne i poza kolejnością Tab.
                // Rozwinięcie wysokości (grid 0fr → 1fr) i przesuwane podświetlenie bieżącego kroku.
                <SubSteps open={isOpen} currentId={current?.id}>
                  {own.map((s) => (
                    <li key={s.id}>
                      <button type="button" className={s.id === current?.id ? 'step-link active' : 'step-link'}
                        aria-current={s.id === current?.id ? 'step' : undefined} onClick={() => onGo(s.id)}>
                        <span>{s.title}</span>
                        {locked && <Lock />}
                        {locked && <span className="sr-only">(tylko podgląd)</span>}
                        {s.done && <span className={fresh(s.id) ? 'wz-sub-done m-pop' : 'wz-sub-done'} aria-hidden="true"><Check /></span>}
                        {s.done && <span className="sr-only">(gotowe)</span>}
                      </button>
                    </li>
                  ))}
                </SubSteps>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

/**
 * Pod-kroki etapu: zwijane wysokością (bez `hidden`, żeby przejście było płynne; zwinięte = `inert`) z jednym
 * podświetleniem, które przesuwa się do bieżącego kroku (250 ms). Przy reduced motion — od razu.
 */
function SubSteps({ open, currentId, children }: { open: boolean; currentId: string | undefined; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null)
  const [hl, setHl] = useState<{ top: number; height: number } | null>(null)
  useLayoutEffect(() => {
    const el = box.current
    if (!el || !open) return
    const measure = () => {
      const active = el.querySelector<HTMLElement>('.step-link.active')
      // Pozycja względem .mw-sub-inner (position: relative), niezależnie od marginesów listy.
      const top = active ? active.getBoundingClientRect().top - el.getBoundingClientRect().top : 0
      setHl(active ? { top, height: active.offsetHeight } : null)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [open, currentId])
  return (
    <div className="mw-sub-wrap" data-open={open} inert={!open}>
      <div ref={box} className="mw-sub-inner">
        {hl && <span className="mw-sub-hl" aria-hidden="true" style={{ transform: `translateY(${hl.top}px)`, height: hl.height }} />}
        <ul className={hl ? 'wz-substeps mw-substeps has-hl' : 'wz-substeps mw-substeps'}>{children}</ul>
      </div>
    </div>
  )
}

const dayWord = (n: number) => (n === 1 ? 'dzień' : 'dni')

/** Karta terminu na dole kolumny: liczba dni, data i pasek cyklu (od startu oceny do terminu oceny). */
export function TermCard({ detail, ratingStageKey }: { detail: Detail; ratingStageKey: string | null }) {
  if (detail.isFinal) {
    return (
      <div className="wz-term">
        <p className="wz-term-label">Status</p>
        <p className="wz-term-status">{detail.statusLabel}</p>
      </div>
    )
  }
  const current = detail.stages.find((s) => s.key === detail.currentStageKey)
  if (!current) return <div className="wz-term"><p className="wz-term-status">{detail.phase}</p></div>
  const left = daysUntil(current.dueTo)
  const overdue = current.overdue || (left != null && left < 0)
  const label = current.key === ratingStageKey ? 'Termin oceny' : `Termin · ${current.title.length > 28 ? detail.phase : current.title}`
  // Pasek cyklu: od startu oceny do najdalszego terminu etapu (termin oceny).
  const end = [...detail.stages].map((s) => s.dueTo).filter(Boolean).sort().pop() ?? null
  const span = end ? Date.parse(end) - Date.parse(detail.startDate) : 0
  const share = span > 0 ? Math.min(1, Math.max(0, (Date.now() - Date.parse(detail.startDate)) / span)) : null
  return (
    <div className={`wz-term${overdue ? ' overdue' : ''}`}>
      <p className="wz-term-label">{label}</p>
      {left == null ? (
        <p className="wz-term-status">{current.dueTo ? fmtDate(current.dueTo) : 'niezwłocznie'}</p>
      ) : (
        <p className="wz-term-row">
          <strong className="wz-term-days">{Math.abs(left)} {dayWord(Math.abs(left))}</strong>
          <span className="wz-term-date">{overdue ? 'po terminie' : `do ${fmtDate(current.dueTo)}`}</span>
        </p>
      )}
      {share != null && (
        <span className="wz-term-bar" role="img" aria-label={`Cykl oceny: ${Math.round(share * 100)}% za nami`}>
          <span style={{ width: `${share * 100}%` }} />
        </span>
      )}
      {current.dueNote && <p className="wz-term-note">{current.dueNote}</p>}
    </div>
  )
}
