// H05 v2 · Część I i podpisy: miniatura części I (osoby, kryteria nazwą, rozmowa 4/4, termin z kłódką), oś okresu
// pusta do podpisu ocenianego, sloty podpisów z twarzami, wiersz „Po podpisach” (§ 6 ust. 3) i zapis z powodem blokady.
// Podpisy: SignatureField z arkusza; zamknięcie etapu: completeStage (to samo wywołanie co CompleteStage).
import { useState } from 'react'
import { Avatar } from '../Avatar'
import { DateInput } from '../DateInput'
import { SheetForm, SignatureField } from '../Evaluations'
import { Info, Source } from '../v2'
import { IssueList, PdfButton, type StepProps } from './common'
import { completeStage, initialValues, useWorkContext, withoutAutoFilled } from './data'
import { StartHead } from './start-head'
import { CompetencyIcon, UiIcon } from './start-icons'
import {
  KICKOFF_EMPTY, PERIODIC_REGULATION_URL, firstNameOf, kickoffKey, kickoffTopics, monthsBetween, nameCase, readLocal, reg, useOrg,
  type KickoffState,
} from './start-model'
import {
  criteriaFieldOf, criteriaOf, fmtDate, isFirstTemplate, keyOf, sheetLetter, today, type Answer, type Detail, type Field,
} from './types'

/** Termin etapu, jaki ustali zamknięcie: z pola arkusza z prefill "stage:x" (też niezapisany wpis), inaczej termin etapu z serwera. */
function plannedDue(detail: Detail, values: Record<string, Answer>, sections: string[], stageKey: string): string | null {
  const stage = detail.stages.find((s) => s.key === stageKey)
  const field = detail.schema.sections.filter((s) => sections.includes(s.key)).flatMap((s) => s.fields)
    .find((f) => f.prefill === `stage:${stageKey}`)
  const value = field && values[keyOf(field.key, null)]
  if (field && stage?.status === 'Pending' && value?.valueDate) return field.type === 'dateRange' ? value.valueDateTo ?? value.valueDate : value.valueDate
  return stage?.dueTo ?? null
}

