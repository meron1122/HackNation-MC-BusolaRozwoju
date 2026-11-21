import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { api, apiBlobUrl } from './api'
import { Avatar } from './Avatar'
import type { Row } from './Crud'
import { SignaturePad } from './SignaturePad'

// --- kształty z API / szablonu (EvaluationTemplates/*.json) ---
type Cond = { field: string; in: string[] }
type Field = { key: string; type: string; label?: string; required?: boolean; visibleWhen?: Cond; requiredWhen?: Cond } & Record<string, any>
type Section = { key: string; title: string; part?: string; stage: string; visibleWhen?: Cond; fields: Field[] }
type ScaleOption = { value: number; key: string; label: string }
type Level = { key: string; label: string; min?: number; minExclusive?: number; max: number }
type Schema = { title: string; sections: Section[]; scales: Record<string, ScaleOption[]>; scoring?: { levels?: Level[] } }
type Answer = { fieldKey: string; itemKey: string | null; valueText: string | null; valueNumber: number | null; valueDate: string | null; valueDateTo: string | null }
type Stage = { key: string; title: string; status: string; optional: boolean; dueFrom: string | null; dueTo: string | null; completedOn: string | null; overdue: boolean }
type Signature = { id: number; fieldKey: string; role: string; signerName: string; signedOn: string; place: string | null; hasImage: boolean }
type Detail = {
  id: number; employeeId: number; employeeName: string; evaluatorName: string | null; templateTitle: string
  status: string; statusLabel: string; isFinal: boolean; startDate: string; schema: Schema
  stages: Stage[]; answers: Answer[]; signatures: Signature[]; canEdit: boolean; isOwn: boolean
}
type ListItem = {
  id: number; employeeName: string; templateTitle: string; statusLabel: string; isFinal: boolean
  startDate: string; nextStageTitle: string | null; nextDueTo: string | null
}
type Template = { id: number; code: string; title: string }

const today = () => new Date().toISOString().slice(0, 10)

export function EvaluationsPage({ canAdd, openId, onOpen }: { canAdd: boolean; openId: number | null; onOpen: (id: number | null) => void }) {
  return openId === null
    ? <EvaluationList canAdd={canAdd} onOpen={onOpen} />
    : <EvaluationCard id={openId} onBack={() => onOpen(null)} />
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
            <thead><tr><th>Pracownik</th><th>Arkusz</th><th>Status</th><th>Najbliższy etap</th><th>Termin</th><th /></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.employeeName}</td>
                  <td>{r.templateTitle}</td>
                  <td>{r.statusLabel}</td>
                  <td>{r.nextStageTitle ?? '—'}</td>
                  <td className={r.nextDueTo && r.nextDueTo < today() ? 'overdue' : undefined}>{r.nextDueTo ?? '—'}</td>
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

// --- karta oceny ---

const keyOf = (fieldKey: string, itemKey: string | null) => `${fieldKey}|${itemKey ?? ''}`
const emptyAnswer = (fieldKey: string, itemKey: string | null): Answer =>
  ({ fieldKey, itemKey, valueText: null, valueNumber: null, valueDate: null, valueDateTo: null })

function EvaluationCard({ id, onBack }: { id: number; onBack: () => void }) {
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
        <button className="secondary" onClick={onBack}>Wróć do listy</button>
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
      <Stages detail={detail} onChange={load} />
      {error && <p role="alert" className="error">{error}</p>}
      <SheetForm key={JSON.stringify(detail.answers)} detail={detail} onSaved={load} />
    </section>
  )
}

