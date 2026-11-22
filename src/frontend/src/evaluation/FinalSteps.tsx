import { useEffect, useState, type ReactNode } from 'react'
import { api } from '../api'
import { SheetForm, SignatureField } from '../Evaluations'
import { Auto, CompleteStage, DuePill, IssueList, NextButton, PdfButton, Pill, type StepProps } from './common'
import { completeStage, withoutAutoFilled } from './data'
import {
  RESULT_LABELS, answerOf, valueOf, criteriaFieldOf, criteriaOf, daysUntil, fmtDate, isFirstTemplate, plural, scoresFieldOf, sheetLetter, today,
  type Detail, type Field, type Section,
} from './types'

const roleOfEvaluator = (f: Field) => f.type === 'signature' && f.role !== 'evaluated'

/** Średnia, poziom i wynik — liczone przez backend (kłódka, „auto”). */
function ComputedChips({ detail }: { detail: Detail }) {
  const s = detail.scoring
  if (!s || s.average == null) return <p className="muted small">Średnia, poziom i wynik pojawią się po wystawieniu wszystkich ocen cząstkowych.</p>
  return (
    <p className="chips">
      <Pill icon="lock">Średnia {s.average.toFixed(2)} · auto</Pill>
      {s.levelLabel && <Pill icon="lock">Poziom: {s.levelLabel.toLowerCase()} · auto</Pill>}
      {/* Wynik bez zieleni/czerwieni i bez ✓/✗: brandbook zabrania kolorów „dobrej” i „złej” oceny. */}
      {s.result && <Pill icon="lock">Ocena {RESULT_LABELS[s.result]?.toLowerCase() ?? s.result} · auto</Pill>}
    </p>
  )
}

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

