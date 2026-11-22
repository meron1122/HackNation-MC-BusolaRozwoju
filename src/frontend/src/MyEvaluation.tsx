import { useEffect, useState } from 'react'
import { api } from './api'
import { DuePill, Pill } from './evaluation/common'
import { Icon } from './Icon'
import { signatureState, slotBlock } from './evaluation/data'
import { daysUntil, fmtDate, kindLabel, type Detail, type SelfAssessment } from './evaluation/types'

type ListItem = { id: number; isFinal: boolean; startDate: string }
type Task = { tone: 'action' | 'waiting' | 'info'; text: string; dueTo?: string | null }

/**
 * Co oceniany ma teraz zrobić w swojej ocenie: podpis (gdy przełożony już podpisał tę część), samoocena / sprawozdanie
 * w jej etapie, zapoznanie z gotową oceną, ewentualny sprzeciw. Terminy przełożonego nie są jego zadaniami.
 */
function tasksOf(detail: Detail, self: SelfAssessment | null): Task[] {
  const tasks: Task[] = []
  const signatures = detail.schema.sections.flatMap((s) => s.fields.filter((f) => f.type === 'signature' && f.role === 'evaluated').map((f) => ({ f, s })))
  for (const { f, s } of signatures) {
    const state = signatureState(detail, f)
    const stage = detail.stages.find((x) => x.key === s.stage)
    const name = `${s.part ? `${s.part} · ` : ''}${s.title}`
    const what = s.key.includes('acknowledg') ? 'Zapoznaj się z oceną i podpisz' : `Podpisz: ${name}`
    // Termin z backendu (np. okno oceny jeszcze się nie zaczęło) — zadanie czeka, z podanym powodem.
    const blocked = slotBlock(detail, f)
    if (state === 'open' && blocked) tasks.push({ tone: 'waiting', text: `${name}: ${blocked}` })
    else if (state === 'open') tasks.push({ tone: 'action', text: what, dueTo: stage?.dueTo })
    if (state === 'waitingForEvaluator' && stage?.key === detail.currentStageKey) {
      tasks.push({ tone: 'waiting', text: `${name}: podpiszesz po rozmowie, gdy podpisze przełożony.`, dueTo: stage?.dueTo })
    }
  }
  // Samoocena / sprawozdanie: zawsze, gdy można ją edytować; termin z API samooceny (nie termin etapu).
  const selfStage = detail.schema.stages?.find((s) => s.selfAssessment)
  if (selfStage && detail.canEditSelfAssessment) {
    const stage = detail.stages.find((s) => s.key === selfStage.key)
    tasks.push({
      tone: 'action',
      text: selfStage.phase === 'Sprawozdanie' ? 'Złóż sprawozdanie (samoocenę) i przekaż je przełożonemu' : 'Wypełnij samoocenę i przekaż ją przełożonemu',
      dueTo: self?.dueTo ?? stage?.dueTo,
    })
  }
  const objection = detail.stages.find((s) => s.optional && s.status === 'Pending' && s.dueTo)
  if (objection && detail.stages.find((s) => s.key === 'acknowledgement')?.status === 'Completed') {
    tasks.push({ tone: 'info', text: 'Możesz złożyć sprzeciw do dyrektora generalnego urzędu (art. 83 ust. 1 ustawy).', dueTo: objection.dueTo })
  }
  return tasks
}

/** „Moja ocena” — strona startowa ocenianego zamiast listy terminów przełożonego. */
export function MyEvaluationPage({ onOpen }: { onOpen: (id: number) => void }) {
  const [details, setDetails] = useState<{ detail: Detail; self: SelfAssessment | null }[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    api<{ employee: { id: number } }>('employees/me/profile')
      .then((p) => api<ListItem[]>(`evaluations?employeeId=${p.employee.id}`))
      .then((rows) => {
        // Otwarte oceny, a gdy ich brak — ostatnia zamknięta (do wglądu).
        const open = rows.filter((r) => !r.isFinal)
        const shown = open.length ? open : rows.sort((a, b) => b.startDate.localeCompare(a.startDate)).slice(0, 1)
        return Promise.all(shown.map(async (r) => {
          const detail = await api<Detail>(`evaluations/${r.id}`)
          // Termin samooceny podaje API samooceny; bez niego zadanie pokaże termin etapu.
          const self = detail.canEditSelfAssessment
            ? await api<SelfAssessment>(`evaluations/${r.id}/self-assessment`).catch(() => null)
            : null
          return { detail, self }
        }))
      })
      .then((d) => { if (active) setDetails(d) }, (e: Error) => { if (active) setError(e.message) })
    return () => {
      active = false
    }
  }, [])

  if (error) return <p role="alert" className="error">{error}</p>
  if (!details) return <p>Ładowanie…</p>
  return (
    <section className="my-evaluation">
      <div className="toolbar"><h2>Moja ocena</h2></div>
      {details.length === 0 && <p className="muted">Nie masz jeszcze oceny w systemie.</p>}
      {details.map(({ detail: d, self }) => {
        const tasks = tasksOf(d, self)
        const current = d.stages.find((s) => s.key === d.currentStageKey)
        return (
          <div key={d.id} className="card my-card">
            <div className="card-head">
              <div>
                <h3>{kindLabel(d.templateCode)}</h3>
                <p className="muted small">Przełożony: {d.evaluatorName ?? '—'} · od {fmtDate(d.startDate)}</p>
              </div>
              <Pill tone={d.isFinal ? 'done' : 'info'}>{d.phase}</Pill>
            </div>
            {tasks.length > 0 ? (
              <ul className="my-tasks">
                {tasks.map((t) => (
                  <li key={t.text} className={t.tone}>
                    <span className="grow">{t.tone === 'action' ? '→ ' : t.tone === 'waiting' ? <><Icon name="clock" /> </> : ''}{t.text}</span>
                    {t.dueTo && <DuePill dueTo={t.dueTo} daysLeft={daysUntil(t.dueTo)} overdue={(daysUntil(t.dueTo) ?? 0) < 0} />}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">
                {d.isFinal ? 'Ocena zakończona.' : `Teraz nic nie musisz robić. Etap: ${current?.title ?? d.phase}${current?.dueTo ? ` (do ${fmtDate(current.dueTo)})` : ''} — prowadzi go przełożony.`}
              </p>
            )}
            <div className="buttons"><button type="button" onClick={() => onOpen(d.id)}>Otwórz moją ocenę</button></div>
          </div>
        )
      })}
    </section>
  )
}
