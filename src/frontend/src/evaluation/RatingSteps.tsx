import { useEffect, useRef, useState } from 'react'
import { DateInput } from '../DateInput'
import { Avatar } from '../Avatar'
import { SheetForm } from '../Evaluations'
import { Info, Radar, Segments, Source, useStepHeader } from '../v2'
import { NextButton, PdfButton, type StepProps } from './common'
import { saveAnswers, useApi, useWorkContext } from './data'
import { byDate, NotesAside, PeriodAxis, ScaleTiles, shortCriterion } from './rating-parts'
import { shuffled, suggestionValues } from './rating-logic'
import {
  answerOf, criteriaOf, emptyAnswer, fmtDate, indicatorFieldOf, isFirstTemplate, plural, scoresFieldOf,
  type Detail, type Indicator, type Notes, type ScaleOption, type SelfAssessment, type Topic,
} from './types'
import './rating-hifi.css'

/**
 * Oznaczenia opisów zachowań: litery w przetasowanej kolejności, bo cyfry (1, 3, 5…) wyglądałyby jak punkty skali.
 * Każdy wskaźnik trzeba ocenić jednym z opisów: backend nie przyjmuje „brak okazji do obserwacji”, więc tego kafla nie ma.
 */
const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E']
/** Po wyborze zachowania przejście do następnego wskaźnika (W07). */
const ADVANCE_MS = 350

type Choice = { valueNumber: number | null; valueText: string | null }
type Note = Notes['notes'][number]
type WorkApi = ReturnType<typeof useWorkContext>

const lower = (o: ScaleOption) => o.label.charAt(0).toLowerCase() + o.label.slice(1)
const firstNameOf = (name: string) => name.split(' ')[0]

/** Okres osi notatek: od podpisu części I (początek okresu z API) do terminu etapu oceny. */
function periodOf(detail: Detail, notes: Notes | null, stageKey: string | null | undefined) {
  const start = notes?.evidence.periodStart ?? detail.stages[0]?.completedOn ?? null
  const end = detail.stages.find((s) => s.key === stageKey)?.dueTo ?? null
  return { start, end }
}

