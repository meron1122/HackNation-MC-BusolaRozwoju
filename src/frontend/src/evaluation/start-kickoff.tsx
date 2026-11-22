// H04 v2 · Rozmowa rozpoczynająca: stepper 4 zagadnień z § 5 ust. 1 (z szablonu), para twarzy, oczekiwania jako 3 karty
// nad cienką linijką 1·3·5·7·9 (bez suwaka i kolorów skali), „Tego unikaj” na szarym tle. Zapis przykładu jak dotąd: PUT context.
import { useState } from 'react'
import { AiFrame, Info, Source, askAssistant } from '../v2'
import { PdfButton, type StepProps } from './common'
import { useWorkContext } from './data'
import { PersonPair, StartHead } from './start-head'
import { CompetencyIcon, UiIcon, shortName } from './start-icons'
import {
  KICKOFF_EMPTY, PERIODIC_REGULATION_URL, firstNameOf, kickoffKey, kickoffTopics, nameCase, reg, useLocalState, useOrg,
  type KickoffState,
} from './start-model'
import { criteriaFieldOf, criteriaOf, isFirstTemplate, scoresFieldOf, type Detail, type Indicator } from './types'

const LEVELS = [
  { key: 'below', title: 'Tego unikaj', tone: 'avoid', icon: 'close', word: 'poniżej oczekiwań' },
  { key: 'meets', title: 'Tego oczekuję', tone: 'expect', icon: 'check', word: 'na poziomie oczekiwań' },
  { key: 'above', title: 'Tak wygląda więcej', tone: 'more', icon: 'up', word: 'powyżej oczekiwań' },
] as const

export function KickoffStep({ detail, steps, go }: StepProps) {
  const first = isFirstTemplate(detail.templateCode)
  const topics = kickoffTopics(detail)
  const [state, setState] = useLocalState<KickoffState>(kickoffKey(detail.id), KICKOFF_EMPTY)
  const firstOpen = topics.findIndex((_, i) => !state.topics.includes(i))
  const [tab, setTab] = useState(firstOpen < 0 ? Math.max(0, topics.findIndex((t) => t.kind === 'expectations')) : firstOpen)
  const { evaluator } = useOrg(detail)
  const name = firstNameOf(detail.employeeName)
  const phase = detail.schema.stages?.find((s) => s.key === detail.stages[0]?.key)?.phase ?? (first ? 'Rozmowa wstępna' : 'Rozmowa rozpoczynająca')
  const topic = topics[tab]
  const nextStep = steps[steps.findIndex((s) => s.id === 'kickoff') + 1]

  function advance(base: KickoffState = state) {
    const marked = base.topics.includes(tab) ? base : { ...base, topics: [...base.topics, tab] }
    if (marked !== state) setState(marked)
    if (tab < topics.length - 1) setTab(tab + 1)
    else if (nextStep) go(nextStep.id)
  }
  const nextLabel = tab < topics.length - 1 ? topics[tab + 1].short.toLowerCase() : nextStep?.title.toLowerCase()

  return (
    <div className="step sv2">
      <StartHead detail={detail} topic={phase} />

      <div className="sv2-talkrow">
        <PersonPair a={{ id: evaluator?.id ?? null, name: detail.evaluatorName ?? evaluator?.name ?? 'Oceniający', hasAvatar: evaluator?.hasAvatar }}
          b={{ id: detail.employeeId, name: detail.employeeName }} />
        <ol className="sv2-talk" aria-label={`Zagadnienia rozmowy · ${state.topics.length}/${topics.length} omówione`}>
          {topics.map((t, i) => {
            const done = state.topics.includes(i)
            return (
              <li key={t.text} className={`${done ? 'done' : ''}${i === tab ? ' current' : ''}`}>
                <button type="button" aria-current={i === tab ? 'step' : undefined} title={t.text} onClick={() => setTab(i)}>
                  <span className="sv2-talk-dot" aria-hidden="true">{done ? <UiIcon name="check" size={14} /> : i + 1}</span>
                  <span>{t.short}{t.optional && <span className="sv2-muted"> · opcjonalne</span>}</span>
                  {done && <span className="sr-only"> (omówione)</span>}
                </button>
              </li>
            )
          })}
        </ol>
        {topics[0]?.legalRef && (
          <Source refText={first ? `Rozp. 2015 · § 3` : reg('§ 5 ust. 1')} href={first ? undefined : PERIODIC_REGULATION_URL} align="end" />
        )}
      </div>

      {topic.kind === 'expectations'
        ? <Expectations detail={detail} state={state} setState={setState} onDone={advance} nextLabel={nextLabel} />
        : (
          <>
            <TopicPanel detail={detail} kind={topic.kind} text={topic.text} legalRef={topic.legalRef} optional={topic.optional} go={go} />
            <div className="step-actions sv2-actions">
              <PdfButton detail={detail} label={`Podgląd dla ${nameCase(name, 'gen')}`} />
              <span className="grow" />
              {nextLabel && <button type="button" onClick={() => advance()}>Dalej: {nextLabel}</button>}
            </div>
          </>
        )}
    </div>
  )
}

