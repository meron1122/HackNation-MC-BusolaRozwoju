// Domyślne wartości części II (rozmowa oceniająca), liczone po stronie frontu z danych oceny:
// okres podlegania ocenie: od podpisu części I przez ocenianego (albo zamknięcia etapu kryteriów / startu oceny)
// do dziś, nie dalej niż termin sporządzenia oceny; data rozmowy: dziś. Użytkownik może je zmienić i zapisać.
import { answerOf, emptyAnswer, today, type Answer, type Detail, type Section } from './types'

export function periodDefaults(detail: Detail, section: Section | undefined): { from: string; to: string } {
  const firstStage = detail.stages[0]
  const firstSections = detail.schema.sections.filter((s) => s.stage === firstStage?.key)
  const evaluatedSignature = firstSections.flatMap((s) => s.fields).find((f) => f.type === 'signature' && f.role === 'evaluated')
  const signed = evaluatedSignature && detail.signatures.find((s) => s.fieldKey === evaluatedSignature.key)?.signedOn
  const from = (signed ?? firstStage?.completedOn ?? detail.startDate).slice(0, 10)
  const due = detail.stages.find((s) => s.key === section?.stage)?.dueTo
  const now = today()
  const to = due && due < now ? due : now
  return { from, to: to < from ? from : to }
}

/** Pola daty i okresu z sekcji rozmowy (bez zapisanej wartości) z wartościami domyślnymi — do formularza albo zapisu. */
export function interviewDefaults(detail: Detail, section: Section | undefined): Answer[] {
  if (!section) return []
  const out: Answer[] = []
  for (const f of section.fields) {
    if (answerOf(detail, f.key)?.valueDate) continue
    if (f.type === 'dateRange' && !f.prefill) {
      const { from, to } = periodDefaults(detail, section)
      out.push({ ...emptyAnswer(f.key, null), valueDate: from, valueDateTo: to })
    } else if (f.type === 'date' && !f.prefill) {
      out.push({ ...emptyAnswer(f.key, null), valueDate: today() })
    }
  }
  return out
}
