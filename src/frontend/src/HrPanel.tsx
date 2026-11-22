import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from './api'
import { DuePill, Pill } from './evaluation/common'
import { fmtDate, pathLabel, plural, type Progress } from './evaluation/types'

type HrRow = {
  employeeId: number; employeeName: string; evaluatorName: string | null; departmentId: number; departmentName: string
  atRisk: boolean; evaluation: Progress
}
type Hr = { counters: { overdue: number; dueIn7Days: number; inProgress: number; closedInYear: number; year: number }; rows: HrRow[] }

/** „Anna Kowalczyk” → „A. Kowalczyk” */
const shortName = (name: string | null) => {
  if (!name) return '—'
  const [first, ...rest] = name.split(' ')
  return rest.length ? `${first[0]}. ${rest.join(' ')}` : name
}
const distinct = <T,>(values: T[]) => [...new Set(values)]
const thisYear = new Date().getFullYear()

/** W14: panel HR — liczniki, filtry (ścieżka, faza, wydział, tylko zagrożone) i przypomnienia dla przełożonych. */
export function HrPanel({ canRemind, onOpenEvaluation }: { canRemind: boolean; onOpenEvaluation: (id: number) => void }) {
  const [year, setYear] = useState(thisYear)
  const [data, setData] = useState<Hr | null>(null)
  const [error, setError] = useState('')
  const [path, setPath] = useState('')
  const [phase, setPhase] = useState('')
  const [department, setDepartment] = useState('')
  const [riskOnly, setRiskOnly] = useState(false)
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState<number | 'all' | null>(null)

  const load = useCallback(() => api<Hr>(`dashboard/hr?year=${year}`).then(setData, (e: Error) => setError(e.message)), [year])
  useEffect(() => {
    load()
  }, [load])

  const rows = useMemo(() => (data?.rows ?? []).filter((r) =>
    (!path || r.evaluation.templateCode === path)
    && (!phase || r.evaluation.phase === phase)
    && (!department || String(r.departmentId) === department)
    && (!riskOnly || r.atRisk)), [data, path, phase, department, riskOnly])
  const atRisk = rows.filter((r) => r.atRisk)

  async function remind(ids: number[], scope: number | 'all') {
    setBusy(scope)
    try {
      if (scope === 'all') {
        const res = await api<{ sent: number; skipped: number[] }>('evaluations/reminders', 'POST', { evaluationIds: ids })
        setStatus(`Wysłano ${res.sent} ${plural(res.sent, 'przypomnienie', 'przypomnienia', 'przypomnień')}${res.skipped.length ? `, pominięto ${res.skipped.length}` : ''}.`)
      } else {
        await api(`evaluations/${ids[0]}/reminders`, 'POST', {})
        setStatus('Wysłano przypomnienie.')
      }
      await load()
    } catch (e) {
      setStatus((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  if (error) return <p role="alert" className="error">{error}</p>
  if (!data) return <p>Ładowanie…</p>
  const c = data.counters
  const all = data.rows

  return (
    <section className="hr-panel">
      <div className="toolbar">
        <h2>Oceny w departamencie</h2>
        {canRemind && (
          <button type="button" disabled={atRisk.length === 0 || busy !== null} onClick={() => remind(atRisk.map((r) => r.evaluation.evaluationId), 'all')}>
            {busy === 'all' ? 'Wysyłanie…' : `Wyślij przypomnienia (${atRisk.length})`}
          </button>
        )}
      </div>
      <div className="counters">
        <div className="card counter"><strong>{c.overdue}</strong><Pill tone="danger">Po terminie</Pill></div>
        <div className="card counter"><strong>{c.dueIn7Days}</strong><Pill tone="warn">Termin w 7 dni</Pill></div>
        <div className="card counter"><strong>{c.inProgress}</strong><Pill tone="info">W toku</Pill></div>
        <div className="card counter">
          <strong>{c.closedInYear}</strong>
          <label className="check"><Pill tone="ok">Zamknięte w</Pill>
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="Rok">
              {[thisYear, thisYear - 1, thisYear - 2].map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
        </div>
      </div>
      <div className="filters">
        <select value={path} onChange={(e) => setPath(e.target.value)} aria-label="Ścieżka">
          <option value="">Wszystkie ścieżki</option>
          {distinct(all.map((r) => r.evaluation.templateCode)).sort().map((code) => <option key={code} value={code}>{pathLabel(code)}</option>)}
        </select>
        <select value={phase} onChange={(e) => setPhase(e.target.value)} aria-label="Etap">
          <option value="">Każdy etap</option>
          {distinct(all.map((r) => r.evaluation.phase)).sort((a, b) => a.localeCompare(b, 'pl')).map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={department} onChange={(e) => setDepartment(e.target.value)} aria-label="Wydział">
          <option value="">Każdy wydział</option>
          {distinct(all.map((r) => `${r.departmentId}|${r.departmentName}`)).map((d) => {
            const [id, name] = d.split('|')
            return <option key={id} value={id}>{name}</option>
          })}
        </select>
        <button type="button" className={riskOnly ? 'chip-button active' : 'chip-button'} aria-pressed={riskOnly} onClick={() => setRiskOnly((v) => !v)}>Tylko zagrożone</button>
      </div>
      {status && <p className="muted" role="status">{status}</p>}
      {rows.length === 0 ? <p className="muted">Brak ocen dla wybranych filtrów.</p> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Osoba</th><th>Przełożony</th><th>Ścieżka</th><th>Etap</th><th>Termin</th><th>Status</th><th>Akcja</th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const p = r.evaluation
                return (
                  <tr key={p.evaluationId}>
                    <td><button type="button" className="link person-link" onClick={() => onOpenEvaluation(p.evaluationId)}><strong>{r.employeeName}</strong></button></td>
                    <td>{shortName(r.evaluatorName)}</td>
                    <td>{pathLabel(p.templateCode)}</td>
                    <td>{p.phase}<br /><span className="muted small">{r.departmentName}</span></td>
                    <td className="nowrap">{p.dueTo ? fmtDate(p.dueTo) : '—'}</td>
                    <td><DuePill daysLeft={p.daysLeft} overdue={p.overdue} /></td>
                    <td>
                      {canRemind && (
                        <button type="button" className="link" disabled={busy !== null} onClick={() => remind([p.evaluationId], p.evaluationId)}>
                          {busy === p.evaluationId ? 'Wysyłanie…' : 'Przypomnij'}
                        </button>
                      )}
                      {p.lastReminder && <p className="muted small">ostatnio {fmtDate(p.lastReminder.sentAt)}</p>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
