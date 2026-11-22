// H04 v2 · Rozmowa rozpoczynająca: stepper zagadnień z § 5 ust. 1 (z szablonu), para twarzy.
// Obowiązki i cele: listy do wpisania (zapis: start-kickoff-store.ts, na razie localStorage — TODO API).
// Oczekiwania: wszystkie wskaźniki wybranego kryterium na jednym ekranie, przy każdym 3 zwarte karty i przykład z pracy
// wydziału (zapis jak dotąd: PUT context/indicators).
import { useState, type ReactNode } from 'react'
import { AiFrame, Info, Source, askAssistant } from '../v2'
import { PdfButton, type StepProps } from './common'
import { useWorkContext, type WorkContextApi } from './data'
import { PersonPair, StartHead } from './start-head'
import { CompetencyIcon, UiIcon, shortName } from './start-icons'
import { useKickoff, type KickoffGoal, type KickoffRecord } from './start-kickoff-store'
import { PERIODIC_REGULATION_URL, firstNameOf, kickoffTopics, nameCase, reg, useOrg } from './start-model'
import { criteriaFieldOf, criteriaOf, isFirstTemplate, scoresFieldOf, type Detail, type Indicator, type ScaleOption } from './types'

const LEVELS = [
  { key: 'below', title: 'Tego unikaj', tone: 'avoid', icon: 'close', word: 'poniżej oczekiwań' },
  { key: 'meets', title: 'Tego oczekuję', tone: 'expect', icon: 'check', word: 'na poziomie oczekiwań' },
  { key: 'above', title: 'Tak wygląda więcej', tone: 'more', icon: 'up', word: 'powyżej oczekiwań' },
] as const

const indicatorWord = (n: number) => (n === 1 ? 'wskaźnik' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'wskaźniki' : 'wskaźników')

type Update = (patch: Partial<KickoffRecord>) => void

