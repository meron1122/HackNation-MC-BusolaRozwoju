import { useEffect, useState } from 'react'
import { EmptyState } from './EmptyState'
import { api } from './api'
import { fmtDate } from './evaluation/types'

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
    <section>
      <div className="toolbar">
        <h2>Nadchodzące terminy</h2>
        <label className="check">
          w ciągu
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {RANGES.map((d) => <option key={d} value={d}>{d} dni</option>)}
          </select>
        </label>
      </div>
      {error && <p role="alert" className="error">{error}</p>}
      {rows && (
        <p className="muted">
          {rows.length} {rows.length === 1 ? 'termin' : 'terminów'}
          {overdue > 0 && <>, w tym <strong className="overdue">{overdue} po terminie</strong></>}.
        </p>
      )}
      {rows === null ? <p>Ładowanie…</p> : rows.length === 0 ? <EmptyState title="W tym okresie nie ma terminów">Wybierz dłuższy zakres powyżej, żeby zobaczyć kolejne terminy etapów.</EmptyState> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Termin</th><th>Zostało</th><th>Pracownik</th><th>Etap</th><th>Arkusz</th><th /></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.evaluationId}-${r.stageTitle}`} className={r.overdue ? 'overdue-row' : undefined}>
                  <td className="nowrap">{r.dueFrom ? `${fmtDate(r.dueFrom)}–${fmtDate(r.dueTo)}` : fmtDate(r.dueTo)}</td>
                  <td className={r.overdue ? 'overdue nowrap' : 'nowrap'}>
                    {r.overdue ? `${-r.daysLeft} dni po terminie` : r.daysLeft === 0 ? 'dziś' : `${r.daysLeft} dni`}
                  </td>
                  <td>{r.employeeName}</td>
                  <td>{r.stageTitle}</td>
                  <td>{r.templateTitle}</td>
                  <td className="actions">
                    <button className="link" onClick={() => onOpen(r.evaluationId)}>
                      {r.stageKey === 'criteria' ? 'Wybierz kryteria' : 'Otwórz ocenę'}
                    </button>
                  </td>
                </tr>
              ))}
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
    <div className="card panel without-evaluation">
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
