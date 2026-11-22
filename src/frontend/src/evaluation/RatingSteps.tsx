import { useEffect, useRef, useState } from 'react'
import { SheetForm } from '../Evaluations'
import { NextButton, PdfButton, Pill, type StepProps } from './common'
import { saveAnswers, useApi, useWorkContext } from './data'
import { fmtMean, shuffled, suggestionValues } from './rating-logic'
import {
  answerOf, criteriaOf, emptyAnswer, fmtDate, indicatorFieldOf, isFirstTemplate, plural, scoresFieldOf,
  type Detail, type Indicator, type Notes, type ScaleOption, type SelfAssessment, type Topic,
} from './types'
import './rating-hifi.css'

/**
 * Oznaczenia opisów zachowań: litery w przetasowanej kolejności, bo cyfry (1, 3, 5…) wyglądałyby jak punkty skali.
 * Każdy wskaźnik trzeba ocenić jednym z opisów — bez „nie było okazji” (decyzja W07: odpowiedź jest wymagana).
 */
const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E']
/** Po wyborze zachowania przejście do następnego wskaźnika (W07). */
const ADVANCE_MS = 350

type Choice = { valueNumber: number | null; valueText: string | null }
type Note = Notes['notes'][number]
type WorkApi = ReturnType<typeof useWorkContext>

const lower = (o: ScaleOption) => o.label.charAt(0).toLowerCase() + o.label.slice(1)

