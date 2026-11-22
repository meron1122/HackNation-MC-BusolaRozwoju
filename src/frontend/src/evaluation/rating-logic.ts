// Pomocnicze dla kroków „Ocena wskaźników” i „Rozmowa oceniająca” (agent A): kolejność opisów, sugestia z remisem.
import type { ScaleOption } from './types'

/** Stała (dla danego wskaźnika) kolejność opisów poziomów — żeby nie sugerować, który jest „środkowy”. */
export function shuffled(options: ScaleOption[], seed: string): ScaleOption[] {
  let h = 2166136261
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  const rank = (o: ScaleOption) => Math.imul(h ^ (o.value * 2654435761), 2246822519) >>> 0
  return [...options].sort((a, b) => rank(a) - rank(b))
}

export const nearest = (scale: ScaleOption[], mean: number) =>
  scale.reduce((best, o) => (Math.abs(o.value - mean) < Math.abs(best.value - mean) ? o : best), scale[0]).value

/**
 * Wartości sugestii do pokazania: jedna (najbliższa wartość skali) albo dwie, gdy średnia leży dokładnie w połowie
 * między sąsiednimi wartościami (np. 6,00 → „5 lub 7”). Backend w remisie zwraca niższą — rozstrzyga przełożony.
 */
export function suggestionValues(scale: ScaleOption[], mean: number | null, apiSuggested: number | null): number[] {
  if (mean == null) return apiSuggested != null ? [apiSuggested] : []
  const values = scale.map((o) => o.value).sort((a, b) => a - b)
  for (let i = 0; i < values.length - 1; i++) {
    if (Math.abs((values[i] + values[i + 1]) / 2 - mean) < 1e-6) return [values[i], values[i + 1]]
  }
  return [apiSuggested ?? nearest(scale, mean)]
}

/** 6 → „6,00” (polski zapis dziesiętny). */
export const fmtMean = (n: number) => n.toFixed(2).replace('.', ',')

