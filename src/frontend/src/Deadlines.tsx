import { useEffect, useState } from 'react'
import { EmptyState } from './EmptyState'
import { api } from './api'
import { daysLabel, fmtDate } from './evaluation/types'
import { Avatar } from './Avatar'
import './dash-v2.css'
import { Info } from './v2/Info'
import { deadlineReason } from './hifi-helpers'
import './hifi-pages.css'
import { Person } from './Person'
import { ListSkeleton } from './dash-parts'
import { EmptyEnter, Loadable, Refreshing, Reveal } from './v2/motion'

type Deadline = {
  evaluationId: number; employeeId: number; employeeName: string; templateTitle: string; stageKey: string; stageTitle: string
  dueFrom: string | null; dueTo: string; daysLeft: number; overdue: boolean
}
type WithoutEvaluation = { employeeId: number; employeeName: string; hireDate: string; subjectToFirstEvaluation: boolean }

const RANGES = [30, 60, 90, 365]

export function DeadlinesPage({ onOpen }: { onOpen: (evaluationId: number) => void }) {
  const [days, setDays] = useState(60)
  const [rows, setRows] = useState<Deadline[] | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [attempt, setAttempt] = useState(0)
  const [shownDays, setShownDays] = useState(days)

  // Zmiana zakresu: lista zostaje na ekranie i przygasa (po 300 ms), nowa wchodzi przenikaniem.
  useEffect(() => {
    let active = true
    setLoading(true)
    api<Deadline[]>(`dashboard/deadlines?days=${days}`).then(
      (r) => { if (active) { setRows(r); setShownDays(days); setError(''); setLoading(false) } },
      (e: Error) => { if (active) { setError(e.message); setLoading(false) } },
    )
    return () => { active = false }
  }, [days, attempt])

  const overdue = rows?.filter((r) => r.overdue).length ?? 0

  return (
    <section className="hifi-page dash hifi-deadlines">
      <div className="hifi-head">
        <div className="dash-hr-head">
          <h1>Terminy</h1>
          {rows && <span className="dash-count m-fade-in">{rows.length}</span>}
          {overdue > 0 && <span className="late m-fade-in">{overdue} po terminie</span>}
        </div>
        <div className="hifi-filter" role="group" aria-label="Zakres">
          {RANGES.map((d) => (
            <button key={d} type="button" className="dash-chip" aria-pressed={d === days} onClick={() => setDays(d)}>{d} dni</button>
          ))}
        </div>
      </div>
      {rows && error && <p role="alert" className="error">{error}</p>}
      <Loadable loading={loading && !rows} error={rows ? '' : error} onRetry={() => setAttempt((n) => n + 1)} skeleton={<ListSkeleton rows={6} />}>
      {() => rows && (
      <Refreshing busy={loading}>
      <Reveal k={shownDays}>
      {rows.length === 0 ? <EmptyEnter><EmptyState title="W tym okresie nie ma terminów">Wybierz dłuższy zakres.</EmptyState></EmptyEnter> : (
        <section className="card dash-dl-list" aria-label="Terminy etapów">
          <ul className="m-stagger">
            {rows.map((r) => {
              const reason = deadlineReason(r.stageKey, r.dueTo, /pierwsz/i.test(r.templateTitle))
              const first = /pierwsz/i.test(r.templateTitle)
              const sheet = r.templateTitle.match(/Arkusz ([A-C])\b/)?.[1]
              return (
                <li key={`${r.evaluationId}-${r.stageTitle}`}>
                  <div className="dash-dl-row">
                    <span className="dash-term">
                      <strong className={r.overdue ? 'late' : undefined}>{daysLabel(r.daysLeft, r.overdue)}</strong>
                      <span>{r.dueFrom ? `${fmtDate(r.dueFrom)}–${fmtDate(r.dueTo)}` : fmtDate(r.dueTo)}{reason && <Info label="Skąd ten termin" align="start">{reason}</Info>}</span>
                    </span>
                    <span className="dash-who">
                      <Avatar path={`org/${r.employeeId}/avatar`} name={display(r.employeeName)} size={40} decorative />
                      <span className="dash-who-name">
                        <strong>{display(r.employeeName)}</strong>
                        {first ? <span className="dash-first" title="Pierwsza ocena"><span aria-hidden="true">◆</span><span className="sr-only">pierwsza ocena</span></span>
                          : sheet && <span className="dash-sheet" title={`Arkusz ${sheet}`}>{sheet}</span>}
                      </span>
                    </span>
                    <span>{r.stageTitle}</span>
                    <button type="button" className="link" onClick={() => onOpen(r.evaluationId)}>
                      {r.stageKey === 'criteria' ? 'Wybierz kryteria' : 'Otwórz'} <span aria-hidden="true">→</span>
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      )}
      </Reveal>
      </Refreshing>
      )}
      </Loadable>
      <WithoutEvaluationList />
    </section>
  )
}

/** API podaje „Nazwisko Imię”; na ekranie „Imię Nazwisko”. */
const display = (name: string) => {
  const [last, ...rest] = name.split(' ')
  return rest.length ? `${rest.join(' ')} ${last}` : name
}

// Pracownicy, których terminów nikt nie pilnuje (np. dodani przed automatycznym zakładaniem cykli).
function WithoutEvaluationList() {
  const [rows, setRows] = useState<WithoutEvaluation[] | null>(null)

  useEffect(() => {
    api<WithoutEvaluation[]>('dashboard/without-evaluation').then(setRows, () => setRows([]))
  }, [])

  if (!rows || rows.length === 0) return null
  return (
    <section className="card dash-dl-without m-rise-in" aria-labelledby="dl-without">
      <h2 id="dl-without">Bez otwartej oceny <span className="dash-count">{rows.length}</span></h2>
      <ul>
        {rows.map((r) => (
          <li key={r.employeeId}>
            <Person id={r.employeeId} name={display(r.employeeName)}
              detail={`od ${fmtDate(r.hireDate)}${r.subjectToFirstEvaluation ? ' · pierwsza ocena' : ''}`} />
          </li>
        ))}
      </ul>
    </section>
  )
}