/** Zagadnienia inne niż oczekiwania: krótka karta z tym, o czym mówić (z danych oceny), i odwołanie do przepisu w ⓘ. */
function TopicPanel({ detail, kind, text, legalRef, optional, go }: {
  detail: Detail; kind: string; text: string; legalRef?: string; optional?: boolean; go: (id: string) => void
}) {
  const criteria = criteriaOf(detail)
  const mandatory: { key: string }[] = criteriaFieldOf(detail.schema)?.mandatory ?? []
  const editable = detail.canEdit && detail.stages[0]?.status === 'Pending'
  return (
    <section className="card sv2-topic" aria-label={text}>
      <div className="sv2-row-head">
        <h3 className="sv2-h3">{text}</h3>
        <Info align="end" label="Podstawa">{legalRef ?? 'Zakres rozmowy z rozporządzenia.'}{optional ? ' Jeśli to uzasadnione.' : ''}</Info>
      </div>
      {kind === 'duties' && (
        <p className="sv2-topic-line">
          <UiIcon name="doc" size={20} />
          <span>{[detail.employeePosition ?? detail.answers.find((x) => x.fieldKey === 'evaluated' && x.itemKey === 'position')?.valueText, detail.employeeDepartment].filter(Boolean).join(' · ') || 'Opis stanowiska pracy'}</span>
        </p>
      )}
      {kind === 'criteria' && (
        <>
          <ul className="sv2-chips">
            {criteria.map((c) => {
              const locked = mandatory.some((m) => m.key === c.key)
              return (
                <li key={c.key} className={locked ? 'sv2-lockchip' : 'sv2-lockchip sv2-extra-chip'}>
                  <CompetencyIcon id={c.key} size={20} />
                  <span>{c.label}</span>
                  {locked && <><UiIcon name="lock" size={15} /><span className="sr-only"> (obowiązkowe)</span></>}
                </li>
              )
            })}
          </ul>
          {editable && <button type="button" className="link sv2-self-start" onClick={() => go('criteria')}>Zmień kryteria dodatkowe</button>}
        </>
      )}
    </section>
  )
}

