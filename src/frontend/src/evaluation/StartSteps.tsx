import { useState, type ReactNode } from 'react'
import { api } from '../api'
import { SheetForm } from '../Evaluations'
import { CompleteStage, DuePill, IssueList, NextButton, PdfButton, Pill, TopicList, type StepProps } from './common'
import { useApi, useWorkContext, withoutAutoFilled } from './data'
import {
  daysUntil, criteriaFieldOf, criteriaOf, fmtDate, isFirstTemplate, scoresFieldOf, sheetLetter, stageOf, type Detail, type Field, type PositiveRule, type Schema,
} from './types'

const allFields = (schema: Schema) => schema.sections.flatMap((s) => s.fields)

/** Warunek oceny pozytywnej z szablonu (scoring.positiveWhen) opisany słowami. */
function describeRule(rule: PositiveRule, schema: Schema): string {
  switch (rule.rule) {
    case 'fieldIn': {
      const field = allFields(schema).find((f) => f.key === rule.field)
      const labels = (rule.values ?? []).map((v) => field?.options?.find((o: { value: string }) => o.value === v)?.label ?? v)
      return `${field?.label ?? rule.field}: ${labels.join(' lub ').toLowerCase()}`
    }
    case 'maxCountOfScore':
      return rule.count === 0 ? `żadna ocena cząstkowa ${rule.score} pkt` : `najwyżej ${rule.count === 1 ? 'jedna ocena' : `${rule.count} oceny`} ${rule.score} pkt`
    case 'minAverage':
      return `średnia co najmniej ${rule.value}`
    case 'levelIn':
      return `poziom: ${(rule.values ?? []).map((v) => schema.scoring?.levels?.find((l) => l.key === v)?.label.toLowerCase() ?? v).join(', ')}`
    default:
      return rule.rule
  }
}

function stageDue(detail: Detail, key: string): string {
  const s = stageOf(detail, key)
  if (!s) return '—'
  if (s.status === 'Completed') return `wykonano ${fmtDate(s.completedOn)}`
  if (s.status === 'Skipped') return 'pominięty'
  if (s.dueFrom && s.dueTo) return `${fmtDate(s.dueFrom)} – ${fmtDate(s.dueTo)}`
  if (s.dueTo) return `do ${fmtDate(s.dueTo)}`
  return 'po poprzednim etapie'
}

/** Krótko, kogo dotyczy arkusz (pełny opis: appliesTo w szablonie). */
const SHEET_HINTS: Record<string, string> = {
  'periodic-b': 'kieruje pracownikami',
  'periodic-c': 'bez podległych pracowników',
}

