import type { Step } from '../evaluation/common'
import { daysUntil, fmtDate, type Detail } from '../evaluation/types'

/** Pięć etapów v5 (H08 v2). Ostatni — okno sprzeciwu — tylko informacyjnie, bez kroków. */
export const STAGES = ['Start cyklu', 'Obserwacja', 'Przygotowanie oceny', 'Czeka na zapoznanie', 'Okno sprzeciwu'] as const

/**
 * Do którego etapu v5 należy krok kreatora. Pierwsza ocena odpowiednio: elementy i rozmowa wstępna → start,
 * sprawozdanie (etap pośredni) → obserwacja, ocena → przygotowanie oceny.
 */
export function stageIndexOf(step: Step): number {
  if (['start', 'criteria', 'kickoff', 'part1', 'own-criteria'].includes(step.id)) return 0
  if (step.id === 'notes' || step.id.startsWith('stage:')) return 1
  if (step.id === 'ack' || step.id === 'own-sign') return 3
  return 2
}

const Check = () => (
  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
    <path d="M3.5 8.4l3 3 6-6.4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

/** Lewa kolumna kreatora: „ARKUSZ C”, 5 etapów, pod-kroki tylko pod bieżącym etapem. */
export function StageNav({ sheet, steps, currentId, onGo }: {
  sheet: string
  steps: Step[]
  currentId: string
  onGo: (id: string) => void
}) {
  const current = steps.find((s) => s.id === currentId) ?? steps[0]
  const open = current ? stageIndexOf(current) : 0
  return (
    <nav className="wz-nav" aria-label="Etapy i kroki oceny">
      <p className="wz-sheet">{sheet}</p>
      <ol className="wz-stages">
        {STAGES.map((label, i) => {
          const own = steps.filter((s) => stageIndexOf(s) === i)
          const done = own.length > 0 && own.every((s) => s.done)
          const isOpen = i === open
          const marker = (
            <span className={`wz-mark${done ? ' done' : isOpen ? ' now' : ''}`} aria-hidden="true">
              {done ? <Check /> : isOpen ? <span className="wz-mark-dot" /> : i + 1}
            </span>
          )
          const state = done ? ' (gotowe)' : isOpen ? ' (bieżący etap)' : ''
          return (
            <li key={label} className={`wz-stage${isOpen ? ' open' : ''}${done ? ' done' : ''}`}>
              {own.length === 0 ? (
                <span className="wz-stage-head static">{marker}<span>{label}</span></span>
              ) : (
                <button type="button" className="wz-stage-head" aria-expanded={isOpen}
                  onClick={() => !isOpen && onGo((own.find((s) => !s.done) ?? own[0]).id)}>
                  {marker}<span>{label}</span><span className="sr-only">{state}</span>
                </button>
              )}
              {own.length > 0 && (
                // Pod-kroki innych etapów zostają w DOM ukryte (hidden): niewidoczne i poza kolejnością Tab.
                <ul className="wz-substeps" hidden={!isOpen}>
                  {own.map((s) => (
                    <li key={s.id}>
                      <button type="button" className={s.id === current?.id ? 'step-link active' : 'step-link'}
                        aria-current={s.id === current?.id ? 'step' : undefined} onClick={() => onGo(s.id)}>
                        <span>{s.title}</span>
                        {s.done && <span className="wz-sub-done" aria-hidden="true"><Check /></span>}
                        {s.done && <span className="sr-only">(gotowe)</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
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
