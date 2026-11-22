import { useEffect, useState, type CSSProperties } from 'react'
import { api } from './api'
import { EmptyState } from './EmptyState'
import { openAssistant } from './assistant/AssistantWidget'
import { progressReason } from './hifi-helpers'
import './hifi-pages.css'
import { Icon } from './Icon'
import { Person } from './Person'
import { DuePill, Pill, StatusPill, type EvaluationStatus } from './evaluation/common'
import {
  fmtDate, isFirstTemplate, kindLabel, pathLabel, plural, type Progress,
} from './evaluation/types'

type TeamMember = { employeeId: number; firstName: string; lastName: string; positionName: string | null; needsAttention: boolean; evaluation: Progress | null }
type Team = { departmentName: string | null; count: number; members: TeamMember[] }

const NOT_STARTED = 'Oczekuje na start'
const ATTENTION_DAYS = 30 // W06: przypomnienie 30 dni przed terminem oceny
// Faza pierwszego etapu, gdy backend zwraca „Oczekuje na start” (Progress nie ma fazy etapu, tylko jego pełny tytuł).
const FIRST_STAGE_PHASE: Record<string, string> = { criteria: 'Rozmowa rozpoczynająca', initial_interview: 'Rozmowa wstępna' }

function useTeam() {
  const [team, setTeam] = useState<Team | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    api<Team>(`dashboard/team?days=${ATTENTION_DAYS}`).then(setTeam, (e: Error) => setError(e.message))
  }, [])
  return { team, error }
}

const fullName = (m: TeamMember) => `${m.firstName} ${m.lastName}`
const kindOf = (p: Progress) => (isFirstTemplate(p.templateCode) ? 'Pierwsza ocena' : 'Ocena okresowa')
const thisWeek = (p: Progress) => p.overdue || p.daysLeft == null || p.daysLeft <= 7

/** Etap oceny jako jeden z czterech statusów z guidelines; faza z szablonu zostaje jako dopisek. */
function statusOf(p: Progress): EvaluationStatus {
  if (p.isFinal) return p.phase === 'Anulowana' ? 'cancelled' : 'done'
  if (!p.started || p.phase === NOT_STARTED) return 'planned'
  return p.stageKey === 'acknowledgement' ? 'sign' : 'progress'
}

/** `showOverdue`: tam, gdzie obok nie ma kolumny z terminem, „po terminie” jako osobna pigułka (słowo, nie czerwień). */
export function PhasePill({ progress, showOverdue = false }: { progress: Progress | null; showOverdue?: boolean }) {
  if (!progress) return <Pill>Brak oceny</Pill>
  const status = statusOf(progress)
  return (
    <>
      {showOverdue && progress.overdue && !progress.isFinal && <Pill tone="attention" icon="clock">po terminie</Pill>}
      <StatusPill status={status} detail={status === 'progress' || status === 'done' ? progress.phase : null} />
    </>
  )
}

function actionLabel(p: Progress): string {
  if (!p.started || p.phase === NOT_STARTED) return 'Rozpocznij ocenę'
  if (p.overdue || p.stageKey === 'acknowledgement') return 'Uzupełnij'
  return 'Przygotuj'
}

/** Pigułka w „Moim zespole”: najbliższe działanie. Szary tekst: obserwacja albo zamknięta ocena (nic pilnego). */
function TeamStatus({ m }: { m: TeamMember }) {
  const p = m.evaluation
  if (!p) return <span className="muted small">Brak oceny</span>
  if (p.isFinal) return <span className="muted small">{p.phase === 'Anulowana' ? 'Anulowana' : `Zakończona · ${p.phase}`}</span>
  const what = p.phase === NOT_STARTED ? FIRST_STAGE_PHASE[p.stageKey ?? ''] ?? p.stageTitle ?? p.phase : p.phase
  const due = p.dueTo ? ` · do ${fmtDate(p.dueTo)}` : ''
  if (!m.needsAttention && !p.overdue && p.phase === 'Obserwacja') {
    return <span className="muted small">Obserwacja · ocena {p.dueTo ? fmtDate(p.dueTo).slice(3) : '—'}</span>
  }
  return (
    <Pill tone={p.overdue ? 'attention' : 'info'} icon={p.overdue ? 'clock' : statusOf(p) === 'planned' ? 'planned' : 'progress'}>
      {what}{due}{p.overdue ? ' · po terminie' : ''}
    </Pill>
  )
}