/** W07 (ocena wskaźnika: opisy zachowań jako odpowiedzi) i W08 (podsumowanie kryterium: sugestia i ocena robocza). */
export function IndicatorsStep({ detail, steps, go, reload }: StepProps) {
  const scores = scoresFieldOf(detail.schema)!
  const indicatorField = indicatorFieldOf(detail.schema, scores.field.key)!
  const competencies = detail.schema.competencyModel?.competencies ?? {}
  const criteria = criteriaOf(detail).filter((c) => competencies[c.key])
  const scale = scores.scale
  const editable = detail.canEdit && !detail.lockedSections.includes(scores.section.key)
  const work = useWorkContext(detail.id)
  const notes = useApi<Notes>(`evaluations/${detail.id}/notes`)

  const [choices, setChoices] = useState<Record<string, Choice>>(() => Object.fromEntries(
    detail.answers.filter((a) => a.fieldKey === indicatorField.key && a.itemKey).map((a) => [a.itemKey!, { valueNumber: a.valueNumber, valueText: a.valueText }])))
  const answered = (key: string) => choices[key]?.valueNumber != null
  const scored = (key: string) => answerOf(detail, scores.field.key, key)?.valueNumber != null
  const [pos, setPos] = useState<{ c: number; i: number | 'summary' }>(() => {
    for (let c = 0; c < criteria.length; c++) {
      const i = competencies[criteria[c].key].indicators.findIndex((x) => !answered(x.key))
      if (i >= 0) return { c, i }
      if (!scored(criteria[c].key)) return { c, i: 'summary' }
    }
    return { c: 0, i: 'summary' }
  })
  const [error, setError] = useState('')
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])

  const criterion = criteria[pos.c]
  const indicators = criterion ? competencies[criterion.key].indicators : []
  const indicator = typeof pos.i === 'number' ? indicators[pos.i] : undefined

  const move = (next: { c: number; i: number | 'summary' }) => {
    window.clearTimeout(timer.current)
    setPos(next)
  }

  async function choose(key: string, choice: Choice) {
    if (!editable || typeof pos.i !== 'number') return
    setChoices((c) => ({ ...c, [key]: choice }))
    // Automatyczne przejście dalej — tylko gdy użytkownik nadal jest na tym samym wskaźniku.
    const from = { c: pos.c, i: pos.i }
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      setPos((p) => (p.c === from.c && p.i === from.i ? { c: from.c, i: from.i < indicators.length - 1 ? from.i + 1 : 'summary' } : p))
    }, ADVANCE_MS)
    try {
      await saveAnswers(detail.id, [{ ...emptyAnswer(indicatorField.key, key), ...choice }])
      setError('')
      reload()
    } catch (e) {
      window.clearTimeout(timer.current)
      setError((e as Error).message)
    }
  }

  // Klawisze A–E wybierają opis (poza polami tekstowymi). Litery, nie cyfry — żeby nie mylić z punktami.
  useEffect(() => {
    if (!indicator || !editable) return
    const order = shuffled(scale, indicator.key)
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest('input, textarea, select') || e.ctrlKey || e.metaKey || e.altKey) return
      const key = e.key.toUpperCase()
      const n = OPTION_LETTERS.indexOf(key)
      if (key.length === 1 && n >= 0 && n < order.length) choose(indicator.key, { valueNumber: order[n].value, valueText: null })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (criteria.length === 0) return <p className="muted">Najpierw wybierz kryteria (krok „Kryteria i wskaźniki”).</p>

  const doneInCriterion = indicators.filter((i) => answered(i.key)).length
  const totalIndicators = criteria.reduce((n, c) => n + competencies[c.key].indicators.length, 0)
  const doneIndicators = criteria.reduce((n, c) => n + competencies[c.key].indicators.filter((i) => answered(i.key)).length, 0)
  const next = () => {
    if (typeof pos.i === 'number' && pos.i < indicators.length - 1) move({ c: pos.c, i: pos.i + 1 })
    else if (typeof pos.i === 'number') move({ c: pos.c, i: 'summary' })
    else if (pos.c < criteria.length - 1) move({ c: pos.c + 1, i: 0 })
    window.scrollTo({ top: 0 })
  }
  const prev = () => {
    if (pos.i === 'summary') move({ c: pos.c, i: indicators.length - 1 })
    else if (pos.i > 0) move({ c: pos.c, i: pos.i - 1 })
    else if (pos.c > 0) move({ c: pos.c - 1, i: 'summary' })
  }
  const openCriterion = (index: number) => {
    const list = competencies[criteria[index].key].indicators
    const firstOpen = list.findIndex((x) => !answered(x.key))
    move({ c: index, i: firstOpen >= 0 ? firstOpen : 'summary' })
  }
  const indicatorNotes = (key: string) => notes.data?.notes.filter((n) => n.indicatorKey === key) ?? []

  return (
    <div className="step rh">
      <div className="rh-tabs" role="tablist" aria-label="Kryteria oceny">
        {criteria.map((c, index) => {
          const done = scored(c.key)
          return (
            <button key={c.key} type="button" role="tab" aria-selected={index === pos.c}
              className={index === pos.c ? 'rh-tab active' : done ? 'rh-tab done' : 'rh-tab'} onClick={() => openCriterion(index)}>
              {done && <span aria-hidden="true">✓</span>}{c.label}
              {done && <span className="sr-only"> (ocenione)</span>}
            </button>
          )
        })}
      </div>

      <div className="rh-progress">
        <div className="rh-progress-row">
          <span><strong>{criterion.label}</strong>{indicator ? ` · wskaźnik ${(pos.i as number) + 1} z ${indicators.length}` : ' · podsumowanie'}</span>
          <span className="grow" />
          <span className="small muted">wszystkie kryteria: {doneIndicators} z {totalIndicators} wskaźników</span>
        </div>
        <div className="rh-bar" role="progressbar" aria-label={`Postęp w kryterium ${criterion.label}`}
          aria-valuemin={0} aria-valuemax={indicators.length} aria-valuenow={doneInCriterion}>
          <div style={{ width: `${(doneInCriterion / Math.max(1, indicators.length)) * 100}%` }} />
        </div>
      </div>

      {!editable && (
        <p className="rh-readonly small">Tylko do odczytu{detail.lockedSections.includes(scores.section.key) ? ' — etap oceny jest zamknięty' : ''}.</p>
      )}
      {error && <p role="alert" className="error">{error}</p>}

      {indicator ? (
        <IndicatorQuestion key={indicator.key} detail={detail} indicator={indicator} scale={scale}
          choice={choices[indicator.key]} editable={editable} onChoose={(c) => choose(indicator.key, c)}
          expectation={work.indicator(indicator.key).expectation} notes={indicatorNotes(indicator.key)} notesError={notes.error} />
      ) : (
        <CriterionSummary key={criterion.key} detail={detail} criterionKey={criterion.key} label={criterion.label} indicators={indicators}
          choices={choices} scale={scale} scoresKey={scores.field.key} editable={editable} work={work} reload={reload}
          noteCount={(key) => indicatorNotes(key).length} onChange={(i) => move({ c: pos.c, i })} />
      )}

      <div className="step-actions">
        {indicator
          ? <button type="button" className="secondary" onClick={prev} disabled={pos.c === 0 && pos.i === 0}>← Poprzedni wskaźnik</button>
          : <button type="button" className="secondary" onClick={prev}>← Wskaźniki</button>}
        <span className="grow" />
        {indicator && editable && (
          <span className="small muted">Skróty: <kbd>A</kbd>–<kbd>{OPTION_LETTERS[scale.length - 1]}</kbd> wybór, potem przejście dalej</span>
        )}
        {indicator || pos.c < criteria.length - 1
          ? <button type="button" onClick={next}>
            {indicator
              ? (pos.i as number) < indicators.length - 1 ? 'Następny wskaźnik →' : 'Zobacz sugestię poziomu →'
              : `Dalej: ${criteria[pos.c + 1].label} →`}
          </button>
          : <NextButton steps={steps} current="indicators" go={go} label="Dalej: rozmowa oceniająca" />}
      </div>
    </div>
  )
}

