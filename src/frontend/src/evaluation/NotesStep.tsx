import { Fragment, useEffect, useState, type FormEvent } from 'react'
import { api } from '../api'
import { ConfirmButton } from '../ConfirmButton'
import { DateInput } from '../DateInput'
import { Info } from '../v2'
import { CompleteStage, DuePill, IssueList, PdfButton, Pill, type StepProps } from './common'
import { useApi } from './data'
import { TermPanel } from './TermPanel'
import {
  daysUntil, criteriaOf, fmtDate, today, type Detail, type Note, type NoteRequest, type Notes, type SelfAssessment,
} from './types'
import { noteHint } from './final-note-hint'
import { CoverageMap, DeadlineBanner, NotesTimeline, type IndicatorOption } from './notes-parts'
import { StartHead } from './start-head'
import { CompetencyIcon, UiIcon } from './start-icons'
import { firstNameOf, nameCase } from './start-model'
import './start-hifi.css'
import './notes-v2.css'

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

/** W06 / H06 v2: oś okresu z notatkami, mapa pokrycia wskaźników, formularz S/D/R. Oceniany notatek nie widzi. */
export function NotesStep({ detail, steps, go, reload: reloadDetail }: StepProps) {
  const { data, error, reload } = useApi<Notes>(`evaluations/${detail.id}/notes`)
  const options = indicatorOptions(detail)
  const criteria = criteriaOf(detail)
  const [editing, setEditing] = useState<number | null>(null)
  const [indicator, setIndicator] = useState<string | null>(null)
  const notesStep = steps.find((s) => s.id === 'notes')
  const stage = detail.stages.find((s) => s.key === notesStep?.stageKey)
  const firstStage = detail.stages[0]
  const periodStart = data?.evidence.periodStart ?? firstStage?.completedOn ?? detail.startDate
  const end = stage?.dueTo
  const left = daysUntil(end)
  const ratingStep = steps.find((s) => s.group === 'Ocena')
  const canWrite = detail.canEdit && stage?.status === 'Pending'
  const alert = stage?.status === 'Pending' && left != null && left <= 30
  const name = firstNameOf(detail.employeeName)

  const count = (indicatorKey: string) => data?.evidence.indicators.find((i) => i.indicatorKey === indicatorKey)?.count ?? 0
  const notesCount = data?.notes.length ?? 0
  const uncovered = options.filter((o) => count(o.key) === 0).length
  const selected = indicator ?? options.find((o) => count(o.key) === 0)?.key ?? options[0]?.key ?? null

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

  return (
    <div className="step sv2 nv2">
      <StartHead detail={detail} topic="Notatki" />
      {alert && data && <DeadlineBanner left={left!} uncovered={uncovered} onGo={ratingStep ? () => go(ratingStep.id) : undefined} />}
      {error ? (
        <p className="callout attention">Notatki nie są jeszcze dostępne: {error}</p>
      ) : !data ? <p>Ładowanie…</p> : (
        <>
          {end && <NotesTimeline start={periodStart} end={end} today={today()} notes={data.notes} options={options} recentShare={data.evidence.recentShare} />}
          {stage?.dueNote && <p className="sv2-muted">{stage.dueNote}</p>}
          {data.evidence.outsidePeriod > 0 && (
            <p className="sv2-muted">Sprzed okresu oceny: {data.evidence.outsidePeriod} — nie liczą się jako dowody.</p>
          )}
          <div className={canWrite ? 'nv2-cols' : undefined}>
            <CoverageMap options={options} criteria={criteria} count={count} selected={canWrite ? selected : indicator} onSelect={setIndicator}
              empty={notesCount === 0}
              onAddFirst={canWrite ? () => document.getElementById('notes-new')?.querySelector<HTMLElement>('textarea')?.focus() : undefined} />
            {canWrite && (
              <NoteForm id="notes-new" title="Nowa notatka" employee={name} options={options} onSubmit={create} alert={alert}
                indicator={selected} onIndicator={setIndicator} />
            )}
          </div>
          {!detail.isOwn && <TermPanel detail={detail} reload={reloadDetail} />}
          <SelfAssessmentStatus detail={detail} />
          {notesCount > 0 && (
            <details className="sv2-details nv2-list">
              <summary>Wszystkie notatki · {notesCount}</summary>
              <ul className="nv2-notes">
                {[...data.notes].sort((a, b) => b.observedOn.localeCompare(a.observedOn)).map((n) => (
                  <li key={n.id} className={n.inPeriod ? undefined : 'out'}>
                    {editing === n.id ? (
                      <NoteForm title="Edycja notatki" employee={name} options={options} initial={n} onSubmit={(body) => update(n.id, body)}
                        onCancel={() => setEditing(null)} />
                    ) : (
                      <NoteView note={n} options={options} employee={name} onEdit={canWrite && n.canEdit ? () => setEditing(n.id) : undefined}
                        onDelete={canWrite && n.canEdit ? () => remove(n.id) : undefined} />
                    )}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  )
}

function NoteView({ note, options, employee, onEdit, onDelete }: {
  note: Note; options: IndicatorOption[]; employee: string; onEdit?: () => void; onDelete?: () => void
}) {
  const indicator = options.find((o) => o.key === note.indicatorKey)
  return (
    <div className="nv2-note">
      <div className="nv2-note-head">
        <strong>{fmtDate(note.observedOn)}</strong>
        {indicator && <span className="nv2-note-ind"><CompetencyIcon id={indicator.criterionKey} size={16} />{indicator.criterionLabel} · {indicator.text}</span>}
        <span className="grow" />
        {note.isPrivate && <span className="nv2-tag"><UiIcon name="lock" size={14} /> tylko dla mnie</span>}
        {note.discussedWithEmployee && <span className="nv2-tag"><UiIcon name="check" size={14} /> omówiono z {nameCase(employee, 'inst')}</span>}
        {!note.inPeriod && <span className="nv2-tag">sprzed okresu</span>}
        {onEdit && <button type="button" className="link" onClick={onEdit}>Edytuj</button>}
        {onDelete && <ConfirmButton compact question="Usunąć notatkę?" confirmLabel="Usuń notatkę" onConfirm={onDelete}>Usuń</ConfirmButton>}
      </div>
      <dl className="nv2-sar">
        {SAR.map((f) => note[f.name] ? <div key={f.name}><dt><UiIcon name={f.icon} size={16} /><span className="sr-only">{f.label}</span></dt><dd>{note[f.name]}</dd></div> : null)}
      </dl>
    </div>
  )
}

const SAR = [
  { name: 'situation', label: 'Sytuacja', icon: 'pin', placeholder: 'Sytuacja: kiedy, przy jakim zadaniu' },
  { name: 'action', label: 'Działanie', icon: 'pen', placeholder: 'Działanie: co zrobił(a)' },
  { name: 'result', label: 'Rezultat', icon: 'flag', placeholder: 'Rezultat: z jakim skutkiem' },
] as const

function NoteForm({ id, title, employee, options, initial, indicator, onIndicator, alert = false, onSubmit, onCancel }: {
  id?: string
  title: string
  employee: string
  options: IndicatorOption[]
  initial?: Note
  /** Formularz nowej notatki: wskaźnik sterowany z mapy pokrycia. */
  indicator?: string | null
  onIndicator?: (key: string | null) => void
  /** Tryb alertu (≤ 30 dni): główną akcją jest „Przejdź do oceny”, zapis ma obrys. */
  alert?: boolean
  onSubmit: (body: NoteRequest) => Promise<void>
  onCancel?: () => void
}) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [formKey, setFormKey] = useState(0)
  const [localIndicator, setLocalIndicator] = useState<string>(initial?.indicatorKey ?? '')
  const [text, setText] = useState<Record<string, string>>(() => ({
    situation: initial?.situation ?? '', action: initial?.action ?? '', result: initial?.result ?? '',
  }))
  const [saved, setSaved] = useState('')
  const [dismissed, setDismissed] = useState<string | null>(null)
  const criteria = [...new Map(options.map((o) => [o.criterionKey, o.criterionLabel])).entries()]
  const hint = noteHint([text.situation, text.action, text.result].filter(Boolean).join(' '))
  const value = onIndicator ? indicator ?? '' : localIndicator
  const setValue = (v: string) => (onIndicator ? onIndicator(v || null) : setLocalIndicator(v))
  const criterion = options.find((o) => o.key === value)?.criterionKey
  const empty = !text.situation.trim() && !text.action.trim() && !text.result.trim()
  useEffect(() => { if (hint !== dismissed) setDismissed(null) }, [hint, dismissed])

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const field = (name: string) => String(form.get(name) ?? '').trim()
    if (!field('situation') && !field('action') && !field('result')) {
      setError('Opisz przynajmniej sytuację, działanie albo rezultat.')
      return
    }
    setBusy(true)
    try {
      await onSubmit({
        observedOn: field('observedOn'),
        situation: field('situation'),
        action: field('action'),
        result: field('result'),
        indicatorKey: field('indicatorKey') || null,
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
    <form key={formKey} id={id} className="card nv2-form" onSubmit={submit} aria-labelledby={id ? `${id}-title` : undefined}>
      <div className="sv2-row-head">
        <h3 id={id ? `${id}-title` : undefined} className="sv2-h3">{title}</h3>
        <span className="nv2-private"><UiIcon name="lock" size={16} /> Prywatna</span>
        <Info label="Kto widzi notatkę">
          {employee} nie widzi notatek w aplikacji. Do asystenta trafia tekst bez nazwiska. „Tylko dla mnie” ukrywa notatkę też przed innymi przełożonymi.
        </Info>
      </div>
      <div className="nv2-form-row">
        <label className="nv2-date">
          <span className="sr-only">Data zdarzenia</span>
          <DateInput name="observedOn" required defaultValue={initial?.observedOn ?? today()} max={today()} />
        </label>
        <label className="nv2-select">
          <span className="sr-only">Wskaźnik</span>
          {criterion && <CompetencyIcon id={criterion} size={18} />}
          <select name="indicatorKey" value={value} onChange={(e) => setValue(e.target.value)}>
            <option value="">— bez wskaźnika —</option>
            {criteria.map(([key, label]) => (
              <optgroup key={key} label={label}>
                {options.filter((o) => o.criterionKey === key).map((o) => <option key={o.key} value={o.key}>{o.text}</option>)}
              </optgroup>
            ))}
          </select>
        </label>
      </div>
      {SAR.map((f) => (
        <label key={f.name} className="sv2-input-icon nv2-sar-input">
          <UiIcon name={f.icon} size={18} />
          <span className="sr-only">{f.label}</span>
          <textarea name={f.name} rows={1} defaultValue={text[f.name]} placeholder={f.placeholder}
            onChange={(e) => { const v = e.target.value; setText((t) => ({ ...t, [f.name]: v })); setSaved('') }} />
        </label>
      ))}
      {hint && dismissed !== hint && (
        <p className="nv2-hint nv2-hint-row notes-hint" role="status">
          <Info label="Wskazówka z reguły, nie AI">Busola sprawdza słowa-opinie i brak opisu działania. To zasada Busoli, nie model AI.</Info>
          <span className="grow"><strong>Wskazówka:</strong> {hint}</span>
          <button type="button" className="nv2-x" aria-label="Zamknij wskazówkę" onClick={() => setDismissed(hint)}>×</button>
        </p>
      )}
      <div className="nv2-form-foot">
        <label className="check"><input type="checkbox" name="discussedWithEmployee" defaultChecked={initial?.discussedWithEmployee} /> Omówiono z {nameCase(employee, 'inst')}</label>
        <label className="check"><input type="checkbox" name="isPrivate" defaultChecked={initial?.isPrivate} /> Tylko dla mnie</label>
        <span className="grow" />
        {saved && <span className="sv2-muted" role="status">{saved}</span>}
        {onCancel && <button type="button" className="secondary" onClick={onCancel}>Anuluj</button>}
        <button type="submit" className={alert ? 'nv2-outline' : undefined} disabled={busy || empty}>{busy ? 'Zapisywanie…' : 'Zapisz notatkę'}</button>
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
      {stage.dueNote && <p className="muted small">{stage.dueNote}</p>}
      <TermPanel detail={detail} reload={reload} />
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
