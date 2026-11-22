import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { api } from '../api'
import { StepHeader, StepHeaderContext, type StepProgress } from '../v2'
import { StageNav, TermCard, stageIndexOf } from '../v2/WizardNav'
import { WizardPanel } from '../v2/WizardPanel'
import { setAssistantStep } from '../assistant/AssistantWidget'
import { ErrorState, Skeleton, useDelayedFlag } from '../v2/motion'
import { PdfButton, type Step, type StepProps } from './common'
import { canSignNow } from './data'
import { AcknowledgementStep, ResultStep, ReviewStep, SectionStep } from './FinalSteps'
import { NotesStep, StageStep } from './NotesStep'
import { ObjectionStep } from './objection-step'
import { OwnCriteriaStep, OwnSignaturesStep, SelfAssessmentStep } from './OwnSteps'
import { IndicatorsStep, InterviewStep } from './RatingSteps'
import { CriteriaStep, KickoffStep, PartOneStep, StartStep } from './StartSteps'
import { currentStageIndex, stageStartText } from './stage-lock'
import './stage-lock.css'
import './mw-wizard.css'
import {
  daysUntil, indicatorFieldOf, isFirstTemplate, scoresFieldOf, sheetLetter, type Check, type Detail, type Section, type SectionCheck,
} from './types'

const GROUP_START = 'Start cyklu'
const GROUP_DURING = 'W trakcie'
const GROUP_RATING = 'Ocena'
const GROUP_OWN = 'Moja ocena'

const onlySignatures = (s: Section) => s.fields.every((f) => ['signature', 'person', 'notice'].includes(f.type))
const shortTitle = (title: string, fallback?: string) => (title.length <= 40 || !fallback ? title : fallback)

/**
 * Kroki kreatora z szablonu: etap pierwszy (kryteria / rozmowa wstępna) → „Start cyklu”, etapy pośrednie i notatki →
 * „W trakcie”, etap z ocenami cząstkowymi i zapoznanie → „Ocena”. Tytuły kroków arkusza z tytułów sekcji szablonu.
 */
