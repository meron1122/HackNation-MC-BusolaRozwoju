import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { api } from './api'
import { Avatar } from './Avatar'
import { addressee, termWord } from './dash-model'
import { BellButton, CountUp, HrSkeleton, MiniStepper, SheetMark } from './dash-parts'
import { EmptyEnter, Loadable, Refreshing, Reveal, SentConfirm } from './v2/motion'
import { MedianCard } from './dash-median'
import { EmptyState } from './EmptyState'
import { fmtDate, plural, type EvaluationTerms, type Progress } from './evaluation/types'
import './hifi-pages.css'
import './dash-v2.css'
import { Icon } from './Icon'

type HrRow = {
  employeeId: number; employeeName: string; evaluatorName: string | null; departmentId: number; departmentName: string
  atRisk: boolean; evaluation: Progress
}
type Hr = { counters: { overdue: number; dueIn7Days: number; inProgress: number; closedInYear: number; year: number }; rows: HrRow[] }
/** Jeden wiersz na osobę: najpilniejsza ocena + pozostałe (zamknięta poprzednia, nowy cykl). */
type Group = { main: HrRow; others: HrRow[]; name: string; recalc: number | null }

const thisYear = new Date().getFullYear()
/** API podaje „Nazwisko Imię”; na ekranie „Imię Nazwisko”. */
const display = (name: string) => {
  const [last, ...rest] = name.split(' ')
  return rest.length ? `${rest.join(' ')} ${last}` : name
}
/** „Anna Kowalczyk” → „A. Kowalczyk” */
const shortName = (name: string | null) => {
  if (!name) return 'bez przełożonego'
  const [first, ...rest] = name.split(' ')
  return rest.length ? `${first[0]}. ${rest.join(' ')}` : name
}
const urgency = (r: HrRow) => (r.evaluation.isFinal ? 1e6 : r.evaluation.overdue ? -1e4 + (r.evaluation.daysLeft ?? 0) : r.evaluation.daysLeft ?? 1e5)
const due7 = (p: Progress) => !p.overdue && p.daysLeft != null && p.daysLeft <= 7

