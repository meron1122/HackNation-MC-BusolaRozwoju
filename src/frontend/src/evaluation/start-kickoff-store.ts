// Zapis rozmowy rozpoczynającej (H04): przebieg (omówione zagadnienia i kryteria) oraz obowiązki i cele.
// TODO(API): backend nie ma jeszcze pól na obowiązki i cele (szablon zna je tylko jako stages[].topics).
// Docelowo: GET/PUT /api/evaluations/{id}/kickoff — wystarczy podmienić ciała loadKickoff/saveKickoff (i readKickoffCache
// na pustą wartość do czasu odpowiedzi). Do tego czasu dane leżą w localStorage pod `busola.kickoff.{evaluationId}`.
import { useCallback, useEffect, useRef, useState } from 'react'
import { kickoffKey } from './start-model'

export type KickoffGoal = { goal: string; how: string }
export type KickoffRecord = {
  /** Indeksy omówionych zagadnień § 5 ust. 1. */
  topics: number[]
  /** Klucze kryteriów, których oczekiwania omówiono. */
  criteria: string[]
  /** Główne obowiązki z opisu stanowiska (punkty). */
  duties: string[]
  /** Cele na okres oceny (opcjonalne, § 5 ust. 1 pkt 4). */
  goals: KickoffGoal[]
}
export const KICKOFF_RECORD_EMPTY: KickoffRecord = { topics: [], criteria: [], duties: [], goals: [] }

function normalize(raw: unknown): KickoffRecord {
  const r = (raw ?? {}) as Partial<KickoffRecord>
  return {
    topics: Array.isArray(r.topics) ? r.topics : [],
    criteria: Array.isArray(r.criteria) ? r.criteria : [],
    duties: Array.isArray(r.duties) ? r.duties.map(String) : [],
    goals: Array.isArray(r.goals) ? r.goals.map((g) => ({ goal: String(g?.goal ?? ''), how: String(g?.how ?? '') })) : [],
  }
}

/** Odczyt synchroniczny (pierwszy render). Przy API: zwróć KICKOFF_RECORD_EMPTY i poczekaj na loadKickoff. */
export function readKickoffCache(evaluationId: number): KickoffRecord {
  try {
    const raw = localStorage.getItem(kickoffKey(evaluationId))
    return raw == null ? KICKOFF_RECORD_EMPTY : normalize(JSON.parse(raw))
  } catch {
    return KICKOFF_RECORD_EMPTY
  }
}

/** Odczyt zapisu rozmowy. Przy API: `return normalize(await api(`evaluations/${id}/kickoff`))`. */
export async function loadKickoff(evaluationId: number): Promise<KickoffRecord> {
  return readKickoffCache(evaluationId)
}

/** Zapis rozmowy. Przy API: `await api(`evaluations/${id}/kickoff`, 'PUT', record)`. */
export async function saveKickoff(evaluationId: number, record: KickoffRecord): Promise<void> {
  try {
    localStorage.setItem(kickoffKey(evaluationId), JSON.stringify(record))
  } catch {
    throw new Error('Nie udało się zapisać w tej przeglądarce.')
  }
}

/** Stan rozmowy z zapisem: zmiana od razu w UI, zapis w tle; `error` gdy zapis się nie udał. */
export function useKickoff(evaluationId: number) {
  const [record, setRecord] = useState<KickoffRecord>(() => readKickoffCache(evaluationId))
  const [error, setError] = useState('')
  // Stan autozapisu dla wskaźnika „Zapisuję… / ✓ Zapisano 12:04” (karta 14); sam zapis bez zmian.
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [savedAt, setSavedAt] = useState<Date | undefined>(undefined)
  const latest = useRef(record)
  useEffect(() => {
    let alive = true
    void loadKickoff(evaluationId).then((r) => { if (alive) { latest.current = r; setRecord(r) } }).catch(() => undefined)
    return () => { alive = false }
  }, [evaluationId])
  const update = useCallback((patch: Partial<KickoffRecord>) => {
    const next = { ...latest.current, ...patch }
    latest.current = next
    setRecord(next)
    setSaveState('saving')
    saveKickoff(evaluationId, next).then(
      () => { setError(''); setSaveState('saved'); setSavedAt(new Date()) },
      (e: Error) => { setError(e.message); setSaveState('error') })
  }, [evaluationId])
  return { record, update, error, saveState, savedAt }
}
