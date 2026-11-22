import { useEffect, useId, useState, type CSSProperties } from 'react'
import { api } from './api'
import { EmptyState } from './EmptyState'
import { DashTimeline, type TimelineRow } from './dash-timeline'
import { DashSkeleton, MiniStepper, TilesSkeleton, useLoad } from './dash-parts'
import { EmptyEnter, Loadable } from './v2/motion'
import { cycleEnd, shortAction, stageLabel, stageRef, stageWindow, taskOf, termWord } from './dash-model'
import { progressReason } from './hifi-helpers'
import './hifi-pages.css'
import './dash-v2.css'
import { Avatar } from './Avatar'
import { DuePill, Pill, StatusPill, type EvaluationStatus } from './evaluation/common'
import { fmtDate, isFirstTemplate, pathLabel, sheetLetter, type Progress } from './evaluation/types'
import { Ring } from './v2/charts'
import { askAssistant, Source } from './v2/Info'

type TeamMember = { employeeId: number; firstName: string; lastName: string; positionName: string | null; needsAttention: boolean; evaluation: Progress | null }
type Team = { departmentName: string | null; count: number; members: TeamMember[] }
type ListItem = { id: number; startDate: string }

const NOT_STARTED = 'Oczekuje na start'
const ATTENTION_DAYS = 30 // W06: przypomnienie 30 dni przed terminem oceny

function useTeam() {
  const { data: team, error, loading, retry } = useLoad(() => api<Team>(`dashboard/team?days=${ATTENTION_DAYS}`), [])
  return { team, error, loading, retry }
}

/** Daty startu cykli (oś zespołu). `dashboard/team` ich nie podaje, więc bierzemy je z listy ocen. */
function useStarts() {
  const [starts, setStarts] = useState<Record<number, string>>({})
  useEffect(() => {
    api<ListItem[]>('evaluations').then((rows) => setStarts(Object.fromEntries(rows.map((r) => [r.id, r.startDate]))), () => setStarts({}))
  }, [])
  return starts
}

const fullName = (m: TeamMember) => `${m.firstName} ${m.lastName}`

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

/** Pilność: najpierw po terminie, potem najbliższy termin. */
const urgency = (p: Progress) => (p.overdue ? -10_000 + (p.daysLeft ?? 0) : p.daysLeft ?? 10_000)

/** „Dzień dobry, Anno”: wołacz imion żeńskich na -a; pozostałe w mianowniku. */
const vocative = (name: string) => (/a$/i.test(name) ? `${name.slice(0, -1)}o` : name)
const longToday = () => new Date().toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

const QUESTIONS = ['Co omówić na rozmowie?', 'Średnia 4,0: pozytywna?']
function ask(q: string) {
  askAssistant(q) // otwiera okno asystenta i wysyła pytanie
}

/** H01 v2: pulpit przełożonej — następny krok, kolejka, asystent i oś cykli zespołu. */
export function TeamDashboard({ userName, onOpenEvaluation, onOpenProfile }: {
  userName: string
  onOpenEvaluation: (id: number) => void
  onOpenProfile: (employeeId: number) => void
}) {
  const { team, error, loading, retry } = useTeam()
  const starts = useStarts()
  const first = userName.includes('@') ? '' : userName.split(' ')[0]
  return (
    <section className="hifi-page dash" aria-busy={loading || undefined}>
      <div className="dash-hello">
        {/* Nazwa w tokenie bywa e-mailem konta — wtedy bez imienia. */}
        <h1>Dzień dobry{first ? `, ${vocative(first)}` : ''}</h1>
        <span>{longToday()}</span>
      </div>
      <Loadable loading={loading} error={error} onRetry={retry} skeleton={<DashSkeleton />}>
        {() => <DashBody team={team!} starts={starts} onOpenEvaluation={onOpenEvaluation} onOpenProfile={onOpenProfile} />}
      </Loadable>
    </section>
  )
}

