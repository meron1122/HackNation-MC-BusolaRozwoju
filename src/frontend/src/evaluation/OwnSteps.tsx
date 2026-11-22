import { Fragment, useState } from 'react'
import { api } from '../api'
import { ConfirmButton } from '../ConfirmButton'
import { SignatureField } from '../Evaluations'
import { PdfButton, Pill, type StepProps } from './common'
import { useApi, useWorkContext } from './data'
import {
  RESULT_LABELS, answerOf, criteriaOf, fmtDate, isFirstTemplate, scoresFieldOf, type Detail, type SelfAssessment,
} from './types'

/** Widok ocenianego: kryteria, opisy oczekiwanych zachowań i przykłady ustalone na rozmowie (bez notatek przełożonego). */
export function OwnCriteriaStep({ detail }: StepProps) {
  const criteria = criteriaOf(detail)
  const competencies = detail.schema.competencyModel?.competencies ?? {}
  const work = useWorkContext(detail.id)
  const current = detail.stages.find((s) => s.key === detail.currentStageKey)
  return (
    <div className="step">
      <div className="step-head"><h2>Moja ocena · {isFirstTemplate(detail.templateCode) ? 'elementy oceny' : 'kryteria'} i oczekiwania</h2></div>
      <div className="card">
        <dl className="summary">
          <dt>Faza</dt><dd>{detail.phase}</dd>
          <dt>Przełożony</dt><dd>{detail.evaluatorName ?? '—'}</dd>
          {current && <><dt>Najbliższy termin</dt><dd>{current.title}{current.dueTo && ` · do ${fmtDate(current.dueTo)}`}</dd></>}
        </dl>
      </div>
      {criteria.length === 0 && <p className="muted">Kryteria nie zostały jeszcze ustalone.</p>}
      {criteria.map((c) => (
        <details key={c.key} className="card" open={criteria.length <= 3}>
          <summary><strong>{c.label}</strong></summary>
          <ul className="expectations">
            {(competencies[c.key]?.indicators ?? []).map((i) => {
              const example = work.indicator(i.key).expectation
              return (
                <li key={i.key}>
                  <p>{i.text}</p>
                  {i.levels.meets && <p className="small"><Pill tone="info">Tego oczekuję</Pill> {i.levels.meets}</p>}
                  {example && <p className="small"><Pill>Przykład</Pill> {example}</p>}
                </li>
              )
            })}
          </ul>
        </details>
      ))}
    </div>
  )
}

/** Samoocena / sprawozdanie ocenianego: poziom i komentarz per kryterium, potrzeby rozwojowe; po przekazaniu tylko odczyt. */
export function SelfAssessmentStep(props: StepProps) {
  const { data, error, reload } = useApi<SelfAssessment>(`evaluations/${props.detail.id}/self-assessment`)
  if (error) return <p className="callout attention">Samoocena niedostępna: {error}</p>
  if (!data) return <p>Ładowanie…</p>
  return <SelfAssessmentForm key={`${data.updatedAt}-${data.submittedAt}`} {...props} data={data} reloadSelf={reload} />
}