/** W02 (ocena okresowa) i W15 (pierwsza ocena): ścieżka, arkusz, terminy. Bez opisu stanowiska — backend go nie ma. */
export function StartStep({ detail, steps, go, reload }: StepProps) {
  const first = isFirstTemplate(detail.templateCode)
  const notStarted = detail.phase === 'Oczekuje na start'
  const schema = detail.schema
  const letter = sheetLetter(detail.templateCode)
  const scores = scoresFieldOf(schema)
  const stages = detail.stages.filter((s) => !s.optional)
  const templates = useApi<{ code: string; title: string }[]>('evaluation-templates')
  const periodic = (templates.data ?? []).filter((t) => t.code.startsWith('periodic-'))
  // Backend pozwala zmienić szablon tylko przed rozpoczęciem oceny (bez wpisów, podpisów, notatek).
  const canSwitch = detail.canEdit && notStarted && detail.answers.length === 0 && detail.signatures.length === 0
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function switchTo(templateCode: string) {
    if (!canSwitch || busy || templateCode === detail.templateCode) return
    setBusy(true)
    try {
      await api(`evaluations/${detail.id}/template`, 'PUT', { templateCode })
      setError('')
      await reload()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const pathCard = (kind: 'periodic' | 'first', title: string, text: string, extra?: ReactNode) => {
    const selected = first === (kind === 'first')
    const target = kind === 'first' ? 'first' : periodic.find((t) => t.code === 'periodic-c')?.code ?? periodic[0]?.code
    const clickable = canSwitch && !selected && !!target
    return (
      <div className={selected ? 'choice-card selected' : clickable ? 'choice-card clickable' : 'choice-card disabled'}
        role={clickable ? 'button' : undefined} tabIndex={clickable ? 0 : undefined} aria-pressed={selected}
        onClick={() => clickable && switchTo(target!)} onKeyDown={(e) => clickable && e.key === 'Enter' && switchTo(target!)}>
        <div className="choice-head"><strong>{title}</strong>{selected && <span className="small accent">wybrana</span>}</div>
        <p className="muted small">{text}</p>
        {extra}
      </div>
    )
  }

  return (
    <div className="step">
      <div className="step-head">
        <h2>{notStarted ? 'Rozpocznij ocenę' : 'Ścieżka oceny'} · {detail.employeeName}</h2>
        {first && <Pill>od {fmtDate(detail.startDate)}</Pill>}
      </div>
      <div className="choice-row">
        {pathCard('periodic', 'Ocena okresowa', detail.previous
          ? `Poprzednia ocena ${fmtDate(detail.previous.date)}${detail.previous.levelLabel ? ` (${detail.previous.levelLabel.toLowerCase()})` : ''} → kolejna za 24 mies.`
          : 'Ocena co 24 miesiące: kryteria na początku okresu, ocena na jego końcu.',
        periodic.length > 1 && (canSwitch || !first) ? (
          <div className="chips" onClick={(e) => e.stopPropagation()}>
            {periodic.map((t) => (
              <button key={t.code} type="button" title={t.title} disabled={!canSwitch && t.code !== detail.templateCode}
                className={t.code === detail.templateCode ? 'chip-button active' : 'chip-button'} onClick={() => switchTo(t.code)}>
                Arkusz {sheetLetter(t.code)}{SHEET_HINTS[t.code] ? ` · ${SHEET_HINTS[t.code]}` : ''}
              </button>
            ))}
          </div>
        ) : null)}
        {pathCard('first', 'Pierwsza ocena', 'Dla osób w pierwszym roku pracy w służbie cywilnej.')}
      </div>
      <p className="muted small">
        {canSwitch
          ? 'Ścieżkę i arkusz zaproponowały dane kadrowe. Możesz je zmienić, dopóki ocena się nie zaczęła — terminy przeliczą się od nowa.'
          : 'Ścieżki i arkusza nie można już zmienić — ocena się zaczęła.'}
      </p>
      {error && <p role="alert" className="error">{error}</p>}

      {!first && (
        <div className="callout ok">
          <strong>Arkusz {letter}</strong> {schema.appliesTo && <span>· {schema.appliesTo}</span>}
          {schema.legalBasis && <p className="muted small">{schema.legalBasis}</p>}
        </div>
      )}

      <div className={first ? 'two-col' : ''}>
        <div className="card">
          <h3>Kroki i terminy (wyliczone)</h3>
          <ol className="stage-list">
            {stages.map((s) => {
              const phase = schema.stages?.find((d) => d.key === s.key)?.phase ?? s.title
              return (
              <li key={s.key} className={s.key === detail.currentStageKey ? 'current' : s.status !== 'Pending' ? 'done' : undefined}>
                <span>{phase}{phase !== s.title && <span className="muted small"> · {s.title}</span>}</span>
                <Pill tone={s.overdue ? 'danger' : s.key === detail.currentStageKey ? 'warn' : 'neutral'}>
                  {s.key === detail.currentStageKey && !s.dueTo ? 'niezwłocznie' : stageDue(detail, s.key)}
                </Pill>
              </li>
              )
            })}
          </ol>
        </div>
        {first && scores && (
          <div className="card">
            <h3>Ta sama ocena zachowaniami</h3>
            <p className="small">
              {(scores.field.items ?? []).length} elementów oceny — te same wskaźniki behawioralne co w ocenie okresowej (arkusz C).
            </p>
            <p className="small">Skala: {scores.scale.map((o) => <Pill key={o.key}>{o.value} · {o.label.toLowerCase()}</Pill>)}</p>
            {schema.scoring?.positiveWhen && (
              <>
                <p><strong>Ocena pozytywna, gdy łącznie:</strong></p>
                <ul className="checks">{schema.scoring.positiveWhen.map((r, i) => <li key={i}>{describeRule(r, schema)}</li>)}</ul>
              </>
            )}
            <div className="callout info">
              <Pill tone="info">Kierujący komórką</Pill>{' '}
              {detail.unitHeadName ?? <span className="muted">nie wskazano (Wydziały → kierujący komórką)</span>}
              <span className="muted small"> · współtworzy ocenę i podpisuje jej potwierdzenie</span>
            </div>
            <p className="muted small">Każdy wskaźnik trzeba ocenić jednym z opisów zachowań. Wnioski rozwojowe tylko przy ocenie pozytywnej.</p>
          </div>
        )}
      </div>
      <div className="step-actions"><span className="grow" /><NextButton steps={steps} current="start" go={go} /></div>
    </div>
  )
}

/** W03: kryteria obowiązkowe (z arkusza) + do 3 dodatkowych z modelu kompetencji i podgląd ich wskaźników. */
export function CriteriaStep({ detail, steps, go, reload }: StepProps) {
  const schema = detail.schema
  const criteriaField = criteriaFieldOf(schema)
  const section = schema.sections.find((s) => s.fields.some((f) => f === criteriaField))
  const criteria = criteriaOf(detail)
  const competencies = schema.competencyModel?.competencies ?? {}
  const [selected, setSelected] = useState(criteria[0]?.key ?? '')
  const competency = competencies[selected]

  return (
    <div className="step">
      <div className="step-head"><h2>{isFirstTemplate(detail.templateCode) ? 'Elementy oceny i wskaźniki' : 'Kryteria i wskaźniki'}</h2></div>
      {criteriaField && section ? (
        <SheetForm key={JSON.stringify(detail.answers)} detail={detail} onSaved={reload} sectionKeys={[section.key]}
          fieldFilter={(f: Field) => f.type === 'criteriaSelection'} showStage={false} />
      ) : (
        <p className="muted">Elementy oceny są stałe (arkusz pierwszej oceny): {criteria.map((c) => c.label).join(', ')}.</p>
      )}
      {criteria.length > 0 && (
        <div className="card">
          <h3>Wskaźniki · {competency?.name ?? '—'}</h3>
          <div className="chips" role="tablist">
            {criteria.map((c) => (
              <button key={c.key} type="button" role="tab" aria-selected={c.key === selected}
                className={c.key === selected ? 'chip-button active' : 'chip-button'} onClick={() => setSelected(c.key)}>{c.label}</button>
            ))}
          </div>
          {competency ? (
            <ul className="indicator-list">{competency.indicators.map((i) => <li key={i.key}>{i.text}</li>)}</ul>
          ) : <p className="muted small">To kryterium nie ma wskaźników w modelu kompetencji.</p>}
          <p className="muted small">Każde kryterium oceniasz przez wszystkie jego wskaźniki — przy każdym wybierasz jeden opis zachowania.</p>
        </div>
      )}
      <div className="step-actions"><span className="grow" /><NextButton steps={steps} current="criteria" go={go} /></div>
    </div>
  )
}

const LEVEL_CARDS = [
  { key: 'meets', title: 'Tego oczekuję', tone: 'info', note: 'na poziomie oczekiwań' },
  { key: 'above', title: 'Tak wygląda więcej', tone: 'ok', note: 'powyżej oczekiwań' },
  { key: 'below', title: 'Tego unikaj', tone: 'warn', note: 'poniżej oczekiwań' },
] as const

/** W04: rozmowa rozpoczynająca — oczekiwania (opisy poziomów wskaźników + przykład) i tematy z § 5 ust. 1. */
export function KickoffStep({ detail, steps, go }: StepProps) {
  const [tab, setTab] = useState<'expectations' | 'topics'>('expectations')
  const first = isFirstTemplate(detail.templateCode)
  const firstStage = detail.stages[0]
  const phase = detail.schema.stages?.find((s) => s.key === firstStage?.key)?.phase ?? firstStage?.title
  return (
    <div className="step">
      <div className="step-head">
        <h2>{phase}</h2>
        {firstStage?.status === 'Pending' && firstStage.dueTo && (
          <DuePill dueTo={firstStage.dueTo} daysLeft={daysUntil(firstStage.dueTo)} overdue={firstStage.overdue} />
        )}
      </div>
      <div className="chips" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'expectations'} className={tab === 'expectations' ? 'chip-button active' : 'chip-button'}
          onClick={() => setTab('expectations')}>1. Oczekiwania</button>
        <button type="button" role="tab" aria-selected={tab === 'topics'} className={tab === 'topics' ? 'chip-button active' : 'chip-button'}
          onClick={() => setTab('topics')}>2. Tematy rozmowy {first ? '' : '(§ 5 ust. 1)'}</button>
      </div>
      {tab === 'expectations' ? <Expectations detail={detail} /> : <Topics detail={detail} />}
      <div className="step-actions">
        <PdfButton detail={detail} label="Podgląd PDF dla pracownika" />
        <span className="grow" />
        {tab === 'expectations'
          ? <button type="button" onClick={() => setTab('topics')}>Dalej: tematy rozmowy →</button>
          : <NextButton steps={steps} current="kickoff" go={go} />}
      </div>
    </div>
  )
}

function Expectations({ detail }: { detail: Detail }) {
  const criteria = criteriaOf(detail).filter((c) => detail.schema.competencyModel?.competencies[c.key])
  const [selected, setSelected] = useState(criteria[0]?.key ?? '')
  const work = useWorkContext(detail.id)
  const scale = scoresFieldOf(detail.schema)?.scale ?? []
  const competency = detail.schema.competencyModel?.competencies[selected]
  const editable = detail.canEdit && detail.stages[0]?.status === 'Pending'

  if (criteria.length === 0) return <p className="muted">Najpierw wybierz kryteria.</p>
  return (
    <>
      <p className="muted small">
        Opisy zachowań z modelu kompetencji pokazują ocenianemu, czego oczekujesz. Możesz dopisać przykład z pracy wydziału — oceniany go zobaczy.
      </p>
      {work.error && <p className="muted small">Przykładów nie da się teraz zapisać: {work.error}</p>}
      <div className="chips" role="tablist">
        {criteria.map((c) => {
          const indicators = detail.schema.competencyModel!.competencies[c.key].indicators
          const filled = indicators.filter((i) => work.indicator(i.key).expectation).length
          return (
            <button key={c.key} type="button" role="tab" aria-selected={c.key === selected}
              className={c.key === selected ? 'chip-button active' : 'chip-button'} onClick={() => setSelected(c.key)}>
              {c.label}{filled > 0 && ` ✓${filled}`}
            </button>
          )
        })}
      </div>
      {competency?.indicators.map((indicator) => (
        <div key={indicator.key} className="card">
          <p className="muted small">{competency.name}</p>
          <h3>{indicator.text}</h3>
          <div className="level-cards">
            {LEVEL_CARDS.filter((c) => indicator.levels[c.key]).map((c) => {
              const option = scale.find((o) => o.key === c.key)
              return (
                <div key={c.key} className={`level-card ${c.tone}`}>
                  <strong>{c.title}</strong>
                  <span className="small muted">{c.note}{option && ` · ${option.value} pkt`}</span>
                  <p>{indicator.levels[c.key]}</p>
                </div>
              )
            })}
          </div>
          <ExampleField key={`${indicator.key}-${work.context ? 'loaded' : 'loading'}`}
            initial={work.indicator(indicator.key).expectation ?? ''} disabled={!editable || !!work.error}
            onSave={(expectation) => work.saveIndicator(indicator.key, { expectation })} />
        </div>
      ))}
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
    <label className="block-label">Twój przykład z pracy wydziału (opcjonalnie)
      <textarea rows={2} value={value} disabled={disabled} onChange={(e) => setValue(e.target.value)} onBlur={save}
        placeholder="Np. przy odpowiedziach na interpelacje zgłoś ryzyko min. 3 dni przed terminem." />
      {status && <span className="muted small" role="status">{status}</span>}
    </label>
  )
}

/** Tematy rozmowy: statyczna lista „do omówienia”; potwierdzeniem są podpisy (część I / rozmowa wstępna). */
function Topics({ detail }: { detail: Detail }) {
  const first = isFirstTemplate(detail.templateCode)
  const firstStageKey = detail.stages[0]?.key
  const stageSections = detail.schema.sections.filter((s) => s.stage === firstStageKey)
  const signatureRef = stageSections.flatMap((s) => s.fields).filter((f) => f.type === 'signature' && f.role === 'evaluated').map((f) => f.legalRef).find(Boolean)
  // Szablony v3 niosą tematy z rozporządzenia (stages[].topics); stała lista tylko dla starszych wersji.
  const fromTemplate = detail.schema.stages?.find((s) => s.key === firstStageKey)?.topics
  const topics = fromTemplate?.length ? null : first
    ? [
      'Zadania na stanowisku i oczekiwania wobec elementów oceny (opisy zachowań z zakładki „Oczekiwania”).',
      ...stageSections.flatMap((s) => s.fields).filter((f) => f.type === 'dateRange').map((f) => `${f.label}${f.legalRef ? ` (${f.legalRef})` : ''}.`),
    ]
    : [
      'Główne obowiązki ocenianego wynikające z opisu stanowiska pracy.',
      `Kryteria oceny: obowiązkowe z arkusza i wybrane dodatkowe (${criteriaOf(detail).map((c) => c.label).join(', ') || 'jeszcze niewybrane'}).`,
      'Oczekiwania oceniającego co do spełniania kryteriów — opisy zachowań z zakładki „Oczekiwania”.',
      'Cele do osiągnięcia przez ocenianego — jeśli to uzasadnione.',
    ]
  return (
    <div className="card">
      <h3>Do omówienia{first ? ' na rozmowie wstępnej' : ' (§ 5 ust. 1 rozporządzenia)'}</h3>
      {topics ? <ol className="topics">{topics.map((t) => <li key={t}>{t}</li>)}</ol> : <TopicList topics={fromTemplate!} />}
      {!first && <p className="small">Kryteria tej oceny: {criteriaOf(detail).map((c) => c.label).join(', ') || 'jeszcze niewybrane'}. Oczekiwania — zakładka „Oczekiwania”.</p>}
      <p className="muted small">
        Lista nic nie zapisuje. Potwierdzeniem przeprowadzenia rozmowy i zapoznania ocenianego z {first ? 'terminami' : 'kryteriami i terminem sporządzenia oceny'} są
        podpisy {first ? 'w części „Rozmowa wstępna”' : 'w części I arkusza'}{signatureRef ? ` (${signatureRef})` : ''}.
      </p>
    </div>
  )
}

/** W05: część I (dane, kryteria, termin 🔒 auto) i podpisy; zapis zamyka etap i rozpoczyna okres obserwacji. */
export function PartOneStep({ detail, check, steps, go, reload, sections }: StepProps & { sections: string[] }) {
  const schema = detail.schema
  const first = isFirstTemplate(detail.templateCode)
  const firstStage = detail.stages[0]
  const criteriaField = criteriaFieldOf(schema)
  const criteria = criteriaOf(detail)
  const mandatory: { key: string }[] = criteriaField?.mandatory ?? []
  const extra = criteria.filter((c) => !mandatory.some((m) => m.key === c.key))
  const work = useWorkContext(detail.id)
  const examples = work.context?.indicators.filter((i) => i.expectation).length ?? 0
  const evaluation = detail.stages.find((s) => s.key !== firstStage?.key && !s.optional && schema.sections.some((x) => x.stage === s.key && x.fields.some((f) => f.type === 'scores')))
  const report = first ? detail.stages.find((s) => s.key !== firstStage?.key && s.key !== evaluation?.key && !s.optional) : undefined
  const stageIssues = withoutAutoFilled(detail, firstStage?.key ?? '', check?.stages.find((s) => s.key === firstStage?.key)?.issues ?? [])
  const signedDates = detail.signatures
    .filter((s) => schema.sections.some((x) => sections.includes(x.key) && x.fields.some((f) => f.key === s.fieldKey)))
    .map((s) => s.signedOn).sort()
  const closed = firstStage?.status !== 'Pending'

  return (
    <div className="step">
      <div className="step-head"><h2>{first ? 'Rozmowa wstępna i podpisy' : 'Część I arkusza i podpisy'}</h2></div>
      <div className="card">
        <div className="card-head">
          <h3>{first ? 'Arkusz pierwszej oceny · rozmowa wstępna' : `Arkusz ${sheetLetter(detail.templateCode)} · część I`}</h3>
          <PdfButton detail={detail} />
        </div>
        <dl className="summary">
          <dt>Oceniany</dt><dd>{detail.employeeName}</dd>
          {criteriaField ? (
            <>
              <dt>Kryteria obowiązkowe</dt><dd>{mandatory.length} (arkusz {sheetLetter(detail.templateCode)})</dd>
              <dt>Kryteria dodatkowe</dt><dd>{extra.length ? extra.map((c) => c.label).join(', ') : 'brak'}</dd>
            </>
          ) : (
            <><dt>Elementy oceny</dt><dd>{criteria.map((c) => c.label).join(', ')}</dd></>
          )}
          {report && <><dt>Sprawozdanie</dt><dd>{stageDue(detail, report.key)}</dd></>}
          {evaluation && <><dt>{first ? 'Okres pierwszej oceny' : 'Termin sporządzenia oceny'}</dt><dd><strong>{stageDue(detail, evaluation.key)}</strong> <span className="auto">🔒 auto</span></dd></>}
          <dt>Opisy zachowań dla wybranych kryteriów</dt>
          <dd>{criteria.length} {first ? 'elementów' : 'kryteriów'}{examples > 0 && ` · ${examples} przykładów z pracy wydziału`}</dd>
        </dl>
      </div>
      <SheetForm key={JSON.stringify(detail.answers)} detail={detail} onSaved={reload} sectionKeys={sections} showStage={false}
        fieldFilter={(f: Field) => f.type !== 'criteriaSelection' && !(f.type === 'date' && f.prefill?.startsWith('stage:'))} />
      {!closed && <IssueList issues={stageIssues} steps={steps} go={go} />}
      {closed ? (
        <div className="callout ok">Etap zamknięty {fmtDate(firstStage?.completedOn)} — część I jest zablokowana.</div>
      ) : (
        <CompleteStage detail={detail} check={check} stageKey={firstStage!.key} defaultDate={signedDates[signedDates.length - 1]}
          label={first ? 'Zapisz i zamknij rozmowę wstępną →' : 'Zapisz i rozpocznij obserwację →'} onDone={async () => { await reload(); go('notes') }}>
          <p className="callout info">
            {first
              ? <>Po zapisie rozmowa wstępna zostanie zablokowana. Sprawozdanie: {report ? stageDue(detail, report.key) : '—'}, pierwsza ocena: {evaluation ? stageDue(detail, evaluation.key) : '—'}.</>
              : <>Po zapisie część I zostanie zablokowana, okres obserwacji potrwa do {fmtDate(evaluation?.dueTo)}.</>}
          </p>
        </CompleteStage>
      )}
    </div>
  )
}