function IndicatorQuestion({ detail, indicator, scale, choice, editable, onChoose, expectation, notes, notesError }: {
  detail: Detail
  indicator: Indicator
  scale: ScaleOption[]
  choice: Choice | undefined
  editable: boolean
  onChoose: (c: Choice) => void
  expectation: string | null
  notes: Note[]
  notesError: string
}) {
  const agreedOn = detail.stages[0]?.completedOn
  const headingId = `rh-q-${indicator.key}`
  return (
    <div className="rh-question-layout">
      <div className="rh-question">
        <div className="rh-question-head">
          <h2 id={headingId} className="rh-question-text">{indicator.text}</h2>
          <p className="muted">Wybierz zachowanie typowe dla całego okresu oceny. Weź pod uwagę powtarzalność, nie jednorazowy wyjątek.</p>
        </div>
        {expectation && (
          <p className="rh-expectation small">
            <strong>Ustalone oczekiwanie{agreedOn ? ` (${fmtDate(agreedOn)})` : ''}:</strong> „{expectation}”
          </p>
        )}
        <div className="rh-options" role="radiogroup" aria-labelledby={headingId}>
          {shuffled(scale, indicator.key).map((o, index) => {
            const checked = choice?.valueNumber === o.value
            return (
              <button key={o.key} type="button" role="radio" aria-checked={checked} disabled={!editable}
                className={checked ? 'option selected' : 'option'} style={{ animationDelay: `${index * 40}ms` }}
                onClick={() => onChoose({ valueNumber: o.value, valueText: null })}>
                <span className="option-key" aria-hidden="true">{OPTION_LETTERS[index]}</span>
                <span className="grow">{indicator.levels[o.key] ?? o.label}</span>
                {checked && <span className="rh-check" aria-hidden="true">✓</span>}
              </button>
            )
          })}
        </div>
      </div>
      <aside className="rh-notes" aria-label="Twoje notatki do tego wskaźnika">
        <h3>Twoje notatki do tego wskaźnika</h3>
        {notesError ? <p className="muted small">Notatki niedostępne: {notesError}</p>
          : notes.length === 0 ? <p className="muted small">Brak notatek przy tym wskaźniku. Oceń na podstawie tego, co pamiętasz z całego okresu.</p>
          : (
            <ul>
              {notes.map((n) => (
                <li key={n.id} className={n.inPeriod ? undefined : 'muted'}>
                  <time className="small muted">{fmtDate(n.observedOn)}</time>
                  <span>{[n.situation, n.action, n.result].filter(Boolean).join(' · ')}</span>
                  {!n.inPeriod && <span className="small">sprzed okresu oceny, nie liczy się</span>}
                </li>
              ))}
            </ul>
          )}
        <p className="small muted">Notatki pomagają przypomnieć sobie sytuacje. Zachowanie wybierasz Ty.</p>
      </aside>
    </div>
  )
}

