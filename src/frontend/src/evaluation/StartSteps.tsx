import { useState, type KeyboardEvent, type ReactNode } from 'react'
import { api } from '../api'
import { SheetForm } from '../Evaluations'
import { Icon } from '../Icon'
import { Auto, CompleteStage, DuePill, IssueList, NextButton, PdfButton, Pill, TopicList, type StepProps } from './common'
import { saveAnswers, useApi, useWorkContext, withoutAutoFilled } from './data'
import {
  daysLabel, daysUntil, criteriaFieldOf, criteriaOf, emptyAnswer, fmtDate, isFirstTemplate, plural, scoresFieldOf, sheetLetter, stageOf,
  type Answer, type Detail, type Field, type PositiveRule, type Schema, type Section,
} from './types'
import './start-hifi.css'

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

/** Dlaczego ten arkusz (reguła z danych kadrowych) i przepis, który ją wyznacza. */
const SHEET_REASONS: Record<string, { reason: string; ref: string }> = {
  'periodic-b': { reason: 'Praca na stanowisku polega na bezpośrednim kierowaniu pracownikami.', ref: '§ 3 ust. 3' },
  'periodic-c': { reason: 'Stanowisko bez bezpośredniego kierowania pracownikami (brak podległych pracowników).', ref: '§ 3 ust. 4' },
}

