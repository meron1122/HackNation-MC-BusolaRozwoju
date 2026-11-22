import { useState, type FormEvent, type ReactNode } from 'react'
import { api, apiDownload } from '../api'
import { DateInput } from '../DateInput'
import { Info } from '../v2'
import { useApi } from './data'
import { fmtDate, isFirstTemplate, type Detail, type EvaluationTerms, type TermChange } from './types'
import './term-panel.css'

const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
/** Jak AddMonths w .NET: ten sam dzień miesiąca, a gdy go brak — ostatni dzień miesiąca. */
const addMonths = (iso: string, months: number) => {
  const [y, m, d] = iso.split('-').map(Number)
  const target = new Date(Date.UTC(y, m - 1 + months, 1))
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(d, last))
  return target.toISOString().slice(0, 10)
}
const minIso = (a: string, b: string | null | undefined) => (b && b < a ? b : a)

const GROUNDS = [
  'zmiana na stanowisku oceniającego',
  'przewidywana dłuższa usprawiedliwiona nieobecność ocenianego',
  'przewidywana dłuższa usprawiedliwiona nieobecność oceniającego',
  'wniosek ocenianego',
]

function range(from: string | null, to: string | null) {
  return from ? `${fmtDate(from)} – ${fmtDate(to)}` : `do ${fmtDate(to)}`
}

function describe(c: TermChange): string {
  if (c.kind === 'ContractExtension') return `umowa przedłużona do ${fmtDate(c.contractEnd)}; okres oceny do ${fmtDate(c.newTo)}`
  if (c.kind === 'ReportTerm') return `sprawozdanie: ${range(c.oldFrom, c.oldTo)} → ${range(c.newFrom, c.newTo)}`
  return `termin oceny: ${fmtDate(c.oldTo)} → ${fmtDate(c.newTo)}`
}

/** Formularz decyzji: wysyła body, po sukcesie odświeża terminy i ocenę. */
function DecisionForm({ title, info, action, submitLabel, onDone, children }: {
  title: string; info?: ReactNode; action: (form: FormData) => Promise<unknown>; submitLabel: string; onDone: () => Promise<void>; children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true)
    try {
      await action(new FormData(e.currentTarget))
      setError('')
      setOpen(false)
      await onDone()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }
  if (!open) return <button type="button" className="secondary" onClick={() => setOpen(true)}>{title}</button>
  return (
    <form onSubmit={submit} className="card form tpv2-form">
      <div className="tpv2-head">
        <h4>{title}</h4>
        {info && <Info label="Zasady zmiany terminu" align="end">{info}</Info>}
      </div>
      {children}
      {error && <p role="alert" className="error">{error}</p>}
      <div className="buttons">
        <button type="submit" disabled={busy}>{busy ? 'Zapisywanie…' : submitLabel}</button>
        <button type="button" className="secondary" onClick={() => setOpen(false)}>Anuluj</button>
      </div>
    </form>
  )
}

/**
 * Terminy i nieobecności w ocenie. Ocena okresowa: przedłużenie z art. 81 ust. 7 liczy się samo (widać je w terminie
 * etapu), oceniający może zmienić termin z art. 81 ust. 8. Pierwsza ocena: przy nieobecności w terminie sprawozdania
 * przełożony wyznacza nowy termin (§ 5), a przy nieobecnościach ponad 3 miesiące można przedłużyć umowę (art. 35 ust. 4).
 * Decyzje wymagające pisma mają PDF zawiadomienia.
 */