function buildSteps(detail: Detail, check: Check | null): Step[] {
  const schema = detail.schema
  const stageDefs = schema.stages ?? []
  const stageStatus = (key: string | null | undefined) => detail.stages.find((s) => s.key === key)?.status
  const closed = (key: string | null | undefined) => !!key && stageStatus(key) !== undefined && stageStatus(key) !== 'Pending'
  const sectionCheck = (key: string): SectionCheck | undefined => check?.sections.find((s) => s.key === key)
  const sectionsDone = (keys: string[]) => keys.length > 0 && keys.every((k) => {
    const c = sectionCheck(k)
    return c ? c.complete || !c.visible : detail.lockedSections.includes(k)
  })
  const phaseOf = (key: string) => stageDefs.find((s) => s.key === key)?.phase
  const first = isFirstTemplate(detail.templateCode)

  const scores = scoresFieldOf(schema)
  const firstStage = detail.stages[0]?.key ?? null
  const ratingStage = scores?.section.stage ?? detail.stages.find((s) => !s.optional && s.key !== firstStage)?.key ?? null
  const ackStage = detail.stages.find((s) => s.key === 'acknowledgement')?.key
    ?? detail.stages.find((s) => schema.sections.some((x) => x.stage === s.key && x.key.includes('acknowledg')))?.key ?? null

  if (detail.isOwn) {
    const selfStage = stageDefs.find((s) => s.selfAssessment)
    const steps: Step[] = [
      { id: 'own-criteria', group: GROUP_OWN, title: first ? 'Elementy oceny i oczekiwania' : 'Kryteria i oczekiwania', done: closed(firstStage), stageKey: firstStage, sections: [] },
    ]
    if (selfStage) {
      steps.push({ id: 'self', group: GROUP_OWN, title: selfStage.phase === 'Sprawozdanie' ? 'Sprawozdanie (samoocena)' : 'Samoocena', done: !detail.canEditSelfAssessment && closed(selfStage.key), stageKey: selfStage.key, sections: [] })
    }
    // Podpis pod sprawozdaniem składa się w kroku sprawozdania (podpis = złożenie), nie w „Moich podpisach”.
    const reportStage = selfStage?.completedBy === 'evaluated' ? selfStage.key : null
    const ownSignatureSections = schema.sections.filter((s) => s.stage !== reportStage && s.fields.some((f) => f.type === 'signature' && f.role === 'evaluated'))
    steps.push({
      id: 'own-sign', group: GROUP_OWN, title: 'Moje podpisy', stageKey: ackStage, sections: ownSignatureSections.map((s) => s.key),
      done: ownSignatureSections.flatMap((s) => s.fields).filter((f) => f.type === 'signature' && f.role === 'evaluated').every((f) => detail.signatures.some((s) => s.fieldKey === f.key)),
    })
    return steps
  }

  const steps: Step[] = []
  const used = new Set<string>()
  const take = (keys: string[]) => keys.forEach((k) => used.add(k))

  // --- Start cyklu ---
  const startSections = schema.sections.filter((s) => s.stage === firstStage).map((s) => s.key)
  const hasCriteriaPicker = schema.sections.some((s) => s.stage === firstStage && s.fields.some((f) => f.type === 'criteriaSelection'))
  const hasProgress = detail.answers.length > 0 || detail.signatures.length > 0
  steps.push({ id: 'start', group: GROUP_START, title: first ? 'Ścieżka i terminy' : 'Ścieżka oceny', done: hasProgress || closed(firstStage), stageKey: firstStage, sections: [] })
  if (hasCriteriaPicker || schema.competencyModel) {
    const criteriaSection = schema.sections.find((s) => s.fields.some((f) => f.type === 'criteriaSelection'))
    const picked = criteriaSection && detail.answers.some((a) => criteriaSection.fields.some((f) => f.key === a.fieldKey && f.type === 'criteriaSelection'))
    const criteriaIssues = check?.sections.find((s) => s.key === criteriaSection?.key)?.issues.filter((i) => i.blocking && criteriaSection?.fields.some((f) => f.key === i.fieldKey && f.type === 'criteriaSelection')) ?? []
    steps.push({
      id: 'criteria', group: GROUP_START, title: first ? 'Elementy oceny i wskaźniki' : 'Kryteria i wskaźniki', stageKey: firstStage, sections: [],
      done: closed(firstStage) || (hasCriteriaPicker ? !!picked && criteriaIssues.length === 0 : hasProgress),
    })
  }
  const evaluatorSigned = schema.sections.filter((s) => s.stage === firstStage).flatMap((s) => s.fields)
    .some((f) => f.type === 'signature' && f.role !== 'evaluated' && detail.signatures.some((x) => x.fieldKey === f.key))
  steps.push({ id: 'kickoff', group: GROUP_START, title: (firstStage && phaseOf(firstStage)) ?? 'Rozmowa rozpoczynająca', done: closed(firstStage) || evaluatorSigned, stageKey: firstStage, sections: [] })
  steps.push({ id: 'part1', group: GROUP_START, title: first ? 'Dane i podpisy' : 'Część I i podpisy', done: closed(firstStage), stageKey: firstStage, sections: startSections })
  take(startSections)

  // --- W trakcie ---
  steps.push({ id: 'notes', group: GROUP_DURING, title: 'Notatki', done: closed(ratingStage), stageKey: ratingStage, sections: [] })
  for (const stage of detail.stages) {
    if (stage.optional || stage.key === firstStage || stage.key === ratingStage || stage.key === ackStage) continue
    const own = schema.sections.filter((s) => s.stage === stage.key).map((s) => s.key)
    take(own)
    steps.push({ id: `stage:${stage.key}`, group: GROUP_DURING, title: phaseOf(stage.key) ?? stage.title, done: closed(stage.key), stageKey: stage.key, sections: own })
  }

  // --- Ocena ---
  const ratingSections = schema.sections.filter((s) => s.stage === ratingStage)
  const indicatorField = scores && indicatorFieldOf(schema, scores.field.key)
  if (scores) {
    take([scores.section.key])
    if (indicatorField && schema.competencyModel) {
      steps.push({ id: 'indicators', group: GROUP_RATING, title: 'Ocena wskaźników', done: closed(ratingStage) || sectionsDone([scores.section.key]), stageKey: ratingStage, sections: [scores.section.key] })
    } else {
      steps.push({ id: `section:${scores.section.key}`, group: GROUP_RATING, title: shortTitle(scores.section.title, scores.field.label), done: sectionsDone([scores.section.key]), stageKey: ratingStage, sections: [scores.section.key] })
    }
  }
  const interview = ratingSections.find((s) => s.key.toLowerCase().includes('interview') && !used.has(s.key))
  if (interview) {
    take([interview.key])
    steps.push({ id: 'interview', group: GROUP_RATING, title: interview.title, done: sectionsDone([interview.key]), stageKey: ratingStage, sections: [interview.key] })
  }
  const resultKey = schema.scoring?.result
  const resultSection = ratingSections.find((s) => resultKey && s.fields.some((f) => f.key === resultKey))
  const signatureSections = ratingSections.filter((s) => !used.has(s.key) && s !== resultSection && onlySignatures(s)).map((s) => s.key)
  const resultSections = ratingSections.filter((s) => !used.has(s.key) && !signatureSections.includes(s.key)).map((s) => s.key)
  if (resultSections.length) {
    take(resultSections)
    const visible = resultSections.filter((k) => sectionCheck(k)?.visible !== false)
    steps.push({ id: 'result', group: GROUP_RATING, title: shortTitle(resultSection?.title ?? 'Arkusz', 'Przyznanie oceny'), done: sectionsDone(visible), stageKey: ratingStage, sections: resultSections })
  }
  take(signatureSections)
  steps.push({ id: 'review', group: GROUP_RATING, title: 'Sprawdź i podpisz', done: closed(ratingStage), stageKey: ratingStage, sections: signatureSections })
  if (ackStage) {
    const ackSections = schema.sections.filter((s) => s.stage === ackStage).map((s) => s.key)
    take(ackSections)
    steps.push({ id: 'ack', group: GROUP_RATING, title: 'Zapoznanie', done: closed(ackStage), stageKey: ackStage, sections: ackSections })
  }
  // Sprzeciw (art. 83 ustawy): etap opcjonalny bez sekcji — krok H16 w etapie „Okno sprzeciwu”.
  const objection = detail.stages.find((s) => s.key === 'objection')
  if (objection) {
    steps.push({ id: 'objection', group: GROUP_RATING, title: 'Sprzeciw', done: closed(objection.key), stageKey: objection.key, sections: [] })
  }

  // Sekcje spoza znanych kroków (inne szablony) — każda jako osobny krok, żeby nic nie zginęło.
  for (const section of schema.sections.filter((s) => !used.has(s.key))) {
    steps.push({ id: `section:${section.key}`, group: GROUP_RATING, title: section.title, done: sectionsDone([section.key]), stageKey: section.stage, sections: [section.key] })
  }
  return steps
}