function CriterionSummary({ detail, criterionKey, label, indicators, choices, scale, scoresKey, editable, work, reload, noteCount, onChange }: {
  detail: Detail
  criterionKey: string
  label: string
  indicators: Indicator[]
  choices: Record<string, Choice>
  scale: ScaleOption[]
  scoresKey: string
  editable: boolean
  work: WorkApi
  reload: () => Promise<void>
  noteCount: (indicatorKey: string) => number
  onChange: (indicatorIndex: number) => void
}) {
  const fromApi = detail.scoring?.criteria.find((c) => c.key === criterionKey)
  const picked = indicators.map((i) => choices[i.key]?.valueNumber).filter((n): n is number => n != null)
  const localMean = picked.length ? Math.round((picked.reduce((a, b) => a + b, 0) / picked.length) * 100) / 100 : null
  // Średnia z bieżących wyborów (te same dane co backend; lokalnie, bo backend odświeża się po zapisie).
  const mean = localMean ?? fromApi?.indicatorMean ?? null
  const complete = picked.length === indicators.length
  const suggestions = complete ? suggestionValues(scale, mean, fromApi?.suggested ?? null) : []
  const [score, setScore] = useState<number | null>(answerOf(detail, scoresKey, criterionKey)?.valueNumber ?? null)
  const [error, setError] = useState('')
  const meets = scale.find((o) => o.key === 'meets')
  const option = (v: number | null) => scale.find((o) => o.value === v)

  async function pick(value: number) {
    if (!editable) return
    const before = score
    setScore(value)
    try {
      await saveAnswers(detail.id, [{ ...emptyAnswer(scoresKey, criterionKey), valueNumber: value }])
      setError('')
      reload()
    } catch (e) {
      setScore(before)
      setError((e as Error).message)
    }
  }

  const differs = score != null && suggestions.length > 0 && !suggestions.includes(score)

  return (
    <div className="rh-summary">
      <h2 className="rh-summary-title">{label}</h2>

      <section className="card rh-picked" aria-labelledby="rh-picked">
        <h3 id="rh-picked">Wybrane zachowania</h3>
        {indicators.map((i, index) => {
          const o = option(choices[i.key]?.valueNumber ?? null)
          const n = noteCount(i.key)
          return (
            <div key={i.key} className="rh-picked-row">
              <div className="grow">
                <p className="small muted">{i.text}</p>
                <p>{o ? `„${i.levels[o.key] ?? o.label}”` : <em className="muted">nie wybrano</em>}</p>
                <p className="small muted">{n} {plural(n, 'notatka', 'notatki', 'notatek')}</p>
              </div>
              {editable && <button type="button" className="link" onClick={() => onChange(index)}>{o ? 'Zmień wybór' : 'Wybierz'}</button>}
            </div>
          )
        })}
      </section>

      <section className="ai-proposal rh-suggestion" aria-labelledby="rh-sug">
        <span className="ai-tag" id="rh-sug">✦ Sugerowany poziom · liczy reguła, nie AI</span>
        {!complete ? (
          <p>Sugestia pojawi się, gdy wybierzesz zachowanie przy każdym wskaźniku ({picked.length} z {indicators.length}).</p>
        ) : suggestions.length === 2 ? (
          <div className="rh-sug-row">
            <b className="rh-sug-value">{suggestions[0]} lub {suggestions[1]}</b>
            <p className="small muted">
              Średnia wybranych poziomów ({picked.join(', ')}) = {fmtMean(mean!)} leży dokładnie w połowie między dwiema wartościami skali.
              Rozstrzygnij na podstawie notatek z całego okresu.
            </p>
          </div>
        ) : suggestions.length === 1 ? (
          <div className="rh-sug-row">
            <b className="rh-sug-value" key={suggestions[0]}>{suggestions[0]}</b>
            <div>
              <b>{option(suggestions[0]) ? lower(option(suggestions[0])!) : ''}</b>
              <p className="small muted">
                Średnia wybranych poziomów ({picked.join(', ')}){mean != null ? ` = ${fmtMean(mean)}` : ''}, zaokrąglona do najbliższej wartości skali.
              </p>
            </div>
          </div>
        ) : <p className="muted">Brak sugestii.</p>}
        <p className="small muted">To podpowiedź, nie ocena. Ocenę wybierasz Ty.</p>
      </section>

      <section className="rh-decision" aria-labelledby="rh-dec">
        <div className="rh-decision-head">
          <h3 id="rh-dec">Twoja ocena za kryterium</h3>
          <span className="grow" />
          {meets && <span className="small muted">Punkt wyjścia: {meets.value} · {lower(meets)} <span className="rh-ref">(Poradnik KPRM, s. 26)</span></span>}
        </div>
        <p className="small muted">Wybierz ocenę: możesz wybrać sugestię albo inną wartość. Potwierdzisz ją po rozmowie oceniającej.</p>
        <ScoreScale scale={scale} value={score} suggested={suggestions} disabled={!editable} label={`Ocena za kryterium: ${label}`} onPick={pick} />
        {error && <p role="alert" className="error">{error}</p>}
        {differs && (
          <div className="rh-differs">
            <span className="pill neutral">Twoja ocena: {score} · sugestia: {suggestions.join(' lub ')}</span>
            <ReasonField key={`${criterionKey}-${work.context ? 'loaded' : 'loading'}`} initial={work.reason(criterionKey)}
              disabled={!editable || !!work.error} onSave={(v) => work.saveReason(criterionKey, v)} />
          </div>
        )}
      </section>
    </div>
  )
}

