import { Fragment, useState, type FormEvent } from 'react'
import { api } from '../api'
import { ConfirmButton } from '../ConfirmButton'
import { DateInput } from '../DateInput'
import { Icon } from '../Icon'
import { CompleteStage, DuePill, IssueList, PdfButton, Pill, type StepProps } from './common'
import { useApi } from './data'
import {
  daysUntil, criteriaOf, fmtDate, plural, today, type Detail, type Note, type NoteRequest, type Notes, type SelfAssessment,
} from './types'
import { noteHint } from './final-note-hint'
import './final-hifi.css'

type IndicatorOption = { key: string; text: string; criterionKey: string; criterionLabel: string }

function indicatorOptions(detail: Detail): IndicatorOption[] {
  const competencies = detail.schema.competencyModel?.competencies ?? {}
  return criteriaOf(detail).flatMap((c) =>
    (competencies[c.key]?.indicators ?? []).map((i) => ({ key: i.key, text: i.text, criterionKey: c.key, criterionLabel: c.label })))
}

/** Status samooceny / sprawozdania ocenianego (przełożony widzi treść dopiero po przekazaniu). */
export function SelfAssessmentStatus({ detail }: { detail: Detail }) {
  const { data, error } = useApi<SelfAssessment>(`evaluations/${detail.id}/self-assessment`)
  if (error || !data || !data.stageKey) return null
  return (
    <p className="small">
      Samoocena pracownika:{' '}
      {data.submitted
        ? <Pill tone="done" icon="done">przekazana {fmtDate(data.submittedAt)}</Pill>
        : data.stageOpen ? <Pill tone="attention">jeszcze nieprzekazana</Pill> : <Pill>niedostępna w tym etapie</Pill>}
    </p>
  )
}

