// Dane pomocnicze kroków startu (H02–H05) i notatek (H06): dane kadrowe z /org, odmiana imion, stan lokalny przeglądarki.
import { useCallback, useState } from 'react'
import { useApi } from './data'
import type { Detail } from './types'

export type OrgCard = { id: number; name: string; jobTitle: string | null; departmentName: string; hasAvatar: boolean; reportsCount: number; isMe: boolean }
export type OrgView = { focus: OrgCard; managers: OrgCard[]; reports: OrgCard[] }

/** Dane kadrowe ocenianego: liczba podległych (reportsCount) i bezpośredni przełożony (ostatni w łańcuchu). */
export function useOrg(detail: Detail) {
  const { data, error } = useApi<OrgView>(`org?employeeId=${detail.employeeId}`)
  const managers = data?.managers ?? []
  const evaluator = managers.find((m) => m.name === detail.evaluatorName) ?? managers[managers.length - 1] ?? null
  return { org: data, error, reports: data?.focus.reportsCount ?? null, evaluator }
}

/** Rozporządzenie o ocenach okresowych (Dz. U. 2016 poz. 470) w ISAP. */
export const PERIODIC_REGULATION_URL = 'https://isap.sejm.gov.pl/isap.nsf/DocDetails.xsp?id=WDU20160000470'
export const reg = (ref: string) => `Rozp. 2016 · ${ref}`

/** Imię z „Imię Nazwisko” albo „Nazwisko Imię” (lista ocen ma odwrotną kolejność; w Detail jest „Imię Nazwisko”). */
export const firstNameOf = (name: string) => name.split(/\s+/)[0] ?? name

/** Odmiana imienia: dopełniacz („ocena Kasi”) i narzędnik („z Kasią”). Heurystyka dla polskich imion. */
export function nameCase(first: string, form: 'gen' | 'inst'): string {
  if (/a$/i.test(first)) {
    const stem = first.slice(0, -1)
    if (form === 'inst') return `${stem}ą`
    if (/i$/i.test(stem)) return stem
    return /[kglj]$/i.test(stem) ? `${stem}i` : `${stem}y`
  }
  if (form === 'gen') return `${first}a`
  return /[kg]$/i.test(first) ? `${first}iem` : `${first}em`
}

/** Mały stan per przeglądarka (wygoda, nie dane oceny): klucz w localStorage, odczyt i zapis w try/catch. */
export function useLocalState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw == null ? initial : (JSON.parse(raw) as T)
    } catch {
      return initial
    }
  })
  const set = useCallback((next: T) => {
    setValue(next)
    try {
      localStorage.setItem(key, JSON.stringify(next))
    } catch {
      // brak localStorage — stan tylko do odświeżenia
    }
  }, [key])
  return [value, set] as const
}

/** Odczyt bez hooka (np. licznik zagadnień rozmowy w części I). */
export function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw == null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

export const kickoffKey = (id: number) => `busola.kickoff.${id}`
export const ospKey = (id: number) => `busola.osp-current.${id}`

/** Miesiące między datami ISO (zaokrąglone). */
export const monthsBetween = (from: string, to: string) =>
  Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / (30.44 * 86_400_000)))
