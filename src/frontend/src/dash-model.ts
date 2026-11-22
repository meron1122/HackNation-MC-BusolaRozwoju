// Pulpit przełożonej (H01) i panel HR (H14) v2: etapy v5, terminy jako słowa, odmiana imion w tytułach.
import { fmtDate, isFirstTemplate, sheetLetter, type Progress } from './evaluation/types'

/** 5 etapów v5 oceny okresowej (stepper w lewej kolumnie kreatora, mini-stepper na pulpicie i w panelu HR). */
export const PERIODIC_STAGES = ['Start cyklu', 'Obserwacja', 'Przygotowanie oceny', 'Czeka na zapoznanie', 'Okno sprzeciwu']
/** Pierwsza ocena: 4 etapy z szablonu (rozmowa wstępna, sprawozdanie, ocena, zapoznanie). */
export const FIRST_STAGES = ['Rozmowa wstępna', 'Sprawozdanie', 'Ocena', 'Czeka na zapoznanie']

/** Okno „Przygotowanie oceny”: ostatnie 30 dni przed terminem (W06: przypomnienie 30 dni przed terminem). */
const PREPARE_DAYS = 30

export type StagePos = { labels: string[]; index: number; first: boolean; done: boolean }

/** Gdzie w etapach v5 jest ocena. `index` = labels.length, gdy zamknięta. */
export function stagePos(p: Progress): StagePos {
  const first = isFirstTemplate(p.templateCode)
  const labels = first ? FIRST_STAGES : PERIODIC_STAGES
  if (p.isFinal) return { labels, index: labels.length, first, done: true }
  const key = p.stageKey ?? ''
  let index = 0
  if (first) index = Math.max(0, ['initial_interview', 'report', 'evaluation', 'acknowledgement'].indexOf(key))
  else if (key === 'evaluation') index = (p.daysLeft ?? 999) <= PREPARE_DAYS || p.overdue ? 2 : 1
  else if (key === 'acknowledgement') index = 3
  else if (key === 'objection') index = 4
  return { labels, index, first, done: false }
}

export const stageLabel = (p: Progress) => {
  const s = stagePos(p)
  return s.done ? (p.phase === 'Anulowana' ? 'Anulowana' : 'Zakończona') : s.labels[s.index]
}

/** Odznaka arkusza: „B”, „C”; pierwsza ocena = null (romb ◆). */
export const sheetOf = (code: string) => (isFirstTemplate(code) ? null : sheetLetter(code))