function DashBody({ team, starts, onOpenEvaluation, onOpenProfile }: {
  team: Team
  starts: Record<number, string>
  onOpenEvaluation: (id: number) => void
  onOpenProfile: (employeeId: number) => void
}) {
  const attention = team.members
    .filter((m) => m.needsAttention && m.evaluation && !m.evaluation.isFinal)
    .sort((a, b) => urgency(a.evaluation!) - urgency(b.evaluation!))
  const [next, ...queue] = attention

  const rows: TimelineRow[] = team.members.map((m) => {
    const p = m.evaluation
    const start = p ? starts[p.evaluationId] : undefined
    return {
      id: m.employeeId, name: fullName(m), progress: p, action: attention.includes(m),
      start: start ?? null, end: p && start ? cycleEnd(start, p.templateCode) : p?.stageKey === 'evaluation' ? p.dueTo : null,
    }
  })

  return (
    <>
      <div className="dash-top">
        {next ? <NextStep m={next} onOpen={onOpenEvaluation} /> : (
          <section className="card dash-hero dash-hero-empty" aria-labelledby="dash-next">
            <EmptyEnter>
              <p className="dash-eyebrow" id="dash-next">Następny krok</p>
              <h2>Wszystko w terminie</h2>
            </EmptyEnter>
          </section>
        )}
        <div className="dash-side">
          <section className="card dash-queue" aria-labelledby="dash-queue">
            <h2 id="dash-queue">W kolejce <span className="dash-count">{queue.length}</span></h2>
            {queue.length === 0 ? <EmptyEnter><p className="dash-muted">Pusto.</p></EmptyEnter> : (
              <ul>
                {queue.map((m, i) => <QueueRow key={m.employeeId} m={m} i={i} onOpen={onOpenEvaluation} />)}
              </ul>
            )}
          </section>
          <section className="card dash-ask" aria-labelledby="dash-ask">
            <h2 id="dash-ask"><span className="dash-spark" aria-hidden="true">✦</span> Zapytaj asystenta</h2>
            <div className="dash-ask-chips">
              {QUESTIONS.map((q) => <button key={q} type="button" className="dash-chip" onClick={() => ask(q)}>{q}</button>)}
            </div>
          </section>
        </div>
      </div>
      <section className="card dash-team" aria-labelledby="dash-team">
        <h2 id="dash-team">Mój zespół</h2>
        {team.members.length === 0
          ? <EmptyEnter><EmptyState title="W zespole nie ma jeszcze pracowników">Gdy kadry przypiszą Ci pracowników, pojawią się tutaj.</EmptyState></EmptyEnter>
          : <DashTimeline rows={rows} onOpenEvaluation={onOpenEvaluation} onOpenProfile={onOpenProfile} />}
      </section>
    </>
  )
}

/** Hero „Następny krok”: twarz, zadanie, pierścień dni, termin ze źródłem ↗, mini-stepper i jedna akcja. */
function NextStep({ m, onOpen }: { m: TeamMember; onOpen: (id: number) => void }) {
  const p = m.evaluation!
  const id = useId()
  const task = taskOf(p, m.firstName)
  const sheet = sheetLetter(p.templateCode)
  const reason = progressReason(p)
  const ref = stageRef(p)
  const days = p.daysLeft ?? 0
  return (
    <section className="card dash-hero" aria-labelledby={id}>
      <p className="dash-eyebrow">Następny krok</p>
      <div className="dash-hero-main">
        <Avatar path={`org/${m.employeeId}/avatar`} name={fullName(m)} size={88} decorative />
        <div className="dash-hero-title">
          <h2 id={id}>{task.title}</h2>
          <p>{[fullName(m), m.positionName, isFirstTemplate(p.templateCode) ? 'pierwsza ocena' : sheet && `arkusz ${sheet}`].filter(Boolean).join(' · ')}</p>
        </div>
        {p.dueTo && (
          <div className="dash-hero-due ml-ring">
            <Ring value={days} max={stageWindow(p)} size={128} overdue={p.overdue} caption={Math.abs(days) === 1 ? 'dzień' : 'dni'}
              label={p.overdue ? `${Math.abs(days)} ${Math.abs(days) === 1 ? 'dzień' : 'dni'} po terminie` : `Zostało ${days} ${days === 1 ? 'dzień' : 'dni'}`} />
            <span className="dash-hero-date">
              do {fmtDate(p.dueTo)}
              {(reason || ref) && <Source refText={[reason, ref].filter(Boolean).join(' · ')} align="end" />}
            </span>
          </div>
        )}
      </div>
      <div className="dash-hero-foot ml-steps-pop">
        <MiniStepper progress={p} caption="count" size="lg" />
        <button type="button" className="dash-primary" onClick={() => onOpen(p.evaluationId)}>
          {task.action} <span aria-hidden="true">→</span>
        </button>
      </div>
    </section>
  )
}

