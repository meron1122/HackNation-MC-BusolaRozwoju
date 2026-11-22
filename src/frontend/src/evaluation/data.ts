// Dane oceny poza komponentami: ładowanie z API, kontekst roboczy, zapis odpowiedzi, zamknięcie etapu, podpowiedzi pól.
import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import {
  emptyAnswer, keyOf, type Answer, type CheckIssue, type Cond, type Detail, type IndicatorContext, type WorkContext,
} from './types'

/** GET z API; `error` = endpoint nie odpowiada (np. backend jeszcze go nie ma) albo brak dostępu. */
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState('')
  const reload = useCallback(async () => {
    if (!path) return
    try {
      setData(await api<T>(path))
      setError('')
    } catch (e) {
      setError((e as Error).message)
    }
  }, [path])
  useEffect(() => {
    if (!path) return
    let active = true
    api<T>(path).then(
      (d) => { if (active) { setData(d); setError('') } },
      (e: Error) => { if (active) setError(e.message) },
    )
    return () => {
      active = false
    }
  }, [path])
  return { data, error, reload, setData }
}

/** Kontekst roboczy oceny (oczekiwania, częstotliwość, złożoność, powód innej oceny niż sugestia). */
export function useWorkContext(evaluationId: number) {
  const { data, error, reload, setData } = useApi<WorkContext>(`evaluations/${evaluationId}/context`)
  const indicator = (key: string): IndicatorContext =>
    data?.indicators.find((i) => i.indicatorKey === key) ?? { indicatorKey: key, expectation: null, frequency: null, complexity: null }
  const reason = (criterionKey: string) => data?.criteria.find((c) => c.criterionKey === criterionKey)?.scoreReason ?? ''

  // PUT to łatka: pominięte pole = bez zmian, "" = wyczyść (oczekiwanie tylko w 1. etapie, reszta w etapie ocen).
  async function saveIndicator(key: string, patch: Partial<Pick<IndicatorContext, 'expectation' | 'frequency' | 'complexity'>>) {
    const next = { ...indicator(key), ...patch }
    const body = Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, v ?? '']))
    await api(`evaluations/${evaluationId}/context/indicators/${encodeURIComponent(key)}`, 'PUT', body)
    setData((d) => ({
      indicators: [...(d?.indicators ?? []).filter((i) => i.indicatorKey !== key), next],
      criteria: d?.criteria ?? [],
    }))
  }

  async function saveReason(criterionKey: string, scoreReason: string) {
    await api(`evaluations/${evaluationId}/context/criteria/${encodeURIComponent(criterionKey)}`, 'PUT', { scoreReason })
    setData((d) => ({
      indicators: d?.indicators ?? [],
      criteria: [...(d?.criteria ?? []).filter((c) => c.criterionKey !== criterionKey), { criterionKey, scoreReason: scoreReason || null }],
    }))
  }

  return { context: data, error, reload, indicator, reason, saveIndicator, saveReason }
}

export type WorkContextApi = ReturnType<typeof useWorkContext>

export const saveAnswers = (evaluationId: number, answers: Answer[]) => api(`evaluations/${evaluationId}/answers`, 'PUT', { answers })

/** Wartości startowe: zapisane odpowiedzi, a dla pustych pól podpowiedzi (prefill) z danych oceny. */
export function initialValues(detail: Detail): Record<string, Answer> {
  const values: Record<string, Answer> = {}
  for (const a of detail.answers) values[keyOf(a.fieldKey, a.itemKey)] = a
  const has = (fieldKey: string) => detail.answers.some((a) => a.fieldKey === fieldKey)
  const stage = (prefill?: string) => detail.stages.find((s) => prefill === `stage:${s.key}`)
  const [first, ...rest] = detail.employeeName.split(' ')
  const [evFirst, ...evRest] = (detail.evaluatorName ?? '').split(' ')
  const [headFirst, ...headRest] = (detail.unitHeadName ?? '').split(' ')

  for (const field of detail.schema.sections.flatMap((s) => s.fields)) {
    if (has(field.key)) continue
    const personName = field.role === 'evaluated' ? [first, rest.join(' ')]
      : (field.role === 'evaluator' || field.role === 'supervisor') && detail.evaluatorName ? [evFirst, evRest.join(' ')]
      : field.role === 'unitHead' && detail.unitHeadName ? [headFirst, headRest.join(' ')]
      : null
    if (field.type === 'person' && personName) {
      values[keyOf(field.key, 'firstName')] = { ...emptyAnswer(field.key, 'firstName'), valueText: personName[0] }
      values[keyOf(field.key, 'lastName')] = { ...emptyAnswer(field.key, 'lastName'), valueText: personName[1] }
    } else if (field.prefill === 'employee.hireDate') {
      values[keyOf(field.key, null)] = { ...emptyAnswer(field.key, null), valueDate: detail.startDate }
    } else if (stage(field.prefill)?.dueTo) {
      const s = stage(field.prefill)!
      values[keyOf(field.key, null)] = field.type === 'dateRange'
        ? { ...emptyAnswer(field.key, null), valueDate: s.dueFrom ?? detail.startDate, valueDateTo: s.dueTo }
        : { ...emptyAnswer(field.key, null), valueDate: s.dueTo }
    }
  }
  return values
}

/**
 * Pola z podpowiedzią (termin etapu, data zatrudnienia, imię i nazwisko osoby), których nikt jeszcze nie zapisał —
 * do zapisu przed zamknięciem etapu. Sekcje ukryte warunkiem (visibleWhen) pomijamy.
 */
export function unsavedPrefills(detail: Detail, stageKey: string): Answer[] {
  const values = initialValues(detail)
  const visible = (c?: Cond) => !c || c.in.includes(detail.answers.find((a) => a.fieldKey === c.field)?.valueText ?? '')
  return detail.schema.sections
    .filter((s) => s.stage === stageKey && !detail.lockedSections?.includes(s.key) && visible(s.visibleWhen))
    .flatMap((s) => s.fields)
    .filter((f) => visible(f.visibleWhen) && !detail.answers.some((a) => a.fieldKey === f.key))
    .flatMap((f) => f.type === 'person'
      ? [values[keyOf(f.key, 'firstName')], values[keyOf(f.key, 'lastName')]]
      : f.prefill && !f.prefill.startsWith('previous.') ? [values[keyOf(f.key, null)]] : [])
    .filter((a): a is Answer => !!a)
}

/** Zamknięcie etapu: najpierw zapis podpowiedzi (np. termin sporządzenia oceny), potem complete. */
export async function completeStage(detail: Detail, stageKey: string, completedOn: string) {
  const prefills = unsavedPrefills(detail, stageKey)
  if (prefills.length) await saveAnswers(detail.id, prefills)
  await api(`evaluations/${detail.id}/stages/${stageKey}/complete`, 'POST', { completedOn })
}

/** Braki blokujące, które uzupełni samo zamknięcie etapu (podpowiedzi), nie blokują przycisku. */
export function withoutAutoFilled(detail: Detail, stageKey: string, issues: CheckIssue[]): CheckIssue[] {
  const auto = new Set(unsavedPrefills(detail, stageKey).map((a) => a.fieldKey))
  return issues.filter((i) => !i.blocking || !i.fieldKey || !auto.has(i.fieldKey))
}