function defaultStep(detail: Detail, steps: Step[]): string {
  if (detail.isOwn) {
    // Najpierw podpis, który można złożyć teraz (kolejność i termin), potem samoocena, gdy można ją edytować.
    const ownSign = steps.find((s) => s.id === 'own-sign')
    const unsignedNow = detail.schema.sections.filter((s) => ownSign?.sections.includes(s.key)).flatMap((s) => s.fields)
      .some((f) => f.type === 'signature' && f.role === 'evaluated' && canSignNow(detail, f))
    if (unsignedNow) return 'own-sign'
    const self = steps.find((s) => s.id === 'self')
    if (detail.canEditSelfAssessment && self) return self.id
    return 'own-criteria'
  }
  if (detail.isFinal) return steps.find((s) => s.id === (detail.status === 'objection_filed' ? 'objection' : 'ack'))?.id ?? steps[steps.length - 1].id
  if (detail.phase === 'Oczekuje na start') return 'start'
  const current = detail.currentStageKey
  const ratingStarted = detail.answers.some((a) => steps.some((s) => s.id === 'indicators') && a.fieldKey === indicatorFieldOf(detail.schema, scoresFieldOf(detail.schema)?.field.key ?? '')?.key)
  const candidates = steps.filter((s) => s.stageKey === current && !s.done && s.id !== 'start')
  if (current && steps.find((s) => s.id === 'notes')?.stageKey === current && !ratingStarted) {
    const due = daysUntil(detail.stages.find((s) => s.key === current)?.dueTo)
    if (due == null || due > 30) return 'notes'
  }
  return candidates.find((s) => s.id !== 'notes')?.id ?? candidates[0]?.id ?? steps.find((s) => !s.done)?.id ?? steps[0].id
}

/**
 * Ekran oceny jako kreator (H08 v2): lewa kolumna z arkuszem, 5 etapami v5 i kartą terminu; treść kroku z nagłówkiem
 * (twarz, temat, segmenty); prawy panel z zakładkami Notatki / ✦ Asystent.
 */