function SelfAssessmentForm({ detail, reload, data, reloadSelf }: StepProps & { data: SelfAssessment; reloadSelf: () => Promise<void> }) {
  const [levels, setLevels] = useState<Record<string, { level: string | null; comment: string }>>(
    () => Object.fromEntries(data.criteria.map((c) => [c.key, { level: c.level, comment: c.comment ?? '' }])))
  const [needs, setNeeds] = useState(data.developmentNeeds ?? '')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const stage = detail.stages.find((s) => s.key === data.stageKey)
  // Sprawozdanie (pierwsza ocena) zamyka przekazanie — oceniany składa je, a nie tylko pokazuje przełożonemu.
  const closesStage = detail.schema.stages?.find((s) => s.key === data.stageKey)?.completedBy === 'evaluated'
  const editable = data.canEdit
  // Sprawozdanie pierwszej oceny: formularz z załącznika nr 3 — treść, pod nią samoocena jako tekst, podpis = złożenie.
  const form = data.reportForm ?? null
  const [report, setReport] = useState(form?.report ?? '')
  const signatureField = form?.signatureFieldKey
    ? detail.schema.sections.flatMap((s) => s.fields).find((f) => f.key === form.signatureFieldKey)
    : undefined
  const signed = !!signatureField && detail.signatures.some((s) => s.fieldKey === signatureField.key)
  // Złożyć można dopiero w terminie wyznaczonym przez przełożonego (backend) i z opisem zadań.
  const blocked = form ? form.submitBlockedReason ?? (report.trim() ? null : 'Najpierw opisz w sprawozdaniu zadania z przepracowanego okresu.') : null

  const body = () => ({
    criteria: data.criteria.map((c) => ({ criterionKey: c.key, level: levels[c.key]?.level ?? null, comment: levels[c.key]?.comment || null })),
    developmentNeeds: needs || null,
    report: form ? report || null : null,
  })
  async function save() {
    setBusy(true)
    try {
      await api(`evaluations/${detail.id}/self-assessment`, 'PUT', body())
      setStatus('Zapisano wersję roboczą — przełożony jej jeszcze nie widzi.')
    } catch (e) {
      setStatus((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  async function send() {
    await api(`evaluations/${detail.id}/self-assessment`, 'PUT', body())
    await api(`evaluations/${detail.id}/self-assessment/submit`, 'POST')
    setStatus('')
    await reloadSelf()
  }
  async function submit() {
    setBusy(true)
    try {
      await send()
      await reload()
    } catch (e) {
      setStatus((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="step">
      <div className="step-head">
        <h2>{form ? 'Sprawozdanie' : detail.schema.stages?.find((s) => s.key === data.stageKey)?.phase === 'Sprawozdanie' ? 'Sprawozdanie i samoocena' : 'Samoocena'}</h2>
        {/* Termin samooceny z API (przy okresowej 30 dni przed terminem oceny); po terminie przekazać nadal można. */}
        {data.submitted
          ? <Pill tone="done" icon="done">{closesStage ? 'złożone' : 'przekazana'} {fmtDate(data.submittedAt)}</Pill>
          : (data.dueTo ?? stage?.dueTo) && <Pill tone={data.overdue ? 'attention' : 'neutral'} icon="clock">do {fmtDate(data.dueTo ?? stage?.dueTo)}{data.overdue && ' · po terminie'}</Pill>}
      </div>
      {!data.stageOpen && !data.submitted && <p className="callout info">Samoocena będzie dostępna w etapie „{stage?.title ?? data.stageKey}”.</p>}
      {form ? (
        <>
          <p className="muted small">
            Formularz sprawozdania z załącznika nr 3 do rozporządzenia. Przełożony zobaczy je dopiero po złożeniu i omówi na rozmowie oceniającej.
          </p>
          <div className="card">
            <dl className="summary">
              <dt>Nazwa urzędu</dt><dd>{form.office || '—'}</dd>
              <dt>Imię i nazwisko</dt><dd>{[form.firstName, form.lastName].filter(Boolean).join(' ') || '—'}</dd>
              <dt>Komórka organizacyjna</dt><dd>{form.department || '—'}</dd>
              <dt>Stanowisko pracy</dt><dd>{form.position || '—'}</dd>
              <dt>Termin złożenia</dt>
              <dd>{form.periodFrom || form.periodTo ? `od ${fmtDate(form.periodFrom)} do ${fmtDate(form.periodTo)} · wyznaczył przełożony` : 'wyznaczy przełożony na rozmowie wstępnej'}</dd>
            </dl>
          </div>
          <label className="block-label card">Sprawozdanie dotyczące zadań realizowanych w trakcie przepracowanego okresu
            <span className="muted small">
              Opisz po kolei: zadania z opisu stanowiska i inne istotne zadania, problemy przy ich wykonywaniu i sposób ich
              rozwiązania, zdobyte umiejętności i wiedzę oraz wnioski, jak usprawnić wykonywanie zadań. Pisz chronologicznie
              i konkretnie — najważniejsze zadania na Twoim stanowisku.
            </span>
            <textarea rows={12} maxLength={20000} value={report} disabled={!editable} onChange={(e) => setReport(e.target.value)} />
          </label>
          <h3>Samoocena w elementach oceny</h3>
          <p className="muted small">Na formularzu sprawozdania samoocena i potrzeby rozwojowe są dopisane pod Twoim tekstem.</p>
        </>
      ) : (
        <p className="muted small">Oceń, jak w tym okresie wyglądała Twoja praca w każdym kryterium. Przełożony zobaczy samoocenę dopiero po jej przekazaniu i omówi ją na rozmowie oceniającej.</p>
      )}
      {data.criteria.map((c) => (
        <fieldset key={c.key} className="card self-criterion" disabled={!editable}>
          <legend><strong>{c.label}</strong></legend>
          <div className="chips" role="radiogroup" aria-label={c.label}>
            {data.scale.map((o) => (
              <button key={o.key} type="button" role="radio" aria-checked={levels[c.key]?.level === o.key}
                className={levels[c.key]?.level === o.key ? 'chip-button active' : 'chip-button'}
                onClick={() => setLevels((l) => ({ ...l, [c.key]: { comment: l[c.key]?.comment ?? '', level: l[c.key]?.level === o.key ? null : o.key } }))}>
                {o.label}
              </button>
            ))}
          </div>
          <label className="block-label">Przykłady z okresu (opcjonalnie)
            <textarea rows={2} maxLength={2000} value={levels[c.key]?.comment ?? ''}
              onChange={(e) => setLevels((l) => ({ ...l, [c.key]: { level: l[c.key]?.level ?? null, comment: e.target.value } }))} />
          </label>
        </fieldset>
      ))}
      <label className="block-label card">Potrzeby rozwojowe (szkolenia, zadania, wsparcie)
        <textarea rows={3} value={needs} disabled={!editable} onChange={(e) => setNeeds(e.target.value)} />
      </label>
      {status && <p className="muted small" role="status">{status}</p>}
      {form && (editable || data.submitted) && (
        <div className="step-actions">
          {editable && <button type="button" className="secondary" onClick={save} disabled={busy}>Zapisz roboczo</button>}
          <span className="grow" />
          <PdfButton detail={detail} report label={data.submitted ? 'Pobierz sprawozdanie (PDF)' : 'Podgląd PDF (zapisana wersja)'} />
        </div>
      )}
      {form && editable && (
        <div className="card">
          <h3>Miejscowość, data i podpis</h3>
          <p className="muted small">Podpis składa sprawozdanie — zamyka etap i potem nie zmienisz treści.</p>
          {signatureField && (
            <SignatureField field={signatureField} detail={detail} onSigned={reload} blockedReason={blocked ?? undefined}
              submitLabel="Podpisz i złóż sprawozdanie" afterSign={send} />
          )}
          {(!signatureField || signed) && (
            <div className="step-actions">
              {blocked && <p className="muted small grow">{blocked}</p>}
              <span className="grow" />
              <ConfirmButton primary disabled={busy || !!blocked} onConfirm={submit}
                question="Złożenie zamyka etap sprawozdania, potem nie zmienisz treści." confirmLabel="Złóż sprawozdanie">
                Złóż sprawozdanie
              </ConfirmButton>
            </div>
          )}
        </div>
      )}
      {editable && !form && (
        <div className="step-actions">
          <button type="button" className="secondary" onClick={save} disabled={busy}>Zapisz roboczo</button>
          <span className="grow" />
          <ConfirmButton primary disabled={busy} onConfirm={submit}
            question={closesStage ? 'Złożenie zamyka etap sprawozdania, potem nie zmienisz treści.' : 'Po przekazaniu nie zmienisz samooceny.'}
            confirmLabel={closesStage ? 'Złóż sprawozdanie' : 'Przekaż przełożonemu'}>
            {closesStage ? 'Złóż sprawozdanie' : 'Przekaż przełożonemu'}
          </ConfirmButton>
        </div>
      )}
    </div>
  )
}

/**
 * Wynik dla ocenianego — dopiero po sporządzeniu oceny (do tego czasu backend nie zwraca mu roboczej oceny:
 * odpowiedzi etapu ocen są ukryte, a `scoring` = null). Pokazuje to, z czym oceniany się zapoznaje przed podpisem.
 */
function OwnResult({ detail }: { detail: Detail }) {
  const scores = scoresFieldOf(detail.schema)
  const rating = detail.stages.find((s) => s.key === scores?.section.stage)
  if (!scores || rating?.status !== 'Completed') return null
  const keys = detail.schema.scoring ?? {}
  const avg = detail.scoring?.average ?? (keys.average ? answerOf(detail, keys.average)?.valueNumber : null)
  const levelKey = detail.scoring?.level ?? (keys.level ? answerOf(detail, keys.level)?.valueText : null)
  const levelLabel = detail.scoring?.levelLabel ?? keys.levels?.find((l) => l.key === levelKey)?.label
  const result = detail.scoring?.result ?? (keys.result ? answerOf(detail, keys.result)?.valueText : null)
  const texts = detail.schema.sections.filter((s) => s.stage === rating.key).flatMap((s) => s.fields)
    .filter((f) => f.type === 'longText' && answerOf(detail, f.key)?.valueText)
  return (
    <div className="card">
      <h3>Ocena {isFirstTemplate(detail.templateCode) ? 'dokonana' : 'sporządzona'} {fmtDate(rating.completedOn)}</h3>
      <dl className="summary">
        {criteriaOf(detail).map((c) => (
          <Fragment key={c.key}><dt>{c.label}</dt><dd>{answerOf(detail, scores.field.key, c.key)?.valueNumber ?? '—'} pkt</dd></Fragment>
        ))}
        {avg != null && <><dt>Średnia</dt><dd><strong>{Number(avg).toFixed(2)}</strong></dd></>}
        {levelLabel && <><dt>Poziom</dt><dd><strong>{levelLabel.toLowerCase()}</strong></dd></>}
        {result && <><dt>Ocena</dt><dd><strong>{RESULT_LABELS[result]?.toLowerCase() ?? result}</strong></dd></>}
        {texts.map((f) => <Fragment key={f.key}><dt>{f.label}</dt><dd className="pre-line">{answerOf(detail, f.key)?.valueText}</dd></Fragment>)}
      </dl>
    </div>
  )
}

/** Podpisy ocenianego: część I / rozmowy, zapoznanie z oceną; pouczenie o sprzeciwie. */
export function OwnSignaturesStep({ detail, reload, sections }: StepProps & { sections: string[] }) {
  const objection = detail.stages.find((s) => s.optional)
  return (
    <div className="step">
      <div className="step-head"><h2>Moje podpisy</h2></div>
      <p className="muted small">Podpisz tutaj albo wybierz „Podpisz na telefonie lub tablecie”, żeby złożyć podpis odręczny przez kod QR.</p>
      <OwnResult detail={detail} />
      {detail.schema.sections.filter((s) => sections.includes(s.key)).map((section) => {
        const locked = detail.lockedSections.includes(section.key)
        const stage = detail.stages.find((s) => s.key === section.stage)
        return (
          <div key={section.key} className="card">
            <h3>{section.part ? `${section.part} · ` : ''}{section.title}</h3>
            {stage?.status === 'Pending' && stage.dueTo && <p className="muted small">Termin etapu: {fmtDate(stage.dueTo)}</p>}
            {section.fields.filter((f) => f.type === 'signature' && f.role === 'evaluated').map((f) => (
              <SignatureField key={f.key} field={f} detail={detail} onSigned={reload} locked={locked} />
            ))}
            {section.fields.filter((f) => f.type === 'notice').map((f) => <p key={f.key} className="notice small">{f.label}</p>)}
          </div>
        )
      })}
      {objection?.status === 'Pending' && objection.dueTo && (
        <p className="callout attention">Sprzeciw do dyrektora generalnego urzędu możesz złożyć do {fmtDate(objection.dueTo)}.</p>
      )}
    </div>
  )
}