export function TermPanel({ detail, reload }: { detail: Detail; reload: () => Promise<void> | void }) {
  const { data, reload: reloadTerms } = useApi<EvaluationTerms>(`evaluations/${detail.id}/terms`)
  if (!data) return null
  const first = isFirstTemplate(detail.templateCode)
  const reportDef = detail.schema.stages?.find((s) => s.completedBy === 'evaluated')
  const report = reportDef && detail.stages.find((s) => s.key === reportDef.key)
  const empty = !data.absences.length && !data.changes.length && !data.canChangeReportTerm && !data.canChangeEvaluationTerm && !data.canExtendContract
  if (empty) return null

  const done = async () => {
    await reloadTerms()
    await reload()
  }
  const post = (path: string, body: unknown) => api(`evaluations/${detail.id}/terms/${path}`, 'POST', body)
  const suggestion = data.reportSuggestion
  const suggestedTo = suggestion ? minIso(suggestion.to, suggestion.latest) : null
  // Umowa na 12 miesięcy od nawiązania stosunku pracy (art. 35 ust. 3), chyba że w profilu jest inny koniec.
  const baseEnd = data.contractEnd ?? addDays(addMonths(detail.startDate, 12), -1)

  return (
    <details className="card" open={!!suggestion || !!data.firstYear?.threshold || data.changes.length > 0}>
      <summary><strong>Terminy i nieobecności</strong>{data.absences.length > 0 && <span className="muted small"> · nieobecności: {data.absences.length}</span>}</summary>

      {data.absences.length > 0 && (
        <ul className="small">
          {data.absences.map((a) => (
            <li key={a.id}>{fmtDate(a.startDate)} – {a.endDate ? fmtDate(a.endDate) : 'trwa'} · {a.reasonName}</li>
          ))}
        </ul>
      )}

      {first && suggestion && report?.status === 'Pending' && (
        <p className="callout attention small">
          W terminie sprawozdania pracownik był nieobecny {suggestion.absenceDays} dni: {suggestion.absences.join('; ')}.
          Możesz wyznaczyć nowy termin, przedłużając pierwotny o okres nieobecności (§ 5 ust. 1) — do {fmtDate(suggestion.to)}{' '}
          (teraz: {range(report.dueFrom, report.dueTo)}).
          {suggestion.latest && suggestion.to > suggestion.latest && (
            <> To wychodzi poza okres oceny — termin może kończyć się najpóźniej {fmtDate(suggestion.latest)} (§ 5 ust. 3); rozważ przedłużenie umowy.</>
          )}
        </p>
      )}

      {first && data.firstYear?.threshold && (
        <p className="callout info small">
          Usprawiedliwione nieobecności w pierwszych 12 miesiącach: {data.firstYear.justifiedDays} dni
          {data.firstYear.longContinuous ? ', w tym ciągła ponad 3 miesiące' : ' (łącznie ponad 90 dni)'}. Na wniosek pracownika dyrektor
          generalny może przedłużyć umowę o czas nieobecności (art. 35 ust. 4 ustawy); okres oceny przesunie się z końcem umowy.
        </p>
      )}

      <div className="buttons tpv2-actions">
        {data.canChangeReportTerm && report && (
          <DecisionForm title="Wyznacz nowy termin sprawozdania" submitLabel="Wyznacz termin" onDone={done}
            action={(f) => post('report', {
              dueFrom: String(f.get('dueFrom') ?? '') || null,
              dueTo: String(f.get('dueTo') ?? ''),
              reason: String(f.get('reason') ?? ''),
              afterContractExtension: f.get('afterContract') === 'on',
            })}>
            <p className="muted small">
              Dotychczas: {range(report.dueFrom, report.dueTo)}. Nowy termin przedłuża dotychczasowy o okres nieobecności albo pracy poza miejscem
              pracy (§ 5 ust. 1) i musi pozwolić na ocenę najpóźniej miesiąc przed końcem stosunku pracy (§ 5 ust. 3). Pracownika zawiadamiasz
              pisemnie (PDF poniżej po zapisie), kopia do arkusza (§ 5 ust. 4).
            </p>
            <div className="field-grid">
              <label>Od<DateInput name="dueFrom" defaultValue={report.dueFrom ?? ''} /></label>
              <label>Do<DateInput name="dueTo" required defaultValue={suggestedTo ?? ''} min={report.dueTo ?? undefined} max={suggestion?.latest ?? undefined} /></label>
            </div>
            <label className="block-label">Uzasadnienie
              <textarea name="reason" rows={2} maxLength={1000} required
                defaultValue={suggestion ? `Usprawiedliwiona nieobecność w terminie: ${suggestion.absences.join('; ')}.` : ''} />
            </label>
            <label className="check"><input type="checkbox" name="afterContract" /> po przedłużeniu umowy (§ 5 ust. 2)</label>
          </DecisionForm>
        )}

        {data.canExtendContract && (
          <DecisionForm title="Przedłużenie umowy (art. 35 ust. 4)" submitLabel="Zapisz przedłużenie" onDone={done}
            action={(f) => post('contract', { contractEnd: String(f.get('contractEnd') ?? ''), reason: String(f.get('reason') ?? '') })}>
            <p className="muted small">
              Zapisz decyzję dyrektora generalnego: umowa przedłuża się o czas usprawiedliwionej nieobecności, a pierwszą ocenę trzeba dokonać
              najpóźniej miesiąc przed nowym końcem umowy. Potem wyznacz nowy termin sprawozdania (§ 5 ust. 2).
            </p>
            <div className="field-grid">
              <label>Nowy koniec umowy
                <DateInput name="contractEnd" required min={addDays(baseEnd, 1)}
                  defaultValue={data.firstYear?.justifiedDays ? addDays(baseEnd, data.firstYear.justifiedDays) : ''} />
              </label>
            </div>
            <label className="block-label">Uzasadnienie
              <textarea name="reason" rows={2} maxLength={1000} required defaultValue="Decyzja dyrektora generalnego na wniosek pracownika — przedłużenie o czas usprawiedliwionej nieobecności." />
            </label>
          </DecisionForm>
        )}

        {data.canChangeEvaluationTerm && (
          <DecisionForm title="Zmień termin oceny (art. 81 ust. 8)" submitLabel="Zmień termin" onDone={done}
            info={<>Gdy od początku okresu oceny minęło ponad 6 miesięcy. Pracownika zawiadamiasz pisemnie, kopia do arkusza (§ 8 rozporządzenia).
              Po zmianie termin nie przedłuża się już sam o nieobecności.</>}
            action={(f) => post('evaluation', { dueTo: String(f.get('dueTo') ?? ''), ground: Number(f.get('ground')), reason: String(f.get('reason') ?? '') })}>
            <p className="tpv2-lead">Nowy termin najwcześniej {fmtDate(data.evaluationTermEarliest)}.</p>
            <fieldset className="tpv2-grounds">
              <legend>Podstawa</legend>
              <div className="tpv2-tiles">
                {GROUNDS.map((g, i) => (
                  <label key={g} className="tpv2-tile">
                    <input type="radio" name="ground" value={i + 1} required defaultChecked={i === 1} />
                    <span><small>pkt {i + 1}</small>{g}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="tpv2-fields">
              <label className="tpv2-field">Nowy termin<DateInput name="dueTo" required min={data.evaluationTermEarliest ?? undefined} /></label>
              <label className="tpv2-field">Uzasadnienie<textarea name="reason" rows={2} maxLength={1000} required /></label>
            </div>
          </DecisionForm>
        )}
      </div>

      {data.changes.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Data</th><th>Zmiana</th><th>Podstawa</th><th>Kto</th><th><span className="sr-only">Zawiadomienie</span></th></tr></thead>
            <tbody>
              {data.changes.map((c) => (
                <tr key={c.id}>
                  <td>{fmtDate(c.changedOn)}</td>
                  <td>{describe(c)}<br /><span className="muted small">{c.reason}</span></td>
                  <td>{c.legalRef}</td>
                  <td>{c.changedByName}</td>
                  <td className="actions">
                    {c.hasNotice && (
                      <button type="button" className="link"
                        onClick={() => apiDownload(`evaluations/${detail.id}/terms/changes/${c.id}/pdf`, `zawiadomienie-${detail.id}-${c.id}.pdf`)}>
                        Zawiadomienie (PDF)
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </details>
  )
}
