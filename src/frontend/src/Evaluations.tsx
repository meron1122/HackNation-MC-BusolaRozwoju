import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { api, apiBlobUrl } from './api'
import { Avatar } from './Avatar'
import type { Row } from './Crud'
import { initialValues, signatureState } from './evaluation/data'
import { EvaluationWizard } from './evaluation/Wizard'
import {
  NO_BASIS, RESULT_LABELS, emptyAnswer, fmtDate, keyOf, pathLabel, today,
  type Answer, type Competency, type Cond, type Detail, type Field, type Level, type ScaleOption, type Section, type Stage,
} from './evaluation/types'
import { SignaturePad } from './SignaturePad'
import { SignatureLinkPanel } from './Signatures'

type ListItem = {
  id: number; employeeName: string; templateTitle: string; statusLabel: string; isFinal: boolean
  startDate: string; nextStageTitle: string | null; nextDueTo: string | null; templateCode?: string; phase?: string
}
type Template = { id: number; code: string; title: string }

/** Ocena otwiera się w kreatorze (kroki jak w wireframe'ach); „Cały arkusz” to dawny formularz wszystkich sekcji. */
export function EvaluationsPage({ canAdd, openId, onOpen }: { canAdd: boolean; openId: number | null; onOpen: (id: number | null) => void }) {
  const [sheetFor, setSheetFor] = useState<number | null>(null)
  if (openId === null) return <EvaluationList canAdd={canAdd} onOpen={onOpen} />
  return sheetFor === openId
    ? <EvaluationCard id={openId} onBack={() => setSheetFor(null)} backLabel="Wróć do kroków oceny" />
    : <EvaluationWizard key={openId} id={openId} onBack={() => onOpen(null)} onShowSheet={() => setSheetFor(openId)} onOpenEvaluation={onOpen} />
}

function EvaluationList({ canAdd, onOpen }: { canAdd: boolean; onOpen: (id: number) => void }) {
  const [rows, setRows] = useState<ListItem[] | null>(null)
  const [error, setError] = useState('')
  const [adding, setAdding] = useState(false)

  const load = useCallback(() => api<ListItem[]>('evaluations').then(setRows, (e: Error) => setError(e.message)), [])
  useEffect(() => {
    load()
  }, [load])

  return (
    <section>
      <div className="toolbar">
        <h2>Oceny</h2>
        {canAdd && !adding && <button onClick={() => setAdding(true)}>Załóż ocenę</button>}
      </div>
      {error && <p role="alert" className="error">{error}</p>}
      {adding && <CreateForm onCancel={() => setAdding(false)} onCreated={(id) => onOpen(id)} />}
      {rows === null ? <p>Ładowanie…</p> : rows.length === 0 ? <p className="muted">Brak ocen.</p> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Pracownik</th><th>Ścieżka</th><th>Faza</th><th>Najbliższy etap</th><th>Termin</th><th /></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.employeeName}</td>
                  <td title={r.templateTitle}>{r.templateCode ? pathLabel(r.templateCode) : r.templateTitle}</td>
                  <td>{r.phase ?? r.statusLabel}</td>
                  <td>{r.nextStageTitle ?? '—'}</td>
                  <td className={r.nextDueTo && r.nextDueTo < today() ? 'overdue' : undefined}>{fmtDate(r.nextDueTo)}</td>
                  <td className="actions"><button className="link" onClick={() => onOpen(r.id)}>Otwórz</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function CreateForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: (id: number) => void }) {
  const [employees, setEmployees] = useState<Row[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    api<Row[]>('employees?pageSize=200').then(setEmployees, () => setEmployees([]))
    api<Template[]>('evaluation-templates').then(setTemplates, () => setTemplates([]))
  }, [])

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const startDate = String(form.get('startDate') ?? '')
    try {
      const created = await api<{ id: number }>('evaluations', 'POST', {
        employeeId: Number(form.get('employeeId')),
        templateCode: form.get('templateCode'),
        startDate: startDate === '' ? null : startDate,
      })
      onCreated(created.id)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <form onSubmit={submit} className="form card">
      <label>Pracownik
        <select name="employeeId" required defaultValue="">
          <option value="">— wybierz —</option>
          {employees.map((e) => <option key={e.id} value={e.id}>{e.lastName} {e.firstName}</option>)}
        </select>
      </label>
      <label>Arkusz
        <select name="templateCode" required defaultValue="">
          <option value="">— wybierz —</option>
          {templates.map((t) => <option key={t.code} value={t.code}>{t.title}</option>)}
        </select>
      </label>
      <label>Początek (puste = data zatrudnienia / dziś)
        <input name="startDate" type="date" />
      </label>
      <p className="muted">Pierwsza ocena: od daty zatrudnienia. Okresowa: od sporządzenia poprzedniej oceny albo zatrudnienia na czas nieokreślony.</p>
      {error && <p role="alert" className="error">{error}</p>}
      <div className="buttons">
        <button type="submit">Załóż</button>
        <button type="button" className="secondary" onClick={onCancel}>Anuluj</button>
      </div>
    </form>
  )
}

