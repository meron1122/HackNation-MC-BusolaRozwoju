// H02 · reguła wyboru arkusza B/C z danych kadrowych. Czysta funkcja (bez Reacta), żeby dało się ją sprawdzić osobno.
// Zasada Busoli: gdy dane są sprzeczne albo niepełne, pytamy przełożonego zamiast pokazywać pewny wniosek.

/** Nazwa stanowiska sugeruje kierowanie ludźmi (naczelnik, kierownik, dyrektor, zastępca, koordynator, szef). */
const LEADERSHIP = /(^|[^\p{L}])(naczelni|kierowni|kieruj|dyrektor|zastęp|wicedyrektor|koordynator|koordynuj|szef)/iu

export function suggestsLeadership(position: string | null | undefined): boolean {
  return !!position && LEADERSHIP.test(position)
}

export type SheetDecision =
  /** Pewny wniosek: dane kadrowe pasują do arkusza. */
  | { kind: 'sure'; letter: 'B' | 'C' }
  /** Pytanie „Czy … bezpośrednio kieruje pracownikami?” — Tak → B, Nie → C, bez domyślnej odpowiedzi. */
  | { kind: 'ask'; reason: 'leadership-no-reports' | 'mismatch' }
  /** Liczba podległych jeszcze się ładuje albo arkusz nie jest B/C (A, pierwsza ocena). */
  | { kind: 'none' }

export function sheetDecision({ position, reports, letter }: {
  position: string | null | undefined
  reports: number | null
  letter: string | null | undefined
}): SheetDecision {
  if (letter !== 'B' && letter !== 'C') return { kind: 'none' }
  if (reports == null) return { kind: 'none' }
  if (reports === 0 && suggestsLeadership(position)) return { kind: 'ask', reason: 'leadership-no-reports' }
  if ((reports > 0 && letter === 'C') || (reports === 0 && letter === 'B')) return { kind: 'ask', reason: 'mismatch' }
  return { kind: 'sure', letter }
}
