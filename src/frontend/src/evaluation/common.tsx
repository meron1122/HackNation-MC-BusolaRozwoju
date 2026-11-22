import { useState, type ReactNode } from 'react'
import { apiDownload } from '../api'
import { completeStage, withoutAutoFilled } from './data'
import { daysLabel, fmtDate, plural, today, type Check, type CheckIssue, type Detail, type Topic } from './types'

/** Krok kreatora oceny: grupa w lewym menu, ptaszek z `check`, etap szablonu. */
export type Step = {
  id: string
  group: string
  title: string
  done: boolean
  stageKey: string | null
  /** Sekcje szablonu, które ten krok pokazuje (do „Zmień” z listy braków). */
  sections: string[]
}

export type StepProps = {
  detail: Detail
  check: Check | null
  steps: Step[]
  reload: () => Promise<void>
  go: (stepId: string) => void
  onOpenEvaluation?: (id: number) => void
}

export function Pill({ tone = 'neutral', children }: { tone?: 'neutral' | 'info' | 'ok' | 'warn' | 'danger'; children: ReactNode }) {
  return <span className={`pill ${tone}`}>{children}</span>
}

export function DuePill({ daysLeft, overdue, dueTo }: { daysLeft: number | null; overdue: boolean; dueTo?: string | null }) {
  const tone = overdue ? 'danger' : daysLeft == null ? 'warn' : daysLeft <= 7 ? 'warn' : 'info'
  return <Pill tone={tone}>{dueTo ? `do ${fmtDate(dueTo)} · ` : ''}{daysLabel(daysLeft, overdue)}</Pill>
}

export function PdfButton({ detail, label = 'Pobierz PDF' }: { detail: Detail; label?: string }) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function download() {
    setBusy(true)
    try {
      await apiDownload(`evaluations/${detail.id}/pdf`, `ocena-${detail.id}.pdf`)
      setError('')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <span className="pdf-button">
      <button type="button" className="secondary" onClick={download} disabled={busy}>{busy ? 'Pobieranie…' : label}</button>
      {error && <span role="alert" className="error small">{error}</span>}
    </span>
  )
}

/** Lista braków z `GET /check`: blokujące (czerwone) i ostrzeżenia, z przepisem i przejściem do kroku. */
export function IssueList({ issues, steps, go, title }: { issues: CheckIssue[]; steps: Step[]; go: (id: string) => void; title?: string }) {
  if (issues.length === 0) return null
  const blocking = issues.filter((i) => i.blocking)
  const warnings = issues.filter((i) => !i.blocking)
  const stepOf = (i: CheckIssue) => (i.sectionKey ? steps.find((s) => s.sections.includes(i.sectionKey!)) : undefined)
  const item = (i: CheckIssue, n: number) => {
    const step = stepOf(i)
    return (
      <li key={n}>
        {i.message}{i.legalRef && <span className="muted"> · {i.legalRef}</span>}
        {step && <> → <button type="button" className="link" onClick={() => go(step.id)}>Uzupełnij</button></>}
      </li>
    )
  }
  return (
    <>
      {blocking.length > 0 && (
        <div className="callout danger" role="alert">
          <strong>{title ?? `Nie można jeszcze zamknąć etapu · ${blocking.length} ${plural(blocking.length, 'sprawa', 'sprawy', 'spraw')} do uzupełnienia`}</strong>
          <ul>{blocking.map(item)}</ul>
        </div>
      )}
      {warnings.length > 0 && (
        <div className="callout warn">
          <strong>Ostrzeżenia (nie blokują)</strong>
          <ul>{warnings.map(item)}</ul>
        </div>
      )}
    </>
  )
}

/** Przycisk zamknięcia etapu z datą; nieaktywny, gdy `check` zgłasza braki blokujące. */
export function CompleteStage({ detail, check, stageKey, label, defaultDate, onDone, children }: {
  detail: Detail
  check: Check | null
  stageKey: string
  label: string
  defaultDate?: string | null
  onDone: () => void
  children?: ReactNode
}) {
  const [date, setDate] = useState(defaultDate ?? today())
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const stage = detail.stages.find((s) => s.key === stageKey)
  const stageCheck = check?.stages.find((s) => s.key === stageKey)
  if (!detail.canEdit || !stage || stage.status !== 'Pending') return null
  const blocking = stageCheck ? withoutAutoFilled(detail, stageKey, stageCheck.issues).some((i) => i.blocking) : false
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
    <div className="step-footer">
      <div className="grow">{children}</div>
      <label className="check">Data <input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
      <button type="button" onClick={run} disabled={disabled}>{busy ? 'Zapisywanie…' : label}</button>
      {error && <p role="alert" className="error wide">{error}</p>}
    </div>
  )
}

/** Tematy rozmowy z szablonu (stages[].topics, z rozporządzenia) — statyczna lista, nic nie zapisuje. */
export function TopicList({ topics }: { topics: Topic[] }) {
  return (
    <ol className="topics">
      {topics.map((t) => (
        <li key={t.text}>
          {t.text}{t.optional && <span className="muted"> — jeśli uzasadnione</span>}
          {t.legalRef && <span className="muted small"> · {t.legalRef}</span>}
        </li>
      ))}
    </ol>
  )
}

export function NextButton({ steps, current, go, label }: { steps: Step[]; current: string; go: (id: string) => void; label?: string }) {
  const index = steps.findIndex((s) => s.id === current)
  const next = steps[index + 1]
  if (!next) return null
  return <button type="button" onClick={() => go(next.id)}>{label ?? `Dalej: ${next.title[0].toLowerCase()}${next.title.slice(1)}`} →</button>
}