/** W06: notatki z obserwacji (sytuacja–działanie–rezultat) i dowody na wskaźniki. Oceniany ich nie widzi. */
export function NotesStep({ detail, steps, go }: StepProps) {
  const { data, error, reload } = useApi<Notes>(`evaluations/${detail.id}/notes`)
  const options = indicatorOptions(detail)
  const criteria = criteriaOf(detail)
  const [editing, setEditing] = useState<number | null>(null)
  const [preset, setPreset] = useState<{ key: string; n: number } | null>(null)
  const notesStep = steps.find((s) => s.id === 'notes')
  const stage = detail.stages.find((s) => s.key === notesStep?.stageKey)
  const firstStage = detail.stages[0]
  const periodStart = data?.evidence.periodStart ?? firstStage?.completedOn ?? detail.startDate
  const end = stage?.dueTo
  const left = daysUntil(end)
  const ratingStep = steps.find((s) => s.group === 'Ocena')
  const canWrite = detail.canEdit && stage?.status === 'Pending'

  const progress = end ? Math.min(1, Math.max(0, (Date.parse(today()) - Date.parse(periodStart)) / (Date.parse(end) - Date.parse(periodStart)))) : null
  const count = (indicatorKey: string) => data?.evidence.indicators.find((i) => i.indicatorKey === indicatorKey)?.count ?? 0
  const notesCount = data?.notes.length ?? 0
  const uncovered = options.filter((o) => count(o.key) === 0).length

  async function create(body: NoteRequest) {
    await api(`evaluations/${detail.id}/notes`, 'POST', body)
    await reload()
  }
  async function update(id: number, body: NoteRequest) {
    await api(`evaluations/${detail.id}/notes/${id}`, 'PUT', body)
    setEditing(null)
    await reload()
  }
  async function remove(id: number) {
    await api(`evaluations/${detail.id}/notes/${id}`, 'DELETE')
    await reload()
  }
  function addFor(key: string) {
    setPreset((p) => ({ key, n: (p?.n ?? 0) + 1 }))
    requestAnimationFrame(() => document.getElementById('notes-new')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  return (
    <div className="step notes-hifi">
      {stage?.status === 'Pending' && left != null && left <= 30 && (
        <div className="notes-banner" role="status">
          <Icon name="clock" />
          <strong>{left < 0 ? `Termin oceny minął ${-left} ${plural(-left, 'dzień', 'dni', 'dni')} temu.` : `${left} ${plural(left, 'dzień', 'dni', 'dni')} do terminu oceny.`}</strong>
          <span className="grow">Zaplanuj rozmowę oceniającą.</span>
          {ratingStep && <button type="button" onClick={() => go(ratingStep.id)}>Przejdź do oceny</button>}
        </div>
      )}
      <div className="step-head"><h2>Notatki z obserwacji</h2><Pill icon="lock">widzisz tylko Ty</Pill></div>
      {progress != null && (
        <div className="notes-timeline" aria-label={`Okres obserwacji: ${Math.round(progress * 100)}% za nami`}>
          <div className="notes-timeline-bar">
            <div style={{ width: `${progress * 100}%` }} />
            <span className="notes-today" style={{ left: `${progress * 100}%` }} aria-hidden="true" />
          </div>
          <div className="notes-timeline-labels small">
            <span><strong>{fmtDate(periodStart)}</strong> · początek okresu oceny</span>
            <span className="notes-today-label">dziś</span>
            <span><strong>{fmtDate(end)}</strong> · termin</span>
          </div>
        </div>
      )}
      <SelfAssessmentStatus detail={detail} />
      {error ? (
        <p className="callout attention">Notatki nie są jeszcze dostępne: {error}</p>
      ) : !data ? <p>Ładowanie…</p> : (
        <>
          {data.evidence.recentShare != null && notesCount >= 3 && data.evidence.recentShare >= 0.5 && (
            <p className="callout attention">
              <strong>! {Math.round(data.evidence.recentShare * 100)}% notatek pochodzi z ostatnich 4 miesięcy.</strong> Dodaj obserwacje z wcześniejszej części okresu, żeby ocena objęła cały okres, a nie ostatnie wrażenie.
            </p>
          )}
          {data.evidence.outsidePeriod > 0 && (
            <p className="muted small">{data.evidence.outsidePeriod} {plural(data.evidence.outsidePeriod, 'notatka jest', 'notatki są', 'notatek jest')} sprzed okresu oceny — nie liczą się jako dowody.</p>
          )}
          {canWrite && (
            <NoteForm key={preset ? `${preset.key}-${preset.n}` : 'new'} id="notes-new" title="Nowa notatka" options={options} onSubmit={create}
              defaultIndicator={preset?.key ?? options[0]?.key ?? null} />
          )}
          <section className="card notes-coverage" aria-labelledby="notes-coverage-title">
            <div className="card-head">
              <h3 id="notes-coverage-title">Notatki przy wskaźnikach</h3>
              {options.length > 0 && (uncovered > 0
                ? <Pill tone="attention">{uncovered} z {options.length} bez notatek</Pill>
                : <Pill tone="done" icon="done">każdy wskaźnik ma notatkę</Pill>)}
            </div>
            <ul>
              {criteria.flatMap((c) => options.filter((o) => o.criterionKey === c.key).map((o, i) => (
                <li key={o.key}>
                  <span className="small muted notes-crit">{i === 0 ? c.label : ''}</span>
                  <span className="grow">{o.text}</span>
                  {count(o.key) > 0
                    ? <Pill tone="info">{count(o.key)} {plural(count(o.key), 'notatka', 'notatki', 'notatek')}</Pill>
                    : <Pill tone="attention">! Brak notatek</Pill>}
                  {canWrite && <button type="button" className="link small" onClick={() => addFor(o.key)} aria-label={`Dodaj notatkę: ${o.text}`}>Dodaj</button>}
                </li>
              )))}
            </ul>
          </section>
          <section className="card">
            <h3>Notatki ({notesCount})</h3>
            {notesCount === 0 && <p className="muted">Zapisuj krótkie obserwacje co miesiąc. Ułatwią ocenę za 2 lata. Opisz zachowanie: co zrobił(a), w jakiej sytuacji, z jakim skutkiem.</p>}
            <ul className="note-list">
              {[...data.notes].sort((a, b) => b.observedOn.localeCompare(a.observedOn)).map((n) => (
                <li key={n.id} className={n.inPeriod ? undefined : 'muted'}>
                  {editing === n.id ? (
                    <NoteForm title="Edycja notatki" options={options} initial={n} onSubmit={(body) => update(n.id, body)} onCancel={() => setEditing(null)} />
                  ) : (
                    <NoteView note={n} options={options} onEdit={canWrite && n.canEdit ? () => setEditing(n.id) : undefined}
                      onDelete={canWrite && n.canEdit ? () => remove(n.id) : undefined} />
                  )}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  )
}

function NoteView({ note, options, onEdit, onDelete }: { note: Note; options: IndicatorOption[]; onEdit?: () => void; onDelete?: () => void }) {
  const indicator = options.find((o) => o.key === note.indicatorKey)
  return (
    <div className="note">
      <div className="note-head">
        <strong>{fmtDate(note.observedOn)}</strong>
        {indicator && <Pill>{indicator.criterionLabel} · {indicator.text.length > 60 ? `${indicator.text.slice(0, 60)}…` : indicator.text}</Pill>}
        {note.isPrivate && <Pill icon="lock">prywatna</Pill>}
        {note.discussedWithEmployee && <Pill tone="info" icon="done">omówiono z pracownikiem</Pill>}
        {!note.inPeriod && <Pill tone="attention">sprzed okresu oceny</Pill>}
        <span className="grow" />
        {onEdit && <button type="button" className="link" onClick={onEdit}>Edytuj</button>}
        {onDelete && <ConfirmButton compact question="Usunąć notatkę?" confirmLabel="Usuń notatkę" onConfirm={onDelete}>Usuń</ConfirmButton>}
      </div>
      <dl className="notes-sar">
        <div><dt>Sytuacja</dt><dd>{note.situation || '—'}</dd></div>
        <div><dt>Działanie</dt><dd>{note.action || '—'}</dd></div>
        <div><dt>Rezultat</dt><dd>{note.result || '—'}</dd></div>
      </dl>
      <p className="muted small">{note.authorName}</p>
    </div>
  )
}

const SAR = [
  { name: 'situation', label: 'Sytuacja', placeholder: 'np. raport kwartalny, termin 12.03' },
  { name: 'action', label: 'Działanie', placeholder: 'co zrobił(a)' },
  { name: 'result', label: 'Rezultat', placeholder: 'z jakim skutkiem' },
] as const

function NoteForm({ id, title, options, initial, defaultIndicator = null, onSubmit, onCancel }: {
  id?: string
  title: string
  options: IndicatorOption[]
  initial?: Note
  defaultIndicator?: string | null
  onSubmit: (body: NoteRequest) => Promise<void>
  onCancel?: () => void
}) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [formKey, setFormKey] = useState(0)
  const [text, setText] = useState<Record<string, string>>(() => ({
    situation: initial?.situation ?? '', action: initial?.action ?? '', result: initial?.result ?? '',
  }))
  const [saved, setSaved] = useState('')
  const criteria = [...new Map(options.map((o) => [o.criterionKey, o.criterionLabel])).entries()]
  const hint = noteHint([text.situation, text.action, text.result].filter(Boolean).join(' '))

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const value = (name: string) => String(form.get(name) ?? '').trim()
    if (!value('situation') && !value('action') && !value('result')) {
      setError('Opisz przynajmniej sytuację, działanie albo rezultat.')
      return
    }
    setBusy(true)
    try {
      await onSubmit({
        observedOn: value('observedOn'),
        situation: value('situation'),
        action: value('action'),
        result: value('result'),
        indicatorKey: value('indicatorKey') || null,
        isPrivate: form.get('isPrivate') === 'on',
        discussedWithEmployee: form.get('discussedWithEmployee') === 'on',
      })
      setError('')
      if (!initial) {
        setFormKey((k) => k + 1)
        setText({ situation: '', action: '', result: '' })
        setSaved('Zapisano notatkę.')
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form key={formKey} id={id} className="card note-form notes-form" onSubmit={submit}>
      <h3>{title}</h3>
      <div className="notes-form-row">
        <label className="notes-indicator">Wskaźnik
          <select name="indicatorKey" defaultValue={initial ? initial.indicatorKey ?? '' : defaultIndicator ?? ''}>
            <option value="">— bez wskaźnika —</option>
            {criteria.map(([key, label]) => (
              <optgroup key={key} label={label}>
                {options.filter((o) => o.criterionKey === key).map((o) => <option key={o.key} value={o.key}>{o.text}</option>)}
              </optgroup>
            ))}
          </select>
        </label>
        <label>Data obserwacji <DateInput name="observedOn" required defaultValue={initial?.observedOn ?? today()} /></label>
      </div>
      <div className="notes-sar-inputs">
        {SAR.map((f) => (
          <label key={f.name}>{f.label}
            <textarea name={f.name} rows={3} defaultValue={text[f.name]} placeholder={f.placeholder}
              onChange={(e) => { const v = e.target.value; setText((t) => ({ ...t, [f.name]: v })); setSaved('') }} />
          </label>
        ))}
      </div>
      {hint && (
        <div className="ai-proposal notes-hint" role="status">
          <span className="ai-tag">✦ Podpowiedź</span>
          <span>{hint}</span>
        </div>
      )}
      <div className="notes-form-foot">
        <label className="check"><input type="checkbox" name="isPrivate" defaultChecked={initial?.isPrivate} /> Prywatna</label>
        <label className="check"><input type="checkbox" name="discussedWithEmployee" defaultChecked={initial?.discussedWithEmployee} /> Omówiono z pracownikiem</label>
        <span className="grow" />
        {saved && <span className="muted small" role="status">{saved}</span>}
        {onCancel && <button type="button" className="secondary" onClick={onCancel}>Anuluj</button>}
        <button type="submit" disabled={busy}>{busy ? 'Zapisywanie…' : 'Zapisz notatkę'}</button>
      </div>
      {error && <p role="alert" className="error">{error}</p>}
    </form>
  )
}

/** Etap bez własnych sekcji (np. sprawozdanie w pierwszej ocenie): status samooceny, braki i zamknięcie etapu. */
export function StageStep(props: StepProps & { stepId: string; stageKey: string }) {
  const { detail, check, steps, go, reload, stageKey } = props
  const stage = detail.stages.find((s) => s.key === stageKey)
  const def = detail.schema.stages?.find((s) => s.key === stageKey)
  const issues = check?.stages.find((s) => s.key === stageKey)?.issues ?? []
  if (!stage) return null
  if (def?.completedBy === 'evaluated') return <EvaluatedStageStep {...props} />
  return (
    <div className="step">
      <div className="step-head">
        <h2>{def?.phase ?? stage.title}</h2>
        {stage.status === 'Pending' && stage.dueTo && <Pill tone={stage.overdue ? 'attention' : 'neutral'} icon="clock">do {fmtDate(stage.dueTo)}{stage.overdue ? ' · po terminie' : ''}</Pill>}
      </div>
      <p>{stage.title}{def?.legalRef && <span className="muted"> · {def.legalRef}</span>}</p>
      {def?.selfAssessment && (
        <div className="card">
          <SelfAssessmentStatus detail={detail} />
          <p className="muted small">Pracownik wypełnia {def.phase === 'Sprawozdanie' ? 'sprawozdanie' : 'samoocenę'} ze swojego konta. Po przekazaniu zobaczysz je w rozmowie oceniającej.</p>
        </div>
      )}
      {stage.status === 'Pending' ? (
        <>
          <IssueList issues={issues} steps={steps} go={go} />
          <CompleteStage detail={detail} check={check} stageKey={stageKey} label={`Zamknij etap: ${(def?.phase ?? stage.title).toLowerCase()}`} onDone={reload} />
        </>
      ) : (
        <p className="callout">{stage.status === 'Skipped' ? 'Etap pominięty.' : `Etap zamknięty ${fmtDate(stage.completedOn)}.`}</p>
      )}
    </div>
  )
}

/**
 * Etap zamykany przez ocenianego (sprawozdanie w pierwszej ocenie): przełożony go nie zamyka — widzi status, po złożeniu
 * treść (tylko odczyt), a po terminie może oznaczyć sprawozdanie jako niezłożone (skip; backend zwraca canSkip).
 */
function EvaluatedStageStep({ detail, check, reload, stageKey }: StepProps & { stageKey: string }) {
  const stage = detail.stages.find((s) => s.key === stageKey)!
  const def = detail.schema.stages?.find((s) => s.key === stageKey)
  const stageCheck = check?.stages.find((s) => s.key === stageKey)
  const { data: self } = useApi<SelfAssessment>(`evaluations/${detail.id}/self-assessment`)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const name = def?.phase === 'Sprawozdanie' ? 'sprawozdanie' : 'samoocenę'
  const firstName = detail.employeeName.split(' ')[0]

  async function skip() {
    setBusy(true)
    try {
      await api(`evaluations/${detail.id}/stages/${stageKey}/skip`, 'POST')
      setError('')
      await reload()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="step">
      <div className="step-head">
        <h2>{def?.phase ?? stage.title}</h2>
        {stage.status === 'Pending' && stage.dueTo && <DuePill dueTo={stage.dueTo} daysLeft={daysUntil(stage.dueTo)} overdue={stage.overdue} />}
      </div>
      <p>{stage.title}{def?.legalRef && <span className="muted"> · {def.legalRef}</span>}</p>
      {stage.status === 'Pending' && (
        <div className="callout info">
          <strong>Czeka na {name} pracownika{stage.dueTo ? ` do ${fmtDate(stage.dueTo)}` : ''}.</strong>
          <p className="small">
            {firstName} składa {name} ze swojego konta — przekazanie zamyka ten etap. Ty go nie zamykasz.
          </p>
          {stageCheck?.issues.filter((i) => i.message).map((i) => <p key={i.message} className="muted small">{i.message}{i.legalRef && ` · ${i.legalRef}`}</p>)}
        </div>
      )}
      {stage.status === 'Pending' && detail.canEdit && stageCheck?.canSkip && (
        <div className="step-footer">
          <p className="grow small">Termin minął, a {name} nie wpłynęło. Możesz oznaczyć je jako niezłożone — ocena przejdzie do rozmowy oceniającej (§ 8 ust. 1).</p>
          <ConfirmButton question={`Oznaczyć ${name} jako niezłożone? Ocena przejdzie do rozmowy oceniającej i nie da się tego cofnąć.`}
            confirmLabel="Oznacz jako niezłożone" disabled={busy} onConfirm={skip}>Oznacz jako niezłożone</ConfirmButton>
        </div>
      )}
      {stage.status === 'Skipped' && <p className="callout attention">{name[0].toUpperCase() + name.slice(1)} oznaczone jako niezłożone w terminie.</p>}
      {stage.status === 'Completed' && <p className="callout"><strong>Złożone {fmtDate(stage.completedOn)}.</strong></p>}
      {error && <p role="alert" className="error">{error}</p>}
      {self?.submitted && self.reportForm && (
        <div className="card">
          <div className="card-head">
            <h3>Sprawozdanie pracownika (tylko do odczytu)</h3>
            <PdfButton detail={detail} report label="Pobierz PDF" />
          </div>
          <p className="pre-line small">{self.reportForm.text}</p>
        </div>
      )}
      {self?.submitted && !self.reportForm && (
        <div className="card">
          <h3>{name[0].toUpperCase() + name.slice(1)} pracownika (tylko do odczytu)</h3>
          <dl className="summary">
            {self.criteria.map((c) => (
              <Fragment key={c.key}>
                <dt>{c.label}</dt>
                <dd>
                  {self.scale.find((o) => o.key === c.level)?.label ?? <span className="muted">bez oceny</span>}
                  {c.comment && <><br /><span className="small pre-line">{c.comment}</span></>}
                </dd>
              </Fragment>
            ))}
            <dt>Potrzeby rozwojowe</dt><dd className="pre-line">{self.developmentNeeds || <span className="muted">nie zgłoszono</span>}</dd>
          </dl>
        </div>
      )}
    </div>
  )
}