export function PartOneStep({ detail, check, steps, go, reload, sections }: StepProps & { sections: string[] }) {
  const schema = detail.schema
  const first = isFirstTemplate(detail.templateCode)
  const firstStage = detail.stages[0]
  const name = firstNameOf(detail.employeeName)
  const fem = (n?: string | null) => !!n && /a$/i.test(firstNameOf(n))
  const letter = sheetLetter(detail.templateCode)
  const criteriaField = criteriaFieldOf(schema)
  const criteria = criteriaOf(detail)
  const mandatory: { key: string }[] = criteriaField?.mandatory ?? []
  const extra = criteria.filter((c) => !mandatory.some((m) => m.key === c.key))
  const work = useWorkContext(detail.id)
  const examples = work.context?.indicators.filter((i) => i.expectation).length ?? 0
  const { evaluator } = useOrg(detail)
  const evaluatorName = detail.evaluatorName ?? evaluator?.name ?? null
  const evaluation = detail.stages.find((s) => s.key !== firstStage?.key && !s.optional && schema.sections.some((x) => x.stage === s.key && x.fields.some((f) => f.type === 'scores')))
  const [values, setValues] = useState(() => initialValues(detail))
  const due = evaluation ? plannedDue(detail, values, sections, evaluation.key) : null

  const partFields = schema.sections.filter((s) => sections.includes(s.key)).flatMap((s) => s.fields)
  const signatureFields = partFields.filter((f) => f.type === 'signature')
  const evaluatorSig = signatureFields.find((f) => f.role !== 'evaluated')
  const evaluatedSig = signatureFields.find((f) => f.role === 'evaluated')
  const signed = (f?: Field) => (f ? detail.signatures.find((s) => s.fieldKey === f.key) : undefined)
  const signedCount = signatureFields.filter((f) => signed(f)).length
  const periodFrom = signed(evaluatedSig)?.signedOn ?? null

  const closed = firstStage?.status !== 'Pending'
  const topics = kickoffTopics(detail)
  const kickoff = readLocal<KickoffState>(kickoffKey(detail.id), KICKOFF_EMPTY)
  const required = topics.filter((t) => !t.optional).length
  const talked = closed ? required : topics.filter((t, i) => !t.optional && kickoff.topics.includes(i)).length
  const lockedSection = sections.some((k) => detail.lockedSections.includes(k))

  const stageIssues = withoutAutoFilled(detail, firstStage?.key ?? '', check?.stages.find((s) => s.key === firstStage?.key)?.issues ?? [])
  const otherFields = (f: Field) => f.type !== 'criteriaSelection' && f.type !== 'signature' && !(f.type === 'date' && f.prefill?.startsWith('stage:'))
  const dataIssue = stageIssues.some((i) => i.fieldKey && partFields.some((f) => f.key === i.fieldKey && otherFields(f)))
  // Braki podpisów pokazują sloty i powód przy przycisku — na liście zostają pozostałe sprawy.
  const listIssues = stageIssues.filter((i) => !signatureFields.some((f) => f.key === i.fieldKey))

  return (
    <div className="step sv2">
      <StartHead detail={detail} topic={first ? 'Rozmowa wstępna i podpisy' : 'Część I i podpisy'} />

      <div className="sv2-part1">
        <section className="sv2-sheet" aria-label={`Arkusz ${letter ?? ''} · część I`}>
          <div className="sv2-sheet-top">
            <span className="sv2-caps">{first ? 'Pierwsza ocena · rozmowa wstępna' : `Arkusz ${letter} · część I`}</span>
            <PdfButton detail={detail} label="PDF do podpisu" />
          </div>
          <div className="sv2-sheet-people">
            <div>
              <span className="sv2-label">{fem(detail.employeeName) ? 'Oceniana' : 'Oceniany'}</span>
              <PersonLine id={detail.employeeId} name={detail.employeeName} detail={detail.employeePosition} />
            </div>
            <div>
              <span className="sv2-label">{fem(evaluatorName) ? 'Oceniająca' : 'Oceniający'}</span>
              <PersonLine id={evaluator?.id ?? null} hasAvatar={evaluator?.hasAvatar} name={detail.evaluatorName ?? evaluator?.name ?? '—'}
                detail={evaluator?.jobTitle} lead />
            </div>
          </div>
          <div className="sv2-sheet-block">
            <span className="sv2-label">{criteriaField ? 'Kryteria' : 'Elementy oceny'}</span>
            <div className="sv2-sheet-crit">
              <ul className="sv2-iconrow">
                {(criteriaField ? criteria.filter((c) => mandatory.some((m) => m.key === c.key)) : criteria).map((c) => (
                  <li key={c.key} title={c.label}><CompetencyIcon id={c.key} size={20} /><span className="sr-only">{c.label}</span></li>
                ))}
              </ul>
              {extra.length > 0 && criteriaField && <strong>+ {extra.map((c) => c.label).join(', ')}</strong>}
              {!closed && detail.canEdit && criteriaField && (
                <button type="button" className="link" onClick={() => go('criteria')}>Zmień</button>
              )}
            </div>
          </div>
          <div className="sv2-sheet-block">
            <span className="sv2-label">{first ? 'Rozmowa wstępna' : 'Rozmowa rozpoczynająca'}</span>
            <button type="button" className="sv2-sheet-row" onClick={() => go('kickoff')}>
              <UiIcon name={talked >= required ? 'check' : 'list'} size={18} />
              <strong className="grow">{signed(evaluatorSig) ? fmtDate(signed(evaluatorSig)!.signedOn) : 'zagadnienia'}</strong>
              <strong aria-label={`${talked} z ${required} zagadnień omówionych`}>{talked}/{required}</strong>
            </button>
          </div>
          {evaluation && (
            <div className="sv2-sheet-block">
              <span className="sv2-label">{first ? 'Okres pierwszej oceny' : 'Termin sporządzenia oceny'}</span>
              <div className="sv2-due">
                <UiIcon name="flag" size={22} />
                <strong className="grow">{fmtDate(due)}</strong>
                {(closed || !!signed(evaluatorSig)) && <><UiIcon name="lock" size={18} /><span className="sr-only"> zablokowany</span></>}
                <Info align="end" label="Skąd termin">
                  Liczy system: 24 miesiące od poprzedniej oceny albo od początku okresu (ustawa, art. 81 — do potwierdzenia). Rozporządzenie każe go wpisać w części I (§ 5 ust. 3).
                </Info>
              </div>
            </div>
          )}
          <div className="sv2-sheet-block">
            <span className="sv2-label">Załącznik</span>
            <button type="button" className="sv2-sheet-row" onClick={() => go('kickoff')}>
              <UiIcon name="doc" size={18} />
              <span className="grow">Oczekiwania wobec {nameCase(name, 'gen')}</span>
              <span className="sv2-count-badge" aria-label={`${criteria.length} kryteriów${examples ? `, ${examples} przykładów` : ''}`}>{criteria.length}</span>
            </button>
          </div>
        </section>

        <div className="sv2-part1-side">
          {evaluation && (
            <section className="card sv2-period" aria-label="Okres oceny">
              <h3 className="sv2-h3">Okres oceny</h3>
              <div className={`sv2-period-axis${periodFrom ? ' filled' : ''}`} aria-hidden="true">
                <span className="sv2-period-start" />
                <span className="sv2-period-line" />
                {periodFrom && due && <span className="sv2-period-months">{monthsBetween(periodFrom, due)} mies.</span>}
                <span className="sv2-period-end"><UiIcon name="flag" size={16} /></span>
              </div>
              <div className="sv2-period-labels">
                <span>{periodFrom ? fmtDate(periodFrom) : `od podpisu ${nameCase(name, 'gen')}`}</span>
                <strong>{fmtDate(due)}</strong>
              </div>
            </section>
          )}

          <section aria-labelledby="sv2-sigs">
            <div className="sv2-row-head">
              <h3 id="sv2-sigs" className="sv2-h3">Podpisy</h3>
              <span className="sv2-bars" aria-hidden="true">{signatureFields.map((f) => <i key={f.key} className={signed(f) ? 'on' : undefined} />)}</span>
              <span className="sv2-muted" aria-label={`Podpisano ${signedCount} z ${signatureFields.length}`}>{signedCount}/{signatureFields.length}</span>
            </div>
            <div className="sv2-sigs">
              {[evaluatorSig, evaluatedSig].filter((f): f is Field => !!f).map((f) => {
                const s = signed(f)
                const isEvaluated = f.role === 'evaluated'
                const waiting = !s && !closed && (isEvaluated ? !!signed(evaluatorSig) : true)
                const person = isEvaluated
                  ? { id: detail.employeeId as number | null, name: detail.employeeName, role: fem(detail.employeeName) ? 'oceniana' : 'oceniany', hasAvatar: true }
                  : { id: evaluator?.id ?? null, name: detail.evaluatorName ?? evaluator?.name ?? 'Oceniający', role: fem(evaluatorName) ? 'oceniająca' : 'oceniający', hasAvatar: evaluator?.hasAvatar }
                return (
                  <div key={f.key} className={`sv2-sig${waiting ? ' current' : ''}`}>
                    <PersonLine id={person.id} hasAvatar={person.hasAvatar} name={person.name} detail={person.role} lead={!isEvaluated} size={48} />
                    <span className={`sv2-sig-state${s ? ' signed' : ''}`}>
                      <UiIcon name={s ? 'check' : 'clock'} size={16} />{s ? 'Podpisano' : closed ? 'Brak podpisu' : 'Czeka'}
                    </span>
                    {s ? (
                      <span className="sv2-sig-done"><UiIcon name="lock" size={16} />{[s.place, fmtDate(s.signedOn)].filter(Boolean).join(', ')}</span>
                    ) : !closed && (
                      <div className="sv2-sig-field"><SignatureField field={f} detail={detail} locked={lockedSection} onSigned={reload} /></div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>

          {!first && (
            <section aria-labelledby="sv2-after">
              <div className="sv2-row-head">
                <h3 id="sv2-after" className="sv2-h3">Po podpisach</h3>
                <Source refText={reg('§ 6 ust. 3')} href={PERIODIC_REGULATION_URL} />
              </div>
              <ul className="sv2-after">
                <li><UiIcon name="doc" size={18} /><span className="grow">Kopia części I dla {nameCase(name, 'gen')}</span>
                  <AfterState done={closed} /></li>
                <li><UiIcon name="archive" size={18} /><span className="grow">Oryginał do akt · HR</span>
                  <AfterState done={closed} /></li>
              </ul>
            </section>
          )}
        </div>
      </div>

      <details className="sv2-details" open={dataIssue || undefined}>
        <summary>Dane w części I</summary>
        <SheetForm key={JSON.stringify(detail.answers)} detail={detail} onSaved={reload} sectionKeys={sections} showStage={false}
          fieldFilter={otherFields} onValuesChange={setValues} />
      </details>

      {!closed && <IssueList issues={listIssues} steps={steps} go={go} />}
      {closed ? (
        <p className="sv2-closed"><UiIcon name="lock" size={16} /> Etap zamknięty {fmtDate(firstStage?.completedOn)}</p>
      ) : (
        <StartComplete detail={detail} stageIssues={stageIssues}
          waitingFor={!signed(evaluatorSig) && evaluatorSig ? 'Czeka na Twój podpis' : !signed(evaluatedSig) && evaluatedSig ? `Czeka na podpis ${nameCase(name, 'gen')}` : null}
          defaultDate={signed(evaluatedSig)?.signedOn ?? signed(evaluatorSig)?.signedOn ?? null}
          label={first ? 'Zapisz i zamknij rozmowę wstępną' : 'Zapisz i rozpocznij obserwację'}
          onDone={async () => { await reload(); go('notes') }} />
      )}
    </div>
  )
}

function AfterState({ done }: { done: boolean }) {
  return (
    <span className={`sv2-after-state${done ? ' done' : ''}`}>
      <UiIcon name={done ? 'check' : 'clock'} size={18} />
      <span className="sr-only">{done ? 'gotowe' : 'po zamknięciu etapu'}</span>
    </span>
  )
}

function PersonLine({ id, name, detail, lead = false, size = 36, hasAvatar }: {
  id: number | null; name: string; detail?: string | null; lead?: boolean; size?: number; hasAvatar?: boolean
}) {
  return (
    <span className={`sv2-person${lead ? ' lead' : ''}`}>
      <Avatar path={id != null && hasAvatar !== false ? `org/${id}/avatar` : null} name={name} size={size} decorative />
      <span className="sv2-person-text"><strong>{name}</strong>{detail && <span>{detail}</span>}</span>
    </span>
  )
}

/** Zamknięcie etapu: to samo wywołanie co CompleteStage (completeStage), z widocznym powodem blokady przy przycisku. */
function StartComplete({ detail, stageIssues, waitingFor, defaultDate, label, onDone }: {
  detail: Detail
  stageIssues: { blocking: boolean }[]
  waitingFor: string | null
  defaultDate: string | null
  label: string
  onDone: () => void
}) {
  const stageKey = detail.stages[0]?.key ?? ''
  const [date, setDate] = useState(defaultDate ?? today())
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  if (!detail.canEdit) return null
  const blocking = stageIssues.some((i) => i.blocking)
  const reason = blocking ? waitingFor ?? 'Uzupełnij braki powyżej' : ''
  const disabled = busy || blocking

  async function run() {
    setBusy(true)
    try {
      await completeStage(detail, stageKey, date)
      setError('')
      onDone()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="sv2-complete">
      <span className="grow" />
      {reason && <span id="sv2-complete-why" className="sv2-why">{reason}</span>}
      {!blocking && <label className="sv2-complete-date">Data <DateInput value={date} onChange={setDate} /></label>}
      <button type="button" className={blocking ? 'sv2-locked' : undefined} onClick={run} disabled={disabled}
        aria-describedby={reason ? 'sv2-complete-why' : undefined}>
        {blocking && <UiIcon name="lock" size={16} />}{busy ? 'Zapisywanie…' : label}
      </button>
      {error && <p role="alert" className="error">{error}</p>}
    </div>
  )
}