/** Rozporządzenie o ocenach okresowych (Dz. U. 2016 poz. 470) w ISAP — źródło reguły wyboru arkusza. */
const PERIODIC_REGULATION_URL = 'https://isap.sejm.gov.pl/isap.nsf/DocDetails.xsp?id=WDU20160000470'

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
  const sheetReason = SHEET_REASONS[detail.templateCode]
  const annex = schema.legalBasis?.match(/załącznik nr \d+/)?.[0]
  const regulationLink = !!schema.legalBasis && /2016/.test(schema.legalBasis) && /poz\. 470/.test(schema.legalBasis)

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
    const onKey = (e: KeyboardEvent) => {
      if (clickable && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); switchTo(target!) }
    }
    return (
      <div className={`start-path${selected ? ' selected' : clickable ? ' clickable' : ' disabled'}`}
        role="radio" aria-checked={selected} aria-disabled={!selected && !clickable} tabIndex={clickable || selected ? 0 : -1}
        onClick={() => clickable && switchTo(target!)} onKeyDown={onKey}>
        <span className="start-radio" aria-hidden="true" />
        <div className="start-path-body">
          <div className="start-path-head">
            <strong>{title}</strong>
            {selected && <Pill tone="info" icon="done">wskazują dane kadrowe</Pill>}
          </div>
          <p className="muted">{text}</p>
          {extra}
        </div>
      </div>
    )
  }

  return (
    <div className="step start-hifi">
      <div className="step-head">
        <h2>{notStarted ? 'Rozpocznij ocenę' : 'Ścieżka oceny'} · {detail.employeeName}</h2>
        {first && <Pill>od {fmtDate(detail.startDate)}</Pill>}
      </div>
      <p className="start-lead">Wybierz ścieżkę oceny. Podpowiadamy ją na podstawie danych kadrowych — nie musisz znać przepisów.</p>
      <div className="start-paths" role="radiogroup" aria-label="Ścieżka oceny">
        {pathCard('periodic', 'Ocena okresowa', detail.previous
          ? `Poprzednia ocena ${fmtDate(detail.previous.date)}${detail.previous.levelLabel ? ` (${detail.previous.levelLabel.toLowerCase()})` : ''} → kolejna za 24 mies.`
          : 'Co 24 miesiące: kryteria ustalasz na początku okresu, ocenę sporządzasz na jego końcu.',
        periodic.length > 1 && (canSwitch || !first) ? (
          <div className="chips" role="group" aria-label="Arkusz" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
            {periodic.map((t) => (
              <button key={t.code} type="button" title={t.title} disabled={!canSwitch && t.code !== detail.templateCode}
                aria-pressed={t.code === detail.templateCode}
                className={t.code === detail.templateCode ? 'chip-button active' : 'chip-button'} onClick={() => switchTo(t.code)}>
                Arkusz {sheetLetter(t.code)}{SHEET_HINTS[t.code] ? ` · ${SHEET_HINTS[t.code]}` : ''}
              </button>
            ))}
          </div>
        ) : null)}
        {pathCard('first', 'Pierwsza ocena', 'Dla osób w pierwszym roku pracy w służbie cywilnej. Skala 3/5/7, sprawozdanie i rozmowa wstępna.')}
      </div>
      <p className="muted small">
        {canSwitch
          ? 'Możesz zmienić ścieżkę i arkusz, dopóki ocena się nie zaczęła. Terminy przeliczą się od nowa.'
          : 'Ścieżki i arkusza nie można już zmienić, bo ocena się zaczęła.'}
      </p>
      {error && <p role="alert" className="error">{error}</p>}

      {!first && (
        <div className="start-result" aria-label="Wynik: arkusz oceny">
          <div className="start-result-head">
            <span className="start-result-letter" aria-hidden="true">{letter}</span>
            <div>
              <span className="muted small">Wynik reguły</span>
              <strong>Arkusz {letter}</strong>
            </div>
          </div>
          {sheetReason && <p><strong>Dlaczego:</strong> {sheetReason.reason}</p>}
          {schema.appliesTo && <blockquote className="start-quote">„{schema.appliesTo}”</blockquote>}
          <p className="small start-source">
            <span className="muted">Źródło: </span>
            {regulationLink ? (
              <a href={PERIODIC_REGULATION_URL} target="_blank" rel="noreferrer" title={schema.legalBasis}>
                rozporządzenie w sprawie ocen okresowych{sheetReason ? `, ${sheetReason.ref}` : ''}{annex ? `, ${annex}` : ''} ↗
              </a>
            ) : <span title={schema.legalBasis}>{schema.legalBasis ?? 'szablon arkusza'}</span>}
            <span className="muted"> · dane kadrowe pracownika</span>
          </p>
        </div>
      )}

      <div className={first ? 'two-col' : ''}>
        <div className="card">
          <h3>Kroki i terminy</h3>
          <p className="muted small">Terminy wylicza system z przepisów i daty startu.</p>
          <ol className="start-stages">
            {stages.map((s, i) => {
              const phase = schema.stages?.find((d) => d.key === s.key)?.phase ?? s.title
              const current = s.key === detail.currentStageKey
              const done = s.status !== 'Pending'
              return (
                <li key={s.key} className={current ? 'current' : done ? 'done' : undefined}>
                  <span className="start-stage-dot" aria-hidden="true">{done ? <Icon name="done" /> : i + 1}</span>
                  <span className="start-stage-text">
                    <strong>{phase}</strong>
                    {phase !== s.title && <span className="muted small">{s.title}</span>}
                  </span>
                  <Pill tone={s.overdue ? 'attention' : current ? 'info' : 'neutral'} icon={s.overdue || current ? 'clock' : undefined}>
                    {current && !s.dueTo ? 'niezwłocznie' : stageDue(detail, s.key)}
                    {s.overdue && ' · po terminie'}
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

/**
 * Wybór kryteriów z modelu kompetencji: obowiązkowe jako zablokowane pigułki, dodatkowe (0–max) jako karty.
 * Zapis jak w formularzu arkusza (PUT answers): obowiązkowe + dodatkowe z nazwą, odznaczone z pustą wartością.
 */
function CriteriaPicker({ detail, field, section, reload }: { detail: Detail; field: Field; section: Section; reload: () => Promise<void> }) {
  const competencies = detail.schema.competencyModel?.competencies ?? {}
  const mandatory: { key: string; label: string }[] = field.mandatory ?? []
  const isMandatory = (key: string) => mandatory.some((m) => m.key === key)
  const max: number = field.additional?.max ?? 3
  const savedKeys = detail.answers
    .filter((a) => a.fieldKey === field.key && a.itemKey && a.valueText && !isMandatory(a.itemKey))
    .map((a) => a.itemKey!)
  const [selected, setSelected] = useState<string[]>(savedKeys)
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const locked = detail.lockedSections.includes(section.key)
  const editable = detail.canEdit && !locked
  const full = selected.length >= max
  const options = Object.entries(competencies)
    .filter(([key]) => !isMandatory(key))
    .sort(([, a], [, b]) => a.name.localeCompare(b.name, 'pl'))

  async function toggle(key: string) {
    if (!editable || busy) return
    const next = selected.includes(key) ? selected.filter((k) => k !== key) : full ? selected : [...selected, key]
    if (next === selected) return
    const touched = new Set([...next, ...selected, ...savedKeys])
    const answers: Answer[] = [
      ...mandatory.map((m) => ({ ...emptyAnswer(field.key, m.key), valueText: m.label })),
      ...[...touched].map((k) => ({ ...emptyAnswer(field.key, k), valueText: next.includes(k) ? competencies[k]?.name ?? k : null })),
    ]
    const previous = selected
    setSelected(next)
    setBusy(true)
    setStatus('Zapisywanie…')
    try {
      await saveAnswers(detail.id, answers)
      setStatus('Zapisano.')
      await reload()
    } catch (e) {
      setSelected(previous)
      setStatus((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card start-criteria">
      <div className="start-criteria-group">
        <h3>Obowiązkowe <span className="muted small">· z arkusza {sheetLetter(detail.templateCode)}, nie można ich zmienić</span></h3>
        <ul className="start-lock-pills" aria-label="Kryteria obowiązkowe">
          {mandatory.map((m) => (
            <li key={m.key} className="start-lock-pill"><Icon name="lock" /> {m.label}<span className="sr-only"> (obowiązkowe, zablokowane)</span></li>
          ))}
        </ul>
      </div>
      <div className="start-criteria-group">
        <div className="start-criteria-head">
          <h3>Dodatkowe <span className="muted small">· od 0 do {max}, z modelu kompetencji</span></h3>
          <Pill tone={full ? 'done' : 'info'}>wybrano {selected.length} z {max}</Pill>
        </div>
        <p className="muted small">
          Wybierz kompetencje ważne na tym stanowisku (np. z opisu stanowiska). Dobra praktyka: te same kryteria dodatkowe dla jednakowych stanowisk.
        </p>
        <fieldset className="start-crit-grid" disabled={!editable}>
          <legend className="sr-only">Kryteria dodatkowe (najwyżej {max})</legend>
          {options.filter(([key]) => editable || selected.includes(key)).map(([key, c]) => {
            const checked = selected.includes(key)
            const blocked = !checked && full
            return (
              <div key={key} className={`start-crit${checked ? ' selected' : ''}${blocked ? ' blocked' : ''}`}>
                <label>
                  <input type="checkbox" checked={checked} disabled={blocked || busy} onChange={() => toggle(key)} />
                  <span>
                    <strong>{c.name}</strong>
                    <span className="muted small">{c.indicators.length} {plural(c.indicators.length, 'wskaźnik', 'wskaźniki', 'wskaźników')}</span>
                  </span>
                </label>
                <details>
                  <summary className="small">Pokaż wskaźniki</summary>
                  <ul>{c.indicators.map((i) => <li key={i.key}>{i.text}</li>)}</ul>
                </details>
              </div>
            )
          })}
        </fieldset>
        {!editable && selected.length === 0 && <p className="muted">Nie wybrano kryteriów dodatkowych.</p>}
        {full && editable && <p className="muted small">Wybrano maksymalną liczbę kryteriów dodatkowych. Odznacz jedno, żeby wybrać inne.</p>}
        {locked && <p className="muted small"><Icon name="lock" /> Kryteria są zablokowane — część I arkusza została zamknięta.</p>}
        {status && <p className="muted small" role="status">{status}</p>}
      </div>
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
  const current = criteria.some((c) => c.key === selected) ? selected : criteria[0]?.key ?? ''
  const competency = competencies[current]
  const fromModel = criteriaField?.additional?.from === 'competencyModel'

  return (
    <div className="step start-hifi">
      <div className="step-head"><h2>{isFirstTemplate(detail.templateCode) ? 'Elementy oceny i wskaźniki' : 'Kryteria i wskaźniki'}</h2></div>
      {criteriaField && section ? (
        fromModel
          ? <CriteriaPicker detail={detail} field={criteriaField} section={section} reload={reload} />
          : <SheetForm key={JSON.stringify(detail.answers)} detail={detail} onSaved={reload} sectionKeys={[section.key]}
            fieldFilter={(f: Field) => f.type === 'criteriaSelection'} showStage={false} />
      ) : (
        <p className="muted">Elementy oceny są stałe (arkusz pierwszej oceny): {criteria.map((c) => c.label).join(', ')}.</p>
      )}
      {criteria.length > 0 && (
        <div className="card">
          <h3>Wskaźniki · {competency?.name ?? '—'}</h3>
          <div className="chips" role="tablist" aria-label="Kryteria">
            {criteria.map((c) => (
              <button key={c.key} type="button" role="tab" aria-selected={c.key === current}
                className={c.key === current ? 'chip-button active' : 'chip-button'} onClick={() => setSelected(c.key)}>{c.label}</button>
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
  { key: 'meets', title: 'Tego oczekuję', tone: 'expect', note: 'na poziomie oczekiwań' },
  { key: 'above', title: 'Tak wygląda więcej', tone: 'more', note: 'powyżej oczekiwań' },
  { key: 'below', title: 'Tego unikaj', tone: 'avoid', note: 'poniżej oczekiwań' },
] as const

/** W04: rozmowa rozpoczynająca — oczekiwania (opisy poziomów wskaźników + przykład) i tematy z § 5 ust. 1. */
export function KickoffStep({ detail, steps, go }: StepProps) {
  const [tab, setTab] = useState<'expectations' | 'topics'>('expectations')
  const firstStage = detail.stages[0]
  const phase = detail.schema.stages?.find((s) => s.key === firstStage?.key)?.phase ?? firstStage?.title
  return (
    <div className="step start-hifi">
      <div className="step-head">
        <h2>{phase}</h2>
        {firstStage?.status === 'Pending' && firstStage.dueTo && (
          <DuePill dueTo={firstStage.dueTo} daysLeft={daysUntil(firstStage.dueTo)} overdue={firstStage.overdue} />
        )}
      </div>
      <div className="start-tabs" role="tablist" aria-label="Rozmowa rozpoczynająca">
        <button type="button" role="tab" aria-selected={tab === 'expectations'} className={tab === 'expectations' ? 'active' : undefined}
          onClick={() => setTab('expectations')}>1. Oczekiwania</button>
        <button type="button" role="tab" aria-selected={tab === 'topics'} className={tab === 'topics' ? 'active' : undefined}
          onClick={() => setTab('topics')}>2. Co omówić</button>
      </div>
      {tab === 'expectations' ? <Expectations detail={detail} /> : <Topics detail={detail} />}
      <div className="step-actions">
        <PdfButton detail={detail} label="Podgląd PDF dla pracownika" />
        <span className="grow" />
        {tab === 'expectations'
          ? <button type="button" onClick={() => setTab('topics')}>Co omówić →</button>
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
  const current = criteria.some((c) => c.key === selected) ? selected : criteria[0]?.key ?? ''
  const competency = detail.schema.competencyModel?.competencies[current]
  const editable = detail.canEdit && detail.stages[0]?.status === 'Pending'

  if (criteria.length === 0) return <p className="muted">Najpierw wybierz kryteria.</p>
  return (
    <>
      <p className="muted">
        Opisy zachowań z modelu kompetencji pokazują pracownikowi, czego oczekujesz. Możesz dopisać przykład z pracy wydziału — pracownik go zobaczy.
      </p>
      {work.error && <p className="muted small">Przykładów nie da się teraz zapisać: {work.error}</p>}
      <div className="chips" role="tablist" aria-label="Kryteria">
        {criteria.map((c) => {
          const indicators = detail.schema.competencyModel!.competencies[c.key].indicators
          const filled = indicators.filter((i) => work.indicator(i.key).expectation).length
          return (
            <button key={c.key} type="button" role="tab" aria-selected={c.key === current}
              className={c.key === current ? 'chip-button active' : 'chip-button'} onClick={() => setSelected(c.key)}>
              {c.label}{filled > 0 && <> · <Icon name="done" /> {filled}<span className="sr-only"> {plural(filled, 'przykład', 'przykłady', 'przykładów')}</span></>}
            </button>
          )
        })}
      </div>
      {competency?.indicators.map((indicator, n) => (
        <div key={indicator.key} className="card start-indicator">
          <p className="muted small">{competency.name} · wskaźnik {n + 1} z {competency.indicators.length}</p>
          <h3>{indicator.text}</h3>
          <div className="start-levels">
            {LEVEL_CARDS.filter((c) => indicator.levels[c.key]).map((c) => {
              const option = scale.find((o) => o.key === c.key)
              return (
                <div key={c.key} className={`start-level ${c.tone}`}>
                  <div className="start-level-head">
                    <strong>{c.title}</strong>
                    {option && <span className="start-level-badge" aria-label={`${option.value} pkt, ${c.note}`}>{option.value}</span>}
                  </div>
                  <span className="small muted">{c.note}</span>
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
    <label className="block-label start-example"><span>Twój przykład z pracy wydziału <span className="muted small">(opcjonalnie, zobaczy go pracownik)</span></span>
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
      'Główne obowiązki pracownika wynikające z opisu stanowiska pracy.',
      `Kryteria oceny: obowiązkowe z arkusza i wybrane dodatkowe (${criteriaOf(detail).map((c) => c.label).join(', ') || 'jeszcze niewybrane'}).`,
      'Oczekiwania przełożonego co do spełniania kryteriów — opisy zachowań z zakładki „Oczekiwania”.',
      'Cele do osiągnięcia przez pracownika — jeśli to uzasadnione.',
    ]
  return (
    <div className="card">
      <h3>Do omówienia{first ? ' na rozmowie wstępnej' : ''}</h3>
      {!first && <p className="muted small">Zakres rozmowy wyznacza rozporządzenie (§ 5 ust. 1).</p>}
      {topics ? <ol className="topics">{topics.map((t) => <li key={t}>{t}</li>)}</ol> : <TopicList topics={fromTemplate!} />}
      {!first && <p className="small">Kryteria tej oceny: {criteriaOf(detail).map((c) => c.label).join(', ') || 'jeszcze niewybrane'}. Oczekiwania — zakładka „Oczekiwania”.</p>}
      <p className="muted small">
        Lista nic nie zapisuje. Potwierdzeniem przeprowadzenia rozmowy i zapoznania pracownika z {first ? 'terminami' : 'kryteriami i terminem sporządzenia oceny'} są
        podpisy {first ? 'w części „Rozmowa wstępna”' : 'w części I arkusza'}{signatureRef ? ` (${signatureRef})` : ''}.
      </p>
    </div>
  )
}

/** W05: część I (dane, kryteria, termin liczony automatycznie) i podpisy; zapis zamyka etap i rozpoczyna okres obserwacji. */
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
  const criteriaStep = steps.find((s) => s.id === 'criteria')

  return (
    <div className="step start-hifi">
      <div className="step-head">
        <h2>{first ? 'Rozmowa wstępna i podpisy' : 'Część I arkusza i podpisy'}</h2>
        {!closed && firstStage?.dueTo && <DuePill dueTo={firstStage.dueTo} daysLeft={daysUntil(firstStage.dueTo)} overdue={firstStage.overdue} />}
      </div>
      {evaluation && (
        <div className="start-deadline" aria-label={first ? 'Okres pierwszej oceny' : 'Termin sporządzenia oceny'}>
          <Icon name="clock" />
          <div className="grow">
            <span className="muted small">{first ? 'Okres pierwszej oceny' : 'Termin sporządzenia oceny'} · widoczny przed podpisem</span>
            <span>
              <strong>{stageDue(detail, evaluation.key)}</strong>
              {evaluation.status === 'Pending' && evaluation.dueTo && <span className="small"> · {daysLabel(daysUntil(evaluation.dueTo), evaluation.overdue)}</span>}
            </span>
          </div>
          <Auto />
        </div>
      )}
      <div className="card">
        <div className="card-head">
          <h3>{first ? 'Arkusz pierwszej oceny · rozmowa wstępna' : `Arkusz ${sheetLetter(detail.templateCode)} · część I`}</h3>
          <PdfButton detail={detail} label="Pobierz PDF do podpisu" />
        </div>
        <dl className="summary start-summary">
          <dt>Pracownik</dt><dd>{detail.employeeName}</dd>
          {criteriaField ? (
            <>
              <dt>Kryteria obowiązkowe</dt><dd>{mandatory.length} (arkusz {sheetLetter(detail.templateCode)}) <Icon name="lock" /></dd>
              <dt>Kryteria dodatkowe</dt>
              <dd>
                {extra.length ? extra.map((c) => c.label).join(', ') : 'brak'}
                {criteriaStep && !closed && <> · <button type="button" className="link" onClick={() => go(criteriaStep.id)}>Zmień</button></>}
              </dd>
            </>
          ) : (
            <><dt>Elementy oceny</dt><dd>{criteria.map((c) => c.label).join(', ')}</dd></>
          )}
          {report && <><dt>Sprawozdanie</dt><dd>{stageDue(detail, report.key)}</dd></>}
          {evaluation && <><dt>{first ? 'Okres pierwszej oceny' : 'Termin sporządzenia oceny'}</dt><dd><strong>{stageDue(detail, evaluation.key)}</strong> <Auto /></dd></>}
          <dt>Oczekiwania dla pracownika</dt>
          <dd>opisy zachowań dla {criteria.length} {first ? plural(criteria.length, 'elementu', 'elementów', 'elementów') : plural(criteria.length, 'kryterium', 'kryteriów', 'kryteriów')}{examples > 0 && ` · ${examples} ${plural(examples, 'przykład', 'przykłady', 'przykładów')} z pracy wydziału`}</dd>
        </dl>
      </div>
      <SheetForm key={JSON.stringify(detail.answers)} detail={detail} onSaved={reload} sectionKeys={sections} showStage={false}
        fieldFilter={(f: Field) => f.type !== 'criteriaSelection' && !(f.type === 'date' && f.prefill?.startsWith('stage:'))} />
      {!closed && <IssueList issues={stageIssues} steps={steps} go={go} />}
      {closed ? (
        <div className="callout"><Icon name="lock" /> Etap zamknięty {fmtDate(firstStage?.completedOn)} — część I jest zablokowana.</div>
      ) : (
        <CompleteStage detail={detail} check={check} stageKey={firstStage!.key} defaultDate={signedDates[signedDates.length - 1]}
          label={first ? 'Zapisz i zamknij rozmowę wstępną →' : 'Zapisz i rozpocznij obserwację →'} onDone={async () => { await reload(); go('notes') }}>
          <p className="callout info">
            {first
              ? <>Po zapisie rozmowa wstępna zostanie zablokowana. Sprawozdanie: {report ? stageDue(detail, report.key) : '—'}, pierwsza ocena: {evaluation ? stageDue(detail, evaluation.key) : '—'}.</>
              : <>Po zapisie część I zostanie zablokowana, a okres obserwacji potrwa do <strong>{fmtDate(evaluation?.dueTo)}</strong>. Data podpisu pracownika to początek okresu oceny.</>}
          </p>
        </CompleteStage>
      )}
    </div>
  )
}
