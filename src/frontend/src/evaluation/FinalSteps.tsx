import { useEffect, useState, type ReactNode } from 'react'
import { api } from '../api'
import { SheetForm, SignatureField } from '../Evaluations'
import { Icon } from '../Icon'
import { Auto, CompleteStage, DuePill, IssueList, NextButton, PdfButton, Pill, type Step, type StepProps } from './common'
import { completeStage, saveAnswers, withoutAutoFilled } from './data'
import {
  RESULT_LABELS, answerOf, valueOf, criteriaFieldOf, criteriaOf, daysUntil, emptyAnswer, fmtDate, indicatorFieldOf, isFirstTemplate, plural,
  scoresFieldOf, sheetLetter, today, type CheckIssue, type Cond, type Detail, type Field, type Section,
} from './types'
import './final-hifi.css'

const roleOfEvaluator = (f: Field) => f.type === 'signature' && f.role !== 'evaluated'

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
    <div className="card">
      {fields.map((f) => (
        <p key={f.key} className="small">
          {f.label}: <Pill icon="lock">{autoChoice(detail, f)?.toLowerCase() ?? 'jeszcze nie wiadomo'} · auto</Pill>
          {f.hint && <><br /><span className="muted">{f.hint}</span></>}
        </p>
      ))}
    </div>
  )
}