/** H07 (ocena wskaźnika: opisy zachowań jako odpowiedzi) i H08 (ocena robocza kryterium: sugestia i decyzja). */
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
  const [needScore, setNeedScore] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])

  const criterion = criteria[pos.c]
  const indicators = criterion ? competencies[criterion.key].indicators : []
  const indicator = typeof pos.i === 'number' ? indicators[pos.i] : undefined

  // Nagłówek kreatora: „Katarzyna Nowak · Rzetelność” i segmenty kryteriów „2/6”.
  useStepHeader(criterion?.label ?? null, criterion ? { current: pos.c + 1, total: criteria.length, label: `Kryterium ${pos.c + 1} z ${criteria.length}` } : null)

  const move = (next: { c: number; i: number | 'summary' }) => {
    window.clearTimeout(timer.current)
    setNeedScore(false)
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

  const top = () => window.scrollTo({ top: 0 })
  const next = () => {
    if (typeof pos.i === 'number' && pos.i < indicators.length - 1) move({ c: pos.c, i: pos.i + 1 })
    else if (typeof pos.i === 'number') move({ c: pos.c, i: 'summary' })
    else if (!scored(criterion.key) && editable) { setNeedScore(true); return }
    else if (pos.c < criteria.length - 1) move({ c: pos.c + 1, i: 0 })
    top()
  }
  const prev = () => {
    if (pos.i === 'summary') move({ c: pos.c, i: indicators.length - 1 })
    else if (pos.i > 0) move({ c: pos.c, i: pos.i - 1 })
    else if (pos.c > 0) move({ c: pos.c - 1, i: 'summary' })
  }
  const criterionNotes = notes.data?.notes.filter((n) => n.criterionKey === criterion.key || indicators.some((i) => i.key === n.indicatorKey)) ?? []
  const period = periodOf(detail, notes.data, scores.section.stage)
  const last = pos.i === 'summary' && pos.c === criteria.length - 1

  return (
    <div className="step rh">
      <div className="rh-with-aside">
        <div className="rh-main">
          {!editable && (
            <p className="rh-readonly">Tylko do odczytu{detail.lockedSections.includes(scores.section.key) ? ' · etap oceny zamknięty' : ''}</p>
          )}
          {error && <p role="alert" className="error">{error}</p>}

          {indicator ? (
            <IndicatorQuestion key={indicator.key} indicator={indicator} index={pos.i as number} total={indicators.length}
              answered={(i) => answered(indicators[i].key)} scale={scale}
              choice={choices[indicator.key]} editable={editable} onChoose={(c) => choose(indicator.key, c)}
              expectation={work.indicator(indicator.key).expectation} />
          ) : (
            <CriterionSummary key={criterion.key} detail={detail} criterionKey={criterion.key} label={criterion.label} indicators={indicators}
              choices={choices} scale={scale} scoresKey={scores.field.key} editable={editable} work={work} reload={reload}
              noteCount={(key) => criterionNotes.filter((n) => n.inPeriod && n.indicatorKey === key).length}
              needScore={needScore} onScored={() => setNeedScore(false)} onChange={(i) => move({ c: pos.c, i })} />
          )}

          <div className="rh-actions">
            {indicator
              ? <button type="button" className="secondary" onClick={prev} disabled={pos.c === 0 && pos.i === 0}>← Wstecz</button>
              : <button type="button" className="secondary" onClick={prev}>← Wskaźniki</button>}
            <span className="grow" />
            {last && (scored(criterion.key) || !editable)
              ? <NextButton steps={steps} current="indicators" go={go} label="Dalej: rozmowa oceniająca" />
              : (
                <button type="button" onClick={next}>
                  {indicator
                    ? (pos.i as number) < indicators.length - 1 ? 'Dalej →' : 'Dalej: podsumowanie →'
                    : last ? 'Dalej: rozmowa oceniająca →' : `Dalej: ${shortCriterion(criteria[pos.c + 1].key, criteria[pos.c + 1].label)} →`}
                </button>
              )}
          </div>
        </div>

        <NotesAside notes={criterionNotes} start={period.start} end={period.end}
          error={notes.error ? `Notatki niedostępne: ${notes.error}` : undefined} empty="Brak notatek przy tym kryterium." />
      </div>
    </div>
  )
}

