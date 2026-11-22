import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { api, apiBlobUrl } from '../api'
import { Avatar } from '../Avatar'
import { DateInput } from '../DateInput'
import { SheetForm, SignatureField } from '../Evaluations'
import { AiFrame, Info, Radar, ScaleBar, Source, bandsFromLevels, useStepHeader } from '../v2'
import { SaveButton, useSaveState } from '../v2/motion'
import { CountUp } from './mw-motion'
import { CompleteStage, IssueList, NextButton, PdfButton, type Step, type StepProps } from './common'
import { completeStage, saveAnswers, withoutAutoFilled } from './data'
import {
  FORM_LABELS, accusative, addDays, addMonths, criterionScores, draftIprz, fmtAvg, iprzAreas, type CriterionScore, type IprzForm,
} from './final-model'
import { BranchTimeline, DirectionAnimation, FIcon, LineTimeline, Lock, SheetThumb, type TimelineItem } from './final-visuals'
import {
  RESULT_LABELS, answerOf, valueOf, criteriaFieldOf, emptyAnswer, fmtDate, isFirstTemplate, plural,
  scoresFieldOf, sheetLetter, today, type CheckIssue, type Cond, type Detail, type Field, type Section,
} from './types'
import './final-hifi.css'

const roleOfEvaluator = (f: Field) => f.type === 'signature' && f.role !== 'evaluated'
const legal = (ref?: string | null) => (ref ? (ref.includes('ustawy') ? `Ustawa o służbie cywilnej · ${ref.replace(/\s*ustawy\s*$/, '')}` : `Rozp. 2016 · ${ref}`) : null)

/** Etykieta opcji pola wyboru liczonego przez backend (np. „sprawozdanie w terminie” z etapu sprawozdania). */
function autoChoice(detail: Detail, field: Field): string | null {
  const value = valueOf(detail, field.key)?.valueText
  return value ? field.options?.find((o: { value: string }) => o.value === value)?.label ?? value : null
}

/** Pola wyboru liczone poza wynikiem (np. sprawozdanie w terminie) — z kłódką, bez edycji. */
function AutoChoices({ detail, sections }: { detail: Detail; sections: string[] }) {
  const fields = detail.schema.sections.filter((s) => sections.includes(s.key)).flatMap((s) => s.fields)
    .filter((f) => f.computed && f.type === 'choice' && f.key !== detail.schema.scoring?.result)
  if (fields.length === 0) return null
  return (
    <div className="card final-autos">
      {fields.map((f) => (
        <p key={f.key}>
          <Lock /> <span>{f.label}</span> <strong>{autoChoice(detail, f)?.toLowerCase() ?? '—'}</strong>
          {f.hint && <Info>{f.hint}</Info>}
        </p>
      ))}
    </div>
  )
}

/** Wartość pola do warunków widoczności: wynik i poziom liczy backend (scoring), reszta z odpowiedzi. */
function condValue(detail: Detail, fieldKey: string): string | null {
  if (fieldKey === detail.schema.scoring?.result) return detail.scoring?.result ?? null
  if (fieldKey === detail.schema.scoring?.level) return detail.scoring?.level ?? null
  return answerOf(detail, fieldKey)?.valueText ?? null
}
const visibleIn = (detail: Detail, c?: Cond) => !c || c.in.includes(condValue(detail, c.field) ?? '')

/** Dlaczego ocena jest negatywna: niespełnione warunki z szablonu (scoring.positiveWhen), słowami. */
function negativeReasons(detail: Detail): string[] {
  const s = detail.scoring
  const schema = detail.schema
  const scores = scoresFieldOf(schema)
  if (s?.result !== 'negative' || !scores) return []
  const values = criterionScores(detail).map((c) => ({ label: c.label, v: c.value }))
  const reasons: string[] = []
  for (const rule of schema.scoring?.positiveWhen ?? []) {
    if (rule.rule === 'levelIn' && s.level && !(rule.values ?? []).includes(s.level)) {
      reasons.push(`średnia ${s.average != null ? fmtAvg(s.average) : '–'} to poziom „${s.levelLabel?.toLowerCase() ?? s.level}”`)
    } else if (rule.rule === 'maxCountOfScore' && rule.score != null) {
      const hits = values.filter((x) => x.v === rule.score)
      if (hits.length > (rule.count ?? 0)) {
        reasons.push(`${hits.length} ${plural(hits.length, 'ocena', 'oceny', 'ocen')} ${rule.score} pkt (${hits.map((h) => h.label.toLowerCase()).join(', ')})`)
      }
    } else if (rule.rule === 'minAverage' && rule.value != null && s.average != null && s.average < rule.value) {
      reasons.push(`średnia ${fmtAvg(s.average)} poniżej ${rule.value}`)
    } else if (rule.rule === 'fieldIn' && rule.field) {
      const field = schema.sections.flatMap((x) => x.fields).find((f) => f.key === rule.field)
      const value = valueOf(detail, rule.field)?.valueText
      if (!value || !(rule.values ?? []).includes(value)) {
        const label = value ? field?.options?.find((o: { value: string }) => o.value === value)?.label ?? value : 'brak'
        reasons.push(`${field?.label ?? rule.field}: ${label.toLowerCase()}`)
      }
    }
  }
  return reasons
}

/* ================================================================== wynik (H10, H12, widok ocenianego) */