/** W01: pulpit przełożonego — „Najbliższe terminy” (z uzasadnieniem terminu) i „Mój zespół” (pigułka = działanie). */
export function TeamDashboard({ userName, onOpenEvaluation, onOpenProfile }: {
  userName: string
  onOpenEvaluation: (id: number) => void
  onOpenProfile: (employeeId: number) => void
}) {
  const { team, error } = useTeam()
  if (error) return <p role="alert" className="error">{error}</p>
  if (!team) return <p>Ładowanie…</p>

  const attention = team.members
    .filter((m) => m.needsAttention && m.evaluation)
    .sort((a, b) => (a.evaluation!.daysLeft ?? -1000) - (b.evaluation!.daysLeft ?? -1000))
  const groups = [
    { title: 'Ten tydzień', rows: attention.filter((m) => thisWeek(m.evaluation!)) },
    { title: 'Wkrótce', rows: attention.filter((m) => !thisWeek(m.evaluation!)) },
  ].filter((g) => g.rows.length)
  let index = 0

  return (
    <section className="hifi-page hifi-dashboard">
      <div className="hifi-head">
        <div>
          {/* Nazwa w tokenie bywa e-mailem konta — wtedy bez imienia. */}
          <h1 className="hifi-hello">Dzień dobry{userName.includes('@') ? '' : `, ${userName.split(' ')[0]}`}</h1>
          <p className="hifi-sub">{team.departmentName ?? 'Brak przypisanego wydziału'} · {team.count} {plural(team.count, 'osoba', 'osoby', 'osób')} w zespole</p>
        </div>
        <button type="button" className="secondary hifi-ask" onClick={openAssistant}><span aria-hidden="true" className="hifi-spark">✦</span> Zapytaj asystenta</button>
      </div>
      <div className="hifi-dash-grid">
        <section className="card hifi-card" aria-labelledby="dash-deadlines">
          <div className="hifi-card-head">
            <h2 id="dash-deadlines">Najbliższe terminy</h2>
            <span className="muted small">
              {attention.length === 0 ? `Nic pilnego w ${ATTENTION_DAYS} dni` : `${attention.length} ${plural(attention.length, 'sprawa wymaga', 'sprawy wymagają', 'spraw wymaga')} działania`}
            </span>
          </div>
          {groups.length === 0 && (
            <div className="hifi-empty">
              <Icon name="done" /> <strong>Wszystko w terminie.</strong>
              <span className="muted"> W najbliższych {ATTENTION_DAYS} dniach nie ma etapów do wykonania.</span>
            </div>
          )}
          {groups.map((g) => (
            <div key={g.title} className="hifi-group">
              <p className="hifi-group-title">{g.title}</p>
              <ul className="hifi-tasks">
                {g.rows.map((m) => {
                  const p = m.evaluation!
                  const what = p.phase === NOT_STARTED ? FIRST_STAGE_PHASE[p.stageKey ?? ''] ?? p.stageTitle : p.phase
                  const reason = progressReason(p)
                  const primary = index === 0
                  return (
                    <li key={m.employeeId} className="hifi-task" style={{ '--i': index++ } as CSSProperties}>
                      <div className="hifi-task-main">
                        <div className="hifi-task-who">
                          <Person id={m.employeeId} name={fullName(m)} detail={m.positionName} size="md" onOpen={() => onOpenProfile(m.employeeId)} />
                          <span className={`pill ${isFirstTemplate(p.templateCode) ? 'attention' : 'info'}`}>{kindOf(p)}</span>
                        </div>
                        <p className="hifi-why">
                          {what}{reason ? `: termin to ${reason}.` : '.'}
                          {p.lastReminder && <> Przypomnienie od {p.lastReminder.sentByName} ({fmtDate(p.lastReminder.sentAt)}).</>}
                        </p>
                        <DuePill daysLeft={p.daysLeft} overdue={p.overdue} />
                      </div>
                      <strong className="hifi-when">{p.dueTo ? `do ${fmtDate(p.dueTo)}` : 'niezwłocznie'}</strong>
                      <button type="button" className={primary ? '' : 'secondary'} onClick={() => onOpenEvaluation(p.evaluationId)}>{actionLabel(p)}</button>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </section>
        <section className="card hifi-card" aria-labelledby="dash-team">
          <h2 id="dash-team">Mój zespół</h2>
          {team.members.length === 0 && <EmptyState title="W zespole nie ma jeszcze pracowników">Gdy kadry przypiszą Ci pracowników, pojawią się tutaj, a Busola policzy ich terminy ocen.</EmptyState>}
          <ul className="hifi-team">
            {team.members.map((m) => (
              <li key={m.employeeId}>
                <Person id={m.employeeId} name={fullName(m)} size="md" onOpen={() => onOpenProfile(m.employeeId)}
                  detail={[m.positionName, m.evaluation && kindLabel(m.evaluation.templateCode)].filter(Boolean).join(' · ')} />
                <span className="hifi-team-status">
                  {m.evaluation ? (
                    <button type="button" className="link hifi-team-open" onClick={() => onOpenEvaluation(m.evaluation!.evaluationId)}
                      aria-label={`Ocena: ${fullName(m)}`}><TeamStatus m={m} /></button>
                  ) : <TeamStatus m={m} />}
                </span>
              </li>
            ))}
          </ul>
          {team.members.length > 0 && <p className="muted small hifi-legend">Pigułka = najbliższe działanie. Szary tekst = obserwacja, nic pilnego.</p>}
        </section>
      </div>
    </section>
  )
}

/** „Mój zespół”: tabela podwładnych z fazą, etapem i terminem oceny. */
export function TeamPage({ onOpenEvaluation, onOpenProfile }: { onOpenEvaluation: (id: number) => void; onOpenProfile: (employeeId: number) => void }) {
  const { team, error } = useTeam()
  if (error) return <p role="alert" className="error">{error}</p>
  if (!team) return <p>Ładowanie…</p>
  return (
    <section>
      <div className="toolbar"><h2>Mój zespół</h2><span className="muted">{team.departmentName}</span></div>
      {team.members.length === 0 ? <EmptyState title="W zespole nie ma jeszcze pracowników">Gdy kadry przypiszą Ci pracowników, pojawią się tutaj, a Busola policzy ich terminy ocen.</EmptyState> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Osoba</th><th>Ścieżka</th><th>Faza</th><th>Etap</th><th>Termin</th><th>Status</th><th /></tr></thead>
            <tbody>
              {team.members.map((m) => {
                const p = m.evaluation
                return (
                  <tr key={m.employeeId}>
                    <td><Person id={m.employeeId} name={fullName(m)} detail={m.positionName} onOpen={() => onOpenProfile(m.employeeId)} /></td>
                    <td>{p ? pathLabel(p.templateCode) : '—'}</td>
                    <td><PhasePill progress={p} /></td>
                    <td>{p?.stageTitle ?? '—'}</td>
                    <td className="nowrap">{p?.dueTo ? fmtDate(p.dueTo) : '—'}</td>
                    <td>{p && !p.isFinal && p.stageKey ? <DuePill daysLeft={p.daysLeft} overdue={p.overdue} /> : '—'}</td>
                    <td className="actions">{p && <button type="button" className="link" onClick={() => onOpenEvaluation(p.evaluationId)}>Otwórz ocenę</button>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
