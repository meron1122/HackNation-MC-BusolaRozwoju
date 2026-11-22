import { useEffect, useRef, useState } from 'react'
import { DateInput } from '../DateInput'
import { SheetForm } from '../Evaluations'
import { Info, Radar, Segments, Source, useStepHeader } from '../v2'
import { AutosaveStatus, Refreshing } from '../v2/motion'
import { PdfButton, type StepProps } from './common'
import { saveAnswers, useApi, useWorkContext } from './data'
import { byDate, PeriodAxis, ScaleTiles, shortCriterion } from './rating-parts'
import { shuffled, suggestionValues } from './rating-logic'
import { interviewDefaults } from './interview-defaults'
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
  // Ocena kryterium wybrana w tym kroku (zanim `detail` wróci z backendu po zapisie) i zapis w toku.
  // Bez tego „Dalej” sprawdzało stare `detail.answers` i przy pierwszym kliknięciu pokazywało „Wybierz ocenę kryterium”.
  const [picked, setPicked] = useState<Record<string, number | null>>({})
  const saving = useRef<Promise<unknown> | null>(null)
  const scored = (key: string) => (key in picked ? picked[key] != null : answerOf(detail, scores.field.key, key)?.valueNumber != null)
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
  useStepHeader(criterion ? shortCriterion(criterion.key, criterion.label) : null, criterion ? { current: pos.c + 1, total: criteria.length, label: `Kryterium ${pos.c + 1} z ${criteria.length}` } : null)

  // Kierunek wjazdu pytania / podsumowania (dalej = z prawej, wstecz = z lewej) i czekanie na zapis przy zmianie kryterium.
  const [dir, setDir] = useState<'next' | 'back'>('next')
  const [waiting, setWaiting] = useState(false)
  const order = (p: { c: number; i: number | 'summary' }) => p.c * 1000 + (p.i === 'summary' ? 999 : p.i)
  const move = (next: { c: number; i: number | 'summary' }) => {
    window.clearTimeout(timer.current)
    setNeedScore(false)
    setDir(order(next) < order(pos) ? 'back' : 'next')
    setPos(next)
  }

  async function choose(key: string, choice: Choice) {
    if (!editable || typeof pos.i !== 'number') return
    setChoices((c) => ({ ...c, [key]: choice }))
    // Automatyczne przejście dalej — tylko gdy użytkownik nadal jest na tym samym wskaźniku.
    const from = { c: pos.c, i: pos.i }
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      setDir('next')
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
  const next = async () => {
    if (typeof pos.i === 'number' && pos.i < indicators.length - 1) move({ c: pos.c, i: pos.i + 1 })
    else if (typeof pos.i === 'number') move({ c: pos.c, i: 'summary' })
    else if (!scored(criterion.key) && editable) { setNeedScore(true); return }
    else if (saving.current) {
      // Najpierw zapis oceny kryterium; przy błędzie zostajemy na podsumowaniu (komunikat pokazuje CriterionSummary).
      setWaiting(true)
      const ok = await saving.current.then(() => true, () => false).finally(() => setWaiting(false))
      if (!ok) return
      if (pos.c < criteria.length - 1) move({ c: pos.c + 1, i: 0 })
    }
    else if (pos.c < criteria.length - 1) move({ c: pos.c + 1, i: 0 })
    top()
  }
  // Ostatnie kryterium: przejście do rozmowy dopiero po zapisie oceny (rozmowa pokazuje oceny robocze z backendu).
  const finish = async () => {
    if (saving.current) {
      setWaiting(true)
      const ok = await saving.current.then(() => true, () => false).finally(() => setWaiting(false))
      if (!ok) return
    }
    const after = steps[steps.findIndex((s) => s.id === 'indicators') + 1]
    if (after) go(after.id)
  }
  const prev = () => {
    if (pos.i === 'summary') move({ c: pos.c, i: indicators.length - 1 })
    else if (pos.i > 0) move({ c: pos.c, i: pos.i - 1 })
    else if (pos.c > 0) move({ c: pos.c - 1, i: 'summary' })
  }
  const criterionNotes = notes.data?.notes.filter((n) => n.criterionKey === criterion.key || indicators.some((i) => i.key === n.indicatorKey)) ?? []
  const last = pos.i === 'summary' && pos.c === criteria.length - 1

  return (
    <div className="step rh">
      <div className="rh-with-aside">
        <div className="rh-main" data-dir={dir}>
          {!editable && (
            <p className="rh-readonly">Tylko do odczytu{detail.lockedSections.includes(scores.section.key) ? ' · etap oceny zamknięty' : ''}</p>
          )}
          {error && <p role="alert" className="error">{error}</p>}

          <Refreshing busy={waiting}>
          {indicator ? (
            <IndicatorQuestion key={indicator.key} indicator={indicator} index={pos.i as number} total={indicators.length}
              answered={(i) => answered(indicators[i].key)} scale={scale}
              choice={choices[indicator.key]} editable={editable} onChoose={(c) => choose(indicator.key, c)}
              expectation={work.indicator(indicator.key).expectation} />
          ) : (
            <CriterionSummary key={criterion.key} detail={detail} criterionKey={criterion.key} label={criterion.label} indicators={indicators}
              choices={choices} scale={scale} scoresKey={scores.field.key} editable={editable} work={work} reload={reload}
              noteCount={(key) => criterionNotes.filter((n) => n.inPeriod && n.indicatorKey === key).length}
              score={criterion.key in picked ? picked[criterion.key] : undefined}
              needScore={needScore}
              onScored={(value, save) => {
                setNeedScore(false)
                setPicked((p) => ({ ...p, [criterion.key]: value }))
                const run = save.finally(() => { if (saving.current === run) saving.current = null })
                saving.current = run
                run.catch(() => undefined)
              }}
              onRevert={(value) => setPicked((p) => ({ ...p, [criterion.key]: value }))}
              onChange={(i) => move({ c: pos.c, i })} />
          )}
          </Refreshing>

          <div className="rh-actions">
            {indicator
              ? <button type="button" className="secondary" onClick={prev} disabled={pos.c === 0 && pos.i === 0}>← Wstecz</button>
              : <button type="button" className="secondary" onClick={prev}>← Wskaźniki</button>}
            <span className="grow" />
            {last && (scored(criterion.key) || !editable)
              ? <button type="button" onClick={finish}>Dalej: rozmowa oceniająca →</button>
              : (
                <button type="button" onClick={next}>
                  {indicator
                    ? (pos.i as number) < indicators.length - 1 ? 'Dalej →' : 'Dalej: podsumowanie →'
                    : last ? 'Dalej: rozmowa oceniająca →' : `Dalej: ${shortCriterion(criteria[pos.c + 1].key, criteria[pos.c + 1].label)} →`}
                </button>
              )}
          </div>
        </div>
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
      <div className={choice?.valueNumber != null ? 'rh-options has-choice' : 'rh-options'} role="radiogroup" aria-labelledby={headingId}>
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

function CriterionSummary({ detail, criterionKey, label, indicators, choices, scale, scoresKey, editable, work, reload, noteCount, score: localScore, needScore, onScored, onRevert, onChange }: {
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
  /** Ocena wybrana wcześniej w tym kroku (undefined = brak lokalnego wyboru, bierzemy z `detail`). */
  score: number | null | undefined
  needScore: boolean
  /** Wybór oceny: wartość od razu, `save` — zapis w toku (na niego czeka „Dalej”). */
  onScored: (value: number, save: Promise<unknown>) => void
  onRevert: (value: number | null) => void
  onChange: (indicatorIndex: number) => void
}) {
  const fromApi = detail.scoring?.criteria.find((c) => c.key === criterionKey)
  const picked = indicators.map((i) => choices[i.key]?.valueNumber).filter((n): n is number => n != null)
  const localMean = picked.length ? Math.round((picked.reduce((a, b) => a + b, 0) / picked.length) * 100) / 100 : null
  // Średnia z bieżących wyborów (te same dane co backend; lokalnie, bo backend odświeża się po zapisie).
  const mean = localMean ?? fromApi?.indicatorMean ?? null
  const complete = picked.length === indicators.length
  const suggestions = complete ? suggestionValues(scale, mean, fromApi?.suggested ?? null) : []
  const [score, setScore] = useState<number | null>(localScore !== undefined ? localScore : answerOf(detail, scoresKey, criterionKey)?.valueNumber ?? null)
  const [error, setError] = useState('')
  const option = (v: number | null) => scale.find((o) => o.value === v)
  const meets = scale.find((o) => o.key === 'meets')
  const expectations = indicators.map((i) => work.indicator(i.key).expectation).filter((x): x is string => !!x)

  async function pick(value: number) {
    if (!editable) return
    const before = score
    setScore(value)
    const save = saveAnswers(detail.id, [{ ...emptyAnswer(scoresKey, criterionKey), valueNumber: value }])
    onScored(value, save)
    try {
      await save
      setError('')
      reload()
    } catch (e) {
      setScore(before)
      onRevert(before)
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
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [savedAt, setSavedAt] = useState<Date | undefined>(undefined)
  async function save() {
    if (value === initial) return
    setStatus('')
    setState('saving')
    try {
      await onSave(value.trim())
      setState('saved')
      setSavedAt(new Date())
    } catch (e) {
      setState('error')
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
      {state !== 'idle' && <AutosaveStatus state={state} savedAt={savedAt} />}
      {status && <span className="rh-muted" role="alert">{status}</span>}
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
  const firstName = firstNameOf(detail.employeeName)
  const section = detail.schema.sections.find((s) => sections.includes(s.key))
  const agenda = agendaOf(detail.schema.stages?.find((s) => s.key === section?.stage)?.topics, first)
  const scoreOf = (key: string) => (scores ? answerOf(detail, scores.field.key, key)?.valueNumber ?? null : null)

  useStepHeader(section?.title ?? 'Rozmowa oceniająca')

  const devField = detail.schema.sections.filter((s) => s.stage === section?.stage).flatMap((s) => s.fields)
    .find((f) => f.type === 'longText' && f.key.toLowerCase().includes('development'))

  // Data rozmowy: pole daty z sekcji rozmowy (oficjalne pole arkusza, § 10). Pozostałe pola sekcji — formularz niżej.
  const dateField = section?.fields.find((f) => f.type === 'date')
  const sectionLocked = !!section && detail.lockedSections.includes(section.key)
  const [dateStatus, setDateStatus] = useState('')
  // Wartości domyślne (data rozmowy = dziś, okres od podpisu cz. I do dziś): widoczne w polach, zapisywane przy „Dalej”.
  const canFill = detail.canEdit && !sectionLocked
  const defaults = canFill ? interviewDefaults(detail, section) : []
  const defaultDate = dateField ? defaults.find((a) => a.fieldKey === dateField.key)?.valueDate ?? '' : ''
  const formDetail = defaults.length ? { ...detail, prefill: [...(detail.prefill ?? []), ...defaults.filter((a) => a.fieldKey !== dateField?.key)] } : detail
  async function leave() {
    if (defaults.length) {
      try {
        await saveAnswers(detail.id, defaults)
        await reload()
      } catch (e) {
        setDateStatus((e as Error).message)
        return
      }
    }
    const after = steps[steps.findIndex((s) => s.id === 'interview') + 1]
    if (after) go(after.id)
  }
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
      {dateField && (
        <div className="rh-talk-head">
          <span className="grow" />
          <label className="rh-date">
            <span>Data rozmowy</span>
            <DateInput value={answerOf(detail, dateField.key)?.valueDate ?? defaultDate} onChange={saveDate}
              disabled={!detail.canEdit || sectionLocked} required={dateField.required} />
          </label>
        </div>
      )}
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
            {criteria.length >= 3 && (
              <section className="card rh-radar-card" aria-labelledby="rh-radar-title">
                <div className="rh-radar-side">
                  <h3 id="rh-radar-title">Oceny robocze</h3>
                  <p className="rh-radar-now">
                    <span>{shortCriterion(criteria[index].key, criteria[index].label)}</span>
                    <strong>{scoreOf(criteria[index].key) ?? '–'}</strong>
                  </p>
                </div>
                <Radar axes={criteria.map((c) => shortCriterion(c.key, c.label))} size={120}
                  series={[{ name: 'ocena robocza', values: criteria.map((c) => scoreOf(c.key)), kind: 'a' }]}
                  title={`Oceny robocze: ${criteria.map((c) => `${shortCriterion(c.key, c.label)} ${scoreOf(c.key) ?? 'bez oceny'}`).join(', ')}`} />
              </section>
            )}
            <CriterionTalk detail={detail} criterionKey={criteria[index].key} label={criteria[index].label}
              work={work} notes={notes.data?.notes ?? []} notesData={notes.data}
              reload={reload} />
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
            <h3>Kierunki rozwoju i potrzeby</h3>
            <p className="rh-muted">Omów z {firstName} kierunki rozwoju i potrzebne kwalifikacje. Ustalenia wpiszesz we wnioskach do IPRZ{devField ? ' w kroku „Przyznanie oceny”' : ''}.</p>
          </div>
        )}
      </div>

      {section && section.fields.some((f) => f !== dateField) && (
        <SheetForm key={JSON.stringify(detail.answers)} detail={formDetail} onSaved={reload} sectionKeys={sections} showStage={false}
          fieldFilter={(f) => f !== dateField} />
      )}

      <div className="rh-actions">
        <button type="button" className="secondary" onClick={goPrev}>← Wstecz</button>
        <span className="grow" />
        {nextLabel
          ? <button type="button" onClick={goNext}>Dalej: {nextLabel} →</button>
          : steps[steps.findIndex((s) => s.id === 'interview') + 1] && (
            <button type="button" onClick={leave}>{steps[steps.findIndex((s) => s.id === 'interview') + 1].title} →</button>
          )}
      </div>
    </div>
  )
}

function CriterionTalk({ detail, criterionKey, label, work, notes, notesData, reload }: {
  detail: Detail
  criterionKey: string
  label: string
  work: WorkApi
  notes: Note[]
  notesData: Notes | null
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

    </section>
  )
}