/** Wynik jako bohater: duża średnia, poziom słownie, wynik jako jasna pigułka, trend względem poprzedniej oceny, skala 1–9. */
export function ResultFigure({ detail, compact = false }: { detail: Detail; compact?: boolean }) {
  const s = detail.scoring
  const first = isFirstTemplate(detail.templateCode)
  const bands = bandsFromLevels(detail.schema.scoring?.levels)
  const reasons = negativeReasons(detail)
  const prev = detail.previous
  const avgField = detail.schema.sections.flatMap((x) => x.fields).find((f) => f.key === detail.schema.scoring?.average)
  const resultField = detail.schema.sections.flatMap((x) => x.fields).find((f) => f.key === detail.schema.scoring?.result)
  const scored = criterionScores(detail)
  const rated = scored.filter((c) => c.value != null).length
  return (
    <div className={`final-figure${compact ? ' compact' : ''}`}>
      <div className="final-figure-top">
        <div className="final-avg">
          <span className="final-avg-label"><Lock /> {first ? 'Ocena łączna' : 'Średnia'}
            {legal(avgField?.legalRef) && <Source refText={legal(avgField?.legalRef)!} />}</span>
          <strong className={`final-avg-value${s?.average == null ? ' empty' : ''}`} aria-live="polite"><CountUp value={s?.average ?? null} format={fmtAvg} /></strong>
        </div>
        <div className="final-verdict">
          {s?.levelLabel
            ? <p className="final-level">{s.levelLabel}</p>
            : <p className="final-level muted">Oceniono {rated} z {scored.length}</p>}
          <div className="final-verdict-row">
            {s?.result === 'positive' && <span className="final-result positive"><FIcon name="check" /> Ocena pozytywna</span>}
            {s?.result === 'negative' && (
              <span className="final-result negative"><FIcon name="minus" /> Ocena negatywna
                {reasons.length > 0 && <Info label="Dlaczego negatywna" align="start">{reasons.join('; ')}.</Info>}
              </span>
            )}
            {s?.result && legal(resultField?.legalRef) && <Source refText={legal(resultField?.legalRef)!} />}
            {prev && (
              <span className="final-trend">
                {prev.date.slice(0, 4)}: {prev.average != null ? fmtAvg(prev.average) : (prev.result ? RESULT_LABELS[prev.result]?.toLowerCase() : '—')}
                {prev.average != null && s?.average != null && s.average !== prev.average && <FIcon name="up" size={14} />}
                <Info label="Poprzednia ocena" align="end">
                  {[prev.result && RESULT_LABELS[prev.result]?.toLowerCase(), prev.levelLabel?.toLowerCase(), fmtDate(prev.date)].filter(Boolean).join(' · ')}
                </Info>
              </span>
            )}
          </div>
        </div>
      </div>
      {!first && (
        <div className="final-scale">
          <ScaleBar value={s?.average ?? null} bands={bands} labels="active" />
          {!compact && (
            <Info label="Granica przedziału" align="end">
              Wartość graniczna należy do niższego przedziału, np. 6,00 to „na poziomie oczekiwań” (§ 11 ust. 1 pkt 2).
            </Info>
          )}
        </div>
      )}
    </div>
  )
}

/** Radar ocen cząstkowych z wartościami przy nazwach osi. `onPick` = klik w oś (np. „Zmień” ocenę). */
export function ScoresRadar({ scores, size = 210, onPick }: { scores: CriterionScore[]; size?: number; onPick?: (c: CriterionScore) => void }) {
  if (scores.length < 3) {
    return (
      <ul className="final-score-list">
        {scores.map((c) => <li key={c.key}><span>{c.short}</span><strong>{c.value ?? '–'}</strong></li>)}
      </ul>
    )
  }
  const axes = scores.map((c) => `${c.additional ? '+ ' : ''}${c.short} ${c.value ?? '–'}`)
  return (
    <div className={onPick ? 'final-radar pickable' : 'final-radar'}
      onClick={onPick ? (e) => {
        const label = (e.target as Element).closest('text.v2-radar-label')
        if (!label) return
        const index = [...e.currentTarget.querySelectorAll('text.v2-radar-label')].indexOf(label)
        if (index >= 0) onPick(scores[index])
      } : undefined}>
      <Radar axes={axes} series={[{ name: 'Oceny cząstkowe', values: scores.map((c) => c.value) }]} size={size} showValues={false}
        title={scores.map((c) => `${c.label}: ${c.value ?? 'brak'}`).join('; ')} />
    </div>
  )
}

/* ================================================================== H10 */

const SHORT_FIELD: Record<string, string> = {
  developmentConclusions: 'Wnioski do IPRZ', justification: 'Uzasadnienie', evaluationInterviewDate: 'Rozmowa',
  evaluationPeriod: 'Okres', scores: 'Oceny cząstkowe', promotionRequest: 'Kolejny stopień',
}
const fieldName = (f: Field) => SHORT_FIELD[f.key] ?? f.label ?? f.key
const isIprz = (f: Field) => f.key.toLowerCase().includes('development')
const isPromotion = (f: Field) => f.type === 'choice' && !f.computed && f.legalRef?.includes('§ 11 ust. 5') && (f.options ?? []).some((o: { value: string }) => o.value === 'yes')

const FORM_ICON: Record<IprzForm, 'book' | 'task' | 'people'> = { training: 'book', task: 'task', mentoring: 'people' }