function IndicatorQuestion({ indicator, index, total, answered, scale, choice, editable, onChoose, expectation }: {
  indicator: Indicator
  index: number
  total: number
  answered: (i: number) => boolean
  scale: ScaleOption[]
  choice: Choice | undefined
  editable: boolean
  onChoose: (c: Choice) => void
  expectation: string | null
}) {
  const headingId = `rh-q-${indicator.key}`
  const done = Array.from({ length: total }, (_, i) => i).filter((i) => i !== index && answered(i)).length
  return (
    <div className="rh-question">
      <div className="rh-q-meta">
        <Segments current={index + 1} total={total} done={done} size="sm" label={`Wskaźnik ${index + 1} z ${total}`} />
        <span className="grow" />
        <span className="rh-how">
          <Info label="Jak oceniać?" align="end">Wybierz zachowanie typowe dla całego okresu oceny. Liczy się powtarzalność, nie jednorazowy wyjątek.</Info>
          <span aria-hidden="true">Jak oceniać?</span>
        </span>
      </div>
      <h2 id={headingId} className="rh-q-text">{indicator.text}</h2>
      {expectation && (
        <p className="rh-chip"><strong>Oczekiwanie</strong><span>{expectation}</span></p>
      )}
      <div className="rh-options" role="radiogroup" aria-labelledby={headingId}>
        {shuffled(scale, indicator.key).map((o, i) => {
          const checked = choice?.valueNumber === o.value
          return (
            <button key={o.key} type="button" role="radio" aria-checked={checked} disabled={!editable}
              aria-keyshortcuts={OPTION_LETTERS[i]}
              className={checked ? 'rh-option selected' : 'rh-option'} style={{ animationDelay: `${i * 30}ms` }}
              onClick={() => onChoose({ valueNumber: o.value, valueText: null })}>
              <kbd className="rh-key" aria-hidden="true">{OPTION_LETTERS[i]}</kbd>
              <span className="grow">{indicator.levels[o.key] ?? o.label}</span>
              {checked && <span className="rh-check" aria-hidden="true">✓</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function CriterionSummary({ detail, criterionKey, label, indicators, choices, scale, scoresKey, editable, work, reload, noteCount, needScore, onScored, onChange }: {
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
  needScore: boolean
  onScored: () => void
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
  const option = (v: number | null) => scale.find((o) => o.value === v)
  const meets = scale.find((o) => o.key === 'meets')
  const expectations = indicators.map((i) => work.indicator(i.key).expectation).filter((x): x is string => !!x)

  async function pick(value: number) {
    if (!editable) return
    const before = score
    setScore(value)
    onScored()
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
  const tieChosen = score != null && suggestions.length === 2 && suggestions.includes(score)

  return (
    <div className="rh-summary">
      <div className="rh-sec-head">
        <h3>Zachowania</h3>
        <span className="grow" />
        {expectations.length > 0 && (
          <p className="rh-chip rh-chip-clamp" title={expectations.join(' · ')}><strong>Oczekiwanie</strong><span>{expectations.join(' · ')}</span></p>
        )}
      </div>

      <ul className="rh-rows card">
        {indicators.map((i, index) => {
          const o = option(choices[i.key]?.valueNumber ?? null)
          const n = noteCount(i.key)
          return (
            <li key={i.key} className="rh-row">
              <span className={o ? 'rh-level' : 'rh-level empty'} aria-hidden="true">{o?.value ?? '–'}</span>
              <span className="rh-row-text">
                <span className="rh-row-ind">{i.text}</span>
                <span className="rh-row-beh">{o ? i.levels[o.key] ?? o.label : <em>nie wybrano</em>}</span>
                <span className="sr-only">{o ? `Poziom ${o.value}, ${lower(o)}.` : ''}</span>
              </span>
              <span className="rh-row-notes">{n} {plural(n, 'notatka', 'notatki', 'notatek')}</span>
              {editable && (
                <button type="button" className="link" onClick={() => onChange(index)} aria-label={`${o ? 'Zmień' : 'Wybierz'}: ${i.text}`}>{o ? 'Zmień' : 'Wybierz'}</button>
              )}
            </li>
          )
        })}
      </ul>

      <section className="rh-work card" aria-labelledby="rh-work-title">
        <div className="rh-sec-head">
          <h3 id="rh-work-title">Ocena robocza</h3>
          <Info label="Jak liczona jest sugestia?" align="start">Sugestia: średnia poziomów wskaźników zaokrąglona do skali. Zasada Busoli, nie przepis.</Info>
          <span className="grow" />
          {meets && <Source refText="Poradnik KPRM, s. 26: ocenę zaczyna się od poziomu „na poziomie oczekiwań”" align="end">start od {meets.value}</Source>}
        </div>
        <ScaleTiles scale={scale} value={score} suggested={suggestions} mean={complete ? mean : null} disabled={!editable}
          label={`Ocena robocza za kryterium: ${label}`} onPick={pick} />
        {!complete && <p className="rh-muted">Sugestia po ocenie wszystkich wskaźników · {picked.length}/{indicators.length}</p>}
        {(error || needScore) && <p role="alert" className="error">{error || 'Wybierz ocenę kryterium'}</p>}
      </section>

      {/* Stałe miejsce na pole powodu: wiersz akcji nie skacze po wyborze oceny. */}
      <div className="rh-reason-slot">
      {(differs || tieChosen) && (
        <div className="rh-reason">
          {differs && <span className="rh-diff">Twoja ocena {score} · sugestia {suggestions.join(' lub ')}</span>}
          <ReasonField key={`${criterionKey}-${work.context ? 'loaded' : 'loading'}`} initial={work.reason(criterionKey)}
            title={differs ? 'Dlaczego inaczej?' : `Dlaczego ${score}?`}
            hint={differs ? 'Opcjonalnie. Przyda się w rozmowie i w uzasadnieniu.' : 'Opcjonalnie. Remis: rozstrzygasz Ty, na podstawie notatek.'}
            disabled={!editable || !!work.error} onSave={(v) => work.saveReason(criterionKey, v)} />
        </div>
      )}
      </div>
    </div>
  )
}

function ReasonField({ initial, title, hint, disabled, onSave }: {
  initial: string; title: string; hint: string; disabled: boolean; onSave: (v: string) => Promise<void>
}) {
  const [value, setValue] = useState(initial)
  const [status, setStatus] = useState('')
  async function save() {
    if (value === initial) return
    setStatus('Zapisywanie…')
    try {
      await onSave(value.trim())
      setStatus('Zapisano')
    } catch (e) {
      setStatus((e as Error).message)
    }
  }
  return (
    <div className="rh-reason-row">
      <span className="rh-reason-label">
        <label htmlFor="rh-reason">{title}</label>
        <Info label={`${title} — wyjaśnienie`} align="start">{hint}</Info>
      </span>
      <textarea id="rh-reason" rows={1} value={value} disabled={disabled} onChange={(e) => setValue(e.target.value)} onBlur={save} />
      {status && <span className="rh-muted" role="status">{status}</span>}
    </div>
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

type OrgFocus = { focus: { id: number; name: string; hasAvatar: boolean } }

/** H09: rozmowa oceniająca — agenda § 10 jako 3 kroki, karta kryterium (oczekiwanie, notatki, oś), radar ocen roboczych. */
export function InterviewStep({ detail, steps, go, reload, sections }: StepProps & { sections: string[] }) {
  const first = isFirstTemplate(detail.templateCode)
  const criteria = criteriaOf(detail)
  const scores = scoresFieldOf(detail.schema)
  const [tab, setTab] = useState<AgendaKind>('criteria')
  const [index, setIndex] = useState(0)
  const work = useWorkContext(detail.id)
  const notes = useApi<Notes>(`evaluations/${detail.id}/notes`)
  const self = useApi<SelfAssessment>(`evaluations/${detail.id}/self-assessment`)
  const org = useApi<OrgFocus>('org')
  const firstName = firstNameOf(detail.employeeName)
  const section = detail.schema.sections.find((s) => sections.includes(s.key))
  const agenda = agendaOf(detail.schema.stages?.find((s) => s.key === section?.stage)?.topics, first)
  const scoreOf = (key: string) => (scores ? answerOf(detail, scores.field.key, key)?.valueNumber ?? null : null)

  useStepHeader(null, null)

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

  // Data rozmowy: pole daty z sekcji rozmowy (oficjalne pole arkusza, § 10). Pozostałe pola sekcji — formularz niżej.
  const dateField = section?.fields.find((f) => f.type === 'date')
  const sectionLocked = !!section && detail.lockedSections.includes(section.key)
  const [dateStatus, setDateStatus] = useState('')
  async function saveDate(iso: string) {
    if (!dateField || !/^\d{4}-\d{2}-\d{2}$/.test(iso) && iso !== '') return
    try {
      await saveAnswers(detail.id, [{ ...emptyAnswer(dateField.key, null), valueDate: iso || null }])
      setDateStatus('')
      reload()
    } catch (e) {
      setDateStatus((e as Error).message)
    }
  }

  const title = (item: AgendaItem) => {
    switch (item.kind) {
      case 'criteria': return first ? 'Elementy oceny' : 'Obowiązki i kryteria'
      case 'goals': return 'Cele'
      case 'report': return 'Sprawozdanie'
      case 'development': return 'Rozwój i potrzeby'
    }
  }
  const tabIndex = agenda.findIndex((a) => a.kind === tab)
  const current = agenda[tabIndex] ?? agenda[0]
  const nextTab = agenda[tabIndex + 1]
  const prevTab = agenda[tabIndex - 1]
  const me = org.data?.focus.name === detail.evaluatorName ? org.data.focus : null

  const goNext = () => {
    if (current.kind === 'criteria' && index < criteria.length - 1) setIndex(index + 1)
    else if (nextTab) setTab(nextTab.kind)
  }
  const goPrev = () => {
    if (current.kind === 'criteria' && index > 0) setIndex(index - 1)
    else if (prevTab) { setTab(prevTab.kind); if (prevTab.kind === 'criteria') setIndex(Math.max(0, criteria.length - 1)) }
    else go('indicators')
  }
  const nextLabel = current.kind === 'criteria' && index < criteria.length - 1
    ? shortCriterion(criteria[index + 1].key, criteria[index + 1].label)
    : nextTab ? title(nextTab) : null
  const devDone = !!answerOf(detail, devField?.key ?? '')?.valueText

  return (
    <div className="step rh rh-talk">
      <div className="rh-talk-head">
        <h2>{section?.title ?? 'Rozmowa oceniająca'}</h2>
        <span className="rh-pair" role="img" aria-label={`${detail.employeeName} i ${detail.evaluatorName ?? 'oceniający'}`}>
          <Avatar path={`org/${detail.employeeId}/avatar`} name={detail.employeeName} size={40} decorative />
          <Avatar path={me?.hasAvatar ? `org/${me.id}/avatar` : null} name={detail.evaluatorName ?? '?'} size={40} decorative />
        </span>
        <span className="grow" />
        {dateField && (
          <label className="rh-date">
            <span>Data rozmowy</span>
            <DateInput value={answerOf(detail, dateField.key)?.valueDate ?? ''} onChange={saveDate}
              disabled={!detail.canEdit || sectionLocked} required={dateField.required} />
          </label>
        )}
      </div>
      {dateStatus && <p role="alert" className="error">{dateStatus}</p>}

      <ol className="rh-agenda card" aria-label="Agenda rozmowy">
        {agenda.map((item, i) => {
          const active = item.kind === current.kind
          const done = item.kind === 'development' ? devDone : false
          return (
            <li key={item.kind} className={active ? 'rh-ag active' : 'rh-ag'}>
              {i > 0 && <span className="rh-ag-arrow" aria-hidden="true">→</span>}
              <button type="button" className="rh-ag-btn" aria-current={active ? 'step' : undefined} onClick={() => setTab(item.kind)}>
                <span className={done ? 'rh-ag-num done' : 'rh-ag-num'} aria-hidden="true">{done ? '✓' : i + 1}</span>
                <span className="rh-ag-text">
                  <strong>{title(item)}</strong>
                  {item.kind === 'criteria' && criteria.length > 0 && (
                    <Segments current={index + 1} total={criteria.length} size="sm" label={`${first ? 'Element' : 'Kryterium'} ${index + 1} z ${criteria.length}`} />
                  )}
                  {item.topic?.optional && <span className="rh-muted">opcjonalnie</span>}
                </span>
              </button>
              {i === 0 && (item.topic?.legalRef || !first) && (
                <Source refText={first ? (item.topic?.legalRef ?? 'rozporządzenie') : '§ 10 rozporządzenia'} />
              )}
            </li>
          )
        })}
      </ol>

      <div key={`${current.kind}-${index}`} className="rh-panel">
        {current.kind === 'criteria' && criteria.length === 0 && <p className="muted">Brak kryteriów do omówienia.</p>}
        {current.kind === 'criteria' && criteria[index] && (
          <div className="rh-talk-grid">
            <CriterionTalk detail={detail} criterionKey={criteria[index].key} label={criteria[index].label}
              work={work} notes={notes.data?.notes ?? []} notesData={notes.data} self={self.data} selfError={self.error} firstName={firstName}
              reload={reload} />
            {criteria.length >= 3 && (
              <section className="card rh-radar-card" aria-labelledby="rh-radar-title">
                <h3 id="rh-radar-title">Oceny robocze</h3>
                <Radar axes={criteria.map((c) => shortCriterion(c.key, c.label))} size={170}
                  series={[{ name: 'ocena robocza', values: criteria.map((c) => scoreOf(c.key)), kind: 'a' }]}
                  title={`Oceny robocze: ${criteria.map((c) => `${shortCriterion(c.key, c.label)} ${scoreOf(c.key) ?? 'bez oceny'}`).join(', ')}`} />
              </section>
            )}
          </div>
        )}

        {current.kind === 'goals' && (
          <div className="card rh-card">
            <h3>Cele</h3>
            <p>Omów realizację celów wyznaczonych na rozmowie rozpoczynającej. Bez celów pomiń ten punkt.</p>
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
            ) : <p className="rh-muted">Brak sprawozdania</p>}
          </div>
        )}

        {current.kind === 'development' && (
          <div className="card rh-card">
            <h3>Potrzeby zgłoszone przez {firstName}{devField ? ' → wnioski IPRZ' : ''}</h3>
            {self.error ? <p className="rh-muted">Samoocena niedostępna: {self.error}</p>
              : !self.data ? <p className="rh-muted">Ładowanie…</p>
              : !self.data.submitted ? <p className="rh-muted">Samoocena nieprzekazana. Potrzeby z rozmowy wpiszesz we wnioskach.</p>
              : <p>{self.data.developmentNeeds || <span className="rh-muted">Nie zgłoszono.</span>}</p>}
            {canCopyNeeds && (
              <div className="buttons">
                <button type="button" className="secondary" onClick={copyNeeds}>Dopisz do wniosków</button>
                {copyStatus && <span className="rh-muted" role="status">{copyStatus}</span>}
              </div>
            )}
          </div>
        )}
      </div>

      {section && section.fields.some((f) => f !== dateField) && (
        <SheetForm key={JSON.stringify(detail.answers)} detail={detail} onSaved={reload} sectionKeys={sections} showStage={false}
          fieldFilter={(f) => f !== dateField} />
      )}

      <div className="rh-actions">
        <button type="button" className="secondary" onClick={goPrev}>← Wstecz</button>
        <span className="grow" />
        {nextLabel
          ? <button type="button" onClick={goNext}>Dalej: {nextLabel} →</button>
          : <NextButton steps={steps} current="interview" go={go} />}
      </div>
    </div>
  )
}

function CriterionTalk({ detail, criterionKey, label, work, notes, notesData, self, selfError, firstName, reload }: {
  detail: Detail
  criterionKey: string
  label: string
  work: WorkApi
  notes: Note[]
  notesData: Notes | null
  self: SelfAssessment | null
  selfError: string
  firstName: string
  reload: () => Promise<void>
}) {
  const scores = scoresFieldOf(detail.schema)
  const competency = detail.schema.competencyModel?.competencies[criterionKey]
  const savedScore = scores ? answerOf(detail, scores.field.key, criterionKey)?.valueNumber ?? null : null
  // Po rozmowie oceniający może zmienić ocenę cząstkową tutaj — do sporządzenia oceny (potem sekcja jest zablokowana).
  const [override, setOverride] = useState<number | null>(null)
  const [changing, setChanging] = useState(false)
  const [error, setError] = useState('')
  const [active, setActive] = useState<number | null>(null)
  const score = override ?? savedScore
  const scale = scores?.scale ?? []
  const option = scale.find((o) => o.value === score)
  const meets = scale.find((o) => o.key === 'meets')
  const editable = !!scores && detail.canEdit && !detail.lockedSections.includes(scores.section.key)
  const api = detail.scoring?.criteria.find((c) => c.key === criterionKey)
  const complete = !!api && api.ratedIndicators === api.totalIndicators
  const suggestions = complete ? suggestionValues(scale, api!.indicatorMean, api!.suggested) : []

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
  const examples = byDate(notes).filter((n) => n.inPeriod && (n.criterionKey === criterionKey || competency?.indicators.some((i) => i.key === n.indicatorKey)))
  const own = self?.criteria.find((c) => c.key === criterionKey)
  const differs = score != null && suggestions.length > 0 && !suggestions.includes(score)
  const start = notesData?.evidence.periodStart ?? detail.stages[0]?.completedOn ?? null
  const today = new Date().toISOString().slice(0, 10)

  return (
    <section className="card rh-crit" aria-labelledby="rh-crit-title">
      <div className="rh-crit-head">
        <h3 id="rh-crit-title">{label}</h3>
        <span className="grow" />
        <span className="rh-work-score">
          <span className={option ? 'rh-circle' : 'rh-circle empty'} aria-hidden="true">{option?.value ?? '–'}</span>
          <span className="rh-work-score-text">
            <strong>{option ? lower(option) : 'bez oceny'}</strong>
            <span className="sr-only">Ocena robocza{option ? `: ${option.value}` : ''}.</span>
            {editable && (
              <button type="button" className="link" aria-expanded={changing} aria-label={`Zmień ocenę roboczą: ${label}`}
                onClick={() => setChanging((c) => !c)}>{changing ? 'Gotowe' : 'Zmień'}</button>
            )}
          </span>
        </span>
      </div>

      {changing && editable && (
        <div className="rh-change">
          <ScaleTiles scale={scale} value={score} suggested={suggestions} mean={complete ? api!.indicatorMean : null} disabled={false}
            label={`Ocena robocza za kryterium: ${label}`} onPick={changeScore} />
          {error && <p role="alert" className="error">{error}</p>}
          {differs && (
            <div className="rh-reason">
              <span className="rh-diff">Twoja ocena {score} · sugestia {suggestions.join(' lub ')}</span>
              <ReasonField key={`${criterionKey}-${work.context ? 'loaded' : 'loading'}`} initial={work.reason(criterionKey)}
                title="Dlaczego inaczej?" hint="Opcjonalnie. Przyda się w uzasadnieniu."
                disabled={!!work.error} onSave={(v) => work.saveReason(criterionKey, v)} />
            </div>
          )}
        </div>
      )}

      <div className="rh-crit-body">
        <div className="rh-expect">
          <strong>Oczekiwanie</strong>
          {agreed.length > 0
            ? agreed.map((a) => <p key={a}>{a}</p>)
            : <ul>{competency?.indicators.map((i) => <li key={i.key}>{meets ? i.levels[meets.key] : i.text}</li>)}</ul>}
        </div>
        <div className="rh-examples">
          <strong className="rh-examples-title">Notatki</strong>
          {examples.length === 0 ? <p className="rh-muted">Brak notatek</p> : (
            <ul>
              {examples.map((n) => (
                <li key={n.id} className={active === n.id ? 'active' : undefined}
                  onMouseEnter={() => setActive(n.id)} onMouseLeave={() => setActive(null)}>
                  <time>{fmtDate(n.observedOn)}</time>
                  <span>{[n.situation, n.action, n.result].filter(Boolean).join(' ')}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {start && examples.length > 0 && (
        <PeriodAxis start={start} end={today} notes={examples} active={active} onActive={setActive} endLabel="dziś" />
      )}

      {self?.submitted && own?.comment && (
        <blockquote className="rh-self"><strong>{firstName}:</strong> „{own.comment}”</blockquote>
      )}
      {selfError && <p className="rh-muted">Samoocena niedostępna: {selfError}</p>}
    </section>
  )
}
