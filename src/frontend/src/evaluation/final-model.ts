// Pomocnicze wyliczenia ekranów H10–H12 (przyznanie, sprawdź i podpisz, zapoznanie). Czyste funkcje, bez API.
import { answerOf, criteriaFieldOf, criteriaOf, indicatorFieldOf, scoresFieldOf, type Detail } from './types'

export const fmtAvg = (n: number) => n.toFixed(2).replace('.', ',')

/** Krótkie nazwy kryteriów do osi radaru i listy gotowości (pełna nazwa zostaje w aria-label i dymkach). */
const SHORT: Record<string, string> = {
  knowledge: 'Wiedza', reliability: 'Rzetelność', organization: 'Organizacja pracy', cooperation: 'Współpraca',
  communication: 'Komunikacja', analytical_thinking: 'Myślenie analityczne', crisis_management: 'Sytuacje kryzysowe',
  people_management: 'Zarządzanie ludźmi', decisions: 'Decyzje', strategic_management: 'Zarządzanie strategiczne',
  customer_orientation: 'Orientacja na klienta', public_speaking: 'Wystąpienia publiczne', negotiation: 'Negocjowanie',
  creativity: 'Kreatywność',
}
export const shortName = (key: string, label: string) => SHORT[key] ?? (label.length <= 22 ? label : label.split(' ').slice(0, 2).join(' '))

export type CriterionScore = { key: string; label: string; short: string; value: number | null; additional: boolean }

/** Oceny cząstkowe w kolejności arkusza, z oznaczeniem kryteriów dodatkowych. */
export function criterionScores(detail: Detail): CriterionScore[] {
  const scores = scoresFieldOf(detail.schema)
  const mandatory: { key: string }[] = criteriaFieldOf(detail.schema)?.mandatory ?? scores?.field.items ?? []
  const first = detail.templateCode === 'first'
  return criteriaOf(detail).map((c) => ({
    key: c.key, label: c.label, short: shortName(c.key, c.label),
    value: scores ? answerOf(detail, scores.field.key, c.key)?.valueNumber ?? null : null,
    additional: !first && mandatory.length > 0 && !mandatory.some((m) => m.key === c.key),
  }))
}

/** Biernik imienia do tytułu zadania: „Zapoznaj Kasię / Piotra z oceną”. */
export function accusative(firstName: string): string {
  if (!firstName) return firstName
  if (/a$/i.test(firstName)) return firstName.slice(0, -1) + 'ę'
  return firstName + 'a'
}

export const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
export const addMonths = (iso: string, months: number) => {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + months)
  return d.toISOString().slice(0, 10)
}

/** Forma rozwoju w propozycji IPRZ: ikona i słowo. */
export type IprzForm = 'training' | 'task' | 'mentoring'
export const FORM_LABELS: Record<IprzForm, string> = { training: 'szkolenie', task: 'nowe zadanie', mentoring: 'mentoring' }

export type IprzArea = { criterion: string; indicator: string; target: string | null; forms: IprzForm[]; score: number }

/**
 * Szkic wniosków IPRZ z najniżej ocenionych wskaźników — reguła, nie model (wzór: piaskownica, Przyznanie.tsx → draftIprz).
 * Bierze do dwóch wskaźników ocenionych najwyżej „na poziomie oczekiwań” i cytuje zachowanie docelowe z modelu kompetencji.
 * Forma: poniżej oczekiwań → szkolenie; na poziomie → nowe zadanie i mentoring (do ustalenia z pracownikiem).
 */
export function draftIprz(detail: Detail): { areas: IprzArea[]; text: string; basis: string[] } | null {
  const schema = detail.schema
  const scores = scoresFieldOf(schema)
  const indicatorField = scores && indicatorFieldOf(schema, scores.field.key)
  const competencies = schema.competencyModel?.competencies
  if (!scores || !indicatorField || !competencies) return null
  const meets = scores.scale.find((o) => o.key === 'meets')?.value ?? 5
  const weak = criteriaOf(detail)
    .flatMap((c) => (competencies[c.key]?.indicators ?? []).map((i) => ({
      criterion: competencies[c.key].name, indicator: i, v: answerOf(detail, indicatorField.key, i.key)?.valueNumber ?? null,
    })))
    .filter((x): x is typeof x & { v: number } => x.v != null && x.v <= meets)
    .sort((a, b) => a.v - b.v)
    .slice(0, 2)
  if (weak.length === 0) return null
  const lower = (t: string) => t.charAt(0).toLowerCase() + t.slice(1).replace(/\.$/, '')
  const areas: IprzArea[] = weak.map((x) => ({
    criterion: x.criterion,
    indicator: lower(x.indicator.text),
    target: (x.v < meets ? x.indicator.levels.meets : x.indicator.levels.above) ?? null,
    forms: x.v < meets ? ['training'] : ['task', 'mentoring'],
    score: x.v,
  }))
  const text = areas.map((a, n) =>
    `${n + 1}. ${a.criterion}: ${a.indicator}.${a.target ? ` Cel: ${a.target}` : ''} Forma: ${a.forms.map((f) => FORM_LABELS[f]).join(' i ')}.`,
  ).join('\n')
  return { areas, text, basis: weak.map((x) => `${x.criterion} · ${x.v} pkt`) }
}

/** Ile obszarów ma tekst wniosków IPRZ (numerowane linie), do listy gotowości. */
export function iprzAreas(text: string): number {
  const numbered = text.split('\n').filter((l) => /^\s*\d+[.)]/.test(l)).length
  return numbered || (text.trim() ? 1 : 0)
}