function Expectations({ detail, state, setState, onDone, nextLabel }: {
  detail: Detail
  state: KickoffState
  setState: (s: KickoffState) => void
  onDone: (state: KickoffState) => void
  nextLabel?: string
}) {
  const competencies = detail.schema.competencyModel?.competencies ?? {}
  const criteria = criteriaOf(detail).filter((c) => competencies[c.key])
  const work = useWorkContext(detail.id)
  const scale = scoresFieldOf(detail.schema)?.scale ?? []
  const firstOpen = criteria.find((c) => !state.criteria.includes(c.key))?.key ?? criteria[0]?.key ?? ''
  const [selected, setSelected] = useState(firstOpen)
  const [index, setIndex] = useState(0)
  const current = criteria.some((c) => c.key === selected) ? selected : criteria[0]?.key ?? ''
  const competency = competencies[current]
  const indicators = competency?.indicators ?? []
  const indicator: Indicator | undefined = indicators[Math.min(index, indicators.length - 1)]
  const editable = detail.canEdit && detail.stages[0]?.status === 'Pending'
  const done = criteria.filter((c) => state.criteria.includes(c.key)).length
  const name = firstNameOf(detail.employeeName)

  if (criteria.length === 0 || !indicator) return <p className="sv2-muted">Najpierw wybierz kryteria.</p>

  const pick = (key: string) => { setSelected(key); setIndex(0) }
  const lastIndicator = index >= indicators.length - 1
  const nextCriterion = criteria.find((c) => c.key !== current && !state.criteria.includes(c.key))
  function next() {
    if (!lastIndicator) return setIndex(index + 1)
    const marked = state.criteria.includes(current) ? state : { ...state, criteria: [...state.criteria, current] }
    if (nextCriterion) {
      if (marked !== state) setState(marked)
      pick(nextCriterion.key)
    } else onDone(marked)
  }
  const label = !lastIndicator ? 'następny wskaźnik' : nextCriterion ? shortName(nextCriterion.key, nextCriterion.label).toLowerCase() : nextLabel

  return (
    <>
      <div className="sv2-critrow">
        <ul className="sv2-critpick" aria-label="Kryteria">
          {criteria.map((c) => {
            const active = c.key === current
            const ok = state.criteria.includes(c.key)
            return (
              <li key={c.key}>
                <button type="button" className={`sv2-critbtn${active ? ' active' : ''}${ok ? ' done' : ''}`} aria-pressed={active}
                  aria-label={`${c.label}${ok ? ' (omówione)' : ''}`} title={c.label} onClick={() => pick(c.key)}>
                  <CompetencyIcon id={c.key} size={20} />
                  {active && <span>{shortName(c.key, c.label)}</span>}
                  {ok && <span className="sv2-critbtn-ok" aria-hidden="true"><UiIcon name="check" size={11} /></span>}
                </button>
              </li>
            )
          })}
        </ul>
        <span className="sv2-muted">{done}/{criteria.length} gotowe</span>
      </div>

      <div className="sv2-ind-head">
        <span className="sv2-muted">{shortName(current, competency.name)} · {Math.min(index, indicators.length - 1) + 1}/{indicators.length}</span>
        <div className="sv2-row-head">
          <h3 className="sv2-ind-title">{indicator.text}</h3>
          <Info align="end" label="Skąd opisy">Opisy zachowań z modelu kompetencji, nie od asystenta.</Info>
        </div>
      </div>

      <div className="sv2-levels">
        {LEVELS.filter((l) => indicator.levels[l.key]).map((l) => {
          const option = scale.find((o) => o.key === l.key)
          return (
            <div key={l.key} className={`sv2-level ${l.tone}`}>
              <div className="sv2-level-head">
                <span className="sv2-level-icon" aria-hidden="true"><UiIcon name={l.icon} size={16} /></span>
                <strong>{l.title}</strong>
                {option && <span className="sr-only">, {option.value} pkt, {l.word}</span>}
              </div>
              <p>{indicator.levels[l.key]}</p>
            </div>
          )
        })}
      </div>
      <div className="sv2-ruler" aria-hidden="true">
        <div className="sv2-ruler-line">
          {[1, 3, 5, 7, 9].map((v, i) => <span key={v} className="sv2-tick" style={{ left: `${[0, 31, 50, 69, 100][i]}%` }}><i />{v}</span>)}
        </div>
        <div className="sv2-ruler-words">{LEVELS.map((l) => <span key={l.key} className={l.tone === 'expect' ? 'strong' : undefined}>{l.word}</span>)}</div>
      </div>

      <ExampleField key={`${indicator.key}-${work.context ? 'loaded' : 'loading'}`}
        initial={work.indicator(indicator.key).expectation ?? ''} disabled={!editable || !!work.error}
        onSave={(expectation) => work.saveIndicator(indicator.key, { expectation })} />
      {work.error && <p className="sv2-muted">Przykładów nie da się teraz zapisać: {work.error}</p>}

      <AiFrame compact label="Pytania na otwarcie" actions={
        <button type="button" className="secondary" onClick={() => askAssistant(
          `Zaproponuj 3 pytania na otwarcie rozmowy rozpoczynającej z ${nameCase(name, 'inst')} o wskaźniku „${indicator.text}” (kryterium: ${competency.name}). Wskaż źródło.`)}>
          Zaproponuj pytania
        </button>
      }>
        <span className="sr-only">Asystent zaproponuje pytania do tego wskaźnika w panelu asystenta.</span>
      </AiFrame>

      <div className="step-actions sv2-actions">
        <PdfButton detail={detail} label={`Podgląd dla ${nameCase(name, 'gen')}`} />
        <span className="grow" />
        {label && <button type="button" onClick={next}>Dalej: {label}</button>}
      </div>
    </>
  )
}

function ExampleField({ initial, disabled, onSave }: { initial: string; disabled: boolean; onSave: (v: string) => Promise<void> }) {
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
    <div className="sv2-example">
      <label className="sv2-input-icon">
        <UiIcon name="pen" size={18} />
        <span className="sr-only">Twój przykład z pracy wydziału (opcjonalnie, zobaczy go pracownik)</span>
        <textarea rows={1} value={value} disabled={disabled} onChange={(e) => setValue(e.target.value)} onBlur={save}
          placeholder="Twój przykład (opcjonalnie)" />
      </label>
      {status && <span className="sv2-muted" role="status">{status}</span>}
    </div>
  )
}