/** Uzasadnienie, wnioski do IPRZ (oficjalne pole + propozycja asystenta), wniosek o stopień i pasek akcji. */
function ResultForm({ detail, fields, promotion, steps, go, reload }: {
  detail: Detail
  fields: Field[]
  promotion: Field | undefined
  steps: Step[]
  go: (id: string) => void
  reload: () => Promise<void>
}) {
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((f) => [f.key, answerOf(detail, f.key)?.valueText ?? ''])))
  const [status, setStatus] = useState('')
  const [dirty, setDirty] = useState(false)
  const saver = useSaveState()
  const busy = saver.state === 'saving'
  const [draft, setDraft] = useState<'shown' | 'rejected'>('shown')
  const section = detail.schema.sections.find((s) => s.fields.some((f) => fields.includes(f)))
  const locked = !!section && detail.lockedSections.includes(section.key)
  const editable = detail.canEdit && !locked
  const negative = detail.scoring?.result === 'negative'
  const iprzField = fields.find(isIprz)
  const others = fields.filter((f) => f !== iprzField)
  const proposal = iprzField ? draftIprz(detail) : null
  const showProposal = editable && !!proposal && draft === 'shown' && !values[iprzField!.key]?.trim()
  const next = steps[steps.findIndex((s) => s.id === 'result') + 1]

  const set = (key: string, value: string) => { setValues((v) => ({ ...v, [key]: value })); setDirty(true); setStatus('') }

  // Karta 13: „Zapisz szkic” → kropki (po 300 ms) → „Zapisano ✓” przez 1,5 s; błąd zostaje jako komunikat obok.
  async function save(): Promise<boolean> {
    setStatus('')
    try {
      await saver.run(async () => {
        await saveAnswers(detail.id, fields.map((f) => ({ ...emptyAnswer(f.key, null), valueText: values[f.key] ?? '' })))
        setDirty(false)
        await reload()
      })
      return true
    } catch (e) {
      setStatus((e as Error).message)
      return false
    }
  }

  const requiredNow = (f: Field) => !!f.required || (!!f.requiredWhen && visibleIn(detail, f.requiredWhen))
  const tagOf = (f: Field) => requiredNow(f) ? (f.required ? null : 'wymagane') : f.requiredWhen ? 'zalecane' : 'opcjonalne'
  const head = (f: Field, id: string) => (
    <div className="final-field-head">
      <label htmlFor={id}>{fieldName(f)}{requiredNow(f) && f.required && <span aria-hidden="true"> *</span>}</label>
      {tagOf(f) && <span className={`final-tag${tagOf(f) === 'wymagane' ? ' strong' : ''}`}>{tagOf(f)}</span>}
      {legal(f.legalRef) && (f === iprzField || requiredNow(f)) && <Source refText={legal(f.legalRef)!} />}
    </div>
  )

  return (
    <>
      <div className="final-h10-grid">
        <div className="final-h10-col">
          {others.map((f) => (
            <section key={f.key} className="card final-field">
              {head(f, `final-${f.key}`)}
              <textarea id={`final-${f.key}`} rows={5} value={values[f.key] ?? ''} disabled={!editable} required={requiredNow(f)}
                onChange={(e) => set(f.key, e.target.value)}
                placeholder={negative ? 'Konkretne zachowania z okresu oceny, które zdecydowały o ocenie.' : 'Np. rzetelnie stosuje procedury; terminowość poprawiła się w drugim roku.'} />
            </section>
          ))}
          {promotion && <PromotionField detail={detail} field={promotion} reload={reload} />}
        </div>
        {iprzField && (
          <section className="card final-field final-iprz">
            {head(iprzField, `final-${iprzField.key}`)}
            <textarea id={`final-${iprzField.key}`} rows={showProposal ? 2 : 6} value={values[iprzField.key] ?? ''} disabled={!editable}
              required onChange={(e) => set(iprzField.key, e.target.value)} placeholder="Obszar rozwoju i forma" />
            {showProposal && proposal && (
              <AiFrame label={null} compact className="final-iprz-ai"
                aside={<span className="final-ai-basis">z ocen wskaźników<Info align="end" label="Podstawa propozycji">{proposal.basis.join('; ')}. Opisy zachowań z modelu kompetencji.</Info></span>}
                onInsert={() => set(iprzField.key, proposal.text)}
                onEdit={() => {
                  set(iprzField.key, proposal.text)
                  requestAnimationFrame(() => document.getElementById(`final-${iprzField.key}`)?.focus())
                }}
                onReject={() => setDraft('rejected')}>
                <ul className="final-areas">
                  {proposal.areas.map((a) => (
                    <li key={a.criterion + a.indicator}>
                      <span className="final-area-forms">
                        {a.forms.map((f) => <span key={f} className="final-form-icon" title={FORM_LABELS[f]}><FIcon name={FORM_ICON[f]} size={18} /></span>)}
                      </span>
                      <span className="final-area-text">
                        <strong>{a.criterion}</strong>
                        <span>{a.indicator} · {a.forms.map((f) => FORM_LABELS[f]).join(' + ')}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </AiFrame>
            )}
          </section>
        )}
      </div>
      <div className="step-actions final-actions">
        {editable && <SaveButton state={saver.state} className="secondary" onClick={() => { if (dirty) void save() }} disabled={!busy && saver.state !== 'saved' && !dirty}>Zapisz szkic</SaveButton>}
        {status && <span className="error small" role="alert">{status}</span>}
        {locked && <span className="muted small"><Lock /> Ocena sporządzona</span>}
        <span className="grow" />
        {next && (
          <button type="button" disabled={busy} onClick={async () => { if (!dirty || await save()) go(next.id) }}>
            {next.title} <FIcon name="arrow" />
          </button>
        )}
      </div>
    </>
  )
}

/** Wniosek o kolejny stopień: pole arkusza (Tak / Nie / Nie dotyczy). „Tak” tylko przy ocenie pozytywnej. Zapis od razu. */
function PromotionField({ detail, field, reload }: { detail: Detail; field: Field; reload: () => Promise<void> }) {
  const [value, setValue] = useState<string | null>(answerOf(detail, field.key)?.valueText ?? null)
  const [error, setError] = useState('')
  const section = detail.schema.sections.find((s) => s.fields.includes(field))
  const editable = detail.canEdit && !(section && detail.lockedSections.includes(section.key))
  const positive = detail.scoring?.result === 'positive'
  const options: { value: string; label: string }[] = (field.options ?? []).map((o: { value: string; label: string }) => ({
    value: o.value, label: o.value === 'not_applicable' ? 'Nie dotyczy' : o.label,
  }))
  async function pick(v: string) {
    if (!editable || v === value) return
    const before = value
    setValue(v)
    try {
      await saveAnswers(detail.id, [{ ...emptyAnswer(field.key, null), valueText: v }])
      setError('')
      await reload()
    } catch (e) {
      setValue(before)
      setError((e as Error).message)
    }
  }
  return (
    <section className="card final-promo">
      <span className="final-promo-title" id={`final-${field.key}-label`}>Wniosek o stopień</span>
      <Info label="Kiedy wniosek">Tylko urzędnik służby cywilnej z oceną pozytywną. Wniosek jest fakultatywny; „Nie dotyczy” dla pracownika służby cywilnej.</Info>
      {legal(field.legalRef) && <Source refText={legal(field.legalRef)!} />}
      <span className="grow" />
      <span className="final-seg" role="radiogroup" aria-labelledby={`final-${field.key}-label`}>
        {options.map((o) => {
          const blocked = o.value === 'yes' && !positive
          return (
            <button key={o.value} type="button" role="radio" aria-checked={value === o.value}
              className={value === o.value ? 'active' : undefined} disabled={!editable || blocked}
              title={blocked ? 'Tylko przy ocenie pozytywnej' : undefined} onClick={() => pick(o.value)}>
              {o.label}
            </button>
          )
        })}
      </span>
      {error && <p role="alert" className="error small wide">{error}</p>}
    </section>
  )
}

/** W10 / H10: wynik jako bohater, radar ocen cząstkowych, uzasadnienie, wnioski do IPRZ, wniosek o stopień. */
export function ResultStep({ detail, steps, go, reload, sections, title }: StepProps & { sections: string[]; title: string }) {
  const schema = detail.schema
  const scores = scoresFieldOf(schema)
  const scoresStep = steps.find((s) => scores && s.sections.includes(scores.section.key))
  const first = isFirstTemplate(detail.templateCode)
  const heading = first ? title : 'Przyznanie oceny i IPRZ'
  useStepHeader(heading)
  const resultSection = schema.sections.find((x) => sections.includes(x.key) && x.fields.some((f) => f.key === schema.scoring?.result))
  const textFields = (resultSection?.fields ?? []).filter((f) => f.type === 'longText' && !f.computed && visibleIn(detail, f.visibleWhen))
  const ownKeys = new Set((resultSection?.fields ?? []).filter((f) => f.type === 'longText' && !f.computed).map((f) => f.key))
  const promotion = schema.sections.filter((s) => sections.includes(s.key)).flatMap((s) => s.fields).find(isPromotion)
  const criteria = criterionScores(detail)
  const missing = criteria.filter((c) => c.value == null).length

  return (
    <div className="step final-hifi final-h10">
      <h2 className="sr-only">{heading}</h2>
      {scores && (
        <section className="card final-hero" aria-label="Wynik oceny">
          <ResultFigure detail={detail} />
          <div className="final-hero-radar">
            <p className="final-card-title">Oceny cząstkowe</p>
            <ScoresRadar scores={criteria} size={130} onPick={scoresStep ? () => go(scoresStep.id) : undefined} />
            {scoresStep && (
              <button type="button" className="link final-change" onClick={() => go(scoresStep.id)}>
                <FIcon name="pencil" /> {missing ? `Oceń brakujące (${missing})` : 'Zmień oceny'}
              </button>
            )}
          </div>
        </section>
      )}
      <AutoChoices detail={detail} sections={sections} />
      {resultSection && textFields.length > 0 && (
        <ResultForm key={`${detail.id}:${textFields.map((f) => f.key).join(',')}`} detail={detail} fields={textFields}
          promotion={promotion} steps={steps} go={go} reload={reload} />
      )}
      <SheetForm key={JSON.stringify(detail.answers)} detail={detail} onSaved={reload} sectionKeys={sections} showStage={false}
        fieldFilter={(f: Field) => !f.computed && !ownKeys.has(f.key) && f !== promotion && !f.prefill?.startsWith('previous.')} />
      {!(resultSection && textFields.length > 0) && (
        <div className="step-actions"><span className="grow" /><NextButton steps={steps} current="result" go={go} label="Sprawdź i podpisz" /></div>
      )}
    </div>
  )
}

/* ================================================================== H11 */

type Row = {
  key: string
  label: string
  value: ReactNode
  state: 'ok' | 'missing' | 'locked' | 'empty'
  required: boolean
  step?: Step
  /** Zablokowane (wyliczone / z poprzedniej oceny / etap zamknięty): kłódka bez ołówka. */
  locked: boolean
}

function fieldValue(detail: Detail, field: Field): ReactNode {
  const a = answerOf(detail, field.key)
  if (field.type === 'scores') {
    const values = criterionScores(detail).map((c) => c.value)
    return values.every((v) => v == null) ? null : values.map((v) => v ?? '–').join(' · ')
  }
  switch (field.type) {
    case 'date': return a?.valueDate ? fmtDate(a.valueDate) : null
    case 'dateRange': return a?.valueDate ? `${fmtDate(a.valueDate)} – ${a.valueDateTo ? fmtDate(a.valueDateTo) : 'podpis'}` : null
    case 'longText':
      if (!a?.valueText?.trim()) return null
      if (isIprz(field)) { const n = iprzAreas(a.valueText); return `${n} ${plural(n, 'obszar', 'obszary', 'obszarów')}` }
      return 'uzupełnione'
    case 'choice': return a?.valueText ? (field.options?.find((o: { value: string }) => o.value === a.valueText)?.label ?? a.valueText).toLowerCase() : null
    case 'year': return a?.valueNumber ?? null
    case 'person': return null
    default: return a?.valueText ?? null
  }
}

/** Lista gotowości do podpisu z `/check` i odpowiedzi: wiersze sekcji etapu oceny + kryteria, wynik i poprzednia ocena. */
function readinessRows(detail: Detail, steps: Step[], stageKey: string, issues: CheckIssue[], visibleSection: (key: string) => boolean): Row[] {
  const schema = detail.schema
  const closed = detail.stages.find((s) => s.key === stageKey)?.status !== 'Pending'
  const stepOf = (section: Section) => steps.find((s) => s.sections.includes(section.key))
  const blockingFor = (fieldKey: string) => issues.some((i) => i.blocking && i.fieldKey === fieldKey)
  const rows: Row[] = []

  const criteriaField = criteriaFieldOf(schema)
  const criteria = criterionScores(detail)
  if (criteria.length) {
    const criteriaStage = detail.stages.find((s) => schema.sections.some((x) => x.stage === s.key && x.fields.includes(criteriaField!)))
    const extra = criteria.filter((c) => c.additional).length
    rows.push({
      key: 'criteria', label: isFirstTemplate(detail.templateCode) ? 'Elementy oceny' : 'Kryteria',
      value: extra ? `${criteria.length - extra} + ${extra} ${plural(extra, 'dodatkowe', 'dodatkowe', 'dodatkowych')}` : `${criteria.length}`,
      state: 'locked', required: false, locked: !criteriaStage || criteriaStage.status !== 'Pending',
      step: steps.find((s) => s.id === 'criteria'),
    })
  }

  let resultDone = false
  let previousDone = false
  for (const section of schema.sections.filter((s) => s.stage === stageKey && visibleSection(s.key))) {
    const fields = section.fields.filter((f) => !['signature', 'notice', 'indicatorScores', 'person'].includes(f.type) && visibleIn(detail, f.visibleWhen))
    if (fields.length === 0) continue
    const step = stepOf(section)
    // Sekcja z wieloma polami (np. wniosek o stopień, cz. III) jako jeden wiersz.
    if (fields.length > 3 && !fields.some((f) => f.computed || f.prefill?.startsWith('previous.'))) {
      const missing = fields.some((f) => blockingFor(f.key))
      rows.push({ key: section.key, label: section.title.replace(/\s*\(.*\)$/, ''), value: missing ? 'do uzupełnienia' : 'uzupełnione',
        state: missing ? 'missing' : 'ok', required: true, step, locked: closed })
      continue
    }
    for (const f of fields) {
      if (f.prefill?.startsWith('previous.')) {
        if (previousDone) continue
        previousDone = true
        const p = detail.previous
        rows.push({ key: 'previous', label: 'Poprzednia ocena', locked: true, required: false, state: 'locked',
          value: p ? [p.result && RESULT_LABELS[p.result]?.toLowerCase(), p.levelLabel?.toLowerCase().replace(/\s*oczekiwań$/, ''), fmtDate(p.date)].filter(Boolean).join(' · ') : 'brak w systemie' })
        continue
      }
      if (f.computed && [schema.scoring?.average, schema.scoring?.level, schema.scoring?.result].includes(f.key)) {
        if (resultDone) continue
        resultDone = true
        const s = detail.scoring
        const missing = !s?.result
        rows.push({ key: 'result', label: 'Wynik', locked: true, required: true, state: missing ? 'missing' : 'ok',
          value: s?.average != null ? `${fmtAvg(s.average)} · ${s.levelLabel?.toLowerCase() ?? ''}` : 'po wszystkich ocenach' })
        continue
      }
      if (f.computed) {
        rows.push({ key: f.key, label: fieldName(f), locked: true, required: false, state: 'locked', value: autoChoice(detail, f)?.toLowerCase() ?? '—' })
        continue
      }
      const required = !!f.required || (!!f.requiredWhen && visibleIn(detail, f.requiredWhen))
      const value = fieldValue(detail, f)
      const missing = blockingFor(f.key) || (required && value == null)
      rows.push({ key: f.key, label: fieldName(f), value, required, step, locked: closed,
        state: missing ? 'missing' : value == null ? 'empty' : 'ok' })
    }
  }
  return rows
}

/** Krok kreatora, w którym da się naprawić brak: po sekcji, a dla braków etapu (np. „najpierw zamknij etap…”) po tytule etapu. */
function fixStep(detail: Detail, steps: Step[], issue: CheckIssue): Step | undefined {
  if (issue.sectionKey) return steps.find((s) => s.sections.includes(issue.sectionKey!))
  const stage = detail.stages.find((s) => s.status === 'Pending' && issue.message.includes(s.title))
  return stage ? steps.filter((s) => s.stageKey === stage.key).pop() : undefined
}

const stripPart = (m: string) => m.replace(/\s*\(cz\.\s*[IVX]+\)\s*$/, '')

/** W11: blokady z `GET /check` jako jedna karta do naprawy: „!”, granatowy obrys, „Uzupełnij →”. */
function FixCard({ detail, issues, rows, steps, go, cardRef }: {
  detail: Detail; issues: CheckIssue[]; rows: Row[]; steps: Step[]; go: (id: string) => void; cardRef: RefObject<HTMLDivElement | null>
}) {
  const [issue, ...rest] = issues
  const row = rows.find((r) => r.key === issue.fieldKey)
  const text = row && issue.message.startsWith('Brak:') ? `${row.label}: brak` : stripPart(issue.message)
  const step = fixStep(detail, steps, issue)
  return (
    <div className="final-fix" role="alert" ref={cardRef} tabIndex={-1}>
      <span className="final-fix-icon" aria-hidden="true">!</span>
      <p className="final-fix-text">
        <strong>{text}</strong>
        {legal(issue.legalRef) && <Source refText={legal(issue.legalRef)!} />}
        {rest.length > 0 && (
          <span className="final-fix-more">
            +{rest.length}
            <Info label={`Jeszcze ${rest.length} do uzupełnienia`} align="start">{rest.map((i) => stripPart(i.message)).join('; ')}.</Info>
          </span>
        )}
      </p>
      {step && <button type="button" onClick={() => go(step.id)}>Uzupełnij <FIcon name="arrow" /></button>}
    </div>
  )
}

function Readiness({ rows, go, closed }: { rows: Row[]; go: (id: string) => void; closed: boolean }) {
  const required = rows.filter((r) => r.required)
  const done = required.filter((r) => r.state === 'ok').length
  return (
    <section className="card final-ready-card" aria-labelledby="final-ready-title">
      <div className="final-ready-head">
        <h3 id="final-ready-title">Gotowość</h3>
        <strong aria-label={`${done} z ${required.length} wymaganych`}>{done}/{required.length}</strong>
      </div>
      <div className="final-bar" aria-hidden="true"><span style={{ width: `${required.length ? (done / required.length) * 100 : 100}%` }} /></div>
      <ul className="final-rows">
        {rows.map((r) => {
          const icon = r.state === 'missing' ? 'missing' : r.locked && r.state !== 'ok' ? 'locked' : r.state === 'ok' || r.state === 'empty' ? 'ok' : 'locked'
          const showLock = r.locked && (r.state === 'locked' || r.key === 'result')
          return (
            <li key={r.key} className={r.state === 'missing' ? 'missing' : undefined}>
              <span className={`final-row-icon ${showLock && r.state !== 'missing' ? 'locked' : icon}`}>
                {r.state === 'missing' ? <FIcon name="alert" size={14} /> : showLock ? <Lock size={14} /> : <FIcon name="check" size={14} />}
                <span className="sr-only">{r.state === 'missing' ? 'do uzupełnienia' : showLock ? 'zablokowane' : 'gotowe'}</span>
              </span>
              <span className="final-row-label">{r.label}</span>
              <span className="final-row-value">{r.value ?? (r.state === 'missing' ? 'brak' : '—')}</span>
              {!r.required && r.state !== 'locked' && !r.locked && <span className="final-row-opt">opcjonalne</span>}
              {r.step && !r.locked && !closed
                ? <button type="button" className="final-pencil" aria-label={`Zmień: ${r.label}`} onClick={() => go(r.step!.id)}><FIcon name="pencil" /></button>
                : <span className="final-pencil-space" />}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** Miniatura arkusza z podglądem (PDF w nowej karcie) i pobraniem. */
function SheetCard({ detail }: { detail: Detail }) {
  const [error, setError] = useState('')
  const s = detail.scoring
  const first = isFirstTemplate(detail.templateCode)
  async function preview() {
    const tab = window.open('', '_blank')
    const url = await apiBlobUrl(`evaluations/${detail.id}/pdf`).catch(() => null)
    if (url && tab) tab.location.href = url
    else { tab?.close(); setError('Podgląd niedostępny.') }
  }
  return (
    <section className="card final-sheet">
      <button type="button" className="final-thumb-button" onClick={preview} aria-label="Podgląd arkusza (PDF)"><SheetThumb /></button>
      <div className="final-sheet-body">
        <h3>{first ? 'Arkusz pierwszej oceny' : `Arkusz ${sheetLetter(detail.templateCode) ?? ''}`}</h3>
        <strong className="final-sheet-avg"><CountUp value={s?.average ?? null} format={fmtAvg} /></strong>
        <span>{s?.levelLabel?.toLowerCase() ?? 'wynik po ocenach cząstkowych'}</span>
        <div className="final-sheet-actions">
          <button type="button" className="secondary" onClick={preview}><FIcon name="eye" /> Podgląd</button>
          <PdfButton detail={detail} label="PDF" />
        </div>
        {error && <p role="alert" className="error small">{error}</p>}
      </div>
    </section>
  )
}

/** W11 / H11: karta do naprawy, gotowość n/m, miniatura arkusza, podpis z kłódką i „Co dalej”. */
export function ReviewStep({ detail, check, steps, go, reload, sections }: StepProps & { sections: string[] }) {
  useStepHeader('Sprawdź i podpisz')
  const reviewStep = steps.find((s) => s.id === 'review')!
  const stageKey = reviewStep.stageKey!
  const stage = detail.stages.find((s) => s.key === stageKey)
  const stageCheck = check?.stages.find((s) => s.key === stageKey)
  // Braki, które uzupełni zamknięcie etapu (podpowiedzi: imię i nazwisko oceniającego, terminy), nie blokują.
  const issues = withoutAutoFilled(detail, stageKey, stageCheck?.issues ?? [])
  const signatureFields = detail.schema.sections.filter((s) => sections.includes(s.key)).flatMap((s) => s.fields).filter((f) => f.type === 'signature')
  const unsigned = (f: Field) => !detail.signatures.some((s) => s.fieldKey === f.key)
  // Podpisy z tego kroku są niżej; reszta braków (też podpisy z innych kroków) blokuje podpis oceniającego.
  const isSignatureIssue = (fieldKey: string | null) => signatureFields.some((f) => f.key === fieldKey)
  const otherBlocking = issues.filter((i) => i.blocking && !isSignatureIssue(i.fieldKey))
  const warnings = issues.filter((i) => !i.blocking && !isSignatureIssue(i.fieldKey))
  // Ostatni podpis po stronie oceniającego zamyka etap („Podpisz i sporządź ocenę”), jeśli poza nim nic nie blokuje.
  const finalField = [...signatureFields].reverse().find((f) => roleOfEvaluator(f) && unsigned(f))
  const blockingExceptFinal = issues.filter((i) => i.blocking && i.fieldKey !== finalField?.key)
  const first = isFirstTemplate(detail.templateCode)
  const closed = stage?.status !== 'Pending'
  const ready = otherBlocking.length === 0
  const [signing, setSigning] = useState(false)
  const fixRef = useRef<HTMLDivElement>(null)
  const visibleSection = (key: string) => check?.sections.find((c) => c.key === key)?.visible !== false
  const rows = readinessRows(detail, steps, stageKey, issues, visibleSection)
  const negative = detail.scoring?.result === 'negative'
  const nextCycleDue = addDays(today(), negative ? 7 : 30)
  const signLabel = first ? 'Podpisz i dokonaj oceny' : 'Podpisz i sporządź ocenę'

  const signCard = !closed && detail.canEdit && (
    <section className={`card final-signcard${ready ? ' ready' : ''}`}>
      {finalField || signatureFields.some(unsigned) ? (
        <>
          <button type="button" className={`final-gate${ready ? '' : ' locked'}`} aria-disabled={!ready || undefined}
            aria-expanded={ready ? signing : undefined}
            onClick={() => (ready ? setSigning((v) => !v) : fixRef.current?.focus())}>
            {signLabel} <Lock open={ready} size={18} />
          </button>
          {ready
            ? <p className="final-sign-note">Po podpisie ocena jest zablokowana.</p>
            : <button type="button" className="link final-sign-missing" onClick={() => fixRef.current?.focus()}>
                {otherBlocking.length} do uzupełnienia <FIcon name="up" size={14} />
              </button>}
          {ready && signing && (
            <div className="final-sign-form">
              <SheetForm key={JSON.stringify(detail.answers)} detail={detail} onSaved={reload} sectionKeys={sections} showStage={false}
                fieldFilter={(f: Field) => f.type !== 'signature' && f.type !== 'person'} />
              {signatureFields.map((f) => (
                <SignatureField key={f.key} field={f} detail={detail} onSigned={reload} locked={closed}
                  blockedReason={roleOfEvaluator(f) && otherBlocking.length ? 'Najpierw uzupełnij braki z listy.' : undefined}
                  {...(f === finalField && blockingExceptFinal.length === 0 && detail.canEdit
                    ? { submitLabel: signLabel, afterSign: (signedOn: string) => completeStage(detail, stageKey, signedOn) }
                    : {})} />
              ))}
            </div>
          )}
        </>
      ) : (
        <CompleteStage detail={detail} check={check} stageKey={stageKey} label={first ? 'Dokonaj oceny' : 'Sporządź ocenę'}
          defaultDate={detail.signatures.map((s) => s.signedOn).sort().pop()} onDone={async () => { await reload(); go('ack') }} />
      )}
      {!first && (
        <>
          <div className="final-next-head">
            <h3>Co dalej</h3>
            <Info align="end" label="Terminy po podpisie">Data podpisu to dzień 0 nowego cyklu: rozmowa rozpoczynająca w ciągu {negative ? 7 : 30} dni. Sprzeciw: 7 dni od zapoznania.</Info>
          </div>
          <BranchTimeline person={{ id: detail.employeeId, name: detail.employeeName }} nextCycle={<>Nowy cykl · do {fmtDate(nextCycleDue)}</>} />
        </>
      )}
    </section>
  )

  return (
    <div className="step final-hifi final-h11">
      <h2 className="sr-only">Sprawdź i podpisz</h2>
      <div className="final-h11-grid">
        <div className="final-h11-main">
          {!closed && otherBlocking.length > 0 && <FixCard detail={detail} issues={otherBlocking} rows={rows} steps={steps} go={go} cardRef={fixRef} />}
          <Readiness rows={rows} go={go} closed={closed} />
          {!closed && warnings.length > 0 && (
            <div className="final-warnings">
              <strong>Do sprawdzenia</strong>
              <ul>{warnings.map((w, n) => <li key={n}>{stripPart(w.message)}{legal(w.legalRef) && <Source refText={legal(w.legalRef)!} />}</li>)}</ul>
            </div>
          )}
        </div>
        <div className="final-h11-side">
          {ready && signCard}
          <SheetCard detail={detail} />
          {!ready && signCard}
          {closed && (
            <section className="card final-closed">
              <p><span className="final-row-icon ok"><FIcon name="check" size={14} /></span> <strong>Ocena {first ? 'dokonana' : 'sporządzona'} {fmtDate(stage?.completedOn)}</strong></p>
              <NextButton steps={steps} current="review" go={go} />
            </section>
          )}
          {!closed && !detail.canEdit && <p className="muted small"><Lock /> Podpisuje oceniający.</p>}
        </div>
      </div>
    </div>
  )
}

/* ================================================================== H12 */

/** Odmowa podpisu: API jej nie obsługuje — link pokazuje dymek z instrukcją (adnotacja na arkuszu). */
function RefusalHint({ firstName }: { firstName: string }) {
  const [open, setOpen] = useState(false)
  return (
    <span className="v2-tipwrap final-refusal" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button type="button" className="link" aria-describedby="final-refusal-tip" aria-expanded={open}
        onClick={() => setOpen((v) => !v)} onBlur={() => setOpen(false)} onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}>
        {firstName} odmawia podpisu
      </button>
      <span role="tooltip" id="final-refusal-tip" className="v2-tip v2-tip-start" data-open={open || undefined}>
        Odnotuj odmowę na arkuszu: adnotacja z datą i Twoim podpisem. Zapoznanie zapisz z tą datą; od niej liczy się 7 dni na sprzeciw.
      </span>
    </span>
  )
}

/** W12 / H12: zapoznanie — wynik, skala i radar, data zapoznania w karcie bohatera, „Co dalej”, sprzeciw. */
export function AcknowledgementStep({ detail, check, steps, go, reload, sections, onOpenEvaluation }: StepProps & { sections: string[] }) {
  useStepHeader('Zapoznanie z oceną')
  const ack = steps.find((s) => s.id === 'ack')!
  const stage = detail.stages.find((s) => s.key === ack.stageKey)
  const rating = detail.stages.find((s) => s.key === steps.find((x) => x.id === 'review')?.stageKey)
  const objection = detail.stages.find((s) => s.optional && s.key !== stage?.key)
  const objectionDef = detail.schema.stages?.find((s) => s.key === objection?.key)
  const ackDef = detail.schema.stages?.find((x) => x.key === stage?.key)
  const fields = detail.schema.sections.filter((s) => sections.includes(s.key)).flatMap((s) => s.fields)
  const signatureField = fields.find((f) => f.type === 'signature')
  const signature = detail.signatures.find((s) => s.fieldKey === signatureField?.key)
  const firstName = detail.employeeName.split(' ')[0]
  const first = isFirstTemplate(detail.templateCode)
  const [nextCycle, setNextCycle] = useState<{ id: number; nextStageTitle: string | null; nextDueTo: string | null } | null>(null)
  const [error, setError] = useState('')
  const [date, setDate] = useState(signature?.signedOn ?? today())
  const [busy, setBusy] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const s = detail.scoring
  const negative = s?.result === 'negative'
  const justification = detail.schema.sections.flatMap((x) => x.fields).find((f) => f.type === 'longText' && f.requiredWhen?.in.includes('negative'))
  const ackIssues = stage ? withoutAutoFilled(detail, stage.key, check?.stages.find((x) => x.key === stage.key)?.issues ?? []) : []
  const ackBlocked = ackIssues.some((i) => i.blocking)
  const otherAckIssues = ackIssues.filter((i) => i.fieldKey !== signatureField?.key)

  // Po sporządzeniu oceny okresowej backend zakłada nowy cykl — pokaż jego pierwszy termin.
  useEffect(() => {
    if (first || rating?.status !== 'Completed') return
    api<{ id: number; isFinal: boolean; nextStageTitle: string | null; nextDueTo: string | null }[]>(`evaluations?employeeId=${detail.employeeId}`)
      .then((rows) => setNextCycle(rows.find((r) => r.id > detail.id && !r.isFinal) ?? null), () => setNextCycle(null))
  }, [detail.employeeId, detail.id, first, rating?.status])

  async function objectionAction(action: 'complete' | 'skip') {
    if (!objection) return
    try {
      if (action === 'complete') await api(`evaluations/${detail.id}/stages/${objection.key}/complete`, 'POST', { completedOn: today() })
      else await api(`evaluations/${detail.id}/stages/${objection.key}/skip`, 'POST')
      setError('')
      reload()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function saveAck() {
    if (!stage) return
    setBusy(true)
    try {
      await completeStage(detail, stage.key, date)
      setError('')
      setJustSaved(true)
      await reload()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (rating?.status === 'Pending') {
    return (
      <div className="step final-hifi final-h12">
        <h2 className="sr-only">Zapoznanie z oceną</h2>
        <section className="card final-empty">
          <span className="final-empty-art" aria-hidden="true"><SheetThumb /><span className="final-empty-lock"><Lock size={26} /></span></span>
          <p>Zapoznanie po podpisaniu oceny.</p>
          <button type="button" onClick={() => go('review')}>Przejdź do: Sprawdź i podpisz <FIcon name="arrow" /></button>
        </section>
      </div>
    )
  }

  const ackDone = stage?.status === 'Completed'
  const ackDate = ackDone ? stage?.completedOn ?? date : date
  const objectionDue = objection?.dueTo ?? addDays(ackDate, 7)
  const ratedOn = rating?.completedOn ?? today()
  const cycleDue = nextCycle?.nextDueTo ?? addDays(ratedOn, negative ? 7 : 30)
  const timeline: TimelineItem[] = [
    {
      key: 'ack', tone: 'filled', icon: <FIcon name="pencil" size={16} />,
      title: <>Zapoznanie · {ackDone ? fmtDate(stage?.completedOn) : ackDate === today() ? 'dziś' : fmtDate(ackDate)}</>,
      extra: ackDef?.legalRef && <Source refText={`${legal(ackDef.legalRef)}: niezwłocznie`} />,
    },
  ]
  if (objection) {
    timeline.push({
      key: 'objection', tone: 'ring', icon: <span className="final-line-num">7</span>,
      title: <>Sprzeciw do {fmtDate(objectionDue)}</>,
      extra: <>
        <Info label="Termin sprzeciwu">7 dni od zapoznania; data liczona z pola „Data zapoznania”.</Info>
        <Source refText={`${legal(objectionDef?.legalRef ?? 'art. 83 ust. 1 ustawy')} (pouczenie w arkuszu)`} />
      </>,
    })
  }
  if (!first) {
    timeline.push({
      key: 'cycle', icon: <FIcon name="calendar" size={16} />, title: 'Nowy cykl',
      extra: <Source refText={`Rozp. 2016 · § 7 pkt ${negative ? 2 : 1}: ${negative ? '7' : '30'} dni od sporządzenia; sprzeciw nie wstrzymuje`} onOpen={nextCycle && onOpenEvaluation ? () => onOpenEvaluation(nextCycle.id) : undefined} />,
      sub: negative ? <>rozmowa do {fmtDate(cycleDue)}</> : fmtDate(cycleDue),
    })
    if (negative) {
      timeline.push({
        key: 'again', icon: <FIcon name="calendar" size={16} />, title: 'Ponowna ocena',
        extra: <Source refText="Ustawa o służbie cywilnej · art. 81 ust. 9: po 6 miesiącach od zapoznania (do potwierdzenia)" />,
        sub: <>po {fmtDate(addMonths(ackDate, 6))}</>,
      })
    }
  }

  return (
    <div className="step final-hifi final-h12">
      <div className="final-h12-grid">
        <section className="card final-ackhero">
          <span className="final-face" aria-hidden="true"><Avatar path={`org/${detail.employeeId}/avatar`} name={detail.employeeName} size={120} decorative /></span>
          <div className="final-ackhero-body">
            <div className="final-chips">
              {rating?.completedOn && <span className="final-chip"><FIcon name="check" size={14} /> {first ? 'Dokonana' : 'Sporządzona'} {fmtDate(rating.completedOn)}</span>}
              {negative && justification && answerOf(detail, justification.key)?.valueText && <span className="final-chip"><FIcon name="check" size={14} /> Uzasadnienie</span>}
              <span className="grow" />
              <span className="final-pdf"><PdfButton detail={detail} label="PDF" /></span>
            </div>
            <h2>{ackDone ? 'Zapoznanie zapisane' : `Zapoznaj ${accusative(firstName)} z oceną`}</h2>
            <ResultFigure detail={detail} compact />
            {stage?.status === 'Pending' && detail.canEdit && (
              <div className="final-ackform">
                {signatureField && (
                  <p className="final-signstate">
                    {signature
                      ? <><span className="final-row-icon ok"><FIcon name="check" size={14} /></span> Podpis {firstName}: {fmtDate(signature.signedOn)}</>
                      : <><span className="final-row-icon missing"><FIcon name="alert" size={14} /></span> Czeka na podpis
                        <Info align="start" label="Jak podpisuje pracownik">{detail.employeeName} podpisuje ze swojego konta („Moje podpisy”) albo odręcznie przez kod QR. Datę zapisuje system.</Info></>}
                  </p>
                )}
                <div className="final-ackform-row">
                  <label className="final-date">Data zapoznania
                    <DateInput value={date} onChange={setDate} max={today()} min={rating?.completedOn ?? undefined} />
                  </label>
                  <button type="button" onClick={saveAck} disabled={busy || ackBlocked || !date}>{busy ? 'Zapisywanie…' : 'Zapisz zapoznanie'}</button>
                </div>
                {!signature && <RefusalHint firstName={firstName} />}
                {error && <p role="alert" className="error small">{error}</p>}
              </div>
            )}
            {stage?.status === 'Pending' && !detail.canEdit && !detail.isOwn && <p className="muted small">Czeka na zapoznanie.</p>}
            {ackDone && (
              <p className="final-signstate"><span className="final-row-icon ok"><FIcon name="check" size={14} /></span> Zapoznanie {fmtDate(stage?.completedOn)}</p>
            )}
          </div>
          {justSaved && ackDone && <DirectionAnimation />}
        </section>
        <section className="card final-radarcard" aria-labelledby="final-radar-title">
          <div className="final-next-head">
            <h3 id="final-radar-title">Kryteria</h3>
            <Info align="end" label="Jak czytać radar">Pierścień przerywany = 5, na poziomie oczekiwań. Środek = 1.</Info>
          </div>
          <ScoresRadar scores={criterionScores(detail)} size={190} />
        </section>
      </div>
      {otherAckIssues.length > 0 && stage?.status === 'Pending' && <IssueList issues={otherAckIssues} steps={steps} go={go} />}
      <section className="card final-nextcard" aria-labelledby="final-next-title">
        <h3 id="final-next-title">Co dalej</h3>
        <LineTimeline items={timeline} />
        {nextCycle && onOpenEvaluation && (
          <button type="button" className="link final-open-cycle" onClick={() => onOpenEvaluation(nextCycle.id)}>Otwórz nowy cykl <FIcon name="arrow" /></button>
        )}
      </section>
      {objection && ackDone && (
        <section className="card final-objection">
          {objection.status === 'Pending' ? (
            <>
              <p><strong>Okno sprzeciwu do {fmtDate(objection.dueTo)}</strong>{legal(objectionDef?.legalRef) && <Source refText={legal(objectionDef?.legalRef)!} />}</p>
              {detail.canEdit && (
                <div className="buttons">
                  <button type="button" className="secondary" onClick={() => objectionAction('complete')}>Odnotuj sprzeciw</button>
                  <button type="button" className="secondary" onClick={() => objectionAction('skip')}>Brak sprzeciwu</button>
                </div>
              )}
            </>
          ) : <p><strong>{objection.status === 'Completed' ? `Sprzeciw odnotowano ${fmtDate(objection.completedOn)}.` : 'Sprzeciwu nie złożono.'}</strong></p>}
          {error && <p role="alert" className="error">{error}</p>}
        </section>
      )}
    </div>
  )
}

/** Sekcja szablonu bez dedykowanego ekranu (np. oceny cząstkowe w szablonie bez modelu kompetencji). */
export function SectionStep({ detail, steps, go, reload, stepId, title, sections }: StepProps & { stepId: string; title: string; sections: string[] }) {
  return (
    <div className="step final-hifi">
      <div className="step-head"><h2>{title}</h2></div>
      <SheetForm key={JSON.stringify(detail.answers)} detail={detail} onSaved={reload} sectionKeys={sections} showStage={false} />
      <div className="step-actions"><span className="grow" /><NextButton steps={steps} current={stepId} go={go} /></div>
    </div>
  )
}