const fmtAvg = (n: number) => n.toFixed(2).replace('.', ',')

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
  const values = criteriaOf(detail).map((c) => ({ label: c.label, v: answerOf(detail, scores.field.key, c.key)?.valueNumber ?? null }))
  const reasons: string[] = []
  for (const rule of schema.scoring?.positiveWhen ?? []) {
    if (rule.rule === 'levelIn' && s.level && !(rule.values ?? []).includes(s.level)) {
      reasons.push(`średnia ${s.average != null ? fmtAvg(s.average) : '–'} to poziom „${s.levelLabel?.toLowerCase() ?? s.level}”`)
    } else if (rule.rule === 'maxCountOfScore' && rule.score != null) {
      const hits = values.filter((x) => x.v === rule.score)
      if (hits.length > (rule.count ?? 0)) {
        reasons.push(`${hits.length} ${plural(hits.length, 'ocena', 'oceny', 'ocen')} ${rule.score} pkt (${hits.map((h) => h.label.toLowerCase()).join(', ')}), dopuszczalne: ${rule.count ?? 0}`)
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

/**
 * Szkic wniosków IPRZ z najniżej ocenionych wskaźników — reguła, nie model (wzór: piaskownica, Przyznanie.tsx → draftIprz).
 * Bierze do dwóch wskaźników ocenionych najwyżej „na poziomie oczekiwań” i cytuje zachowanie docelowe z modelu kompetencji.
 */
function draftIprz(detail: Detail): { text: string; basis: string[] } | null {
  const schema = detail.schema
  const scores = scoresFieldOf(schema)
  const indicatorField = scores && indicatorFieldOf(schema, scores.field.key)
  const competencies = schema.competencyModel?.competencies
  if (!scores || !indicatorField || !competencies) return null
  const meets = scores.scale.find((o) => o.key === 'meets')?.value ?? 5
  const weak = criteriaOf(detail)
    .flatMap((c) => (competencies[c.key]?.indicators ?? []).map((i) => ({
      criterion: competencies[c.key].name, indicator: i, v: answerOf(detail, indicatorField.key, i.key)?.valueNumber ?? null,
    })))
    .filter((x): x is typeof x & { v: number } => x.v != null && x.v <= meets)
    .sort((a, b) => a.v - b.v)
    .slice(0, 2)
  if (weak.length === 0) return null
  const lower = (t: string) => t.charAt(0).toLowerCase() + t.slice(1).replace(/\.$/, '')
  const lines = weak.map((x, n) => {
    const target = x.v < meets ? x.indicator.levels.meets : x.indicator.levels.above
    return `${n + 1}. ${x.criterion}: ${lower(x.indicator.text)}.${target ? ` Cel: ${target}` : ''} Forma do ustalenia: szkolenie, mentoring albo nowe zadanie.`
  })
  return { text: lines.join('\n'), basis: weak.map((x) => `${x.criterion} · ${x.v} pkt`) }
}

/** Uzasadnienie i wnioski (pola longText sekcji przyznania oceny) z propozycją asystenta pod wnioskami IPRZ. */
function ConclusionFields({ detail, section, fields, reload }: { detail: Detail; section: Section; fields: Field[]; reload: () => Promise<void> }) {
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((f) => [f.key, answerOf(detail, f.key)?.valueText ?? ''])))
  const [status, setStatus] = useState('')
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState<'shown' | 'rejected'>('shown')
  const locked = detail.lockedSections.includes(section.key)
  const editable = detail.canEdit && !locked
  const negative = detail.scoring?.result === 'negative'
  const iprzField = fields.find((f) => f.key.toLowerCase().includes('development'))
  const proposal = iprzField ? draftIprz(detail) : null
  const showProposal = editable && !!proposal && draft === 'shown' && !values[iprzField!.key]?.trim()

  const set = (key: string, value: string) => { setValues((v) => ({ ...v, [key]: value })); setDirty(true); setStatus('') }

  async function save() {
    setBusy(true)
    setStatus('Zapisywanie…')
    try {
      await saveAnswers(detail.id, fields.map((f) => ({ ...emptyAnswer(f.key, null), valueText: values[f.key] ?? '' })))
      setDirty(false)
      setStatus('Zapisano.')
      await reload()
    } catch (e) {
      setStatus((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  function hintOf(f: Field): string {
    if (f.required) return 'wymagane przy każdej ocenie'
    if (f.requiredWhen) return visibleIn(detail, f.requiredWhen) ? 'wymagane przy tej ocenie' : f.key.toLowerCase().includes('justification') ? 'zalecane · wymagane przy ocenie negatywnej' : 'opcjonalne'
    return 'opcjonalne'
  }

  return (
    <div className="final-conclusions">
      {fields.map((f) => (
        <div key={f.key} className="final-field">
          <label htmlFor={`final-${f.key}`}>
            {f.label}
            <span className={`final-hint${(f.required || (f.requiredWhen && visibleIn(detail, f.requiredWhen))) ? ' required' : ''}`}>{hintOf(f)}</span>
          </label>
          <textarea id={`final-${f.key}`} rows={4} value={values[f.key] ?? ''} disabled={!editable}
            onChange={(e) => set(f.key, e.target.value)}
            placeholder={f === iprzField ? 'Obszar rozwoju i forma, np. szkolenie, mentoring, nowe zadanie' : negative ? 'Wskaż konkretne zachowania z okresu oceny, które zdecydowały o ocenie.' : 'Np. rzetelnie stosuje procedury; terminowość poprawiła się w drugim roku okresu.'} />
          {f === iprzField && showProposal && proposal && (
            <div className="ai-proposal final-proposal" aria-label="Propozycja asystenta">
              <span className="ai-tag">✦ Propozycja asystenta · z najniżej ocenionych wskaźników</span>
              <p className="pre-line">{proposal.text}</p>
              <p className="ai-source"><b>Źródło</b>Twoje oceny wskaźników ({proposal.basis.join('; ')}) i opisy zachowań z modelu kompetencji.</p>
              <div className="buttons">
                <button type="button" onClick={() => set(f.key, proposal.text)}>Wstaw</button>
                <button type="button" className="secondary" onClick={() => {
                  set(f.key, proposal.text)
                  requestAnimationFrame(() => document.getElementById(`final-${f.key}`)?.focus())
                }}>Edytuj</button>
                <button type="button" className="secondary" onClick={() => setDraft('rejected')}>Odrzuć</button>
              </div>
              <p className="muted small">Asystent podpowiada. Treść wniosków ustalasz Ty — po wstawieniu kliknij „Zapisz”.</p>
            </div>
          )}
        </div>
      ))}
      {editable && (
        <div className="buttons">
          <button type="button" onClick={save} disabled={busy || !dirty}>{busy ? 'Zapisywanie…' : 'Zapisz uzasadnienie i wnioski'}</button>
          {dirty && !busy && <span className="muted small">Masz niezapisane zmiany.</span>}
          {status && <span className="muted small" role="status">{status}</span>}
        </div>
      )}
      {locked && <p className="muted small"><Icon name="lock" /> Sekcja zamknięta — ocena została sporządzona.</p>}
    </div>
  )
}

/** W10: arkusz cz. II — oceny cząstkowe (odczyt), wyniki liczone, uzasadnienie, wnioski, poprzednia ocena, wniosek o stopień. */
export function ResultStep({ detail, steps, go, reload, sections, title }: StepProps & { sections: string[]; title: string }) {
  const schema = detail.schema
  const scores = scoresFieldOf(schema)
  const criteria = criteriaOf(detail)
  const mandatory: { key: string }[] = criteriaFieldOf(schema)?.mandatory ?? scores?.field.items ?? []
  const scoresStep = steps.find((s) => scores && s.sections.includes(scores.section.key))
  const first = isFirstTemplate(detail.templateCode)
  const s = detail.scoring
  const resultSection = schema.sections.find((x) => sections.includes(x.key) && x.fields.some((f) => f.key === schema.scoring?.result))
  const textFields = (resultSection?.fields ?? []).filter((f) => f.type === 'longText' && !f.computed && visibleIn(detail, f.visibleWhen))
  const ownKeys = new Set((resultSection?.fields ?? []).filter((f) => f.type === 'longText' && !f.computed).map((f) => f.key))
  const scored = scores ? criteria.filter((c) => answerOf(detail, scores.field.key, c.key)?.valueNumber != null).length : 0
  const reasons = negativeReasons(detail)
  const label = (v: number | null | undefined) => scores?.scale.find((o) => o.value === v)?.label.toLowerCase()

  return (
    <div className="step final-hifi">
      <div className="step-head"><h2>{first ? title : 'Przyznanie oceny i uzasadnienie'}</h2></div>
      {scores && (
        <section className="card final-table-card" aria-label={scores.field.label}>
          <table className="final-table">
            <thead><tr><th scope="col">{first ? 'Element oceny' : 'Kryterium'}</th><th scope="col">Ocena</th><th scope="col"><span className="sr-only">Akcja</span></th></tr></thead>
            <tbody>
              {criteria.map((c) => {
                const value = answerOf(detail, scores.field.key, c.key)?.valueNumber
                return (
                  <tr key={c.key}>
                    <td>{c.label}{!first && !mandatory.some((m) => m.key === c.key) && <span className="muted small"> · dodatkowe</span>}</td>
                    <td>{value != null ? <><strong>{value} pkt</strong> <span className="muted small">{label(value)}</span></> : <Pill tone="attention">✎ do oceny</Pill>}</td>
                    <td className="final-action">
                      {scoresStep && <button type="button" className="link" onClick={() => go(scoresStep.id)} aria-label={`${value != null ? 'Zmień' : 'Oceń'}: ${c.label}`}>{value != null ? 'Zmień' : 'Oceń'}</button>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
      )}
      <div className="final-pills" aria-live="polite">
        <Pill icon="lock">{first ? 'Ocena łączna' : 'Średnia'} {s?.average != null ? fmtAvg(s.average) : '–'}</Pill>
        {s?.levelLabel && <Pill>{s.levelLabel.toLowerCase()}</Pill>}
        {s?.result === 'positive' && <span className="final-result positive">✓ Ocena pozytywna</span>}
        {s?.result === 'negative' && <span className="final-result negative">! Ocena negatywna</span>}
        {!s?.result && <Pill tone="info">Oceniono {scored} z {criteria.length}</Pill>}
        <span className="grow" />
        <span className="small muted">Liczy system{first ? '' : ' · § 11 ust. 1 rozporządzenia'}</span>
      </div>
      {reasons.length > 0 && <p className="final-reasons"><strong>Dlaczego negatywna:</strong> {reasons.join('; ')}.</p>}
      {s?.average == null && <p className="muted small">Średnia, poziom i wynik pojawią się po wystawieniu wszystkich ocen cząstkowych.</p>}
      <AutoChoices detail={detail} sections={sections} />
      {resultSection && textFields.length > 0 && (
        <section className="card">
          <ConclusionFields key={`${detail.id}:${textFields.map((f) => f.key).join(',')}`} detail={detail} section={resultSection} fields={textFields} reload={reload} />
        </section>
      )}
      <SheetForm key={JSON.stringify(detail.answers)} detail={detail} onSaved={reload} sectionKeys={sections} showStage={false}
        fieldFilter={(f: Field) => !f.computed && !ownKeys.has(f.key)} />
      <div className="step-actions"><span className="grow" /><NextButton steps={steps} current="result" go={go} label="Sprawdź przed podpisem" /></div>
    </div>
  )
}

function fieldSummary(detail: Detail, field: Field): ReactNode {
  const a = answerOf(detail, field.key)
  const scoring = detail.scoring
  if (field.type === 'scores') {
    const values = criteriaOf(detail).map((c) => answerOf(detail, field.key, c.key)?.valueNumber)
    if (values.every((v) => v == null)) return <span className="final-missing">! brak ocen</span>
    return <>{values.map((v) => v ?? '—').join(' · ')}{scoring?.average != null && <> · średnia {fmtAvg(scoring.average)}</>}</>
  }
  if (field.computed) {
    if (field.type === 'average') return scoring?.average != null ? fmtAvg(scoring.average) : '—'
    if (field.type === 'level') return scoring?.levelLabel ?? '—'
    if (field.key !== detail.schema.scoring?.result) return autoChoice(detail, field) ?? '—'
    return scoring?.result ? RESULT_LABELS[scoring.result] ?? scoring.result : '—'
  }
  if (field.prefill?.startsWith('previous.')) return 'z poprzedniej oceny (auto)'
  switch (field.type) {
    case 'date': return a?.valueDate ? fmtDate(a.valueDate) : null
    case 'dateRange': return a?.valueDate ? `od ${fmtDate(a.valueDate)} do ${a.valueDateTo ? fmtDate(a.valueDateTo) : 'dnia podpisu'}` : null
    case 'longText': return a?.valueText ? `Uzupełnione (${a.valueText.length} znaków)` : null
    case 'choice': return a?.valueText ? field.options?.find((o: { value: string }) => o.value === a.valueText)?.label ?? a.valueText : null
    case 'year': return a?.valueNumber ?? null
    default: return a?.valueText ?? null
  }
}

/** Krok kreatora, w którym da się naprawić brak: po sekcji, a dla braków etapu (np. „najpierw zamknij etap…”) po tytule etapu. */
function fixStep(detail: Detail, steps: Step[], issue: CheckIssue): Step | undefined {
  if (issue.sectionKey) return steps.find((s) => s.sections.includes(issue.sectionKey!))
  const stage = detail.stages.find((s) => s.status === 'Pending' && issue.message.includes(s.title))
  return stage ? steps.filter((s) => s.stageKey === stage.key).pop() : undefined
}

/** W11: blokady z `GET /check` jako lawendowy boks z „Napraw”; ostrzeżenia osobno, bez alarmu. */
function Blockers({ detail, issues, steps, go }: { detail: Detail; issues: CheckIssue[]; steps: Step[]; go: (id: string) => void }) {
  const blocking = issues.filter((i) => i.blocking)
  const warnings = issues.filter((i) => !i.blocking)
  const row = (i: CheckIssue, n: number) => {
    const step = fixStep(detail, steps, i)
    return (
      <li key={n}>
        <span className="grow">{i.message}{i.legalRef && <span className="muted small"> · {i.legalRef}</span>}</span>
        {step && <button type="button" className="link" onClick={() => go(step.id)} aria-label={`Napraw: ${i.message}`}>Napraw</button>}
      </li>
    )
  }
  return (
    <>
      {blocking.length > 0 ? (
        <div className="final-blockers" role="alert">
          <strong>✎ {blocking.length === 1 ? 'Jedna sprawa' : `${blocking.length} ${plural(blocking.length, 'sprawa', 'sprawy', 'spraw')}`} przed podpisem</strong>
          <ul>{blocking.map(row)}</ul>
        </div>
      ) : (
        <div className="final-ready" role="status"><strong>✓ Wszystko gotowe do podpisu.</strong></div>
      )}
      {warnings.length > 0 && (
        <div className="final-warnings">
          <strong>Do sprawdzenia (nie blokuje podpisu)</strong>
          <ul>{warnings.map(row)}</ul>
        </div>
      )}
    </>
  )
}

/** W11: lista braków z `GET /check`, podsumowanie z „Zmień”, podpis oceniającego i sporządzenie oceny. */
export function ReviewStep({ detail, check, steps, go, reload, sections }: StepProps & { sections: string[] }) {
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
  // Ostatni podpis po stronie oceniającego zamyka etap („Podpisz i sporządź ocenę”), jeśli poza nim nic nie blokuje.
  const finalField = [...signatureFields].reverse().find((f) => roleOfEvaluator(f) && unsigned(f))
  const blockingExceptFinal = issues.filter((i) => i.blocking && i.fieldKey !== finalField?.key)
  const first = isFirstTemplate(detail.templateCode)
  const closed = stage?.status !== 'Pending'

  const rows = detail.schema.sections
    .filter((s) => s.stage === stageKey && check?.sections.find((c) => c.key === s.key)?.visible !== false)
    .flatMap((s) => s.fields.filter((f) => !['signature', 'notice', 'indicatorScores', 'person'].includes(f.type) && !f.prefill?.startsWith('previous.')).map((f) => ({ section: s, field: f })))
  const stepOf = (section: Section) => steps.find((s) => s.sections.includes(section.key))
  const criteria = criteriaOf(detail)
  const criteriaStep = steps.find((s) => s.id === 'criteria')

  return (
    <div className="step final-hifi">
      <div className="step-head"><h2>Sprawdź przed podpisaniem</h2></div>
      {!closed && <Blockers detail={detail} issues={issues.filter((i) => !isSignatureIssue(i.fieldKey))} steps={steps} go={go} />}
      <div className="card final-table-card">
        <table className="final-table final-review">
          <tbody>
            <tr>
              <th scope="row">Dane i kryteria</th>
              <td>{first ? 'Arkusz pierwszej oceny' : `Arkusz ${sheetLetter(detail.templateCode)}`} · {criteria.map((c) => c.label).join(', ')}</td>
              <td className="actions">{criteriaStep && <button type="button" className="link" onClick={() => go(criteriaStep.id)}>Zmień</button>}</td>
            </tr>
            {rows.map(({ section, field }) => {
              const value = fieldSummary(detail, field)
              const required = field.required || (field.requiredWhen && field.requiredWhen.in.includes((field.requiredWhen.field === detail.schema.scoring?.result ? detail.scoring?.result : answerOf(detail, field.requiredWhen.field)?.valueText) ?? ''))
              const step = stepOf(section)
              return (
                <tr key={field.key}>
                  <th scope="row">{field.label ?? section.title}</th>
                  <td>{value ?? (required ? <span className="final-missing">! brak</span> : <span className="muted">— brak (opcjonalne)</span>)}</td>
                  <td className="actions">
                    {field.computed || field.prefill?.startsWith('previous.') ? <span className="muted small">auto</span>
                      : step && !closed && <button type="button" className="link" onClick={() => go(step.id)}>Zmień</button>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <SheetForm key={JSON.stringify(detail.answers)} detail={detail} onSaved={reload} sectionKeys={sections} showStage={false}
        fieldFilter={(f: Field) => f.type !== 'signature'} />
      <div className="card final-sign">
        <h3>Podpis i sporządzenie oceny</h3>
        <p className="muted small">Data sporządzenia to dzień podpisu przełożonego.{!first && ' Od niej liczy się nowy cykl: rozmowa rozpoczynająca w ciągu 30 dni (7 dni po ocenie negatywnej).'}</p>
        {signatureFields.map((f) => (
          <SignatureField key={f.key} field={f} detail={detail} onSigned={reload} locked={closed}
            blockedReason={roleOfEvaluator(f) && otherBlocking.length ? 'Najpierw uzupełnij braki z listy powyżej.' : undefined}
            {...(f === finalField && blockingExceptFinal.length === 0 && detail.canEdit
              ? { submitLabel: first ? 'Podpisz i dokonaj oceny' : 'Podpisz i sporządź ocenę', afterSign: (signedOn: string) => completeStage(detail, stageKey, signedOn) }
              : {})} />
        ))}
        {signatureFields.length === 0 && <p className="muted">Ten etap nie ma podpisów w arkuszu.</p>}
      </div>
      {closed ? (
        <div className="final-ready row">
          <strong className="grow">✓ Ocena {first ? 'dokonana' : 'sporządzona'} {fmtDate(stage?.completedOn)}.</strong>
          <PdfButton detail={detail} />
          <NextButton steps={steps} current="review" go={go} />
        </div>
      ) : (
        <>
          {!finalField && (
            <CompleteStage detail={detail} check={check} stageKey={stageKey} label={first ? 'Dokonaj oceny' : 'Sporządź ocenę'}
              defaultDate={detail.signatures.map((s) => s.signedOn).sort().pop()} onDone={async () => { await reload(); go('ack') }} />
          )}
          <div className="step-actions">
            <span className="grow" />
            <PdfButton detail={detail} />
          </div>
        </>
      )}
    </div>
  )
}

/** W12: zapoznanie — podpis ocenianego (jego konto albo link/QR), zamknięcie etapu, pouczenie o sprzeciwie. */
export function AcknowledgementStep({ detail, check, steps, go, reload, sections, onOpenEvaluation }: StepProps & { sections: string[] }) {
  const ack = steps.find((s) => s.id === 'ack')!
  const stage = detail.stages.find((s) => s.key === ack.stageKey)
  const rating = detail.stages.find((s) => s.key === steps.find((x) => x.id === 'review')?.stageKey)
  const objection = detail.stages.find((s) => s.optional && s.key !== stage?.key)
  const objectionDef = detail.schema.stages?.find((s) => s.key === objection?.key)
  const ackDef = detail.schema.stages?.find((x) => x.key === stage?.key)
  const fields = detail.schema.sections.filter((s) => sections.includes(s.key)).flatMap((s) => s.fields)
  const signatureField = fields.find((f) => f.type === 'signature')
  const notice = fields.find((f) => f.type === 'notice')
  const signature = detail.signatures.find((s) => s.fieldKey === signatureField?.key)
  const firstName = detail.employeeName.split(' ')[0]
  const first = isFirstTemplate(detail.templateCode)
  const [nextCycle, setNextCycle] = useState<{ id: number; nextStageTitle: string | null; nextDueTo: string | null } | null>(null)
  const [error, setError] = useState('')
  const s = detail.scoring

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

  if (rating?.status === 'Pending') {
    return (
      <div className="step final-hifi">
        <div className="step-head"><h2>Zapoznanie z oceną</h2></div>
        <p className="callout">Zapoznanie będzie możliwe po {first ? 'dokonaniu' : 'sporządzeniu'} oceny (krok „Sprawdź i podpisz”).</p>
      </div>
    )
  }

  return (
    <div className="step final-hifi">
      {rating?.status === 'Completed' && (
        <section className="card final-done">
          <span className="final-done-mark" aria-hidden="true">✓</span>
          <h3>Ocena {first ? 'dokonana' : 'sporządzona'} {fmtDate(rating.completedOn)}</h3>
          <p>
            {s?.result && (RESULT_LABELS[s.result] ?? s.result)}{s?.levelLabel && `, ${s.levelLabel.toLowerCase()}`}
            {s?.average != null && `, ${first ? 'ocena łączna' : 'średnia'} ${fmtAvg(s.average)}`}.
          </p>
          <div className="final-done-info">
            {stage?.status === 'Pending' && (
              <span>
                Przekaż ocenę do zapoznania niezwłocznie: podpis pracownika poniżej albo przez kod QR.
              </span>
            )}
            {nextCycle && (
              <span>
                Nowy cykl: {nextCycle.nextStageTitle?.toLowerCase() ?? 'rozmowa rozpoczynająca'}{nextCycle.nextDueTo && <> do <strong>{fmtDate(nextCycle.nextDueTo)}</strong></>}.
                {objection && ' Sprzeciw nie wstrzymuje nowego cyklu.'}
                {onOpenEvaluation && <> <button type="button" className="link" onClick={() => onOpenEvaluation(nextCycle.id)}>Otwórz nowy cykl</button></>}
              </span>
            )}
          </div>
        </section>
      )}
      <div className="step-head">
        <h2>Zapoznanie z oceną</h2>
        {stage?.status === 'Pending' && stage.dueTo && <DuePill dueTo={stage.dueTo} daysLeft={daysUntil(stage.dueTo)} overdue={stage.overdue} />}
      </div>
      {stage?.status === 'Pending' && ackDef?.deadline?.note && <p className="muted small">{ackDef.deadline.note}</p>}
      <div className="card">
        <div className="card-head">
          <h3>{first ? 'Arkusz pierwszej oceny' : `Arkusz ${sheetLetter(detail.templateCode)}`} · całość do podpisu</h3>
          <PdfButton detail={detail} />
        </div>
        <dl className="summary">
          {s?.average != null && <><dt>{first ? 'Ocena łączna' : 'Średnia'}</dt><dd><strong>{fmtAvg(s.average)}</strong> <Auto /></dd></>}
          {s?.levelLabel && <><dt>Poziom</dt><dd><strong>{s.levelLabel.toLowerCase()}</strong> <Auto /></dd></>}
          {s?.result && <><dt>Ocena</dt><dd><strong>{RESULT_LABELS[s.result]?.toLowerCase() ?? s.result}</strong> <Auto /></dd></>}
          {notice && <><dt>Pouczenie</dt><dd>{notice.label}</dd></>}
        </dl>
      </div>
      {signatureField && (
        <div className="card">
          <SignatureField field={signatureField} detail={detail} onSigned={reload} locked={stage?.status !== 'Pending'} />
        </div>
      )}
      {objection && (
        stage?.status === 'Completed' ? (
          <div className="callout attention">
            {objection.status === 'Pending' ? (
              <>
                {firstName} może złożyć sprzeciw do {fmtDate(objection.dueTo)} ({objectionDef?.legalRef ?? 'art. 83 ust. 1 ustawy'}).
                {!first && ' Sprzeciw nie wstrzymuje nowego cyklu.'}
                {detail.canEdit && (
                  <div className="buttons">
                    <button type="button" className="secondary" onClick={() => objectionAction('complete')}>Odnotuj sprzeciw</button>
                    <button type="button" className="secondary" onClick={() => objectionAction('skip')}>Brak sprzeciwu (pomiń)</button>
                  </div>
                )}
              </>
            ) : objection.status === 'Completed' ? `Sprzeciw odnotowano ${fmtDate(objection.completedOn)}.` : 'Sprzeciwu nie złożono.'}
            {error && <p role="alert" className="error">{error}</p>}
          </div>
        ) : (
          <p className="callout attention"><strong>7 dni na sprzeciw.</strong> Od dnia zapoznania {firstName} ma 7 dni na sprzeciw do dyrektora generalnego urzędu — termin pojawi się po zamknięciu zapoznania.</p>
        )
      )}
      {stage?.status === 'Pending' && (
        <>
          <IssueList issues={check?.stages.find((x) => x.key === stage.key)?.issues ?? []} steps={steps} go={go} />
          <CompleteStage key={signature?.signedOn} detail={detail} check={check} stageKey={stage.key} label="Zapisz zapoznanie i zamknij"
            defaultDate={signature?.signedOn} onDone={reload}>
            <span className="muted small">Data zapoznania = data podpisu pracownika.</span>
          </CompleteStage>
        </>
      )}
      {stage?.status === 'Completed' && <p className="muted small">Zapoznanie zamknięte {fmtDate(stage.completedOn)}.</p>}
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