export function EvaluationWizard({ id, onBack, onShowSheet, onOpenEvaluation }: {
  id: number
  onBack: () => void
  onShowSheet: () => void
  onOpenEvaluation?: (id: number) => void
}) {
  const [detail, setDetail] = useState<Detail | null>(null)
  const [check, setCheck] = useState<Check | null>(null)
  const [error, setError] = useState('')
  const [stepId, setStepId] = useState<string | null>(null)
  // Nagłówek kroku (temat, segmenty) — krok ustawia go hookiem useStepHeader.
  const [header, setHeaderState] = useState<{ topic?: ReactNode; progress?: StepProgress | null } | null>(null)
  const setHeader = useCallback((next: { topic?: ReactNode; progress?: StepProgress | null } | null) => setHeaderState(next), [])

  // Szczegóły i /check razem; krok startowy wybieramy raz, przy pierwszym wczytaniu (potem prowadzi użytkownik).
  const fetchAll = useCallback(async () => {
    const d = await api<Detail>(`evaluations/${id}`)
    // Starsze API bez /check — kreator działa, tylko bez ptaszków i listy braków.
    const c = await api<Check>(`evaluations/${id}/check`).catch(() => null)
    return { d, c }
  }, [id])
  const apply = useCallback(({ d, c }: { d: Detail; c: Check | null }) => {
    setDetail(d)
    setCheck(c)
    setError('')
    setStepId((current) => current ?? defaultStep(d, buildSteps(d, c)))
  }, [])
  const load = useCallback(() => fetchAll().then(apply, (e: Error) => setError(e.message)), [fetchAll, apply])

  useEffect(() => {
    let active = true
    fetchAll().then((r) => active && apply(r), (e: Error) => active && setError(e.message))
    return () => {
      active = false
    }
  }, [fetchAll, apply])

  const steps = useMemo(() => (detail ? buildSteps(detail, check) : []), [detail, check])
  // Asystent (prawy dolny róg) dostaje bieżący krok jako część kontekstu ekranu.
  const shown = steps.find((s) => s.id === stepId) ?? steps[0]
  const [shownId, shownTitle] = [shown?.id, shown?.title]
  useEffect(() => setAssistantStep(shownId && shownTitle ? { id: shownId, title: shownTitle } : null), [shownId, shownTitle])
  useEffect(() => () => setAssistantStep(null), [])

  // Przejście kroku (karta 07): kierunek wjazdu treści (dalej = z prawej, wstecz = z lewej) i fokus na nagłówku kroku.
  const [dir, setDir] = useState<1 | -1>(1)
  const frameRef = useRef<HTMLDivElement>(null)
  const focusPending = useRef(false)
  useEffect(() => {
    if (!focusPending.current) return
    focusPending.current = false
    const frame = frameRef.current
    const heading = frame?.querySelector<HTMLElement>('h1, h2') ?? frame?.parentElement?.querySelector<HTMLElement>('.v2-stephead-title')
    if (!heading) return
    if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1')
    heading.focus({ preventScroll: true })
  }, [stepId])

  if (!detail) return <WizardLoading error={error} onRetry={() => { setError(''); void load() }} />

  const go = (next: string) => {
    const from = steps.findIndex((s) => s.id === (stepId ?? steps[0]?.id))
    const to = steps.findIndex((s) => s.id === next)
    if (next !== stepId) {
      setDir(to >= 0 && from >= 0 && to < from ? -1 : 1)
      focusPending.current = true
    }
    setStepId(next)
    window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }
  const step = steps.find((s) => s.id === stepId) ?? steps[0]
  // Etapy późniejsze niż bieżący: kłódka w stepperze, treść tylko do odczytu (canEdit: false) i linia „Ten etap zacznie się …”.
  const nowIndex = currentStageIndex(detail, steps)
  const stepIndex = stageIndexOf(step)
  const locked = nowIndex != null && stepIndex > nowIndex && !step.done
  const props: StepProps = { detail: locked ? { ...detail, canEdit: false } : detail, check, steps, reload: load, go, onOpenEvaluation }
  const backTo = locked ? defaultStep(detail, steps) : null

  const ratingStageKey = steps.find((s) => s.id === 'indicators' || s.id === 'review')?.stageKey ?? null
  const letter = sheetLetter(detail.templateCode)
  const sheet = isFirstTemplate(detail.templateCode) ? 'Pierwsza ocena' : `Arkusz ${letter ?? ''}`.trim()
  const hasNotes = steps.some((s) => s.id === 'notes')

  return (
    <section className="wizard wz mw-wizard-in">
      <aside className="wizard-nav wz-left">
        <StageNav sheet={sheet} steps={steps} currentId={step.id} onGo={go} lockedAfter={nowIndex} />
        <TermCard detail={detail} ratingStageKey={ratingStageKey} />
      </aside>
      <div className="wizard-main">
        <div className="wizard-toolbar">
          <button type="button" className="link" onClick={onBack}>← Wróć</button>
          <span className="grow" />
          {!detail.canEdit && !detail.isOwn && <span className="muted small">Tylko podgląd</span>}
          <PdfButton detail={detail} />
          <button type="button" className="secondary" onClick={onShowSheet}>Cały arkusz</button>
        </div>
        <StepHeader personId={detail.employeeId} name={detail.employeeName} topic={header?.topic ?? step.title} progress={header?.progress ?? null} />
        {error && <p role="alert" className="error">{error}</p>}
        {locked && (
          <p className="wzl-locked" role="status">
            <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true">
              <rect x="3.2" y="7" width="9.6" height="6.6" rx="1.4" fill="none" stroke="currentColor" strokeWidth="1.5" />
              <path d="M5.4 7V5.2a2.6 2.6 0 0 1 5.2 0V7" fill="none" stroke="currentColor" strokeWidth="1.5" />
            </svg>
            <span className="grow">{stageStartText(detail, steps, stepIndex)} Teraz tylko podgląd.</span>
            {backTo && backTo !== step.id && (
              <button type="button" className="secondary" onClick={() => go(backTo)}>
                ← Wróć do: {steps.find((s) => s.id === backTo)?.title}
              </button>
            )}
          </p>
        )}
        <StepHeaderContext.Provider value={setHeader}>
          <div key={step.id} ref={frameRef} className="mw-step-frame" data-dir={dir === 1 ? 'next' : 'back'}>
            <StepView step={step} props={props} />
          </div>
        </StepHeaderContext.Provider>
      </div>
      <WizardPanel detail={detail} step={step.id} onAddNote={hasNotes && !detail.isOwn ? () => go('notes') : undefined} />
    </section>
  )
}

