// Dane oceny poza komponentami: ładowanie z API, kontekst roboczy, zapis odpowiedzi, zamknięcie etapu, podpowiedzi pól.
import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import {
  emptyAnswer, keyOf, type Answer, type CheckIssue, type Cond, type Detail, type Field, type IndicatorContext, type WorkContext,
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
    data?.indicators.find((i) => i.indicatorKey === key) ?? { indicatorKey: key, expectation: null }
  const reason = (criterionKey: string) => data?.criteria.find((c) => c.criterionKey === criterionKey)?.scoreReason ?? ''

  // PUT to łatka: pominięte pole = bez zmian, "" = wyczyść (oczekiwanie tylko w 1. etapie, reszta w etapie ocen).
  async function saveIndicator(key: string, patch: Partial<Pick<IndicatorContext, 'expectation'>>) {
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

/**
 * Wartości startowe: zapisane odpowiedzi, pod nimi podpowiedzi z kartoteki (`detail.prefill`: osoby, urząd, data
 * zatrudnienia — per pozycja, np. sam wydział, gdy imię jest już zapisane), a dla terminów (`prefill: stage:*`) daty etapów.
 */
export function initialValues(detail: Detail): Record<string, Answer> {
  const values: Record<string, Answer> = {}
  for (const a of detail.prefill ?? []) values[keyOf(a.fieldKey, a.itemKey ?? null)] = { ...emptyAnswer(a.fieldKey, a.itemKey ?? null), ...a, itemKey: a.itemKey ?? null }
  for (const a of detail.answers) values[keyOf(a.fieldKey, a.itemKey)] = a
  const has = (fieldKey: string) => detail.answers.some((a) => a.fieldKey === fieldKey)
  const stage = (prefill?: string) => detail.stages.find((s) => prefill === `stage:${s.key}`)

  for (const field of detail.schema.sections.flatMap((s) => s.fields)) {
    if (has(field.key)) continue
    if (!detail.prefill && (field.type === 'person' || field.prefill === 'employee.hireDate')) {
      legacyPrefill(detail, field, values)
    } else if (stage(field.prefill)?.dueTo) {
      const s = stage(field.prefill)!
      values[keyOf(field.key, null)] = field.type === 'dateRange'
        ? { ...emptyAnswer(field.key, null), valueDate: s.dueFrom ?? detail.startDate, valueDateTo: s.dueTo }
        : { ...emptyAnswer(field.key, null), valueDate: s.dueTo }
    }
  }
  return values
}

/** Starsze API bez `prefill`: imię i nazwisko z nazw w ocenie, data zatrudnienia = początek oceny. */
function legacyPrefill(detail: Detail, field: Field, values: Record<string, Answer>) {
  if (field.prefill === 'employee.hireDate') {
    values[keyOf(field.key, null)] = { ...emptyAnswer(field.key, null), valueDate: detail.startDate }
    return
  }
  const name = field.role === 'evaluated' ? detail.employeeName
    : field.role === 'evaluator' || field.role === 'supervisor' ? detail.evaluatorName
    : field.role === 'unitHead' ? detail.unitHeadName : null
  if (!name) return
  const [first, ...rest] = name.split(' ')
  values[keyOf(field.key, 'firstName')] = { ...emptyAnswer(field.key, 'firstName'), valueText: first }
  values[keyOf(field.key, 'lastName')] = { ...emptyAnswer(field.key, 'lastName'), valueText: rest.join(' ') }
}

/**
 * Podpowiedzi, które przed zamknięciem etapu zapisuje front: terminy etapów (`prefill: stage:*`). Dane z kartoteki
 * (`detail.prefill`) zapisuje przy zamknięciu backend — chyba że to starsze API bez `prefill`. Sekcje ukryte pomijamy.
 */
export function unsavedPrefills(detail: Detail, stageKey: string): Answer[] {
  const values = initialValues(detail)
  const visible = (c?: Cond) => !c || c.in.includes(detail.answers.find((a) => a.fieldKey === c.field)?.valueText ?? '')
  return detail.schema.sections
    .filter((s) => s.stage === stageKey && !detail.lockedSections?.includes(s.key) && visible(s.visibleWhen))
    .flatMap((s) => s.fields)
    .filter((f) => visible(f.visibleWhen) && !detail.answers.some((a) => a.fieldKey === f.key))
    .flatMap((f) => {
      if (f.prefill?.startsWith('stage:')) return [values[keyOf(f.key, null)]]
      if (detail.prefill) return []
      if (f.type === 'person') return [values[keyOf(f.key, 'firstName')], values[keyOf(f.key, 'lastName')]]
      return f.prefill === 'employee.hireDate' ? [values[keyOf(f.key, null)]] : []
    })
    .filter((a): a is Answer => !!a)
}

/** Zamknięcie etapu: najpierw zapis podpowiedzi (np. termin sporządzenia oceny), potem complete. */
export async function completeStage(detail: Detail, stageKey: string, completedOn: string) {
  const prefills = unsavedPrefills(detail, stageKey)
  if (prefills.length) await saveAnswers(detail.id, prefills)
  await api(`evaluations/${detail.id}/stages/${stageKey}/complete`, 'POST', { completedOn })
}

/**
 * Kolejność podpisów: pole etapu, który jeszcze nie nadszedł, czeka (`laterStage`); pole ocenianego czeka też na podpis
 * przełożonego/oceniającego w tej samej części (`waitingForEvaluator`) — oceniany potwierdza rozmowę, która już się odbyła.
 */
export type SignatureState = 'signed' | 'open' | 'waitingForEvaluator' | 'laterStage' | 'closed'
export function signatureState(detail: Detail, field: Field): SignatureState {
  if (detail.signatures.some((s) => s.fieldKey === field.key)) return 'signed'
  const section = detail.schema.sections.find((s) => s.fields.some((f) => f.key === field.key))
  if (!section || detail.isFinal || detail.lockedSections?.includes(section.key)) return 'closed'
  const stageIndex = detail.stages.findIndex((s) => s.key === section.stage)
  const currentIndex = detail.stages.findIndex((s) => s.key === detail.currentStageKey)
  if (currentIndex >= 0 && stageIndex > currentIndex) return 'laterStage'
  const evaluatorUnsigned = section.fields.some((f) =>
    f.type === 'signature' && f.role !== 'evaluated' && !detail.signatures.some((s) => s.fieldKey === f.key))
  return field.role === 'evaluated' && evaluatorUnsigned ? 'waitingForEvaluator' : 'open'
}

/** Blokada terminowa z backendu (signatureSlots): etap zamknięty / wcześniejszy otwarty / przed dueFrom. Null = można. */
export function slotBlock(detail: Detail, field: Field): string | null {
  const slot = detail.signatureSlots?.find((s) => s.fieldKey === field.key)
  return slot && !slot.signed && !slot.canSign ? slot.reason ?? 'Tego pola nie można teraz podpisać.' : null
}

/** Pole można podpisać teraz: kolejność podpisów frontu (signatureState) i termin z backendu (signatureSlots). */
export const canSignNow = (detail: Detail, field: Field) => signatureState(detail, field) === 'open' && !slotBlock(detail, field)

/** Braki blokujące, które uzupełni samo zamknięcie etapu (podpowiedzi), nie blokują przycisku. */
export function withoutAutoFilled(detail: Detail, stageKey: string, issues: CheckIssue[]): CheckIssue[] {
  const auto = new Set(unsavedPrefills(detail, stageKey).map((a) => a.fieldKey))
  return issues.filter((i) => !i.blocking || !i.fieldKey || !auto.has(i.fieldKey))
}
