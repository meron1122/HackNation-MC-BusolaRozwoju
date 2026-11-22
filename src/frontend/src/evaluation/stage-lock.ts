// Blokada przyszłych etapów kreatora (v5): kroki etapów późniejszych niż bieżący są tylko do odczytu.
// Bieżący etap v5 liczymy z etapu arkusza (`currentStageKey`). Etap oceny dzieli się na „Obserwację” i
// „Przygotowanie oceny”: przygotowanie zaczyna się 30 dni przed terminem oceny albo z pierwszą oceną wskaźnika
// (ten sam próg co baner w notatkach — zasada Busoli, nie przepis).
import { stageIndexOf } from '../v2/WizardNav'
import type { Step } from './common'
import { daysUntil, fmtDate, indicatorFieldOf, scoresFieldOf, type Detail } from './types'

export const PREP_DAYS = 30

const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Indeks bieżącego etapu v5 (0–4) albo null, gdy blokada nie obowiązuje (widok własnej oceny, ocena zakończona). */
export function currentStageIndex(detail: Detail, steps: Step[]): number | null {
  if (detail.isOwn || detail.isFinal) return null
  const key = detail.currentStageKey
  if (!key) return detail.phase === 'Oczekuje na start' ? 0 : null
  const notes = steps.find((s) => s.id === 'notes')
  const own = steps.filter((s) => s.stageKey === key && s !== notes)
  if (notes && notes.stageKey === key) {
    const left = daysUntil(detail.stages.find((s) => s.key === key)?.dueTo)
    const indicatorKey = indicatorFieldOf(detail.schema, scoresFieldOf(detail.schema)?.field.key ?? '')?.key
    const rated = detail.answers.some((a) => a.fieldKey === indicatorKey && a.valueNumber != null)
    if (own.length === 0 || (left != null && left > PREP_DAYS && !rated)) return stageIndexOf(notes)
  }
  return own.length ? Math.max(...own.map(stageIndexOf)) : 0
}

/** Jedna linia dla zablokowanego etapu: „Ten etap zacznie się …”. */
export function stageStartText(detail: Detail, steps: Step[], index: number): string {
  const own = steps.filter((s) => stageIndexOf(s) === index)
  const stage = detail.stages.find((s) => s.key === own[0]?.stageKey)
  if (stage?.dueFrom) return `Ten etap zacznie się ${fmtDate(stage.dueFrom)}.`
  if (index === 2 && stage?.dueTo) return `Ten etap zacznie się ${fmtDate(addDays(stage.dueTo, -PREP_DAYS))}.`
  // Koniec poprzedniego etapu: najpóźniejszy termin etapów arkusza z wcześniejszych etapów v5.
  const prev = steps.filter((s) => stageIndexOf(s) < index && s.stageKey !== stage?.key)
    .map((s) => detail.stages.find((x) => x.key === s.stageKey)?.dueTo).filter((d): d is string => !!d).sort().pop()
  const after = index === 1 ? 'po rozmowie rozpoczynającej' : index === 3 ? 'po sporządzeniu oceny' : 'po zapoznaniu z oceną'
  return `Ten etap zacznie się ${after}${prev && index < 4 ? ` (termin ${fmtDate(prev)})` : ''}.`
}