function ScoreScale({ scale, value, suggested, disabled, label, onPick }: {
  scale: ScaleOption[]
  value: number | null
  suggested: number[]
  disabled: boolean
  label: string
  onPick: (v: number) => void
}) {
  return (
    <div className="score-buttons rh-scale" role="radiogroup" aria-label={label}>
      {scale.map((o) => {
        const isSug = suggested.includes(o.value)
        return (
          <button key={o.value} type="button" role="radio" aria-checked={value === o.value} disabled={disabled}
            className={['score-button', value === o.value && 'selected', isSug && 'suggested'].filter(Boolean).join(' ')}
            onClick={() => onPick(o.value)}>
            {isSug && <span className="rh-sug-tag">sugestia</span>}
            <strong className="rh-scale-value">{o.value}</strong>
            <span className="small">{lower(o)}</span>
          </button>
        )
      })}
    </div>
  )
}

function ReasonField({ initial, disabled, onSave }: { initial: string; disabled: boolean; onSave: (v: string) => Promise<void> }) {
  const [value, setValue] = useState(initial)
  const [status, setStatus] = useState('')
  async function save() {
    if (value === initial) return
    setStatus('Zapisywanie…')
    try {
      await onSave(value.trim())
      setStatus('Zapisano.')
    } catch (e) {
      setStatus((e as Error).message)
    }
  }
  return (
    <label className="block-label">Dlaczego inaczej? <span className="small muted">Opcjonalnie. Pomoże w rozmowie oceniającej i w uzasadnieniu.</span>
      <textarea rows={2} value={value} disabled={disabled} onChange={(e) => setValue(e.target.value)} onBlur={save}
        placeholder="np. dwa opóźnienia zgłoszone dopiero w dniu terminu" />
      {status && <span className="muted small" role="status">{status}</span>}
    </label>
  )
}

type AgendaKind = 'criteria' | 'goals' | 'report' | 'development'
type AgendaItem = { kind: AgendaKind; topic?: Topic }

/** Punkty agendy z tematów szablonu (§ 10, przy pierwszej ocenie § 2 i § 7); bez szablonu — stała lista. */
function agendaOf(topics: Topic[] | undefined, first: boolean): AgendaItem[] {
  const kindOf = (t: Topic): AgendaKind | null => {
    const text = t.text.toLowerCase()
    if (text.includes('cel')) return 'goals'
    if (text.includes('sprawozdani')) return 'report'
    if (text.includes('rozwoj') || text.includes('rozwój')) return 'development'
    if (text.includes('egzamin')) return null // wynik egzaminu wpisuje się w kroku wyniku
    return 'criteria'
  }
  const items: AgendaItem[] = []
  for (const t of topics ?? []) {
    const kind = kindOf(t)
    if (kind && !items.some((i) => i.kind === kind)) items.push({ kind, topic: t })
  }
  if (items.length) return items
  return first
    ? [{ kind: 'criteria' }, { kind: 'report' }, { kind: 'development' }]
    : [{ kind: 'criteria' }, { kind: 'goals' }, { kind: 'development' }]
}

