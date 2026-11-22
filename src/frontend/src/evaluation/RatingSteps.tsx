import { useEffect, useState } from 'react'
import { SheetForm } from '../Evaluations'
import { NextButton, Pill, TopicList, type StepProps } from './common'
import { saveAnswers, useApi, useWorkContext } from './data'
import {
  answerOf, criteriaOf, emptyAnswer, fmtDate, indicatorFieldOf, isFirstTemplate, plural, scoresFieldOf,
  type CriterionScoring, type Detail, type Indicator, type Notes, type ScaleOption, type SelfAssessment,
} from './types'

/**
 * Oznaczenia opisów zachowań: litery w przetasowanej kolejności, bo cyfry (1, 3, 5…) wyglądałyby jak punkty skali.
 * Każdy wskaźnik trzeba ocenić jednym z opisów — bez „nie było okazji” (decyzja W07: odpowiedź jest wymagana).
 */
const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E']

type Choice = { valueNumber: number | null; valueText: string | null }

/** Stała (dla danego wskaźnika) kolejność opisów poziomów — żeby nie sugerować, który jest „środkowy”. */
function shuffled(options: ScaleOption[], seed: string): ScaleOption[] {
  let h = 2166136261
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  const rank = (o: ScaleOption) => Math.imul(h ^ (o.value * 2654435761), 2246822519) >>> 0
  return [...options].sort((a, b) => rank(a) - rank(b))
}

const nearest = (scale: ScaleOption[], mean: number) =>
  scale.reduce((best, o) => (Math.abs(o.value - mean) < Math.abs(best.value - mean) ? o : best), scale[0]).value

/** Sugestia z backendu (scoring), a gdy jej brak — z bieżących odpowiedzi (ta sama reguła). */
function criterionScoring(detail: Detail, key: string, indicators: Indicator[], choices: Record<string, Choice>, scale: ScaleOption[], scoresKey: string): CriterionScoring {
  const fromApi = detail.scoring?.criteria.find((c) => c.key === key)
  const rated = indicators.map((i) => choices[i.key]?.valueNumber).filter((n): n is number => n != null)
  const mean = rated.length ? Math.round((rated.reduce((a, b) => a + b, 0) / rated.length) * 100) / 100 : null
  return {
    key, label: fromApi?.label ?? key, ratedIndicators: rated.length, totalIndicators: indicators.length,
    // Backend jest źródłem prawdy (ta sama reguła); lokalnie tylko, gdy API nie podało sugestii.
    indicatorMean: fromApi?.indicatorMean ?? mean,
    suggested: fromApi ? fromApi.suggested : mean == null ? null : nearest(scale, mean),
    score: answerOf(detail, scoresKey, key)?.valueNumber ?? fromApi?.score ?? null,
  }
}

