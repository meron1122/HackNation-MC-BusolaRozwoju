import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { api } from './api'
import { EmptyState } from './EmptyState'
import { daysLabel, fmtDate, pathLabel, plural, type Progress } from './evaluation/types'
import { progressReason, waitsFor } from './hifi-helpers'
import './hifi-pages.css'
import { Icon } from './Icon'

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
  useEffect(() => {
    if (!status) return
    const t = setTimeout(() => setStatus(''), 5000)
    return () => clearTimeout(t)
  }, [status])

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
  const paths = distinct(all.map((r) => r.evaluation.templateCode)).sort()
  const phases = distinct(all.map((r) => r.evaluation.phase)).sort((a, b) => a.localeCompare(b, 'pl'))
  const departments = distinct(all.map((r) => `${r.departmentId}|${r.departmentName}`)).map((d) => d.split('|') as [string, string])

  return (
    <section className="hifi-page hifi-hr">
      <div className="hifi-head">
        <div>
          <h1>Oceny w departamencie</h1>
          <p className="hifi-sub">Statusy, terminy i przypomnienia dla przełożonych. Etap i termin dotyczą bieżącego cyklu.</p>
        </div>
        {canRemind && (
          <button type="button" disabled={atRisk.length === 0 || busy !== null} onClick={() => remind(atRisk.map((r) => r.evaluation.evaluationId), 'all')}>
            {busy === 'all' ? 'Wysyłanie…' : `Wyślij przypomnienia (${atRisk.length})`}
          </button>
        )}
      </div>
      <div className="hifi-counters">
        <div className="card hifi-counter" style={{ '--i': 0 } as CSSProperties}><strong>{c.overdue}</strong><span><Icon name="clock" /> Po terminie</span></div>
        <div className="card hifi-counter" style={{ '--i': 1 } as CSSProperties}><strong>{c.dueIn7Days}</strong><span><Icon name="clock" /> Termin w 7 dni</span></div>
        <div className="card hifi-counter" style={{ '--i': 2 } as CSSProperties}><strong>{c.inProgress}</strong><span><Icon name="progress" /> W toku</span></div>
        <div className="card hifi-counter" style={{ '--i': 3 } as CSSProperties}>
          <strong>{c.closedInYear}</strong>
          <span><Icon name="done" /> Zamknięte w
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="Rok zamknięcia">
              {[thisYear, thisYear - 1, thisYear - 2].map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </span>
        </div>
      </div>
      <div className="hifi-filters">
        <FilterGroup label="Ścieżka" value={path} onChange={setPath} all="Wszystkie"
          options={paths.map((code) => [code, pathLabel(code)])} />
        {phases.length > 1 && <FilterGroup label="Etap" value={phase} onChange={setPhase} all="Każdy" options={phases.map((p) => [p, p])} />}
        {departments.length > 1 && <FilterGroup label="Wydział" value={department} onChange={setDepartment} all="Każdy" options={departments} />}
        <button type="button" className={riskOnly ? 'hifi-chip active' : 'hifi-chip'} aria-pressed={riskOnly} onClick={() => setRiskOnly((v) => !v)}>
          <Icon name="clock" /> Tylko zagrożone
        </button>
      </div>
      {rows.length === 0 ? <EmptyState title="Żadna ocena nie pasuje do filtrów">Zmień albo wyczyść filtry powyżej.</EmptyState> : (
        <div className="card hifi-table-card">
          <table className="hifi-table">
            <thead><tr><th>Osoba</th><th>Przełożony</th><th>Ścieżka</th><th>Etap (bieżący cykl)</th><th>Termin</th><th>Czeka na</th><th><span className="sr-only">Akcja</span></th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const p = r.evaluation
                const reason = progressReason(p)
                const waits = waitsFor(p)
                return (
                  <tr key={p.evaluationId}>
                    <td>
                      <button type="button" className="link person-link hifi-person" onClick={() => onOpenEvaluation(p.evaluationId)}>{r.employeeName}</button>
                      {departments.length > 1 && <div className="muted small">{r.departmentName}</div>}
                    </td>
                    <td className="hifi-nowrap">{shortName(r.evaluatorName)}</td>
                    <td className="hifi-nowrap">{pathLabel(p.templateCode)}</td>
                    <td>{p.phase}</td>
                    <td>
                      <div className="hifi-due"><Icon name="clock" /> {p.dueTo ? fmtDate(p.dueTo) : 'niezwłocznie'} · {daysLabel(p.daysLeft, p.overdue)}</div>
                      {reason && <div className="muted small">{reason}</div>}
                    </td>
                    <td>{waits}</td>
                    <td className="hifi-action">
                      {canRemind && waits !== '—' && (
                        <button type="button" className="link" disabled={busy !== null} onClick={() => remind([p.evaluationId], p.evaluationId)}>
                          {busy === p.evaluationId ? 'Wysyłanie…' : 'Przypomnij'}
                        </button>
                      )}
                      {p.lastReminder && <div className="muted small"><Icon name="done" /> wysłano {fmtDate(p.lastReminder.sentAt)}</div>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <div role="status" aria-live="polite" className={status ? 'hifi-toast show' : 'hifi-toast'}>
        {status && <><Icon name="done" /> {status}</>}
      </div>
    </section>
  )
}

/** Filtr jako grupa pigułek (jedna wybrana, „Wszystkie” = brak filtra). */
function FilterGroup({ label, value, onChange, all, options }: {
  label: string; value: string; onChange: (v: string) => void; all: string; options: [string, string][]
}) {
  return (
    <div className="hifi-filter" role="group" aria-label={label}>
      <span className="hifi-filter-label">{label}</span>
      {[['', all] as [string, string], ...options].map(([v, text]) => (
        <button key={v || 'all'} type="button" className={value === v ? 'hifi-chip active' : 'hifi-chip'} aria-pressed={value === v} onClick={() => onChange(v)}>
          {text}
        </button>
      ))}
    </div>
  )
}