function QueueRow({ m, i, onOpen }: { m: TeamMember; i: number; onOpen: (id: number) => void }) {
  const p = m.evaluation!
  const term = termWord(p)
  const first = isFirstTemplate(p.templateCode)
  return (
    <li style={{ '--i': i } as CSSProperties}>
      <Avatar path={`org/${m.employeeId}/avatar`} name={fullName(m)} size={40} decorative />
      <span className="dash-queue-who">
        <strong>{fullName(m)}</strong>
        <span className="dash-queue-stage">
          <span className={first ? 'dash-first' : 'dash-dot'} aria-hidden="true">{first ? '◆' : ''}</span>
          {first && <span className="sr-only">pierwsza ocena: </span>}
          {stageLabel(p)}
        </span>
      </span>
      <span className="dash-queue-when">
        <strong className={term.tone === 'late' ? 'late' : undefined}>{term.word}</strong>
        <button type="button" className="link" onClick={() => onOpen(p.evaluationId)}
          aria-label={`${shortAction(p)}: ${fullName(m)}`}>{shortAction(p)} <span aria-hidden="true">→</span></button>
      </span>
    </li>
  )
}

type OrgCard = { id: number; name: string; jobTitle: string | null; departmentName: string; hasAvatar: boolean }

/** „Mój zespół”: drzewko — ja na górze, pod spodem kafelki podwładnych z fazą, etapem i terminem oceny. */
export function TeamPage({ onOpenEvaluation, onOpenProfile }: { onOpenEvaluation: (id: number) => void; onOpenProfile: (employeeId: number) => void }) {
  const { team, error, loading, retry } = useTeam()
  const [me, setMe] = useState<OrgCard | null>(null)
  useEffect(() => {
    // Konto bez pracownika (np. SuperAdmin) dostaje 404 — wtedy drzewko bez korzenia.
    api<{ focus: OrgCard }>('org').then((v) => setMe(v.focus), () => setMe(null))
  }, [])
  return (
    <section aria-busy={loading || undefined}>
      <div className="toolbar"><h2>Mój zespół</h2>{team && <span className="muted m-fade-in">{team.departmentName}</span>}</div>
      <Loadable loading={loading} error={error} onRetry={retry} skeleton={<TilesSkeleton />} empty={team?.members.length === 0}
        emptyNode={<EmptyState title="W zespole nie ma jeszcze pracowników">Gdy kadry przypiszą Ci pracowników, pojawią się tutaj, a Busola policzy ich terminy ocen.</EmptyState>}>
      {() => team && (
        <div className="org">
          {me && (
            <div className="org-focus">
              <div className="org-card focus me">
                <button type="button" className="org-card-main" onClick={() => onOpenProfile(me.id)}>
                  <Avatar path={me.hasAvatar ? `org/${me.id}/avatar` : null} name={me.name} size={72} />
                  <span>
                    <strong>{me.name} <span className="badge">Ja</span></strong>
                    <span className="muted">{me.jobTitle ?? 'Stanowisko nieuzupełnione'}</span>
                    <span className="muted small">{me.departmentName}</span>
                  </span>
                </button>
              </div>
            </div>
          )}
          <h3 className="org-reports-title">Podwładni ({team.members.length})</h3>
          <ul className="org-reports m-stagger">
            {team.members.map((m) => {
              const p = m.evaluation
              return (
                <li key={m.employeeId} className={`org-card team-tile${m.needsAttention ? ' attention' : ''}`}>
                  <button type="button" className="org-card-main" onClick={() => onOpenProfile(m.employeeId)}
                    aria-label={`Profil: ${fullName(m)}`}>
                    <Avatar path={`org/${m.employeeId}/avatar`} name={fullName(m)} size={56} decorative />
                    <span>
                      <strong>{fullName(m)}</strong>
                      <span className="muted">{m.positionName ?? 'Stanowisko nieuzupełnione'}</span>
                    </span>
                  </button>
                  <dl className="team-tile-info">
                    <div><dt>Ścieżka</dt><dd>{p ? pathLabel(p.templateCode) : '—'}</dd></div>
                    <div><dt>Etap</dt><dd>{p?.stageTitle ?? '—'}</dd></div>
                    <div><dt>Faza</dt><dd><PhasePill progress={p} /></dd></div>
                    <div><dt>Termin</dt><dd>{p?.dueTo ? fmtDate(p.dueTo) : '—'}{p && !p.isFinal && p.stageKey && <DuePill daysLeft={p.daysLeft} overdue={p.overdue} />}</dd></div>
                  </dl>
                  {p && (
                    <div className="org-card-footer">
                      <button type="button" className="link" onClick={() => onOpenEvaluation(p.evaluationId)}
                        aria-label={`Otwórz ocenę: ${fullName(m)}`}>Otwórz ocenę</button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}
      </Loadable>
    </section>
  )
}