function Stages({ detail, onChange }: { detail: Detail; onChange: () => void }) {
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
                  {s.status === 'Pending' && canChange(s) && (
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

/** Wartości startowe: zapisane odpowiedzi, a dla pustych pól podpowiedzi (prefill) z danych oceny. */
function initialValues(detail: Detail): Record<string, Answer> {
  const values: Record<string, Answer> = {}
  for (const a of detail.answers) values[keyOf(a.fieldKey, a.itemKey)] = a
  const has = (fieldKey: string) => detail.answers.some((a) => a.fieldKey === fieldKey)
  const stage = (prefill?: string) => detail.stages.find((s) => prefill === `stage:${s.key}`)
  const [first, ...rest] = detail.employeeName.split(' ')
  const [evFirst, ...evRest] = (detail.evaluatorName ?? '').split(' ')

  for (const field of detail.schema.sections.flatMap((s) => s.fields)) {
    if (has(field.key)) continue
    if (field.type === 'person' && (field.role === 'evaluated' || ((field.role === 'evaluator' || field.role === 'supervisor') && detail.evaluatorName))) {
      const own = field.role === 'evaluated'
      values[keyOf(field.key, 'firstName')] = { ...emptyAnswer(field.key, 'firstName'), valueText: own ? first : evFirst }
      values[keyOf(field.key, 'lastName')] = { ...emptyAnswer(field.key, 'lastName'), valueText: own ? rest.join(' ') : evRest.join(' ') }
    } else if (field.prefill === 'employee.hireDate') {
      values[keyOf(field.key, null)] = { ...emptyAnswer(field.key, null), valueDate: detail.startDate }
    } else if (stage(field.prefill)?.dueTo) {
      const s = stage(field.prefill)!
      values[keyOf(field.key, null)] = field.type === 'dateRange'
        ? { ...emptyAnswer(field.key, null), valueDate: s.dueFrom ?? detail.startDate, valueDateTo: s.dueTo }
        : { ...emptyAnswer(field.key, null), valueDate: s.dueTo }
    }
  }
  return values
}

function SheetForm({ detail, onSaved }: { detail: Detail; onSaved: () => void }) {
  const [values, setValues] = useState(() => initialValues(detail))
  const [status, setStatus] = useState<Record<string, string>>({})
  const schema = detail.schema
  const allFields = schema.sections.flatMap((s) => s.fields)

  const get = (fieldKey: string, itemKey: string | null = null) => values[keyOf(fieldKey, itemKey)]
  const set = (fieldKey: string, itemKey: string | null, patch: Partial<Answer>) =>
    setValues((v) => ({ ...v, [keyOf(fieldKey, itemKey)]: { ...(v[keyOf(fieldKey, itemKey)] ?? emptyAnswer(fieldKey, itemKey)), ...patch } }))
  const matches = (c?: Cond) => !c || c.in.includes(get(c.field)?.valueText ?? '')

  // Pozycje ocen cząstkowych: z szablonu albo z wybranych kryteriów (obowiązkowe + dodatkowe).
  function scoreItems(field: Field): { key: string; label: string }[] {
    if (field.items) return field.items
    const source = allFields.find((f) => f.key === field.itemsFrom)
    if (!source) return []
    const additional = Array.from({ length: source.additional?.max ?? 0 }, (_, i) => `extra_${i + 1}`)
      .map((key) => ({ key, label: get(source.key, key)?.valueText ?? '' }))
      .filter((x) => x.label)
    return [...(source.mandatory ?? []), ...additional]
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

  async function save(section: Section) {
    const keys = new Set(section.fields.map((f) => f.key))
    const answers: Answer[] = Object.values(values).filter((a) => keys.has(a.fieldKey))
    for (const f of section.fields) {
      if (f.type === 'criteriaSelection') {
        for (const m of f.mandatory ?? []) answers.push({ ...emptyAnswer(f.key, m.key), valueText: m.label })
      }
      if (f.type === 'average') answers.push({ ...emptyAnswer(f.key, null), valueNumber: average(f.of) })
      if (f.type === 'level') {
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

  const disabled = !detail.canEdit

  function renderField(f: Field): ReactNode {
    const a = get(f.key)
    const required = f.required || (!!f.requiredWhen && matches(f.requiredWhen))
    const label = <>{f.label}{required && ' *'}</>
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
        return (
          <fieldset key={f.key}>
            <legend>{label}</legend>
            {scoreItems(f).length === 0 && <p className="muted">Najpierw wybierz kryteria.</p>}
            {scoreItems(f).map((item) => (
              <label key={item.key} className="check">{item.label}
                <select value={get(f.key, item.key)?.valueNumber ?? ''} disabled={disabled}
                  onChange={(e) => set(f.key, item.key, { valueNumber: e.target.value ? Number(e.target.value) : null })}>
                  <option value="">—</option>
                  {scale.map((o) => <option key={o.value} value={o.value}>{o.value} – {o.label}</option>)}
                </select>
              </label>
            ))}
          </fieldset>
        )
      }
      case 'average':
        return <p key={f.key}><strong>{f.label}:</strong> {average(f.of) ?? '—'}</p>
      case 'level': {
        const avgField = allFields.find((x) => x.key === f.of)
        return <p key={f.key}><strong>{f.label}:</strong> {level(avgField ? average(avgField.of) : null)?.label ?? '—'}</p>
      }
      case 'signature':
        return <SignatureField key={f.key} field={f} detail={detail} onSigned={onSaved} />
      case 'notice':
        return <p key={f.key} className="notice">{f.label}</p>
      default:
        return <p key={f.key} className="muted">{f.label} (typ {f.type})</p>
    }
  }

  return (
    <>
      {schema.sections.filter((s) => matches(s.visibleWhen)).map((section) => {
        const hasValues = section.fields.some((f) => !['signature', 'notice'].includes(f.type))
        return (
          <div key={section.key} className="card panel sheet-section">
            <h3>{section.part ? `${section.part} · ` : ''}{section.title}</h3>
            <p className="muted small">Etap: {detail.stages.find((s) => s.key === section.stage)?.title ?? section.stage}</p>
            <div className="sheet-fields">
              {section.fields.filter((f) => matches(f.visibleWhen)).map(renderField)}
            </div>
            {detail.canEdit && hasValues && (
              <div className="buttons">
                <button onClick={() => save(section)}>Zapisz sekcję</button>
                {status[section.key] && <span className="muted">{status[section.key]}</span>}
              </div>
            )}
          </div>
        )
      })}
    </>
  )
}

function SignatureField({ field, detail, onSigned }: { field: Field; detail: Detail; onSigned: () => void }) {
  const signature = detail.signatures.find((s) => s.fieldKey === field.key)
  const [image, setImage] = useState<string | null>(null)
  const [error, setError] = useState('')
  const mine = field.role === 'evaluated'
  const canSign = !signature && !detail.isFinal && (mine ? detail.isOwn : detail.canEdit)
  const roleLabel: Record<string, string> = { evaluated: 'oceniany', supervisor: 'bezpośredni przełożony', unitHead: 'kierujący komórką', evaluator: 'oceniający' }

  async function sign(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    try {
      await api(`evaluations/${detail.id}/signatures`, 'POST', {
        fieldKey: field.key,
        signedOn: form.get('signedOn'),
        place: form.get('place') || null,
        image,
      })
      onSigned()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <div className="signature wide">
      <p>{field.label && <>{field.label}<br /></>}<span className="muted">Podpis: {roleLabel[field.role] ?? field.role}</span></p>
      {signature ? (
        <p>
          ✔ {signature.signerName}, {signature.signedOn}{signature.place ? `, ${signature.place}` : ''}
          {signature.hasImage && <><br /><SignatureImage path={`evaluations/${detail.id}/signatures/${signature.id}/image`} /></>}
        </p>
      ) : canSign ? (
        <form onSubmit={sign} className="form">
          <div className="inline">
            <label className="check">Data <input name="signedOn" type="date" defaultValue={today()} required /></label>
            <label className="check">Miejscowość <input name="place" /></label>
          </div>
          <SignaturePad onChange={setImage} />
          <p className="muted small">Odręczny podpis jest opcjonalny — bez niego zostaje potwierdzenie w systemie.</p>
          {error && <p role="alert" className="error">{error}</p>}
          <div className="buttons"><button type="submit">Podpisz</button></div>
        </form>
      ) : (
        <p className="muted">Niepodpisane.</p>
      )}
    </div>
  )
}

// <img> nie wyśle tokenu, więc obraz przez fetch → blob URL.
function SignatureImage({ path }: { path: string }) {
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
