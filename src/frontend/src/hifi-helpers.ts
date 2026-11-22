// Pomocnicze funkcje ekranów hi-fi poza kreatorem (pulpit, panel HR, terminy, moja ocena).
import { fmtDate, type Progress } from './evaluation/types'

type Rule = { days?: number; months?: number; from: string; range?: string }

// Reguły terminów z szablonów (EvaluationTemplates/*.json, pole stages[].deadline). Kotwica = data, od której liczy się termin.
const PERIODIC: Record<string, Rule> = {
  criteria: { days: 30, from: 'początku cyklu oceny' },
  evaluation: { months: 24, from: 'początku cyklu oceny' },
  acknowledgement: { days: 7, from: 'sporządzenia oceny' },
  objection: { days: 7, from: 'zapoznania z oceną' },
}
const FIRST: Record<string, Rule> = {
  initial_interview: { days: 21, from: 'rozpoczęcia pracy' },
  report: { months: 10, from: 'rozpoczęcia pracy', range: '7.–10. miesiąc' },
  evaluation: { months: 11, from: 'rozpoczęcia pracy', range: '8.–11. miesiąc' },
  acknowledgement: { days: 7, from: 'sporządzenia oceny' },
}
const FIRST_STAGES = new Set(['initial_interview', 'report'])

function minus(iso: string, rule: Rule): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`)
  if (rule.months) d.setUTCMonth(d.getUTCMonth() - rule.months)
  if (rule.days) d.setUTCDate(d.getUTCDate() - rule.days)
  return d.toISOString().slice(0, 10)
}

/**
 * Uzasadnienie terminu: „30 dni od początku cyklu oceny (11.05.2019)”. Kotwicę liczymy wstecz od terminu z API,
 * więc tekst zawsze zgadza się z datą pokazaną obok.
 */
export function deadlineReason(stageKey: string | null | undefined, dueTo: string | null | undefined, first: boolean): string | null {
  if (!stageKey || !dueTo) return null
  const rule = (first || FIRST_STAGES.has(stageKey) ? FIRST : PERIODIC)[stageKey]
  if (!rule) return null
  const span = rule.range ?? (rule.months ? `${rule.months} mies.` : `${rule.days} ${rule.days === 1 ? 'dzień' : 'dni'}`)
  return `${span} od ${rule.from} (${fmtDate(minus(dueTo, rule))})`
}

export const progressReason = (p: Progress) => deadlineReason(p.stageKey, p.dueTo, p.templateCode === 'first')

/** Kto ma teraz ruch w ocenie (kolumna „Czeka na” w panelu HR). „—” = obserwacja, nic pilnego. */
export function waitsFor(p: Progress): string {
  if (p.isFinal) return '—'
  if (p.stageKey === 'report') return 'oceniany'
  if (p.stageKey === 'objection') return 'oceniany (sprzeciw)'
  if (p.stageKey === 'acknowledgement') return 'przełożony i oceniany'
  if (p.phase === 'Obserwacja' && !p.overdue && (p.daysLeft ?? 0) > 30) return '—'
  return 'przełożony'
}