/** W09: rozmowa oceniająca — agenda z § 10, przy kryterium ocena robocza, oczekiwanie i przykłady z notatek. */
export function InterviewStep({ detail, steps, go, reload, sections }: StepProps & { sections: string[] }) {
  const first = isFirstTemplate(detail.templateCode)
  const criteria = criteriaOf(detail)
  const scores = scoresFieldOf(detail.schema)
  const [tab, setTab] = useState<AgendaKind>('criteria')
  const [index, setIndex] = useState(0)
  const work = useWorkContext(detail.id)
  const notes = useApi<Notes>(`evaluations/${detail.id}/notes`)
  const self = useApi<SelfAssessment>(`evaluations/${detail.id}/self-assessment`)
  const firstName = detail.employeeName.split(' ')[0]
  const section = detail.schema.sections.find((s) => sections.includes(s.key))
  const agenda = agendaOf(detail.schema.stages?.find((s) => s.key === section?.stage)?.topics, first)
  const scoredCount = scores ? criteria.filter((c) => answerOf(detail, scores.field.key, c.key)?.valueNumber != null).length : 0

  const devField = detail.schema.sections.filter((s) => s.stage === section?.stage).flatMap((s) => s.fields)
    .find((f) => f.type === 'longText' && f.key.toLowerCase().includes('development'))
  const devSection = devField && detail.schema.sections.find((s) => s.fields.includes(devField))
  const canCopyNeeds = !!devField && !!self.data?.developmentNeeds && detail.canEdit && !detail.lockedSections.includes(devSection!.key)
  const [copyStatus, setCopyStatus] = useState('')
  async function copyNeeds() {
    const current = answerOf(detail, devField!.key)?.valueText ?? ''
    const needs = self.data!.developmentNeeds!.trim()
    if (current.includes(needs)) { setCopyStatus('Już są we wnioskach.'); return }
    try {
      await saveAnswers(detail.id, [{ ...emptyAnswer(devField!.key, null), valueText: current ? `${current}\n${needs}` : needs }])
      setCopyStatus('Dopisano do wniosków.')
      reload()
    } catch (e) {
      setCopyStatus((e as Error).message)
    }
  }

  const tabLabel = (item: AgendaItem) => {
    switch (item.kind) {
      case 'criteria': return `${first ? 'Elementy oceny' : 'Obowiązki i kryteria'} · ${scoredCount} z ${criteria.length}`
      case 'goals': return 'Cele'
      case 'report': return `Sprawozdanie${self.data?.reportForm?.report ? '' : ' · brak'}`
      case 'development': return `Rozwój i potrzeby${answerOf(detail, devField?.key ?? '')?.valueText ? ' ✓' : ''}`
    }
  }
  const tabIndex = agenda.findIndex((a) => a.kind === tab)
  const current = agenda[tabIndex] ?? agenda[0]
  const nextTab = agenda[tabIndex + 1]

  return (
    <div className="step rh">
      <div className="step-head">
        <h2>{section?.title ?? 'Rozmowa oceniająca'}</h2>
        <Pill icon="lock">robocza ocena niewidoczna dla pracownika</Pill>
      </div>

      <SheetForm key={JSON.stringify(detail.answers)} detail={detail} onSaved={reload} sectionKeys={sections} showStage={false} />

      <div className="rh-agenda">
        <span className="small muted">Do omówienia{first ? '' : ' (§ 10)'}:</span>
        <div className="rh-tabs" role="tablist" aria-label="Agenda rozmowy">
          {agenda.map((item) => (
            <button key={item.kind} type="button" role="tab" aria-selected={item.kind === current.kind}
              className={item.kind === current.kind ? 'rh-tab active' : 'rh-tab'} onClick={() => setTab(item.kind)}>
              {tabLabel(item)}
            </button>
          ))}
        </div>
      </div>

      <div key={`${current.kind}-${index}`} className="rh-panel" role="tabpanel">
        {current.topic && (
          <p className="small muted">{current.topic.text}{current.topic.optional ? ' (jeśli uzasadnione)' : ''}
            {current.topic.legalRef && <span className="rh-ref"> · {current.topic.legalRef}</span>}</p>
        )}

        {current.kind === 'criteria' && criteria.length === 0 && <p className="muted">Brak kryteriów do omówienia.</p>}
        {current.kind === 'criteria' && criteria[index] && (
          <CriterionTalk detail={detail} criterionKey={criteria[index].key} label={criteria[index].label} criteria={criteria} index={index}
            onIndex={setIndex} work={work} notes={notes.data?.notes ?? []} self={self.data} selfError={self.error} firstName={firstName}
            reload={reload} onEditIndicators={() => go('indicators')} />
        )}

        {current.kind === 'goals' && (
          <div className="card rh-card">
            <h3>Cele</h3>
            <p>Jeśli na rozmowie rozpoczynającej wyznaczono cele, omów sposób ich realizacji. Jeśli celów nie wyznaczono, pomiń ten punkt.</p>
          </div>
        )}

        {current.kind === 'report' && (
          <div className="card rh-card">
            <h3>Sprawozdanie pracownika</h3>
            {self.data?.submitted && self.data.reportForm?.report ? (
              <>
                <p className="pre-line">{self.data.reportForm.report}</p>
                <PdfButton detail={detail} report label="Pobierz sprawozdanie (PDF)" />
              </>
            ) : <p className="muted">Pracownik nie przekazał jeszcze sprawozdania.</p>}
          </div>
        )}

        {current.kind === 'development' && (
          <div className="card rh-card">
            <h3>Potrzeby rozwojowe zgłoszone przez pracownika{devField ? ' → do wniosków IPRZ' : ''}</h3>
            {self.error ? <p className="muted">Samoocena niedostępna: {self.error}</p>
              : !self.data ? <p className="muted">Ładowanie…</p>
              : !self.data.submitted ? <p className="muted">Pracownik nie przekazał jeszcze samooceny. Potrzeby zgłoszone na rozmowie wpiszesz we wnioskach przy sporządzaniu oceny.</p>
              : <p>{self.data.developmentNeeds || <span className="muted">Nie zgłoszono.</span>}</p>}
            {canCopyNeeds && (
              <div className="buttons">
                <button type="button" className="secondary" onClick={copyNeeds}>Dopisz do wniosków</button>
                {copyStatus && <span className="muted small" role="status">{copyStatus}</span>}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="step-actions">
        {current.kind === 'criteria' && criteria.length > 0 && <span className="small muted">{first ? 'Element' : 'Kryterium'} {index + 1} z {criteria.length}</span>}
        <span className="grow" />
        {current.kind === 'criteria' && index < criteria.length - 1
          ? <button type="button" onClick={() => setIndex(index + 1)}>Dalej: {criteria[index + 1].label} →</button>
          : nextTab
            ? <button type="button" onClick={() => setTab(nextTab.kind)}>Dalej: {tabLabel(nextTab).split(' · ')[0].replace(' ✓', '')} →</button>
            : <NextButton steps={steps} current="interview" go={go} />}
      </div>
    </div>
  )
}

function CriterionTalk({ detail, criterionKey, label, criteria, index, onIndex, work, notes, self, selfError, firstName, reload, onEditIndicators }: {
  detail: Detail
  criterionKey: string
  label: string
  criteria: { key: string; label: string }[]
  index: number
  onIndex: (i: number) => void
  work: WorkApi
  notes: Note[]
  self: SelfAssessment | null
  selfError: string
  firstName: string
  reload: () => Promise<void>
  onEditIndicators: () => void
}) {
  const scores = scoresFieldOf(detail.schema)
  const competency = detail.schema.competencyModel?.competencies[criterionKey]
  const savedScore = scores ? answerOf(detail, scores.field.key, criterionKey)?.valueNumber ?? null : null
  // Po rozmowie oceniający może zmienić ocenę cząstkową tutaj — do sporządzenia oceny (potem sekcja jest zablokowana).
  const [override, setOverride] = useState<number | null>(null)
  const [error, setError] = useState('')
  const score = override ?? savedScore
  const scale = scores?.scale ?? []
  const option = scale.find((o) => o.value === score)
  const meets = scale.find((o) => o.key === 'meets')
  const editable = !!scores && detail.canEdit && !detail.lockedSections.includes(scores.section.key)
  const api = detail.scoring?.criteria.find((c) => c.key === criterionKey)
  const suggestions = api && api.ratedIndicators === api.totalIndicators ? suggestionValues(scale, api.indicatorMean, api.suggested) : []
  const scoredKeys = new Set(scores ? criteria.filter((c) => answerOf(detail, scores.field.key, c.key)?.valueNumber != null).map((c) => c.key) : [])

  async function changeScore(value: number) {
    if (!scores) return
    setOverride(value)
    try {
      await saveAnswers(detail.id, [{ ...emptyAnswer(scores.field.key, criterionKey), valueNumber: value }])
      setError('')
      reload()
    } catch (e) {
      setError((e as Error).message)
      setOverride(null)
    }
  }

  const agreed = competency?.indicators.map((i) => work.indicator(i.key).expectation).filter((x): x is string => !!x) ?? []
  const examples = notes.filter((n) => n.inPeriod && n.criterionKey === criterionKey).slice(0, 3)
  const own = self?.criteria.find((c) => c.key === criterionKey)
  const differs = score != null && suggestions.length > 0 && !suggestions.includes(score)

  return (
    <>
      <div className="rh-tabs rh-tabs-sub" role="tablist" aria-label="Kryteria do omówienia">
        {criteria.map((c, i) => {
          const done = scoredKeys.has(c.key)
          return (
            <button key={c.key} type="button" role="tab" aria-selected={i === index}
              className={i === index ? 'rh-tab active' : done ? 'rh-tab done' : 'rh-tab'} onClick={() => onIndex(i)}>
              {done && <span aria-hidden="true">✓</span>}{c.label}{done && <span className="sr-only"> (ocena robocza)</span>}
            </button>
          )
        })}
      </div>

      <h2 className="rh-summary-title">{label}</h2>
      <section className="card rh-card">
        <div className="rh-decision-head">
          <span className="muted">Twoja ocena robocza przed rozmową</span>
          {option ? <span className="pill neutral">{option.value} · {lower(option)}</span> : <span className="pill attention">jeszcze bez oceny</span>}
          <span className="grow" />
          <button type="button" className="link" onClick={onEditIndicators}>Zmień w ocenie wskaźników</button>
        </div>

        <div className="rh-expect">
          <b className="small">Oczekiwanie: opis poziomu „{meets ? lower(meets) : 'na poziomie oczekiwań'}” z modelu kompetencji</b>
          {agreed.length > 0 && <p className="small">Ustalone z pracownikiem: {agreed.map((a) => `„${a}”`).join(' · ')}</p>}
          <ul>
            {competency?.indicators.map((i) => <li key={i.key}>{meets ? i.levels[meets.key] : i.text}</li>)}
          </ul>
        </div>

        <div className="rh-examples">
          <b className="small">Przykłady do omówienia (Twoje notatki)</b>
          {examples.length === 0 ? <p className="muted small">Brak notatek przy tym kryterium.</p> : (
            <ul>
              {examples.map((n) => (
                <li key={n.id}><time className="muted small">{fmtDate(n.observedOn)}</time> · {[n.situation, n.action, n.result].filter(Boolean).join(' · ')}</li>
              ))}
            </ul>
          )}
        </div>

        {self?.submitted && (
          <div className="rh-self">
            <b className="small">Komentarz z samooceny ({firstName})</b>
            {own?.comment ? <blockquote>„{own.comment}”</blockquote> : <p className="muted small">Bez komentarza do tego kryterium.</p>}
          </div>
        )}
        {selfError && <p className="muted small">Samoocena niedostępna: {selfError}</p>}
      </section>

      {editable && scores && (
        <section className="rh-decision" aria-labelledby="rh-talk-dec">
          <h3 id="rh-talk-dec">Po rozmowie: potwierdź albo zmień ocenę roboczą</h3>
          <ScoreScale scale={scale} value={score} suggested={suggestions} disabled={false} label={`Ocena za kryterium: ${label}`} onPick={changeScore} />
          {error && <p role="alert" className="error small">{error}</p>}
          {differs && (
            <div className="rh-differs">
              <span className="pill neutral">Twoja ocena: {score} · sugestia: {suggestions.join(' lub ')}</span>
              <ReasonField key={`${criterionKey}-${work.context ? 'loaded' : 'loading'}`} initial={work.reason(criterionKey)}
                disabled={!!work.error} onSave={(v) => work.saveReason(criterionKey, v)} />
            </div>
          )}
        </section>
      )}
    </>
  )
}