/** W10: arkusz cz. II — oceny cząstkowe (odczyt), wyniki liczone, uzasadnienie, wnioski, poprzednia ocena, wniosek o stopień. */
export function ResultStep({ detail, steps, go, reload, sections, title }: StepProps & { sections: string[]; title: string }) {
  const scores = scoresFieldOf(detail.schema)
  const criteria = criteriaOf(detail)
  const mandatory: { key: string }[] = criteriaFieldOf(detail.schema)?.mandatory ?? scores?.field.items ?? []
  const scoresStep = steps.find((s) => scores && s.sections.includes(scores.section.key))
  const first = isFirstTemplate(detail.templateCode)
  return (
    <div className="step">
      <div className="step-head"><h2>{first ? title : 'Arkusz oceny · część II'}</h2></div>
      {scores && (
        <div className="card">
          <div className="card-head">
            <h3>{scores.field.label}</h3>
            {scoresStep && <button type="button" className="link" onClick={() => go(scoresStep.id)}>Zmień</button>}
          </div>
          <table className="score-table">
            <tbody>
              {criteria.map((c) => {
                const value = answerOf(detail, scores.field.key, c.key)?.valueNumber
                return (
                  <tr key={c.key}>
                    <td>{c.label}{!mandatory.some((m) => m.key === c.key) && <span className="muted"> (dodatkowe)</span>}</td>
                    <td className="num">{value != null ? `${value} pkt` : <span className="error">brak</span>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <ComputedChips detail={detail} />
      <AutoChoices detail={detail} sections={sections} />
      <SheetForm key={JSON.stringify(detail.answers)} detail={detail} onSaved={reload} sectionKeys={sections} showStage={false}
        fieldFilter={(f: Field) => !f.computed} />
      <div className="step-actions"><span className="grow" /><NextButton steps={steps} current="result" go={go} /></div>
    </div>
  )
}

function fieldSummary(detail: Detail, field: Field): ReactNode {
  const a = answerOf(detail, field.key)
  const scoring = detail.scoring
  if (field.type === 'scores') {
    const values = criteriaOf(detail).map((c) => answerOf(detail, field.key, c.key)?.valueNumber)
    if (values.every((v) => v == null)) return <span className="error">— brak ocen</span>
    return <>{values.map((v) => v ?? '—').join(' · ')}{scoring?.average != null && <> → średnia {scoring.average.toFixed(2)}</>}</>
  }
  if (field.computed) {
    if (field.type === 'average') return scoring?.average?.toFixed(2) ?? '—'
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
    <div className="step">
      <div className="step-head"><h2>Sprawdź przed podpisaniem</h2></div>
      {!closed && <IssueList issues={issues.filter((i) => !isSignatureIssue(i.fieldKey))} steps={steps} go={go}
        title={otherBlocking.length ? `Nie możesz jeszcze podpisać · ${otherBlocking.length} ${plural(otherBlocking.length, 'sprawa', 'sprawy', 'spraw')} do uzupełnienia` : undefined} />}
      <div className="card">
        <table className="review-table">
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
                  <td>{value ?? <span className={required ? 'error' : 'muted'}>— brak{required ? '' : ' (opcjonalne)'}</span>}</td>
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
      <div className="card">
        <h3>Podpisy</h3>
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
        <div className="callout row">
          <span className="grow">✓ Ocena sporządzona {fmtDate(stage?.completedOn)}.</span>
          <PdfButton detail={detail} />
          <NextButton steps={steps} current="review" go={go} />
        </div>
      ) : (
        <>
          {!finalField && (
            <CompleteStage detail={detail} check={check} stageKey={stageKey} label={first ? 'Dokonaj oceny' : 'Sporządź ocenę'}
              defaultDate={detail.signatures.map((s) => s.signedOn).sort().pop()} onDone={async () => { await reload(); go('ack') }} />
          )}
          <div className="step-footer">
            <p className="muted small grow">
              Data sporządzenia = data podpisu przełożonego.{!first && ' Od niej liczy się nowy cykl (rozmowa rozpoczynająca do 30 dni).'}
            </p>
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
      <div className="step">
        <div className="step-head"><h2>Zapoznanie z oceną</h2></div>
        <p className="muted">Zapoznanie będzie możliwe po {first ? 'dokonaniu' : 'sporządzeniu'} oceny (krok „Sprawdź i podpisz”).</p>
      </div>
    )
  }

  return (
    <div className="step">
      {rating?.status === 'Completed' && (
        <div className="callout">
          <strong>✓ Ocena {first ? 'dokonana' : 'sporządzona'} {fmtDate(rating.completedOn)}{s?.result && ` · ${RESULT_LABELS[s.result]?.toLowerCase()}`}{s?.levelLabel && ` · ${s.levelLabel.toLowerCase()}`}</strong>
          {nextCycle && (
            <p className="small">
              Utworzono nowy cykl: {nextCycle.nextStageTitle?.toLowerCase() ?? 'rozmowa rozpoczynająca'}{nextCycle.nextDueTo && ` do ${fmtDate(nextCycle.nextDueTo)}`}.
              {onOpenEvaluation && <> <button type="button" className="link" onClick={() => onOpenEvaluation(nextCycle.id)}>Otwórz nowy cykl</button></>}
            </p>
          )}
        </div>
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
          {s?.average != null && <><dt>{first ? 'Ocena łączna' : 'Średnia'}</dt><dd><strong>{s.average.toFixed(2)}</strong> <Auto /></dd></>}
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
          <p className="callout attention">Po zapoznaniu {firstName} ma 7 dni na sprzeciw do dyrektora generalnego urzędu — termin pojawi się po zamknięciu zapoznania.</p>
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
    <div className="step">
      <div className="step-head"><h2>{title}</h2></div>
      <SheetForm key={JSON.stringify(detail.answers)} detail={detail} onSaved={reload} sectionKeys={sections} showStage={false} />
      <div className="step-actions"><span className="grow" /><NextButton steps={steps} current={stepId} go={go} /></div>
    </div>
  )
}
