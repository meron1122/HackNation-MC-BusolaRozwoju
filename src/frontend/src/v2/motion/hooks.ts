import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Flaga z progiem: zwraca true dopiero, gdy `active` trwa dłużej niż `delay` (domyślnie 300 ms),
 * a gdy już się pokazała, trzyma ją co najmniej `min` ms (domyślnie 500 ms). Dzięki temu szybkie odpowiedzi
 * nie migają wskaźnikiem, a wolne nie znikają po ułamku sekundy. Działa także przy ograniczonym ruchu.
 */
export function useDelayedFlag(active: boolean, opts?: { delay?: number; min?: number }): boolean {
  const delay = opts?.delay ?? 300
  const min = opts?.min ?? 500
  const [shown, setShown] = useState(false)
  const shownAt = useRef(0)

  useEffect(() => {
    if (active) {
      if (shown) return
      const t = window.setTimeout(() => {
        shownAt.current = Date.now()
        setShown(true)
      }, delay)
      return () => window.clearTimeout(t)
    }
    if (!shown) return
    const left = min - (Date.now() - shownAt.current)
    const t = window.setTimeout(() => setShown(false), Math.max(0, left))
    return () => window.clearTimeout(t)
  }, [active, shown, delay, min])

  return shown
}

export type SaveState = 'idle' | 'saving' | 'saved'

/**
 * Stan przycisku zapisu: `run(fn)` ustawia „saving”, czeka na obietnicę, potem „saved” przez 1,5 s i wraca do „idle”.
 * Błąd: wraca do „idle” i przekazuje wyjątek dalej (komunikat błędu pokazuje ekran).
 */
export function useSaveState(): { state: SaveState; run: (fn: () => Promise<unknown>) => Promise<void> } {
  const [state, setState] = useState<SaveState>('idle')
  const timer = useRef<number | undefined>(undefined)
  const busy = useRef(false)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const run = useCallback(async (fn: () => Promise<unknown>) => {
    if (busy.current) return
    busy.current = true
    window.clearTimeout(timer.current)
    setState('saving')
    try {
      await fn()
      setState('saved')
      timer.current = window.setTimeout(() => setState('idle'), 1500)
    } catch (e) {
      setState('idle')
      throw e
    } finally {
      busy.current = false
    }
  }, [])

  return { state, run }
}

/** true, gdy użytkownik prosi o ograniczony ruch (reaguje na zmianę ustawienia). */
export function usePrefersReducedMotion(): boolean {
  const query = '(prefers-reduced-motion: reduce)'
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setReduced(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return reduced
}