/** Karta 12: szkielet kreatora dopiero po 300 ms (szybkie wczytanie nie miga), błąd w miejscu treści z „Spróbuj ponownie”. */
function WizardLoading({ error, onRetry }: { error: string; onRetry: () => void }) {
  const show = useDelayedFlag(!error)
  if (error) return <ErrorState title="Nie udało się wczytać oceny" detail={error} onRetry={onRetry} />
  return (
    <div className="mw-wizard-loading">
      {show ? <Skeleton variant="wizard" /> : <div aria-busy="true" />}
    </div>
  )
}

function StepView({ step, props }: { step: Step; props: StepProps }): ReactNode {
  if (step.id.startsWith('stage:')) return <StageStep {...props} stepId={step.id} stageKey={step.stageKey!} />
  if (step.id.startsWith('section:')) return <SectionStep {...props} stepId={step.id} title={step.title} sections={step.sections} />
  switch (step.id) {
    case 'start': return <StartStep {...props} />
    case 'criteria': return <CriteriaStep {...props} />
    case 'kickoff': return <KickoffStep {...props} />
    case 'part1': return <PartOneStep {...props} sections={step.sections} />
    case 'notes': return <NotesStep {...props} />
    case 'indicators': return <IndicatorsStep {...props} />
    case 'interview': return <InterviewStep {...props} sections={step.sections} />
    case 'result': return <ResultStep {...props} sections={step.sections} title={step.title} />
    case 'review': return <ReviewStep {...props} sections={step.sections} />
    case 'ack': return <AcknowledgementStep {...props} sections={step.sections} />
    case 'objection': return <ObjectionStep {...props} />
    case 'own-criteria': return <OwnCriteriaStep {...props} />
    case 'self': return <SelfAssessmentStep {...props} />
    case 'own-sign': return <OwnSignaturesStep {...props} sections={step.sections} />
    default: return <p className="muted">Nieznany krok.</p>
  }
}
