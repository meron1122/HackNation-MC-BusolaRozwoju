import { useEffect, useState } from 'react'
import { ASK_ASSISTANT_EVENT } from '../v2'
import { AssistantChat } from './AssistantChat'
import { GUIDE_TRIED_EVENT, TOUR_STARTED_EVENT, guideTried } from './tours'
import { ask, setScreen, useAssistant, type Screen } from './store'

export { setAssistantStep, type Screen } from './store'

/** Otwiera asystenta z dowolnego miejsca (np. przycisk „Zapytaj asystenta” na pulpicie). */
export const OPEN_ASSISTANT_EVENT = 'busola-open-assistant'
export const openAssistant = () => window.dispatchEvent(new Event(OPEN_ASSISTANT_EVENT))
/** Gdy asystent jest zadokowany (kreator, strona Asystent): „pokaż się” zamiast okna w rogu. */
export const FOCUS_ASSISTANT_EVENT = 'busola-focus-assistant'

/**
 * Asystent zawsze pod ręką. Poza kreatorem i stroną „Asystent” — przycisk i okno w prawym dolnym rogu.
 * W kreatorze jest zakładką „✦ Asystent” w prawym panelu (ta sama rozmowa), więc okno w rogu się chowa.
 */
export function AssistantWidget({ screen, userName = '' }: { screen: Screen; userName?: string }) {
  const [open, setOpen] = useState(false)
  // Zachęta: dopóki użytkownik nie spróbuje prowadzenia po ekranie, przycisk ma znacznik i dymek.
  const [fresh, setFresh] = useState(() => !guideTried())
  useEffect(() => {
    const tried = () => setFresh(false)
    window.addEventListener(GUIDE_TRIED_EVENT, tried)
    return () => window.removeEventListener(GUIDE_TRIED_EVENT, tried)
  }, [])
  const { docked } = useAssistant()
  const screenKey = JSON.stringify(screen)

  useEffect(() => { setScreen(JSON.parse(screenKey), userName) }, [screenKey, userName])

  useEffect(() => {
    const show = () => {
      // Zadokowany panel sam się pokaże; okno w rogu tylko, gdy panelu nie ma.
      window.dispatchEvent(new Event(FOCUS_ASSISTANT_EVENT))
      setOpen(true)
    }
    const askIt = (e: Event) => {
      const q = (e as CustomEvent<string>).detail
      show()
      if (q) void ask(q, 'rules')
    }
    const hide = () => setOpen(false)
    window.addEventListener(OPEN_ASSISTANT_EVENT, show)
    window.addEventListener(ASK_ASSISTANT_EVENT, askIt)
    window.addEventListener(TOUR_STARTED_EVENT, hide)
    return () => {
      window.removeEventListener(TOUR_STARTED_EVENT, hide)
      window.removeEventListener(OPEN_ASSISTANT_EVENT, show)
      window.removeEventListener(ASK_ASSISTANT_EVENT, askIt)
    }
  }, [])

  useEffect(() => {
    if (!open || docked) return
    const escape = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('keydown', escape)
    return () => document.removeEventListener('keydown', escape)
  }, [open, docked])

  if (docked) return null
  return (
    <>
      {open && (
        <section className="assistant-pop" role="dialog" aria-label="Asystent">
          <header className="assistant-head">
            <span className="v2-spark" aria-hidden="true">✦</span>
            <h2>Asystent</h2>
            <span className="grow" />
            <button type="button" className="assistant-close" aria-label="Zamknij asystenta" onClick={() => setOpen(false)}>×</button>
          </header>
          <AssistantChat variant="pop" autoFocus />
        </section>
      )}
      {fresh && !open && (
        <button type="button" className="assistant-nudge" onClick={() => setOpen(true)}>
          <strong>Nowe:</strong> powiedz, czego szukasz — poprowadzę Cię po ekranie.
        </button>
      )}
      <button type="button" className={`${open ? 'assistant-fab open' : 'assistant-fab'}${fresh && !open ? ' attention' : ''}`} aria-expanded={open}
        aria-label={open ? 'Zamknij asystenta' : 'Otwórz asystenta'} onClick={() => setOpen((o) => !o)}>
        <span aria-hidden="true">{open ? '×' : '✦'}</span>
        {!open && <span>Asystent</span>}
      </button>
    </>
  )
}