// --- karta oceny (cały arkusz) ---

function EvaluationCard({ id, onBack, backLabel = 'Wróć do listy' }: { id: number; onBack: () => void; backLabel?: string }) {
  const [detail, setDetail] = useState<Detail | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(() => api<Detail>(`evaluations/${id}`).then(setDetail, (e: Error) => setError(e.message)), [id])
  useEffect(() => {
    load()
  }, [load])

  if (!detail) return error ? <p role="alert" className="error">{error}</p> : <p>Ładowanie…</p>

  return (
    <section className="evaluation">
      <div className="toolbar">
        <h2>{detail.templateTitle}</h2>
        <button className="secondary" onClick={onBack}>{backLabel}</button>
      </div>
      <div className="card panel">
        <div className="avatar-row">
          <Avatar path={`employees/${detail.employeeId}/avatar`} name={detail.employeeName} size={48} />
          <p>
            <strong>{detail.employeeName}</strong> · status: <strong>{detail.statusLabel}</strong><br />
            <span className="muted">Oceniający / przełożony: {detail.evaluatorName ?? '—'} · początek: {detail.startDate}</span>
          </p>
        </div>
        {detail.isOwn && <p className="muted">To Twoja ocena — możesz ją przeglądać i podpisać swoje pola.</p>}
        {!detail.canEdit && !detail.isOwn && <p className="muted">Tylko podgląd.</p>}
      </div>
      {detail.canEdit && detail.stages.some((s) => s.key === 'criteria' && s.status === 'Pending')
        && detail.schema.sections.some((s) => s.fields.some((f) => f.type === 'criteriaSelection' && f.additional?.from === 'competencyModel')) && (
        <div className="card panel cycle-start">
          <p>
            <strong>Początek cyklu:</strong> wybierz do 3 kryteriów dodatkowych z modelu kompetencji i omów je z ocenianym
            {detail.stages.find((s) => s.key === 'criteria')?.dueTo && <> (termin: {detail.stages.find((s) => s.key === 'criteria')!.dueTo})</>}.
          </p>
          <div className="buttons">
            <button onClick={() => document.getElementById('criteria-picker')?.scrollIntoView({ behavior: 'smooth' })}>Wybierz kryteria</button>
          </div>
        </div>
      )}
      <Stages detail={detail} onChange={load} />
      {error && <p role="alert" className="error">{error}</p>}
      <SheetForm key={JSON.stringify(detail.answers)} detail={detail} onSaved={load} />
    </section>
  )
}

