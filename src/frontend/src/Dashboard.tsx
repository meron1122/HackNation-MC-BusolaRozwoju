import { useEffect, useState } from 'react'
import { api } from './api'
import { EmptyState } from './EmptyState'
import { DuePill, Pill, StatusPill, type EvaluationStatus } from './evaluation/common'
import {
  initials, fmtDate, isFirstTemplate, pathLabel, plural, type Progress,
} from './evaluation/types'

type TeamMember = { employeeId: number; firstName: string; lastName: string; needsAttention: boolean; evaluation: Progress | null }
type Team = { departmentName: string | null; count: number; members: TeamMember[] }

const NOT_STARTED = 'Oczekuje na start'
const ATTENTION_DAYS = 14
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

/** W01: pulpit przełożonego — „Wymaga uwagi” (ten tydzień / wkrótce) i lista zespołu z fazą oceny. */
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

  return (
    <section className="dashboard">
      <div className="toolbar">
        <div>
          {/* Nazwa w tokenie bywa e-mailem konta — wtedy bez imienia. */}
          <h2>Dzień dobry{userName.includes('@') ? '' : `, ${userName.split(' ')[0]}`}</h2>
          <p className="muted small">{team.departmentName ?? 'Brak przypisanego wydziału'} · {team.count} {plural(team.count, 'osoba', 'osoby', 'osób')} w zespole</p>
        </div>
      </div>
      <div className="dashboard-grid">
        <div className="card attention">
          <div className="card-head"><h3>Wymaga uwagi</h3><Pill tone={attention.length ? 'attention' : 'neutral'}>{attention.length} {plural(attention.length, 'zadanie', 'zadania', 'zadań')}</Pill></div>
          {groups.length === 0 && <p className="muted">Nic pilnego w najbliższych {ATTENTION_DAYS} dniach.</p>}
          {groups.map((g) => (
            <div key={g.title}>
              <p className="group-title">{g.title}</p>
              <ul className="task-list">
                {g.rows.map((m) => {
                  const p = m.evaluation!
                  const what = p.phase === NOT_STARTED ? FIRST_STAGE_PHASE[p.stageKey ?? ''] ?? p.stageTitle : p.phase
                  const primary = actionLabel(p) === 'Rozpocznij ocenę'
                  return (
                    <li key={m.employeeId}>
                      <span className="initials" aria-hidden="true">{initials(fullName(m))}</span>
                      <div className="grow">
                        <strong>{fullName(m)}</strong>
                        <p className="muted small">{kindOf(p)} · {what?.toLowerCase()}{p.dueTo && ` do ${fmtDate(p.dueTo)}`}</p>
                        {p.lastReminder && <p className="muted small">Przypomnienie od {p.lastReminder.sentByName} · {fmtDate(p.lastReminder.sentAt)}</p>}
                      </div>
                      <DuePill daysLeft={p.daysLeft} overdue={p.overdue} />
                      <button type="button" className={primary ? '' : 'secondary'} onClick={() => onOpenEvaluation(p.evaluationId)}>{actionLabel(p)}</button>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
        <div className="card">
          <h3>Mój zespół</h3>
          {team.members.length === 0 && <EmptyState title="W zespole nie ma jeszcze pracowników">Gdy kadry przypiszą Ci pracowników, pojawią się tutaj, a Busola policzy ich terminy ocen.</EmptyState>}
          <ul className="team-list">
            {team.members.map((m) => (
              <li key={m.employeeId}>
                <button type="button" className="link person-link"
                  onClick={() => (m.evaluation ? onOpenEvaluation(m.evaluation.evaluationId) : onOpenProfile(m.employeeId))}>{fullName(m)}</button>
                <span className="grow" />
                {m.evaluation && <span className="muted small">{pathLabel(m.evaluation.templateCode)}</span>}
                <PhasePill progress={m.evaluation} showOverdue />
              </li>
            ))}
          </ul>
        </div>
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
                    <td><button type="button" className="link person-link" onClick={() => onOpenProfile(m.employeeId)}>{m.lastName} {m.firstName}</button></td>
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