export function KickoffStep({ detail, steps, go }: StepProps) {
  const first = isFirstTemplate(detail.templateCode)
  const topics = kickoffTopics(detail)
  const { record, update, error } = useKickoff(detail.id)
  const firstOpen = topics.findIndex((_, i) => !record.topics.includes(i))
  const [tab, setTab] = useState(firstOpen < 0 ? Math.max(0, topics.findIndex((t) => t.kind === 'expectations')) : firstOpen)
  const { evaluator } = useOrg(detail)
  const name = firstNameOf(detail.employeeName)
  const phase = detail.schema.stages?.find((s) => s.key === detail.stages[0]?.key)?.phase ?? (first ? 'Rozmowa wstępna' : 'Rozmowa rozpoczynająca')
  const topic = topics[tab]
  const nextStep = steps[steps.findIndex((s) => s.id === 'kickoff') + 1]
  const editable = detail.canEdit && detail.stages[0]?.status === 'Pending'

  function advance(patch: Partial<KickoffRecord> = {}) {
    const base = { ...record, ...patch }
    const topicsDone = base.topics.includes(tab) ? base.topics : [...base.topics, tab]
    update({ ...patch, topics: topicsDone })
    if (tab < topics.length - 1) setTab(tab + 1)
    else if (nextStep) go(nextStep.id)
  }
  const nextLabel = tab < topics.length - 1 ? topics[tab + 1].short.toLowerCase() : nextStep?.title.toLowerCase()
  const preview = <PdfButton detail={detail} label={`Podgląd dla ${nameCase(name, 'gen')}`} />

  return (
    <div className="step sv2">
      <StartHead detail={detail} topic={phase} />

      <div className="sv2-talkrow">
        <PersonPair a={{ id: evaluator?.id ?? null, name: detail.evaluatorName ?? evaluator?.name ?? 'Oceniający', hasAvatar: evaluator?.hasAvatar }}
          b={{ id: detail.employeeId, name: detail.employeeName }} />
        <ol className="sv2-talk" aria-label={`Zagadnienia rozmowy · ${record.topics.length}/${topics.length} omówione`}>
          {topics.map((t, i) => {
            const done = record.topics.includes(i)
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
        ? <Expectations detail={detail} record={record} update={update} onDone={advance} nextLabel={nextLabel} preview={preview} />
        : (
          <>
            {topic.kind === 'duties' && <DutiesPanel detail={detail} text={topic.text} legalRef={topic.legalRef}
              duties={record.duties} editable={editable} update={update} />}
            {topic.kind === 'goals' && <GoalsPanel text={topic.text} legalRef={topic.legalRef}
              goals={record.goals} editable={editable} update={update} />}
            {topic.kind !== 'duties' && topic.kind !== 'goals' && (
              <TopicPanel detail={detail} kind={topic.kind} text={topic.text} legalRef={topic.legalRef} optional={topic.optional} go={go} />
            )}
            {error && <p className="sv2-muted" role="alert">{error}</p>}
            <div className="step-actions sv2-actions">
              {preview}
              <span className="grow" />
              {nextLabel && <button type="button" onClick={() => advance()}>Dalej: {nextLabel}</button>}
            </div>
          </>
        )}
    </div>
  )
}

/** Obowiązki z opisu stanowiska: lista punktów do wpisania w trakcie rozmowy. */
function DutiesPanel({ detail, text, legalRef, duties, editable, update }: {
  detail: Detail; text: string; legalRef?: string; duties: string[]; editable: boolean; update: Update
}) {
  const [items, setItems] = useState<string[]>(duties.length ? duties : editable ? [''] : [])
  const save = (list: string[]) => update({ duties: list.map((d) => d.trim()).filter(Boolean) })
  const position = [detail.employeePosition ?? detail.answers.find((x) => x.fieldKey === 'evaluated' && x.itemKey === 'position')?.valueText,
    detail.employeeDepartment].filter(Boolean).join(' · ')
  return (
    <section className="card sv2-topic" aria-labelledby="sv2-duties">
      <div className="sv2-row-head">
        <h3 id="sv2-duties" className="sv2-h3 grow">Główne obowiązki z opisu stanowiska</h3>
        <Info align="end" label="Podstawa">{text}{legalRef ? ` (${legalRef}).` : '.'}</Info>
      </div>
      {position && <p className="sv2-topic-line"><UiIcon name="doc" size={20} /><span>{position}</span></p>}
      {editable ? (
        <>
          <ol className="sv2-editlist">
            {items.map((d, i) => (
              <li key={i}>
                <span className="sv2-editlist-num" aria-hidden="true">{i + 1}</span>
                <label className="grow">
                  <span className="sr-only">Obowiązek {i + 1}</span>
                  <textarea rows={1} value={d} placeholder="np. prowadzenie postępowań w sprawie…"
                    onChange={(e) => setItems(items.map((x, j) => (j === i ? e.target.value : x)))} onBlur={() => save(items)} />
                </label>
                <button type="button" className="sv2-x sv2-x-inline" aria-label={`Usuń obowiązek ${i + 1}`}
                  onClick={() => { const next = items.filter((_, j) => j !== i); setItems(next); save(next) }}>
                  <UiIcon name="close" size={16} />
                </button>
              </li>
            ))}
          </ol>
          <button type="button" className="secondary sv2-self-start sv2-add" onClick={() => setItems([...items, ''])}>
            <UiIcon name="plus" size={16} /> Dodaj obowiązek
          </button>
        </>
      ) : duties.length ? (
        <ol className="sv2-readlist">{duties.map((d, i) => <li key={i}>{d}</li>)}</ol>
      ) : <p className="sv2-muted">Nie wpisano obowiązków.</p>}
    </section>
  )
}

/** Cele na okres oceny (opcjonalne): cel i sposób realizacji. */
function GoalsPanel({ text, legalRef, goals, editable, update }: {
  text: string; legalRef?: string; goals: KickoffGoal[]; editable: boolean; update: Update
}) {
  const [items, setItems] = useState<KickoffGoal[]>(goals)
  const save = (list: KickoffGoal[]) => update({
    goals: list.map((g) => ({ goal: g.goal.trim(), how: g.how.trim() })).filter((g) => g.goal || g.how),
  })
  const edit = (i: number, patch: Partial<KickoffGoal>) => setItems(items.map((g, j) => (j === i ? { ...g, ...patch } : g)))
  return (
    <section className="card sv2-topic" aria-labelledby="sv2-goals">
      <div className="sv2-row-head">
        <h3 id="sv2-goals" className="sv2-h3 grow">Cele na okres oceny</h3>
        <Info align="end" label="Cele są opcjonalne">Cele są opcjonalne ({legalRef ?? '§ 5 ust. 1 pkt 4'}). {text}.</Info>
      </div>
      {editable ? (
        <>
          {items.length > 0 && (
            <ol className="sv2-goals">
              {items.map((g, i) => (
                <li key={i} className="sv2-goal">
                  <span className="sv2-editlist-num" aria-hidden="true">{i + 1}</span>
                  <label>
                    <span className="sv2-label">Cel</span>
                    <textarea rows={1} value={g.goal} onChange={(e) => edit(i, { goal: e.target.value })} onBlur={() => save(items)} />
                  </label>
                  <label>
                    <span className="sv2-label">Sposób realizacji</span>
                    <textarea rows={1} value={g.how} onChange={(e) => edit(i, { how: e.target.value })} onBlur={() => save(items)} />
                  </label>
                  <button type="button" className="sv2-x sv2-x-inline" aria-label={`Usuń cel ${i + 1}`}
                    onClick={() => { const next = items.filter((_, j) => j !== i); setItems(next); save(next) }}>
                    <UiIcon name="close" size={16} />
                  </button>
                </li>
              ))}
            </ol>
          )}
          <button type="button" className="secondary sv2-self-start sv2-add" onClick={() => setItems([...items, { goal: '', how: '' }])}>
            <UiIcon name="plus" size={16} /> Dodaj cel
          </button>
        </>
      ) : goals.length ? (
        <ol className="sv2-readlist">{goals.map((g, i) => <li key={i}><strong>{g.goal}</strong>{g.how && <> · {g.how}</>}</li>)}</ol>
      ) : <p className="sv2-muted">Bez celów.</p>}
    </section>
  )
}

/** Zagadnienia inne niż obowiązki, cele i oczekiwania: krótka karta z danych oceny i odwołanie do przepisu w ⓘ. */
function TopicPanel({ detail, kind, text, legalRef, optional, go }: {
  detail: Detail; kind: string; text: string; legalRef?: string; optional?: boolean; go: (id: string) => void
}) {
  const criteria = criteriaOf(detail)
  const mandatory: { key: string }[] = criteriaFieldOf(detail.schema)?.mandatory ?? []
  const editable = detail.canEdit && detail.stages[0]?.status === 'Pending'
  return (
    <section className="card sv2-topic" aria-label={text}>
      <div className="sv2-row-head">
        <h3 className="sv2-h3 grow">{text}</h3>
        <Info align="end" label="Podstawa">{legalRef ?? 'Zakres rozmowy z rozporządzenia.'}{optional ? ' Jeśli to uzasadnione.' : ''}</Info>
      </div>
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

function Expectations({ detail, record, update, onDone, nextLabel, preview }: {
  detail: Detail
  record: KickoffRecord
  update: Update
  onDone: (patch: Partial<KickoffRecord>) => void
  nextLabel?: string
  preview: ReactNode
}) {
  const competencies = detail.schema.competencyModel?.competencies ?? {}
  const criteria = criteriaOf(detail).filter((c) => competencies[c.key])
  const work = useWorkContext(detail.id)
  const scale = scoresFieldOf(detail.schema)?.scale ?? []
  const firstOpen = criteria.find((c) => !record.criteria.includes(c.key))?.key ?? criteria[0]?.key ?? ''
  const [selected, setSelected] = useState(firstOpen)
  const current = criteria.some((c) => c.key === selected) ? selected : criteria[0]?.key ?? ''
  const competency = competencies[current]
  const indicators = competency?.indicators ?? []
  const editable = detail.canEdit && detail.stages[0]?.status === 'Pending'
  const done = criteria.filter((c) => record.criteria.includes(c.key)).length
  const name = firstNameOf(detail.employeeName)

  if (criteria.length === 0 || indicators.length === 0) return <p className="sv2-muted">Najpierw wybierz kryteria.</p>

  const nextCriterion = criteria.find((c) => c.key !== current && !record.criteria.includes(c.key))
  function next() {
    const marked = record.criteria.includes(current) ? record.criteria : [...record.criteria, current]
    if (nextCriterion) {
      if (marked !== record.criteria) update({ criteria: marked })
      setSelected(nextCriterion.key)
      window.scrollTo?.({ top: 0 })
    } else onDone({ criteria: marked })
  }
  const label = nextCriterion ? shortName(nextCriterion.key, nextCriterion.label).toLowerCase() : nextLabel

  return (
    <>
      <div className="sv2-critrow">
        <ul className="sv2-critpick" aria-label="Kryteria">
          {criteria.map((c) => {
            const active = c.key === current
            const ok = record.criteria.includes(c.key)
            return (
              <li key={c.key}>
                <button type="button" className={`sv2-critbtn${active ? ' active' : ''}${ok ? ' done' : ''}`} aria-pressed={active}
                  aria-label={`${c.label}${ok ? ' (omówione)' : ''}`} title={c.label} onClick={() => setSelected(c.key)}>
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

      <div className="sv2-row-head sv2-crit-head">
        <h3 className="sv2-h3 grow">{competency.name} <span className="sv2-muted">· {indicators.length} {indicatorWord(indicators.length)}</span></h3>
        <Info align="end" label="Skąd opisy">Opisy zachowań z modelu kompetencji, nie od asystenta.</Info>
      </div>

      <ol className="sv2-indlist" aria-label={`Wskaźniki: ${competency.name}`}>
        {indicators.map((indicator, i) => (
          <IndicatorRow key={indicator.key} n={i + 1} indicator={indicator} scale={scale} work={work} editable={editable} />
        ))}
      </ol>
      {work.error && <p className="sv2-muted">Przykładów nie da się teraz zapisać: {work.error}</p>}

      <AiFrame compact label="Pytania na otwarcie" actions={
        <button type="button" className="secondary" onClick={() => askAssistant(
          `Zaproponuj 3 pytania na otwarcie rozmowy rozpoczynającej z ${nameCase(name, 'inst')} o kryterium „${competency.name}” (wskaźniki: ${indicators.map((x) => x.text).join('; ')}). Wskaż źródło.`)}>
          Zaproponuj pytania
        </button>
      }>
        <span className="sr-only">Asystent zaproponuje pytania do tego kryterium w panelu asystenta.</span>
      </AiFrame>

      <div className="step-actions sv2-actions">
        {preview}
        <span className="grow" />
        {label && <button type="button" onClick={next}>Dalej: {label}</button>}
      </div>
    </>
  )
}

function IndicatorRow({ n, indicator, scale, work, editable }: {
  n: number
  indicator: Indicator
  scale: ScaleOption[]
  work: WorkContextApi
  editable: boolean
}) {
  return (
    <li className="sv2-ind">
      <div className="sv2-ind-top">
        <span className="sv2-editlist-num" aria-hidden="true">{n}</span>
        <h4 className="sv2-ind-title">{indicator.text}</h4>
      </div>
      <div className="sv2-levels sv2-levels-compact">
        {LEVELS.filter((l) => indicator.levels[l.key]).map((l) => {
          const option = scale.find((o) => o.key === l.key)
          return (
            <div key={l.key} className={`sv2-level ${l.tone}`}>
              <div className="sv2-level-head">
                <span className="sv2-level-icon" aria-hidden="true"><UiIcon name={l.icon} size={14} /></span>
                <strong>{l.title}</strong>
                {option && <span className="sr-only">, {option.value} pkt, {l.word}</span>}
              </div>
              <p>{indicator.levels[l.key]}</p>
            </div>
          )
        })}
      </div>
      <ExampleField key={`${indicator.key}-${work.context ? 'loaded' : 'loading'}`} label={`Przykład z pracy wydziału: ${indicator.text}`}
        initial={work.indicator(indicator.key).expectation ?? ''} disabled={!editable || !!work.error}
        onSave={(expectation) => work.saveIndicator(indicator.key, { expectation })} />
    </li>
  )
}

function ExampleField({ label, initial, disabled, onSave }: { label: string; initial: string; disabled: boolean; onSave: (v: string) => Promise<void> }) {
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
        <span className="sr-only">{label} (opcjonalnie, zobaczy go pracownik)</span>
        <textarea rows={1} value={value} disabled={disabled} onChange={(e) => setValue(e.target.value)} onBlur={save}
          placeholder="Przykład z pracy wydziału (opcjonalnie)" />
      </label>
      {status && <span className="sv2-muted" role="status">{status}</span>}
    </div>
  )
}
