import { Fragment, useState, type FormEvent } from 'react'
import { api } from '../api'
import { ConfirmButton } from '../ConfirmButton'
import { CompleteStage, DuePill, IssueList, Pill, type StepProps } from './common'
import { useApi } from './data'
import {
  daysUntil, criteriaOf, fmtDate, plural, today, type Detail, type Note, type NoteRequest, type Notes, type SelfAssessment,
} from './types'

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
  const [criterion, setCriterion] = useState(criteria[0]?.key ?? '')
  const [editing, setEditing] = useState<number | null>(null)
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
    <div className="step">
      {stage?.status === 'Pending' && left != null && left <= 30 && (
        <div className="callout attention row">
          <strong className="grow">{left < 0 ? `Termin oceny minął ${-left} dni temu.` : `${left} dni do terminu oceny.`} Zaplanuj rozmowę oceniającą.</strong>
          {ratingStep && <button type="button" onClick={() => go(ratingStep.id)}>Przejdź do oceny</button>}
        </div>
      )}
      <div className="step-head"><h2>Notatki z obserwacji</h2><Pill icon="lock">tylko dla przełożonego</Pill></div>
      {progress != null && (
        <div className="timeline" aria-label="Okres obserwacji">
          <div className="timeline-bar"><div style={{ width: `${progress * 100}%` }} /></div>
          <div className="timeline-labels small muted">
            <span>{fmtDate(periodStart)} · start</span><strong>dziś</strong><span>{fmtDate(end)} · termin</span>
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
              {Math.round(data.evidence.recentShare * 100)}% notatek pochodzi z ostatnich 4 miesięcy. Dodaj obserwacje z wcześniejszej części okresu, żeby ocena objęła cały okres.
            </p>
          )}
          {data.evidence.outsidePeriod > 0 && (
            <p className="muted small">{data.evidence.outsidePeriod} {plural(data.evidence.outsidePeriod, "notatka jest", "notatki są", "notatek jest")} sprzed okresu oceny — nie liczą się jako dowody.</p>
          )}
          <div className="card">
            <h3>Dowody na wskaźniki · {criteria.find((c) => c.key === criterion)?.label}</h3>
            <div className="chips" role="tablist">
              {criteria.map((c) => (
                <button key={c.key} type="button" role="tab" aria-selected={c.key === criterion}
                  className={c.key === criterion ? 'chip-button active' : 'chip-button'} onClick={() => setCriterion(c.key)}>{c.label}</button>
              ))}
            </div>
            <ul className="evidence">
              {options.filter((o) => o.criterionKey === criterion).map((o) => (
                <li key={o.key}>
                  <span>{o.text}</span>
                  {count(o.key) > 0 ? <Pill tone="info">{count(o.key)} {plural(count(o.key), 'notatka', 'notatki', 'notatek')}</Pill> : <Pill tone="attention">brak dowodów</Pill>}
                </li>
              ))}
            </ul>
          </div>
          {canWrite && <NoteForm title="Nowa notatka" options={options} onSubmit={create} defaultIndicator={options.find((o) => o.criterionKey === criterion)?.key ?? null} />}
          <div className="card">
            <h3>Notatki ({notesCount})</h3>
            {notesCount === 0 && <p className="muted">Brak notatek. Opisz zachowanie: co zrobił(a), w jakiej sytuacji, z jakim skutkiem.</p>}
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
          </div>
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
      <dl className="sar">
        <dt>Sytuacja</dt><dd>{note.situation || '—'}</dd>
        <dt>Działanie</dt><dd>{note.action || '—'}</dd>
        <dt>Rezultat</dt><dd>{note.result || '—'}</dd>
      </dl>
      <p className="muted small">{note.authorName}</p>
    </div>
  )
}

function NoteForm({ title, options, initial, defaultIndicator = null, onSubmit, onCancel }: {
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
  const criteria = [...new Map(options.map((o) => [o.criterionKey, o.criterionLabel])).entries()]

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const text = (name: string) => String(form.get(name) ?? '').trim()
    if (!text('situation') && !text('action') && !text('result')) {
      setError('Opisz przynajmniej sytuację, działanie albo rezultat.')
      return
    }
    setBusy(true)
    try {
      await onSubmit({
        observedOn: text('observedOn'),
        situation: text('situation'),
        action: text('action'),
        result: text('result'),
        indicatorKey: text('indicatorKey') || null,
        isPrivate: form.get('isPrivate') === 'on',
        discussedWithEmployee: form.get('discussedWithEmployee') === 'on',
      })
      setError('')
      if (!initial) setFormKey((k) => k + 1)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form key={formKey} className="card note-form" onSubmit={submit}>
      <h3>{title}</h3>
      <div className="sar-inputs">
        <label>Sytuacja<textarea name="situation" rows={3} defaultValue={initial?.situation ?? ''} /></label>
        <label>Działanie<textarea name="action" rows={3} defaultValue={initial?.action ?? ''} /></label>
        <label>Rezultat<textarea name="result" rows={3} defaultValue={initial?.result ?? ''} /></label>
      </div>
      <div className="inline gap">
        <label className="check">Data <input type="date" name="observedOn" required defaultValue={initial?.observedOn ?? today()} /></label>
        <label className="check">Wskaźnik
          <select name="indicatorKey" defaultValue={initial ? initial.indicatorKey ?? '' : defaultIndicator ?? ''}>
            <option value="">— bez wskaźnika —</option>
            {criteria.map(([key, label]) => (
              <optgroup key={key} label={label}>
                {options.filter((o) => o.criterionKey === key).map((o) => <option key={o.key} value={o.key}>{o.text}</option>)}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="check"><input type="checkbox" name="isPrivate" defaultChecked={initial?.isPrivate} /> Prywatna</label>
        <label className="check"><input type="checkbox" name="discussedWithEmployee" defaultChecked={initial?.discussedWithEmployee} /> Omówiono z pracownikiem</label>
      </div>
      {error && <p role="alert" className="error">{error}</p>}
      <div className="buttons">
        <button type="submit" disabled={busy}>{busy ? 'Zapisywanie…' : 'Zapisz notatkę'}</button>
        {onCancel && <button type="button" className="secondary" onClick={onCancel}>Anuluj</button>}
      </div>
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
      {self?.submitted && (
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