export function Stages({ detail, onChange }: { detail: Detail; onChange: () => void }) {
  const [error, setError] = useState('')

  async function run(action: () => Promise<unknown>) {
    try {
      await action()
      setError('')
      onChange()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  function complete(e: FormEvent<HTMLFormElement>, stage: Stage) {
    e.preventDefault()
    const completedOn = new FormData(e.currentTarget).get('completedOn')
    run(() => api(`evaluations/${detail.id}/stages/${stage.key}/complete`, 'POST', { completedOn }))
  }

  const canChange = (s: Stage) => detail.canEdit || (s.optional && !detail.isOwn && detail.isFinal)
  // Etap zamykany przez ocenianego (sprawozdanie) przełożony tylko pomija po terminie — w kroku „Sprawozdanie” kreatora.
  const closedByEvaluated = (s: Stage) => detail.schema.stages?.find((d) => d.key === s.key)?.completedBy === 'evaluated'

  return (
    <div className="card panel">
      <h3>Etapy i terminy</h3>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Etap</th><th>Termin</th><th>Stan</th><th /></tr></thead>
          <tbody>
            {detail.stages.map((s) => (
              <tr key={s.key}>
                <td>{s.title}{s.optional && <span className="muted"> (opcjonalny)</span>}</td>
                <td className={s.overdue ? 'overdue' : undefined}>
                  {s.dueFrom && s.dueTo ? `${s.dueFrom} – ${s.dueTo}` : s.dueTo ? `do ${s.dueTo}` : s.status === 'Pending' ? 'po poprzednim etapie' : '—'}
                  {s.overdue && ' (po terminie)'}
                </td>
                <td>{s.status === 'Completed' ? `wykonany ${s.completedOn}` : s.status === 'Skipped' ? 'pominięty' : 'otwarty'}</td>
                <td className="actions">
                  {s.status === 'Pending' && canChange(s) && !closedByEvaluated(s) && (
                    <form className="inline" onSubmit={(e) => complete(e, s)}>
                      <input name="completedOn" type="date" defaultValue={today()} required aria-label="Data wykonania" />
                      <button type="submit" className="link">Zamknij etap</button>
                      {s.optional && (
                        <button type="button" className="link" onClick={() => run(() => api(`evaluations/${detail.id}/stages/${s.key}/skip`, 'POST'))}>
                          Pomiń
                        </button>
                      )}
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {error && <p role="alert" className="error">{error}</p>}
    </div>
  )
}

/** Pole z poprzedniej oceny (prefill previous.*) — wypełnia backend przy sporządzeniu oceny, tu tylko do odczytu. */
const fromPrevious = (f: Field) => typeof f.prefill === 'string' && f.prefill.startsWith('previous.')

/**
 * Formularz sekcji arkusza. Bez `sectionKeys` — cały arkusz; kreator ocen podaje sekcje swojego kroku
 * (i ewentualnie `fieldFilter`). Pola liczone (computed) i sekcje zamkniętych etapów są tylko do odczytu.
 */
export function SheetForm({ detail, onSaved, sectionKeys, fieldFilter, showStage = true }: {
  detail: Detail
  onSaved: () => void
  sectionKeys?: string[]
  fieldFilter?: (f: Field) => boolean
  showStage?: boolean
}) {
  const [values, setValues] = useState(() => initialValues(detail))
  const [status, setStatus] = useState<Record<string, string>>({})
  const schema = detail.schema
  const allFields = schema.sections.flatMap((s) => s.fields)
  const scoring = detail.scoring

  const get = (fieldKey: string, itemKey: string | null = null) => values[keyOf(fieldKey, itemKey)]
  const set = (fieldKey: string, itemKey: string | null, patch: Partial<Answer>) =>
    setValues((v) => ({ ...v, [keyOf(fieldKey, itemKey)]: { ...(v[keyOf(fieldKey, itemKey)] ?? emptyAnswer(fieldKey, itemKey)), ...patch } }))
  const isComputed = (fieldKey: string) => !!allFields.find((f) => f.key === fieldKey)?.computed
  // Wynik i poziom liczy backend: warunki (np. uzasadnienie przy ocenie negatywnej) patrzą na wyliczoną wartość.
  const textOf = (fieldKey: string): string | null => {
    if (isComputed(fieldKey) && scoring) {
      if (fieldKey === schema.scoring?.result && scoring.result) return scoring.result
      if (fieldKey === schema.scoring?.level && scoring.level) return scoring.level
    }
    return get(fieldKey)?.valueText ?? null
  }
  const matches = (c?: Cond) => !c || c.in.includes(textOf(c.field) ?? '')

  const competencies = schema.competencyModel?.competencies ?? {}
  const fromModel = (f?: Field) => f?.additional?.from === 'competencyModel'

  // Kryteria dodatkowe wybrane z modelu: wpisy pola criteriaSelection spoza obowiązkowych.
  function additionalKeys(source: Field): string[] {
    const mandatory = new Set((source.mandatory ?? []).map((m: { key: string }) => m.key))
    return Object.values(values)
      .filter((a) => a.fieldKey === source.key && a.itemKey && !mandatory.has(a.itemKey) && a.valueText)
      .map((a) => a.itemKey!)
  }

  // Pozycje ocen cząstkowych: z szablonu albo z wybranych kryteriów (obowiązkowe + dodatkowe).
  function scoreItems(field: Field): { key: string; label: string }[] {
    if (field.items) return field.items
    const source = allFields.find((f) => f.key === field.itemsFrom)
    if (!source) return []
    const additional = fromModel(source)
      ? additionalKeys(source).map((key) => ({ key, label: competencies[key]?.name ?? get(source.key, key)?.valueText ?? key }))
      : Array.from({ length: source.additional?.max ?? 0 }, (_, i) => `extra_${i + 1}`)
        .map((key) => ({ key, label: get(source.key, key)?.valueText ?? '' }))
        .filter((x) => x.label)
    return [...(source.mandatory ?? []), ...additional]
  }

  // Podpowiedź oceny cząstkowej: średnia ocenionych wskaźników zaokrąglona do najbliższego stopnia skali.
  function suggestion(indicatorField: Field | undefined, competency: Competency, scale: ScaleOption[]) {
    if (!indicatorField) return null
    const answers = competency.indicators.map((i) => get(indicatorField.key, i.key))
    const rated = answers.map((a) => a?.valueNumber).filter((n): n is number => n != null)
    const noBasis = answers.filter((a) => a?.valueText === NO_BASIS).length
    if (rated.length === 0) return { rated: 0, noBasis, total: competency.indicators.length, mean: null, value: null }
    const mean = rated.reduce((a, b) => a + b, 0) / rated.length
    const value = scale.reduce((best, o) => (Math.abs(o.value - mean) < Math.abs(best - mean) ? o.value : best), scale[0].value)
    return { rated: rated.length, noBasis, total: competency.indicators.length, mean: Math.round(mean * 100) / 100, value }
  }

  function average(scoresKey: string): number | null {
    const field = allFields.find((f) => f.key === scoresKey)
    if (!field) return null
    const numbers = scoreItems(field).map((i) => get(scoresKey, i.key)?.valueNumber).filter((n): n is number => n != null)
    return numbers.length ? Math.round((numbers.reduce((a, b) => a + b, 0) / numbers.length) * 100) / 100 : null
  }

  function level(avg: number | null): Level | undefined {
    if (avg == null) return undefined
    return schema.scoring?.levels?.find((l) => (l.min == null || avg >= l.min) && (l.minExclusive == null || avg > l.minExclusive) && avg <= l.max)
  }

  const shown = (f: Field) => !fieldFilter || fieldFilter(f)
  // Do zapisu: tylko pola wpisywane ręcznie (bez liczonych i danych poprzedniej oceny).
  const savable = (f: Field) => shown(f) && !f.computed && !fromPrevious(f) && !['signature', 'notice', 'indicatorScores'].includes(f.type)

  async function save(section: Section) {
    const keys = new Set(section.fields.filter((f) => savable(f) || (f.type === 'indicatorScores' && shown(f))).map((f) => f.key))
    const answers: Answer[] = Object.values(values).filter((a) => keys.has(a.fieldKey))
    for (const f of section.fields.filter(shown)) {
      if (f.type === 'criteriaSelection') {
        for (const m of f.mandatory ?? []) answers.push({ ...emptyAnswer(f.key, m.key), valueText: m.label })
      }
      // Starsze szablony (bez computed) liczą średnią i poziom po stronie formularza.
      if (f.type === 'average' && !f.computed) answers.push({ ...emptyAnswer(f.key, null), valueNumber: average(f.of) })
      if (f.type === 'level' && !f.computed) {
        const avgField = allFields.find((x) => x.key === f.of)
        answers.push({ ...emptyAnswer(f.key, null), valueText: level(avgField ? average(avgField.of) : null)?.key ?? null })
      }
    }
    setStatus((s) => ({ ...s, [section.key]: 'Zapisywanie…' }))
    try {
      await api(`evaluations/${detail.id}/answers`, 'PUT', { answers })
      setStatus((s) => ({ ...s, [section.key]: 'Zapisano.' }))
      onSaved()
    } catch (e) {
      setStatus((s) => ({ ...s, [section.key]: (e as Error).message }))
    }
  }

  const auto = <span className="auto" title="Liczy system — nie do edycji">🔒 auto</span>

  function computedValue(f: Field): ReactNode {
    const saved = get(f.key)
    if (f.type === 'average') return scoring?.average ?? saved?.valueNumber ?? '—'
    if (f.type === 'level') {
      return scoring?.levelLabel ?? schema.scoring?.levels?.find((l) => l.key === saved?.valueText)?.label ?? '—'
    }
    const result = scoring?.result ?? saved?.valueText
    return result ? (f.options?.find((o: { value: string }) => o.value === result)?.label ?? RESULT_LABELS[result] ?? result) : '—'
  }

  function previousValue(f: Field): ReactNode {
    const saved = get(f.key)
    const previous = detail.previous
    if (f.prefill === 'previous.date') return fmtDate(saved?.valueDate ?? previous?.date)
    const value = saved?.valueText ?? (f.prefill === 'previous.result' ? previous?.result : previous?.level)
    if (!value) return previous || f.prefill !== 'previous.result' ? '—' : 'brak poprzedniej oceny w systemie'
    if (f.prefill === 'previous.level') return previous?.levelLabel ?? schema.scoring?.levels?.find((l) => l.key === value)?.label ?? value
    return f.options?.find((o: { value: string }) => o.value === value)?.label ?? value
  }

  function renderField(f: Field, disabled: boolean, locked: boolean): ReactNode {
    const a = get(f.key)
    const required = f.required || (!!f.requiredWhen && matches(f.requiredWhen))
    const label = <>{f.label}{required && ' *'}</>
    if (f.computed) {
      return <p key={f.key} className="computed"><strong>{f.label}:</strong> {computedValue(f)} {auto}</p>
    }
    if (fromPrevious(f)) {
      return <p key={f.key} className="computed"><strong>{f.label}:</strong> {previousValue(f)} <span className="auto">🔒</span></p>
    }
    switch (f.type) {
      case 'text':
        return <label key={f.key}>{label}<input value={a?.valueText ?? ''} disabled={disabled} onChange={(e) => set(f.key, null, { valueText: e.target.value })} /></label>
      case 'longText':
        return <label key={f.key} className="wide">{label}<textarea rows={4} value={a?.valueText ?? ''} disabled={disabled} onChange={(e) => set(f.key, null, { valueText: e.target.value })} /></label>
      case 'date':
        return <label key={f.key}>{label}<input type="date" value={a?.valueDate ?? ''} disabled={disabled} onChange={(e) => set(f.key, null, { valueDate: e.target.value || null })} /></label>
      case 'year':
        return <label key={f.key}>{label}<input type="number" min={1990} max={2100} value={a?.valueNumber ?? ''} disabled={disabled} onChange={(e) => set(f.key, null, { valueNumber: e.target.value ? Number(e.target.value) : null })} /></label>
      case 'dateRange':
        return (
          <fieldset key={f.key}>
            <legend>{label}</legend>
            <label className="check">od <input type="date" value={a?.valueDate ?? ''} disabled={disabled} onChange={(e) => set(f.key, null, { valueDate: e.target.value || null })} /></label>
            <label className="check">do <input type="date" value={a?.valueDateTo ?? ''} disabled={disabled} onChange={(e) => set(f.key, null, { valueDateTo: e.target.value || null })} /></label>
          </fieldset>
        )
      case 'choice': {
        const options: { value: string; label: string }[] = f.optionsFrom === 'scoring.levels'
          ? (schema.scoring?.levels ?? []).map((l) => ({ value: l.key, label: l.label }))
          : f.options ?? []
        return (
          <label key={f.key}>{label}
            <select value={a?.valueText ?? ''} disabled={disabled} onChange={(e) => set(f.key, null, { valueText: e.target.value || null })}>
              <option value="">—</option>
              {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
        )
      }
      case 'person':
        return (
          <fieldset key={f.key}>
            <legend>{label}</legend>
            {[['firstName', 'Imię'], ['lastName', 'Nazwisko'], ['department', 'Komórka organizacyjna'], ['position', 'Stanowisko pracy']].map(([item, text]) => (
              <label key={item} className="check">{text}
                <input value={get(f.key, item)?.valueText ?? ''} disabled={disabled} onChange={(e) => set(f.key, item, { valueText: e.target.value })} />
              </label>
            ))}
          </fieldset>
        )
      case 'criteriaSelection':
        if (fromModel(f)) {
          const mandatory: { key: string; label: string }[] = f.mandatory ?? []
          const selected = additionalKeys(f)
          const max: number = f.additional.max
          const toggle = (key: string) => {
            if (selected.includes(key)) set(f.key, key, { valueText: null })
            else if (selected.length < max) set(f.key, key, { valueText: competencies[key].name })
          }
          return (
            <div key={f.key} id="criteria-picker" className="criteria-picker">
              <h4>{label}</h4>
              <p>
                <strong>Obowiązkowe (z arkusza):</strong>{' '}
                {mandatory.map((m) => <span key={m.key} className="chip">🔒 {m.label}</span>)}
              </p>
              <p className={selected.length === max ? 'success' : 'muted'}>
                Kryteria dodatkowe (nie więcej niż {max}): wybrano <strong>{selected.length}/{max}</strong>.
                {' '}Ich wskaźniki pojawią się w ocenie wskaźników.
              </p>
              <div className="competency-grid">
                {Object.entries(competencies)
                  .filter(([key]) => !mandatory.some((m) => m.key === key))
                  .sort(([, a], [, b]) => a.name.localeCompare(b.name, 'pl'))
                  .map(([key, c]) => {
                    const checked = selected.includes(key)
                    return (
                      <div key={key} className={checked ? 'competency-card selected' : 'competency-card'}>
                        <label className="check">
                          <input type="checkbox" checked={checked} disabled={disabled || (!checked && selected.length >= max)}
                            onChange={() => toggle(key)} />
                          <strong>{c.name}</strong>
                        </label>
                        <details>
                          <summary className="muted small">Wskaźniki ({c.indicators.length})</summary>
                          <ul>{c.indicators.map((i) => <li key={i.key}>{i.text}</li>)}</ul>
                        </details>
                      </div>
                    )
                  })}
              </div>
            </div>
          )
        }
        return (
          <fieldset key={f.key}>
            <legend>{label}</legend>
            <p className="muted">Obowiązkowe: {(f.mandatory ?? []).map((m: { label: string }) => m.label).join(', ')}</p>
            {Array.from({ length: f.additional?.max ?? 0 }, (_, i) => `extra_${i + 1}`).map((item, i) => (
              <label key={item} className="check">Dodatkowe {i + 1}
                <input value={get(f.key, item)?.valueText ?? ''} disabled={disabled} onChange={(e) => set(f.key, item, { valueText: e.target.value })} />
              </label>
            ))}
          </fieldset>
        )
      case 'scores': {
        const scale = schema.scales[f.scale] ?? []
        const indicatorField = allFields.find((x) => x.type === 'indicatorScores' && x.of === f.key)
        const scoreSelect = (item: { key: string }) => (
          <select value={get(f.key, item.key)?.valueNumber ?? ''} disabled={disabled}
            onChange={(e) => set(f.key, item.key, { valueNumber: e.target.value ? Number(e.target.value) : null })}>
            <option value="">—</option>
            {scale.map((o) => <option key={o.value} value={o.value}>{o.value} – {o.label}</option>)}
          </select>
        )
        if (!indicatorField || !schema.competencyModel) {
          return (
            <fieldset key={f.key}>
              <legend>{label}</legend>
              {scoreItems(f).length === 0 && <p className="muted">Najpierw wybierz kryteria.</p>}
              {scoreItems(f).map((item) => <label key={item.key} className="check">{item.label}{scoreSelect(item)}</label>)}
            </fieldset>
          )
        }
        return (
          <div key={f.key} className="criteria">
            <h4>{label}</h4>
            <ul className="guidance">{schema.competencyModel.guidance.map((g) => <li key={g}>{g}</li>)}</ul>
            {scoreItems(f).length === 0 && <p className="muted">Najpierw wybierz kryteria.</p>}
            {scoreItems(f).map((item) => {
              const competency = competencies[item.key]
              const hint = competency && suggestion(indicatorField, competency, scale)
              return (
                <details key={item.key} className="criterion" open={!detail.isFinal}>
                  <summary>
                    <strong>{item.label}</strong>
                    <span className="criterion-score" onClick={(e) => e.preventDefault()}>Ocena cząstkowa {scoreSelect(item)}</span>
                  </summary>
                  {hint && (
                    <p className="muted small">
                      Ocenione wskaźniki: {hint.rated} z {hint.total}{hint.noBasis > 0 && `, brak podstaw: ${hint.noBasis}`}
                      {hint.value != null && <>
                        {' '}· średnia {hint.mean} → sugerowana ocena <strong>{hint.value}</strong>{' '}
                        {!disabled && get(f.key, item.key)?.valueNumber !== hint.value && (
                          <button type="button" className="link" onClick={() => set(f.key, item.key, { valueNumber: hint.value })}>Użyj</button>
                        )}
                      </>}
                    </p>
                  )}
                  {competency && (
                    // Układ jak w arkuszu modelu: wiersz = wskaźnik behawioralny, kolumna = poziom z opisem zachowania.
                    <div className="table-wrap matrix-wrap">
                      <table className="matrix">
                        <thead>
                          <tr>
                            <th>Wskaźnik behawioralny</th>
                            {scale.map((o) => <th key={o.key}>{o.value} – {o.label}</th>)}
                            <th>Brak podstaw</th>
                          </tr>
                        </thead>
                        <tbody>
                          {competency.indicators.map((indicator) => {
                            const answer = get(indicatorField.key, indicator.key)
                            const name = `${detail.id}-${indicator.key}`
                            const choose = (patch: Partial<Answer>) => !disabled && set(indicatorField.key, indicator.key, patch)
                            return (
                              <tr key={indicator.key}>
                                <th scope="row">{indicator.text}</th>
                                {scale.map((o) => (
                                  <td key={o.key} className={answer?.valueNumber === o.value ? 'chosen' : undefined}
                                    onClick={() => choose({ valueNumber: o.value, valueText: null })}>
                                    <label>
                                      <input type="radio" name={name} disabled={disabled} checked={answer?.valueNumber === o.value}
                                        onChange={() => choose({ valueNumber: o.value, valueText: null })}
                                        aria-label={`${indicator.text}: ${o.value} – ${o.label}`} />
                                      <span>{indicator.levels[o.key]}</span>
                                    </label>
                                  </td>
                                ))}
                                <td className={answer?.valueText === NO_BASIS ? 'chosen no-basis' : 'no-basis'}
                                  onClick={() => choose({ valueNumber: null, valueText: NO_BASIS })}>
                                  <label>
                                    <input type="radio" name={name} disabled={disabled} checked={answer?.valueText === NO_BASIS}
                                      onChange={() => choose({ valueNumber: null, valueText: NO_BASIS })}
                                      aria-label={`${indicator.text}: brak podstaw do oceny`} />
                                    <span>Nie było okazji zaobserwować</span>
                                  </label>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </details>
              )
            })}
          </div>
        )
      }
      case 'indicatorScores':
        return null // rysowane razem z ocenami cząstkowymi (pole „of”)
      case 'average':
        return <p key={f.key}><strong>{f.label}:</strong> {average(f.of) ?? '—'}</p>
      case 'level': {
        const avgField = allFields.find((x) => x.key === f.of)
        return <p key={f.key}><strong>{f.label}:</strong> {level(avgField ? average(avgField.of) : null)?.label ?? '—'}</p>
      }
      case 'signature':
        return <SignatureField key={f.key} field={f} detail={detail} locked={locked} onSigned={onSaved} />
      case 'notice':
        return <p key={f.key} className="notice">{f.label}</p>
      default:
        return <p key={f.key} className="muted">{f.label} (typ {f.type})</p>
    }
  }

  const sections = schema.sections
    .filter((s) => !sectionKeys || sectionKeys.includes(s.key))
    .filter((s) => matches(s.visibleWhen))
    .sort((a, b) => (sectionKeys ? sectionKeys.indexOf(a.key) - sectionKeys.indexOf(b.key) : 0))

  return (
    <>
      {sections.map((section) => {
        const locked = !!detail.lockedSections?.includes(section.key)
        const disabled = !detail.canEdit || locked
        const fields = section.fields.filter((f) => shown(f) && matches(f.visibleWhen))
        if (fields.length === 0) return null
        const hasValues = fields.some(savable)
        return (
          <div key={section.key} className="card panel sheet-section">
            <h3>{section.part ? `${section.part} · ` : ''}{section.title}{locked && <span className="auto"> 🔒 zamknięta</span>}</h3>
            {showStage && <p className="muted small">Etap: {detail.stages.find((s) => s.key === section.stage)?.title ?? section.stage}</p>}
            <div className="sheet-fields">
              {fields.map((f) => renderField(f, disabled, locked))}
            </div>
            {!disabled && hasValues && (
              <div className="buttons">
                <button onClick={() => save(section)}>Zapisz sekcję</button>
                {status[section.key] && <span className="muted" role="status">{status[section.key]}</span>}
              </div>
            )}
          </div>
        )
      })}
    </>
  )
}

const ROLE_LABELS: Record<string, string> = { evaluated: 'oceniany', supervisor: 'bezpośredni przełożony', unitHead: 'kierujący komórką', evaluator: 'oceniający' }

/**
 * Pole podpisu. Oceniający/przełożony podpisuje sam (data, miejscowość, opcjonalnie odręcznie albo na tablecie).
 * Pole ocenianego podpisuje wyłącznie oceniany — ze swojego konta albo przez link/QR na telefonie lub tablecie;
 * przełożony widzi status i może pokazać kod QR, ale nie wpisuje daty za ocenianego.
 * W kreatorze: `blockedReason` wyłącza podpis (braki blokujące), `afterSign` dokleja krok po podpisie (np. sporządzenie oceny).
 */
export function SignatureField({ field, detail, onSigned, locked = false, blockedReason, submitLabel = 'Podpisz', afterSign }: {
  field: Field
  detail: Detail
  onSigned: () => void
  locked?: boolean
  blockedReason?: string
  submitLabel?: string
  afterSign?: (signedOn: string) => Promise<void>
}) {
  const signature = detail.signatures.find((s) => s.fieldKey === field.key)
  const [image, setImage] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [link, setLink] = useState<{ id: string; token: string } | null>(null)
  const mine = field.role === 'evaluated'
  // Kolejność: etap, który jeszcze nie nadszedł, czeka; oceniany podpisuje po podpisie przełożonego w tej samej części.
  const state = locked ? 'closed' : signatureState(detail, field)
  const stageKey = detail.schema.sections.find((s) => s.fields.some((f) => f.key === field.key))?.stage
  const notYet = state === 'laterStage' ? detail.stages.find((s) => s.key === stageKey) : undefined
  const open = state === 'open'
  const canSign = open && (mine ? detail.isOwn : detail.canEdit)
  const waitsForEvaluated = open && mine && !detail.isOwn && detail.canEdit
  const waitsForEvaluator = state === 'waitingForEvaluator'

  // Podpis odręczny na telefonie/tablecie przez link z kodem QR; po podpisaniu trafia do tego pola oceny.
  async function requestLink() {
    try {
      const res = await api<{ request: { id: string }; token: string }>('signatures', 'POST', {
        title: `${detail.templateTitle}: ${field.label ?? field.key}`.slice(0, 200),
        signerName: mine ? detail.employeeName : detail.evaluatorName ?? ROLE_LABELS[field.role] ?? field.role,
        evaluationId: detail.id,
        evaluationFieldKey: field.key,
      })
      setError('')
      setLink({ id: res.request.id, token: res.token })
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function sign(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const signedOn = String(form.get('signedOn'))
    setBusy(true)
    let signed = false
    try {
      await api(`evaluations/${detail.id}/signatures`, 'POST', {
        fieldKey: field.key,
        signedOn,
        place: form.get('place') || null,
        image,
      })
      signed = true
      if (afterSign) await afterSign(signedOn)
      onSigned()
    } catch (err) {
      setError((err as Error).message)
      if (signed) onSigned()
    } finally {
      setBusy(false)
    }
  }

  const linkPanel = link && (
    <SignatureLinkPanel key={link.token} requestId={link.id} token={link.token}
      onFinished={(status) => (status === 'Signed' ? onSigned() : setLink(null))} onClose={() => setLink(null)} />
  )

  return (
    <div className="signature wide">
      <p>{field.label && <>{field.label}<br /></>}<span className="muted">Podpis: {ROLE_LABELS[field.role] ?? field.role}</span></p>
      {signature ? (
        <p>
          ✔ {signature.signerName}, {fmtDate(signature.signedOn)}{signature.place ? `, ${signature.place}` : ''}
          {signature.hasImage && <><br /><SignatureImage path={`evaluations/${detail.id}/signatures/${signature.id}/image`} /></>}
          {error && <><br /><span role="alert" className="error">{error}</span></>}
        </p>
      ) : canSign ? (
        <form onSubmit={sign} className="form">
          <div className="inline">
            <label className="check">Data <input name="signedOn" type="date" defaultValue={today()} required /></label>
            <label className="check">Miejscowość <input name="place" /></label>
          </div>
          <SignaturePad onChange={setImage} />
          <p className="muted small">Odręczny podpis jest opcjonalny — bez niego zostaje potwierdzenie w systemie.</p>
          {blockedReason && <p className="error small">{blockedReason}</p>}
          {error && <p role="alert" className="error">{error}</p>}
          <div className="buttons">
            <button type="submit" disabled={busy || !!blockedReason}>{busy ? 'Zapisywanie…' : submitLabel}</button>
            {!link && !afterSign && !blockedReason && <button type="button" className="secondary" onClick={requestLink}>Podpisz na telefonie lub tablecie</button>}
          </div>
          {linkPanel}
        </form>
      ) : waitsForEvaluated ? (
        <div className="stack">
          <p><span className="pill warn">Czeka na podpis ocenianego</span></p>
          {/* Link/QR do pola ocenianego może zlecić tylko sam oceniany (SignaturesController.CheckSignRulesAsync). */}
          <p className="muted small">
            Podpisuje {detail.employeeName} ze swojego konta (Oceny → ta ocena → „Moje podpisy”) — tam może też podpisać
            odręcznie na telefonie lub tablecie przez kod QR. Datę podpisu zapisuje system w chwili złożenia podpisu.
          </p>
        </div>
      ) : waitsForEvaluator ? (
        <p className="muted">
          {detail.isOwn
            ? 'Podpiszesz po rozmowie, gdy podpisze przełożony (oceniający) — potwierdzasz rozmowę, która już się odbyła.'
            : 'Oceniany podpisze po podpisie przełożonego (oceniającego) w tej części.'}
        </p>
      ) : (
        <p className="muted">
          {notYet ? `Podpis w etapie „${notYet.title}”.` : locked || detail.isFinal ? 'Niepodpisane (etap zamknięty).' : 'Niepodpisane.'}
        </p>
      )}
    </div>
  )
}

// <img> nie wyśle tokenu, więc obraz przez fetch → blob URL.
export function SignatureImage({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let created: string | null = null
    let active = true
    apiBlobUrl(path).then((blobUrl) => {
      created = blobUrl
      if (active) setUrl(blobUrl)
      else if (blobUrl) URL.revokeObjectURL(blobUrl)
    })
    return () => {
      active = false
      if (created) URL.revokeObjectURL(created)
    }
  }, [path])
  return url ? <img className="evaluation-signature-image" src={url} alt="Podpis odręczny" /> : null
}