/** W07 (ocena wskaźnika: opisy poziomów jako odpowiedzi) i W08 (podsumowanie kryterium: sugestia i ocena robocza). */
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
  // Odpowiedź = wybrany opis zachowania (wartość skali); dawne „n/a” nie liczy się jako odpowiedź.
  const answered = (key: string) => choices[key]?.valueNumber != null
  const [pos, setPos] = useState<{ c: number; i: number | 'summary' }>(() => {
    for (let c = 0; c < criteria.length; c++) {
      const i = competencies[criteria[c].key].indicators.findIndex((x) => !answered(x.key))
      if (i >= 0) return { c, i }
      if (answerOf(detail, scores.field.key, criteria[c].key)?.valueNumber == null) return { c, i: 'summary' }
    }
    return { c: 0, i: 'summary' }
  })
  const [error, setError] = useState('')

  const criterion = criteria[pos.c]
  const indicators = criterion ? competencies[criterion.key].indicators : []
  const indicator = typeof pos.i === 'number' ? indicators[pos.i] : undefined

  async function choose(key: string, choice: Choice) {
    if (!editable) return
    setChoices((c) => ({ ...c, [key]: choice }))
    try {
      await saveAnswers(detail.id, [{ ...emptyAnswer(indicatorField.key, key), ...choice }])
      setError('')
      reload()
    } catch (e) {
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

  const totalIndicators = criteria.reduce((n, c) => n + competencies[c.key].indicators.length, 0)
  const doneIndicators = criteria.reduce((n, c) => n + competencies[c.key].indicators.filter((i) => answered(i.key)).length, 0)
  const next = () => {
    if (typeof pos.i === 'number' && pos.i < indicators.length - 1) setPos({ c: pos.c, i: pos.i + 1 })
    else if (typeof pos.i === 'number') setPos({ c: pos.c, i: 'summary' })
    else if (pos.c < criteria.length - 1) setPos({ c: pos.c + 1, i: 0 })
    window.scrollTo({ top: 0 })
  }
  const prev = () => {
    if (pos.i === 'summary') setPos({ c: pos.c, i: indicators.length - 1 })
    else if (pos.i > 0) setPos({ c: pos.c, i: pos.i - 1 })
    else if (pos.c > 0) setPos({ c: pos.c - 1, i: 'summary' })
  }

  return (
    <div className="step">
      <div className="chips" role="tablist" aria-label="Kryteria">
        {criteria.map((c, index) => {
          const scored = answerOf(detail, scores.field.key, c.key)?.valueNumber != null
          return (
            <button key={c.key} type="button" role="tab" aria-selected={index === pos.c}
              className={index === pos.c ? 'chip-button active' : 'chip-button'} onClick={() => setPos({ c: index, i: 0 })}>
              {scored ? '✓ ' : ''}{c.label}
            </button>
          )
        })}
      </div>
      <div className="indicator-progress">
        <span className="small muted">
          <strong>{criterion.label}</strong>
          {indicator ? ` · wskaźnik ${(pos.i as number) + 1} z ${indicators.length}` : ' · podsumowanie'} · kryterium {pos.c + 1} z {criteria.length}
        </span>
        <span className="small muted">odpowiedzi: {doneIndicators}/{totalIndicators}</span>
      </div>
      <div className="timeline-bar"><div style={{ width: `${(doneIndicators / Math.max(1, totalIndicators)) * 100}%` }} /></div>
      {!editable && <p className="muted small">Tylko do odczytu{detail.lockedSections.includes(scores.section.key) ? ' — etap oceny jest zamknięty' : ''}.</p>}
      {error && <p role="alert" className="error">{error}</p>}
      {indicator ? (
        <IndicatorQuestion detail={detail} indicator={indicator} scale={scale} choice={choices[indicator.key]} editable={editable}
          onChoose={(c) => choose(indicator.key, c)} work={work} notes={notes.data?.notes.filter((n) => n.indicatorKey === indicator.key) ?? []} />
      ) : (
        <CriterionSummary detail={detail} criterionKey={criterion.key} label={criterion.label} indicators={indicators} choices={choices}
          scale={scale} scoresKey={scores.field.key} editable={editable} work={work} reload={reload}
          noteCount={(key) => notes.data?.notes.filter((n) => n.indicatorKey === key).length ?? 0} />
      )}
      <div className="step-actions">
        {indicator
          ? <button type="button" className="secondary" onClick={prev} disabled={pos.c === 0 && pos.i === 0}>← Poprzedni wskaźnik</button>
          : <button type="button" className="secondary" onClick={() => setPos({ c: pos.c, i: 0 })}>← Zmień odpowiedzi</button>}
        <span className="grow" />
        {indicator && editable && <span className="small muted">Klawisze A–{OPTION_LETTERS[scale.length - 1]}</span>}
        {indicator || pos.c < criteria.length - 1
          ? <button type="button" onClick={next}>
            {indicator
              ? (pos.i as number) < indicators.length - 1 ? 'Następny wskaźnik →' : 'Podsumowanie kryterium →'
              : `Zapisz roboczo i przejdź do: ${criteria[pos.c + 1].label} →`}
          </button>
          : <NextButton steps={steps} current="indicators" go={go} />}
      </div>
    </div>
  )
}

function IndicatorQuestion({ detail, indicator, scale, choice, editable, onChoose, work, notes }: {
  detail: Detail
  indicator: Indicator
  scale: ScaleOption[]
  choice: Choice | undefined
  editable: boolean
  onChoose: (c: Choice) => void
  work: ReturnType<typeof useWorkContext>
  notes: Notes['notes']
}) {
  const context = work.indicator(indicator.key)
  const agreedOn = detail.stages[0]?.completedOn
  return (
    <div className="card question">
      <h2 className="question-text">{indicator.text}</h2>
      <p className="muted small">Wybierz zachowanie typowe dla całego okresu. Weź pod uwagę powtarzalność, nie jednorazowy wyjątek.</p>
      {context.expectation && (
        <p className="callout info small">Ustalone oczekiwanie{agreedOn ? ` (${fmtDate(agreedOn)})` : ''}: „{context.expectation}”</p>
      )}
      <div className="options" role="radiogroup" aria-label={indicator.text}>
        {shuffled(scale, indicator.key).map((o, index) => {
          const checked = choice?.valueNumber === o.value
          return (
            <button key={o.key} type="button" role="radio" aria-checked={checked} disabled={!editable}
              className={checked ? 'option selected' : 'option'} onClick={() => onChoose({ valueNumber: o.value, valueText: null })}>
              <span className="option-key">{OPTION_LETTERS[index]}</span><span>{indicator.levels[o.key] ?? o.label}</span>
            </button>
          )
        })}
      </div>
      {notes.length > 0 && (
        <details className="notes-preview">
          <summary>Notatki przypięte do tego wskaźnika ({notes.length})</summary>
          <ul>
            {notes.map((n) => (
              <li key={n.id} className={n.inPeriod ? undefined : 'muted'}>
                <strong>{fmtDate(n.observedOn)}</strong> {[n.situation, n.action, n.result].filter(Boolean).join(' · ')}
                {!n.inPeriod && ' (sprzed okresu oceny — nie liczy się)'}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

function CriterionSummary({ detail, criterionKey, label, indicators, choices, scale, scoresKey, editable, work, reload, noteCount }: {
  detail: Detail
  criterionKey: string
  label: string
  indicators: Indicator[]
  choices: Record<string, Choice>
  scale: ScaleOption[]
  scoresKey: string
  editable: boolean
  work: ReturnType<typeof useWorkContext>
  reload: () => Promise<void>
  noteCount: (indicatorKey: string) => number
}) {
  const scoring = criterionScoring(detail, criterionKey, indicators, choices, scale, scoresKey)
  const [score, setScore] = useState<number | null>(scoring.score)
  const [error, setError] = useState('')
  const suggested = scale.find((o) => o.value === scoring.suggested)
  const meets = scale.find((o) => o.key === 'meets')
  const firstContext = indicators.map((i) => work.indicator(i.key).expectation).find(Boolean)

  async function pick(value: number) {
    if (!editable) return
    setScore(value)
    try {
      await saveAnswers(detail.id, [{ ...emptyAnswer(scoresKey, criterionKey), valueNumber: value }])
      setError('')
      reload()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <>
      <h2>{label} · podsumowanie kryterium</h2>
      {firstContext && <p className="callout info small">Oczekiwanie ustalone z pracownikiem: „{firstContext}”. Widzi je też pracownik.</p>}
      {indicators.map((i) => {
        const c = choices[i.key]
        const option = scale.find((o) => o.value === c?.valueNumber)
        return (
          <div key={i.key} className="card summary-row">
            <div className="grow">
              <p className="muted small">{i.text}</p>
              <p>{option ? i.levels[option.key] : <span className="error">brak odpowiedzi</span>}</p>
            </div>
            <div className="summary-meta">
              {option && <Pill>{option.label.toLowerCase()} · {option.value}</Pill>}
              <span className="small muted">{noteCount(i.key)} {plural(noteCount(i.key), 'notatka', 'notatki', 'notatek')}</span>
            </div>
          </div>
        )
      })}
      <div className="callout info">
        <strong>{suggested ? `Sugerowany poziom: ${suggested.label.toLowerCase()} (${suggested.value} pkt)` : 'Sugestia pojawi się po ocenie wskaźników'}</strong>
        <p className="small">
          {scoring.indicatorMean != null && <>Średnia wybranych zachowań: {scoring.indicatorMean.toFixed(2)} ({scoring.ratedIndicators} z {scoring.totalIndicators} wskaźników). </>}
          Liczy reguła: średnia ocenionych wskaźników zaokrąglona do najbliższego stopnia skali. To podpowiedź, nie ocena.
        </p>
      </div>
      <div className="card">
        <div className="card-head">
          <h3>Twoja ocena robocza</h3>
          {meets && <Pill>punkt wyjścia: {meets.value} · {meets.label.toLowerCase()}</Pill>}
          <Pill tone="attention">potwierdzisz po rozmowie oceniającej</Pill>
        </div>
        <div className="score-buttons" role="radiogroup" aria-label={`Ocena cząstkowa: ${label}`}>
          {scale.map((o) => (
            <button key={o.value} type="button" role="radio" aria-checked={score === o.value} disabled={!editable}
              className={['score-button', score === o.value && 'selected', scoring.suggested === o.value && 'suggested'].filter(Boolean).join(' ')}
              onClick={() => pick(o.value)}>
              <strong>{o.value} pkt</strong><span className="small">{o.label.toLowerCase()}</span>
              {scoring.suggested === o.value && <span className="small accent">sugestia</span>}
            </button>
          ))}
        </div>
        {error && <p role="alert" className="error">{error}</p>}
        {score != null && scoring.suggested != null && score !== scoring.suggested && (
          <ReasonField key={`${criterionKey}-${work.context ? 'loaded' : 'loading'}`} initial={work.reason(criterionKey)} disabled={!editable || !!work.error}
            onSave={(v) => work.saveReason(criterionKey, v)} />
        )}
      </div>
    </>
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
    <label className="block-label">Twoja ocena różni się od sugestii. Dlaczego? (opcjonalnie, do roboczej wersji uzasadnienia)
      <textarea rows={2} value={value} disabled={disabled} onChange={(e) => setValue(e.target.value)} onBlur={save} />
      {status && <span className="muted small" role="status">{status}</span>}
    </label>
  )
}

/** W09: rozmowa oceniająca — robocza ocena, perspektywa pracownika (samoocena), przykłady z notatek, potrzeby rozwojowe. */
export function InterviewStep({ detail, steps, go, reload, sections }: StepProps & { sections: string[] }) {
  const first = isFirstTemplate(detail.templateCode)
  const criteria = criteriaOf(detail)
  const scores = scoresFieldOf(detail.schema)
  const [index, setIndex] = useState(0)
  const work = useWorkContext(detail.id)
  const notes = useApi<Notes>(`evaluations/${detail.id}/notes`)
  const self = useApi<SelfAssessment>(`evaluations/${detail.id}/self-assessment`)
  const firstName = detail.employeeName.split(' ')[0]
  const criterion = criteria[index]
  const section = detail.schema.sections.find((s) => sections.includes(s.key))
  const competency = criterion && detail.schema.competencyModel?.competencies[criterion.key]

  // Tematy z szablonu (§ 10 / pierwsza ocena: § 2, § 7); stała lista tylko dla starszych wersji szablonów.
  const templateTopics = detail.schema.stages?.find((s) => s.key === section?.stage)?.topics
  const topics = first
    ? ['Zadania w okresie', `Elementy oceny · ${criteria.length}`, 'Sprawozdanie', 'Rozwój zawodowy']
    : ['Obowiązki w okresie', `Kryteria · ${criteria.length}`, 'Cele', 'Rozwój i potrzeby']

  const savedScore = criterion && scores ? answerOf(detail, scores.field.key, criterion.key)?.valueNumber ?? null : null
  // Po rozmowie oceniający może zmienić ocenę cząstkową tutaj — do sporządzenia oceny (potem sekcja jest zablokowana).
  const [scoreOverride, setScoreOverride] = useState<Record<string, number>>({})
  const [scoreError, setScoreError] = useState('')
  const score = criterion ? scoreOverride[criterion.key] ?? savedScore : null
  const option = scores?.scale.find((o) => o.value === score)
  const scoresEditable = !!scores && detail.canEdit && !detail.lockedSections.includes(scores.section.key)
  const suggested = detail.scoring?.criteria.find((c) => c.key === criterion?.key)?.suggested ?? null
  async function changeScore(value: number) {
    if (!criterion || !scores) return
    setScoreOverride((s) => ({ ...s, [criterion.key]: value }))
    try {
      await saveAnswers(detail.id, [{ ...emptyAnswer(scores.field.key, criterion.key), valueNumber: value }])
      setScoreError('')
      reload()
    } catch (e) {
      setScoreError((e as Error).message)
      setScoreOverride((s) => Object.fromEntries(Object.entries(s).filter(([key]) => key !== criterion.key)))
    }
  }
  const expectation = competency?.indicators.map((i) => work.indicator(i.key).expectation).find(Boolean)
  const examples = (notes.data?.notes ?? []).filter((n) => n.inPeriod && n.criterionKey === criterion?.key).slice(0, 3)
  const own = self.data?.criteria.find((c) => c.key === criterion?.key)

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

  return (
    <div className="step">
      <div className="step-head"><h2>{section?.title ?? 'Rozmowa oceniająca'}</h2><Pill icon="lock">robocza ocena niewidoczna dla pracownika</Pill></div>
      {templateTopics?.length ? (
        <details className="card" open>
          <summary><strong>Do omówienia{first ? '' : ' (§ 10 rozporządzenia)'}</strong></summary>
          <TopicList topics={templateTopics} />
        </details>
      ) : (
        <p className="chips">
          <span className="small muted">Do omówienia{first ? '' : ' (§ 10)'}:</span> {topics.map((t) => <Pill key={t}>{t}</Pill>)}
        </p>
      )}
      {criterion && (
        <>
          <div className="chips" role="tablist">
            {criteria.map((c, i) => (
              <button key={c.key} type="button" role="tab" aria-selected={i === index}
                className={i === index ? 'chip-button active' : 'chip-button'} onClick={() => setIndex(i)}>{c.label}</button>
            ))}
          </div>
          <div className="two-col">
            <div className="card">
              <p className="muted small">Twoja robocza ocena</p>
              <h3>{option ? `${option.value} pkt · ${option.label.toLowerCase()}` : 'jeszcze bez oceny'}</h3>
              {expectation && <p className="muted small">Oczekiwanie: „{expectation}”</p>}
              {examples.length > 0
                ? <p className="small">Przykłady: {examples.map((n) => `${fmtDate(n.observedOn)} ${n.situation || n.action}`).join(' · ')}</p>
                : <p className="muted small">Brak notatek do tego kryterium.</p>}
              {scoresEditable && scores && (
                <>
                  <p className="muted small">Zmień po rozmowie (np. gdy pracownik pokazał nowe przykłady):</p>
                  <div className="chips" role="radiogroup" aria-label={`Ocena cząstkowa: ${criterion.label}`}>
                    {scores.scale.map((o) => (
                      <button key={o.value} type="button" role="radio" aria-checked={score === o.value} title={o.label}
                        className={['chip-button', score === o.value && 'active', suggested === o.value && 'suggested'].filter(Boolean).join(' ')}
                        onClick={() => changeScore(o.value)}>
                        {o.value}{suggested === o.value ? ' · sugestia' : ''}
                      </button>
                    ))}
                  </div>
                  {scoreError && <p role="alert" className="error small">{scoreError}</p>}
                  {score != null && suggested != null && score !== suggested && (
                    <ReasonField key={`${criterion.key}-${work.context ? 'loaded' : 'loading'}`} initial={work.reason(criterion.key)}
                      disabled={!!work.error} onSave={(v) => work.saveReason(criterion.key, v)} />
                  )}
                </>
              )}
            </div>
            <div className="card accent-border">
              <p className="accent small"><strong>Perspektywa: {firstName} (samoocena)</strong></p>
              {self.error ? <p className="muted small">Samoocena niedostępna: {self.error}</p>
                : !self.data ? <p className="muted small">Ładowanie…</p>
                : !self.data.submitted ? <p className="muted small">Samoocena nie została jeszcze przekazana.</p>
                : (
                  <>
                    <div className="chips">
                      {self.data.scale.map((o) => <Pill key={o.key} tone={own?.level === o.key ? 'info' : 'neutral'}>{own?.level === o.key ? '● ' : ''}{o.label.toLowerCase()}</Pill>)}
                    </div>
                    {own?.comment ? <blockquote>„{own.comment}”</blockquote> : <p className="muted small">Bez komentarza.</p>}
                  </>
                )}
            </div>
          </div>
          <p className="muted small">
            Ocenę cząstkową możesz zmieniać do sporządzenia oceny — tutaj albo w kroku „Ocena wskaźników” (tam też odpowiedzi przy wskaźnikach).
          </p>
        </>
      )}
      {self.data?.submitted && (
        <div className="card">
          <h3>Potrzeby rozwojowe zgłoszone przez pracownika{devField ? ' → do wniosków IPRZ' : ''}</h3>
          <p>{self.data.developmentNeeds || <span className="muted">Nie zgłoszono.</span>}</p>
          {canCopyNeeds && (
            <div className="buttons"><button type="button" className="secondary" onClick={copyNeeds}>Dopisz do wniosków</button>{copyStatus && <span className="muted small">{copyStatus}</span>}</div>
          )}
        </div>
      )}
      <SheetForm key={JSON.stringify(detail.answers)} detail={detail} onSaved={reload} sectionKeys={sections} showStage={false} />
      <div className="step-actions">
        <button type="button" className="secondary" disabled={index === 0} onClick={() => setIndex(index - 1)}>← Poprzednie kryterium</button>
        <span className="grow" />
        {index < criteria.length - 1
          ? <button type="button" onClick={() => setIndex(index + 1)}>Następne kryterium: {criteria[index + 1].label} →</button>
          : <NextButton steps={steps} current="interview" go={go} />}
      </div>
    </div>
  )
}
