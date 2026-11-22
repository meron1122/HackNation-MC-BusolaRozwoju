import { useEffect, useState } from 'react'
import { EmptyState } from './EmptyState'
import { api } from './api'
import { daysLabel, fmtDate, plural } from './evaluation/types'
import { deadlineReason } from './hifi-helpers'
import './hifi-pages.css'
import { Icon } from './Icon'

type Deadline = {
  evaluationId: number; employeeName: string; templateTitle: string; stageKey: string; stageTitle: string
  dueFrom: string | null; dueTo: string; daysLeft: number; overdue: boolean
}
type WithoutEvaluation = { employeeId: number; employeeName: string; hireDate: string; subjectToFirstEvaluation: boolean }

const RANGES = [30, 60, 90, 365]

export function DeadlinesPage({ onOpen }: { onOpen: (evaluationId: number) => void }) {
  const [days, setDays] = useState(60)
  const [rows, setRows] = useState<Deadline[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api<Deadline[]>(`dashboard/deadlines?days=${days}`).then(setRows, (e: Error) => setError(e.message))
  }, [days])

  const overdue = rows?.filter((r) => r.overdue).length ?? 0

  return (
    <section className="hifi-page hifi-deadlines">
      <div className="hifi-head">
        <div>
          <h1>Nadchodzące terminy</h1>
          <p className="hifi-sub">
            {rows ? <>{rows.length} {plural(rows.length, 'termin', 'terminy', 'terminów')} w ciągu {days} dni{overdue > 0 && <>, w tym <strong>{overdue} po terminie</strong></>}.</> : 'Etapy ocen, które prowadzisz.'}
          </p>
        </div>
        <div className="hifi-filter" role="group" aria-label="Zakres">
          <span className="hifi-filter-label">W ciągu</span>
          {RANGES.map((d) => (
            <button key={d} type="button" className={d === days ? 'hifi-chip active' : 'hifi-chip'} aria-pressed={d === days} onClick={() => setDays(d)}>{d} dni</button>
          ))}
        </div>
      </div>
      {error && <p role="alert" className="error">{error}</p>}
      {rows === null ? <p>Ładowanie…</p> : rows.length === 0 ? <EmptyState title="W tym okresie nie ma terminów">Wybierz dłuższy zakres powyżej, żeby zobaczyć kolejne terminy etapów.</EmptyState> : (
        <div className="card hifi-table-card">
          <table className="hifi-table">
            <thead><tr><th>Termin</th><th>Pracownik</th><th>Etap</th><th>Arkusz</th><th><span className="sr-only">Akcja</span></th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const reason = deadlineReason(r.stageKey, r.dueTo, /pierwsz/i.test(r.templateTitle))
                return (
                  <tr key={`${r.evaluationId}-${r.stageTitle}`}>
                    <td>
                      <div className="hifi-due">
                        <Icon name="clock" /> {r.dueFrom ? `${fmtDate(r.dueFrom)}–${fmtDate(r.dueTo)}` : fmtDate(r.dueTo)} · {daysLabel(r.daysLeft, r.overdue)}
                      </div>
                      {reason && <div className="muted small">{reason}</div>}
                    </td>
                    <td><strong>{r.employeeName}</strong></td>
                    <td>{r.stageTitle}</td>
                    <td>{r.templateTitle}</td>
                    <td className="hifi-action">
                      <button className="link" onClick={() => onOpen(r.evaluationId)}>
                        {r.stageKey === 'criteria' ? 'Wybierz kryteria' : 'Otwórz ocenę'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <WithoutEvaluationList />
    </section>
  )
}

// Pracownicy, których terminów nikt nie pilnuje (np. dodani przed automatycznym zakładaniem cykli).
function WithoutEvaluationList() {
  const [rows, setRows] = useState<WithoutEvaluation[] | null>(null)

  useEffect(() => {
    api<WithoutEvaluation[]>('dashboard/without-evaluation').then(setRows, () => setRows([]))
  }, [])

  if (!rows || rows.length === 0) return null
  return (
    <div className="card hifi-card hifi-without">
      <h3>Bez otwartej oceny ({rows.length})</h3>
      <p className="muted">Ci pracownicy nie mają trwającego cyklu, więc ich terminów nic nie pilnuje. Załóż ocenę w zakładce „Oceny”.</p>
      <ul>
        {rows.map((r) => (
          <li key={r.employeeId}>
            {r.employeeName} <span className="muted">— data zatrudnienia {fmtDate(r.hireDate)}{r.subjectToFirstEvaluation ? ', podlega pierwszej ocenie' : ''}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