/** H14 v2: panel HR — „Po terminie” z twarzą, pasek stanu, lista „Wymaga działania” z przypomnieniami. */
export function HrPanel({ canRemind, onOpenEvaluation }: { canRemind: boolean; onOpenEvaluation: (id: number) => void }) {
  const [year, setYear] = useState(thisYear)
  const [data, setData] = useState<Hr | null>(null)
  const [outside, setOutside] = useState<number | null>(null)
  const [recalc, setRecalc] = useState<Record<number, number>>({})
  const [error, setError] = useState('')
  const [department, setDepartment] = useState('')
  const [filter, setFilter] = useState<'' | 'late' | 'week'>('')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState<number | 'all' | null>(null)
  const [loading, setLoading] = useState(true)
  /** Wiersz (albo „all”), któremu przed chwilą wysłano przypomnienie: dzwonek kołysze się raz, przycisk mówi „Wysłano ✓”. */
  const [justSent, setJustSent] = useState<number | 'all' | null>(null)
  const seeded = useRef(false)

  // `silent`: odświeżenie po przypomnieniu, bez przygaszania listy.
  const load = useCallback((silent = false) => {
    if (!silent) setLoading(true)
    return api<Hr>(`dashboard/hr?year=${year}`)
      .then((d) => { setData(d); setError('') }, (e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [year])
  useEffect(() => {
    load()
  }, [load])
  useEffect(() => {
    api<unknown[]>('dashboard/without-evaluation').then((r) => setOutside(r.length), () => setOutside(null))
  }, [])

  // Przeliczony termin (np. +45 dni L4): zmiany terminów z evaluations/{id}/terms, tylko dla otwartych ocen.
  const openIds = useMemo(() => (data?.rows ?? []).filter((r) => !r.evaluation.isFinal).map((r) => r.evaluation.evaluationId).join(','), [data])
  useEffect(() => {
    if (!openIds) return
    let active = true
    Promise.all(openIds.split(',').map(Number).map((id) =>
      api<EvaluationTerms>(`evaluations/${id}/terms`).then((t) => [id, t.changes.length ? t.absences.length ? sumAbsence(t) : 0 : -1] as const, () => [id, -1] as const)))
      .then((pairs) => active && setRecalc(Object.fromEntries(pairs.filter(([, v]) => v >= 0))))
    return () => { active = false }
  }, [openIds])

  const departments = useMemo(() => [...new Map((data?.rows ?? []).map((r) => [r.departmentId, r.departmentName])).entries()], [data])

  const groups = useMemo<Group[]>(() => {
    const by = new Map<number, HrRow[]>()
    for (const r of data?.rows ?? []) {
      if (department && String(r.departmentId) !== department) continue
      by.set(r.employeeId, [...(by.get(r.employeeId) ?? []), r])
    }
    return [...by.values()].map((rows) => {
      const sorted = [...rows].sort((a, b) => Number(b.atRisk) - Number(a.atRisk) || urgency(a) - urgency(b))
      const main = sorted[0]
      const id = main.evaluation.evaluationId
      return { main, others: sorted.slice(1), name: display(main.employeeName), recalc: id in recalc ? recalc[id] : null }
    }).sort((a, b) => urgency(a.main) - urgency(b.main))
  }, [data, department, recalc])

  const needs = groups.filter((g) => g.recalc == null && !g.main.evaluation.isFinal && (g.main.atRisk || g.main.evaluation.overdue))
  const recalculated = groups.filter((g) => g.recalc != null && !g.main.evaluation.isFinal)
  const rest = groups.filter((g) => !needs.includes(g) && !recalculated.includes(g))
  const late = needs.filter((g) => g.main.evaluation.overdue)
  const week = needs.filter((g) => due7(g.main.evaluation))
  const shown = filter === 'late' ? late : filter === 'week' ? week : needs

  // Domyślnie zaznaczone wszystkie sprawy z listy (jak w makiecie): HR jednym kliknięciem przypomina zaległym.
  useEffect(() => {
    if (seeded.current || !data) return
    seeded.current = true
    setSelected(new Set(needs.map((g) => g.main.evaluation.evaluationId)))
  }, [data, needs])

  useEffect(() => {
    if (!status) return
    const t = setTimeout(() => setStatus(''), 5000)
    return () => clearTimeout(t)
  }, [status])
  useEffect(() => {
    if (justSent === null) return
    const t = setTimeout(() => setJustSent(null), 2400)
    return () => clearTimeout(t)
  }, [justSent])

  // Awatar przełożonego: szukamy go wśród ocenianych (ta sama osoba w kartotece), inaczej inicjały.
  const idByName = useMemo(() => new Map((data?.rows ?? []).map((r) => [display(r.employeeName), r.employeeId])), [data])

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
      setJustSent(scope)
      await load(true)
    } catch (e) {
      setStatus((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const head = (
    <div className="dash-hr-head">
      <h1>Oceny w departamencie</h1>
      {departments.length > 1 ? (
        <select value={department} onChange={(e) => setDepartment(e.target.value)} aria-label="Wydział">
          <option value="">Wszystkie wydziały</option>
          {departments.map(([id, name]) => <option key={id} value={String(id)}>{name}</option>)}
        </select>
      ) : departments[0] && <span className="m-fade-in">{departments[0][1]}</span>}
      <span>{fmtDate(new Date().toISOString())}</span>
    </div>
  )

  return (
    <section className="hifi-page dash dash-hr">
      {head}
      {data && error && <p role="alert" className="error">{error}</p>}
      <Loadable loading={loading && !data} error={data ? '' : error} onRetry={() => load()} skeleton={<HrSkeleton />}>
        {() => data && <Refreshing busy={loading}>{body(data)}</Refreshing>}
      </Loadable>

      <div role="status" aria-live="polite" className={status ? 'hifi-toast show' : 'hifi-toast'}>
        {status && <><Icon name="done" /> {status}</>}
      </div>
    </section>
  )

  function body(data: Hr) {
  const c = data.counters
  const visibleSelected = shown.map((g) => g.main.evaluation.evaluationId).filter((id) => selected.has(id))
  const toggle = (id: number) => setSelected((s) => {
    const next = new Set(s)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
  const allOn = shown.length > 0 && visibleSelected.length === shown.length
  const firstLate = late[0]

  const row = (g: Group, opts: { check?: boolean } = {}) => {
    const p = g.main.evaluation
    const term = termWord(p)
    const to = addressee(p) ? g.main.evaluatorName : null
    const toId = g.main.evaluatorName ? idByName.get(g.main.evaluatorName) : undefined
    return (
      <li key={g.main.employeeId} className="dash-list-row">
        {opts.check ? (
          <input type="checkbox" checked={selected.has(p.evaluationId)} onChange={() => toggle(p.evaluationId)}
            aria-label={`Zaznacz: ${g.name}`} disabled={!canRemind} />
        ) : <span />}
        <span className="dash-who">
          <Avatar path={`org/${g.main.employeeId}/avatar`} name={g.name} size={40} decorative />
          <span className="dash-who-name">
            <button type="button" className="link" onClick={() => onOpenEvaluation(p.evaluationId)}>{g.name}</button>
            <SheetMark code={p.templateCode} />
          </span>
          <span className="dash-who-sub">
            <span>{shortName(g.main.evaluatorName)}</span>
            {g.others.map((o) => (
              <button key={o.evaluation.evaluationId} type="button" className="link" onClick={() => onOpenEvaluation(o.evaluation.evaluationId)}>
                {o.evaluation.isFinal ? <>✓ ocena {o.evaluation.dueTo ? fmtDate(o.evaluation.dueTo) : ''}</> : 'nowy cykl'} <span aria-hidden="true">↗</span>
              </button>
            ))}
          </span>
        </span>
        <MiniStepper progress={p} />
        <span className="dash-term">
          {g.recalc != null ? (
            <>
              <strong>{p.dueTo ? fmtDate(p.dueTo) : '—'}</strong>
              <button type="button" className="link" onClick={() => onOpenEvaluation(p.evaluationId)}>
                {g.recalc > 0 ? `+${g.recalc} dni nieobecności` : 'termin zmieniony'} <span aria-hidden="true">↗</span>
              </button>
            </>
          ) : (
            <>
              <strong className={term.tone === 'late' ? 'late' : undefined}>{term.word}</strong>
              {term.date && <span>{term.date}</span>}
            </>
          )}
        </span>
        {canRemind && to ? (
          <BellButton name={to} avatarPath={toId ? `org/${toId}/avatar` : null} disabled={busy !== null} busy={busy === p.evaluationId}
            justSent={justSent === p.evaluationId || (justSent === 'all' && selected.has(p.evaluationId))}
            sentAt={p.lastReminder ? fmtDate(p.lastReminder.sentAt) : null} onClick={() => remind([p.evaluationId], p.evaluationId)} />
        ) : <span />}
      </li>
    )
  }

  return (
    <>
      <div className="dash-kpi">
        <section className={`dash-late${c.overdue === 0 ? ' zero' : ''}`} aria-label="Po terminie">
          <div className="dash-late-top"><strong><CountUp value={c.overdue} /></strong><span>⚠ Po terminie</span></div>
          {firstLate ? (
            <span className="dash-late-who">
              <Avatar path={`org/${firstLate.main.employeeId}/avatar`} name={firstLate.name} size={32} decorative />
              <button type="button" className="link" onClick={() => onOpenEvaluation(firstLate.main.evaluation.evaluationId)}>
                {firstLate.name} · {termWord(firstLate.main.evaluation).word}
              </button>
            </span>
          ) : <span className="dash-late-who"><Icon name="done" /> Wszystko w terminie</span>}
        </section>
        <SegmentBar done={c.closedInYear} progress={c.inProgress} out={outside} year={year} onYear={setYear} />
      </div>

      <div className="dash-hr-grid with-radar">
        <section className="card dash-list" aria-labelledby="hr-needs">
          <div className="dash-list-head">
            <h2 id="hr-needs">Wymaga działania <span className="dash-count">{needs.length}</span></h2>
            <button type="button" className="dash-chip" aria-pressed={filter === 'late'} onClick={() => setFilter((f) => (f === 'late' ? '' : 'late'))}>
              Po terminie · {late.length}
            </button>
            <button type="button" className="dash-chip" aria-pressed={filter === 'week'} onClick={() => setFilter((f) => (f === 'week' ? '' : 'week'))}>
              W 7 dni · {week.length}
            </button>
            {canRemind && (
              <button type="button" className="dash-primary" disabled={visibleSelected.length === 0 || busy !== null}
                onClick={() => remind(visibleSelected, 'all')}>
                <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
                  <path d="M10 2.5a5 5 0 0 0-5 5v3.2L3.6 13.4a.8.8 0 0 0 .7 1.2h11.4a.8.8 0 0 0 .7-1.2L15 10.7V7.5a5 5 0 0 0-5-5Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                  <path d="M8 16.6a2 2 0 0 0 4 0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
                <SentConfirm sent={justSent === 'all'}>{busy === 'all' ? 'Wysyłanie…' : `Przypomnij (${visibleSelected.length})`}</SentConfirm>
              </button>
            )}
          </div>
          <Reveal k={`${filter}|${department}`}>
          {shown.length === 0 ? <EmptyEnter><p className="dash-list-empty">Nic do zrobienia.</p></EmptyEnter> : (
            <>
              <div className="dash-list-cols">
                <input type="checkbox" checked={allOn} disabled={!canRemind} aria-label="Zaznacz wszystkie"
                  onChange={() => setSelected((s) => {
                    const next = new Set(s)
                    shown.forEach((g) => (allOn ? next.delete(g.main.evaluation.evaluationId) : next.add(g.main.evaluation.evaluationId)))
                    return next
                  })} />
                <span>Osoba</span><span>Etap</span><span>Termin</span><span />
              </div>
              <ul className="m-stagger">{shown.map((g) => row(g, { check: true }))}</ul>
            </>
          )}
          </Reveal>
          {recalculated.length > 0 && (
            <div className="dash-list-sub">
              <h3>Przeliczony termin <span className="dash-count">{recalculated.length}</span></h3>
              <ul>{recalculated.map((g) => row(g))}</ul>
            </div>
          )}
          {rest.length > 0 && (
            <details className="dash-list-sub">
              <summary>Pozostałe <span className="dash-count">{rest.length}</span></summary>
              <ul>{rest.map((g) => row(g))}</ul>
            </details>
          )}
        </section>
        <MedianCard evaluationIds={groups.flatMap((g) => [g.main, ...g.others]).map((r) => r.evaluation.evaluationId).sort((a, b) => a - b)} />
      </div>
      {groups.length === 0 && <EmptyEnter><EmptyState title="Brak ocen w tym wydziale">Wybierz inny wydział.</EmptyState></EmptyEnter>}
    </>
  )
  }
}

/** Suma dni nieobecności, o które przesunięto termin (zmiany terminów + nieobecności oceny). */
function sumAbsence(t: EvaluationTerms): number {
  const day = 86_400_000
  return t.absences.reduce((sum, a) => {
    const end = a.endDate ? new Date(a.endDate).getTime() : Date.now()
    return sum + Math.max(0, Math.round((end - new Date(a.startDate).getTime()) / day) + 1)
  }, 0)
}

/** Pasek segmentowy: zakończone / w toku / poza cyklem (przerywany obrys, więc nie tylko kolor). */
function SegmentBar({ done, progress, out, year, onYear }: { done: number; progress: number; out: number | null; year: number; onYear: (y: number) => void }) {
  const total = done + progress + (out ?? 0)
  const w = (n: number) => `${total ? Math.max(n ? 4 : 0, (n / total) * 100) : 0}%`
  return (
    <section className="card dash-segbar" aria-label="Stan ocen">
      <div className="dash-segbar-total"><strong><CountUp value={total} /></strong><span>{plural(total, 'osoba', 'osoby', 'osób')}</span></div>
      <div className="dash-segbar-bar" aria-hidden="true">
        {done > 0 && <span className="done" style={{ width: w(done), '--i': 0 } as CSSProperties} />}
        {progress > 0 && <span className="progress" style={{ width: w(progress), '--i': 1 } as CSSProperties} />}
        {(out ?? 0) > 0 && <span className="out" style={{ width: w(out ?? 0), '--i': 2 } as CSSProperties} />}
      </div>
      <div className="dash-segbar-legend">
        <span>
          <strong><CountUp value={done} /></strong> zakończone w
          <select value={year} onChange={(e) => onYear(Number(e.target.value))} aria-label="Rok zamknięcia">
            {[thisYear, thisYear - 1, thisYear - 2].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </span>
        <span><strong><CountUp value={progress} /></strong> w toku</span>
        {out != null && <span><strong><CountUp value={out} /></strong> poza cyklem</span>}
      </div>
    </section>
  )
}