// --- daty ---
const DAY = 86_400_000
const parse = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`)
export const isoDay = (d: Date) => d.toISOString().slice(0, 10)
export function addMonths(iso: string, months: number): string {
  const d = parse(iso)
  d.setUTCMonth(d.getUTCMonth() + months)
  return isoDay(d)
}
export function addDays(iso: string, days: number): string {
  return isoDay(new Date(parse(iso).getTime() + days * DAY))
}
export const todayIso = () => new Date().toISOString().slice(0, 10)
export const daysBetween = (a: string, b: string) => Math.round((parse(b).getTime() - parse(a).getTime()) / DAY)
/** „10.2027” */
export const monthYear = (iso: string) => fmtDate(iso).slice(3)
export const yearFrac = (iso: string) => {
  const d = parse(iso)
  const y = d.getUTCFullYear()
  return y + (d.getTime() - Date.UTC(y, 0, 1)) / (Date.UTC(y + 1, 0, 1) - Date.UTC(y, 0, 1))
}

/** Koniec cyklu (termin oceny): okresowa 24 mies. od startu (§ 2), pierwsza 11 mies. od zatrudnienia (§ 8 ust. 1). */
export const cycleEnd = (startDate: string, templateCode: string) => addMonths(startDate, isFirstTemplate(templateCode) ? 11 : 24)

/** Długość okna etapu (do pierścienia dni). Szablony: 30 dni, 21 dni, 7 dni; etap oceny = 30 dni przygotowania. */
export function stageWindow(p: Progress): number {
  switch (p.stageKey) {
    case 'criteria': return 30
    case 'initial_interview': return 21
    case 'acknowledgement': case 'objection': return 7
    default: return PREPARE_DAYS
  }
}

/** Podstawa terminu etapu z szablonów (`stages[].legalRef`). */
export function stageRef(p: Progress): string | null {
  const first = isFirstTemplate(p.templateCode)
  switch (p.stageKey) {
    case 'criteria': return 'Rozp. 2016 · § 7 pkt 1'
    case 'initial_interview': return 'Rozp. 2015 · § 3'
    case 'report': return 'Rozp. 2015 · § 4 ust. 1'
    case 'evaluation': return first ? 'Rozp. 2015 · § 8 ust. 1' : 'Ustawa o SC · art. 81 ust. 1'
    case 'acknowledgement': return first ? 'Rozp. 2015 · § 11 ust. 1' : 'Rozp. 2016 · § 12 ust. 1'
    case 'objection': return 'Ustawa o SC · art. 83 ust. 1'
    default: return null
  }
}

/** Termin jako słowo z liczbą: „2 dni po”, „za 6 dni”, „czeka 4 dni” (zapoznanie: przepis mówi „niezwłocznie”). */
export function termWord(p: Progress): { word: string; date: string | null; tone: 'late' | 'soon' | 'calm' } {
  const days = (n: number) => `${n} ${n === 1 ? 'dzień' : 'dni'}`
  if (p.stageKey === 'acknowledgement' && p.dueTo && !p.overdue) {
    const since = addDays(p.dueTo, -7)
    const n = Math.max(0, daysBetween(since, todayIso()))
    return { word: n === 0 ? 'czeka od dziś' : `czeka ${days(n)}`, date: `od ${fmtDate(since)}`, tone: n >= 7 ? 'late' : 'calm' }
  }
  if (p.daysLeft == null || !p.dueTo) return { word: '—', date: null, tone: 'calm' }
  if (p.overdue || p.daysLeft < 0) return { word: `${days(Math.abs(p.daysLeft))} po`, date: fmtDate(p.dueTo), tone: 'late' }
  if (p.daysLeft === 0) return { word: 'dziś', date: fmtDate(p.dueTo), tone: 'soon' }
  return { word: `za ${days(p.daysLeft)}`, date: fmtDate(p.dueTo), tone: p.daysLeft <= 7 ? 'soon' : 'calm' }
}

// --- odmiana imion (tylko w tytułach: „z Kasią”, „Zapoznaj Piotra”). Proste reguły, wystarczą dla imion polskich. ---
const female = (name: string) => /a$/i.test(name) && !/^(kuba|barnaba|bonawentura)$/i.test(name)
/** Narzędnik: Katarzyna → Katarzyną, Jan → Janem, Marek → Markiem. */
export function instrumental(name: string): string {
  if (female(name)) return `${name.slice(0, -1)}ą`
  if (/ek$/.test(name)) return `${name.slice(0, -2)}kiem`
  if (/[kg]$/.test(name)) return `${name}iem`
  return `${name}em`
}
/** Biernik: Katarzyna → Katarzynę, Jan → Jana, Marek → Marka. */
export function accusative(name: string): string {
  if (female(name)) return `${name.slice(0, -1)}ę`
  if (/ek$/.test(name)) return `${name.slice(0, -2)}ka`
  return `${name}a`
}

/** Tytuł zadania i nazwa akcji, spójne ze sobą (review H01, uwaga 7). */
export function taskOf(p: Progress, firstName: string): { title: string; action: string } {
  switch (p.stageKey) {
    case 'criteria': return { title: `Rozmowa rozpoczynająca z ${instrumental(firstName)}`, action: 'Zacznij rozmowę' }
    case 'initial_interview': return { title: `Rozmowa wstępna z ${instrumental(firstName)}`, action: 'Zacznij rozmowę' }
    case 'report': return { title: `Sprawozdanie: ${firstName}`, action: 'Otwórz ocenę' }
    case 'evaluation': return { title: `Rozmowa oceniająca z ${instrumental(firstName)}`, action: 'Przygotuj rozmowę' }
    case 'acknowledgement': return { title: `Zapoznaj ${accusative(firstName)} z oceną`, action: 'Zapoznaj z oceną' }
    case 'objection': return { title: `Okno sprzeciwu: ${firstName}`, action: 'Otwórz ocenę' }
    default: return { title: `Ocena: ${firstName}`, action: 'Otwórz ocenę' }
  }
}

/** Krótka nazwa akcji w wierszu „W kolejce”. */
export function shortAction(p: Progress): string {
  switch (p.stageKey) {
    case 'criteria': case 'initial_interview': return 'Rozpocznij'
    case 'acknowledgement': return 'Zapoznaj'
    case 'evaluation': return 'Przygotuj'
    default: return 'Otwórz'
  }
}

/** Kto ma teraz ruch: przełożony czy oceniany (adresat przypomnienia w panelu HR). null = nikt, nic pilnego. */
export function addressee(p: Progress): 'evaluator' | 'employee' | null {
  if (p.isFinal) return null
  if (p.stageKey === 'report' || p.stageKey === 'objection') return 'employee'
  if (p.phase === 'Obserwacja' && !p.overdue && (p.daysLeft ?? 0) > PREPARE_DAYS) return null
  return 'evaluator'
}
