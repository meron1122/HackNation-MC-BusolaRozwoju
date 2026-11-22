import { useSyncExternalStore } from 'react'
import { api, LOGOUT_EVENT } from '../api'

/**
 * Jedna rozmowa z asystentem dla całej aplikacji: okno w rogu, zakładka „✦ Asystent” w kreatorze i strona „Asystent”
 * pokazują ten sam stan. Backend bez zmian: POST agent/chat { messages, context } → { reply, contextLabel }.
 */

/** Na co patrzy użytkownik. Backend dociąga dane encji sam, w zakresie uprawnień użytkownika. */
export type Screen = { page: string; evaluationId: number | null; employeeId: number | null }
export type StepRef = { id: string; title: string } | null
/** 'rules' = pytanie o zasady: do modelu nie idzie oceniana osoba ani pracownik z ekranu. 'context' = z kontekstem ekranu. */
export type Mode = 'rules' | 'context'
/** signature: podpis serwera pod odpowiedzią asystenta; bez niego backend odrzuca historię rozmowy. */
export type Msg = { id: number; role: 'user' | 'assistant'; content: string; error?: boolean; signature?: string }

type State = {
  msgs: Msg[]
  busy: boolean
  screen: Screen
  step: StepRef
  /** Ile paneli asystenta jest zadokowanych (kreator, strona Asystent) — wtedy okno w rogu się chowa. */
  docked: number
  userName: string
}

let state: State = { msgs: [], busy: false, screen: { page: '', evaluationId: null, employeeId: null }, step: null, docked: 0, userName: '' }
let seq = 0
const listeners = new Set<() => void>()
const set = (patch: Partial<State>) => {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}
const subscribe = (cb: () => void) => (listeners.add(cb), () => { listeners.delete(cb) })

export const useAssistant = () => useSyncExternalStore(subscribe, () => state)

export function setScreen(screen: Screen, userName: string) {
  if (JSON.stringify(screen) !== JSON.stringify(state.screen) || userName !== state.userName) set({ screen, userName })
}
export function setAssistantStep(step: StepRef) {
  if (step?.id !== state.step?.id || step?.title !== state.step?.title) set({ step })
}
export function dock() {
  set({ docked: state.docked + 1 })
  return () => set({ docked: Math.max(0, state.docked - 1) })
}
export const resetChat = () => set({ msgs: [] })

// Sesja: po wylogowaniu rozmowa znika, a odpowiedzi z poprzedniej sesji, które dotrą później, są ignorowane.
let session = 0
export function resetSession() {
  session++
  set({ msgs: [], busy: false, userName: '' })
}
if (typeof window !== 'undefined') window.addEventListener(LOGOUT_EVENT, resetSession)

export function contextFor(mode: Mode) {
  const { screen, step } = state
  return mode === 'rules'
    ? { page: screen.page, evaluationId: null, employeeId: null, step: null }
    : { ...screen, step: step?.title ?? null }
}

export const hasEntity = (s: Screen) => s.evaluationId != null || s.employeeId != null

export async function ask(question: string, mode: Mode) {
  const q = question.trim()
  if (!q || state.busy) return
  const history = [...state.msgs.filter((m) => !m.error), { id: ++seq, role: 'user' as const, content: q }]
  set({ msgs: [...state.msgs, history[history.length - 1]], busy: true })
  const mine = session
  try {
    const r = await api<{ reply: string; contextLabel: string; signature: string }>('agent/chat', 'POST', {
      messages: history.slice(-19).map(({ role, content, signature }) => ({ role, content, signature })),
      context: contextFor(mode),
    })
    if (mine !== session) return
    set({ msgs: [...state.msgs, { id: ++seq, role: 'assistant', content: r.reply, signature: r.signature }] })
  } catch (e) {
    if (mine !== session) return
    set({ msgs: [...state.msgs, { id: ++seq, role: 'assistant', content: (e as Error).message, error: true }] })
  } finally {
    if (mine === session) set({ busy: false })
  }
}
