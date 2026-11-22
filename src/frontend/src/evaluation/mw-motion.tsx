// Ruch w kreatorze oceny (agent „Kreator”): drobne hooki bez zależności. Style w mw-wizard.css.
import { useEffect, useRef, useState } from 'react'

export const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Poprzednia wartość (z poprzedniego renderu); przy pierwszym renderze `undefined`. */
export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T | undefined>(undefined)
  useEffect(() => { ref.current = value })
  return ref.current
}

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)

/**
 * Liczba „odlicza” raz, przy pierwszym pokazaniu wartości (np. średnia w wyniku). Późniejsze zmiany: od razu.
 * Przy prefers-reduced-motion zwraca od razu wartość końcową.
 */
export function useCountUp(value: number | null, duration = 700): number | null {
  const played = useRef(false)
  const [shown, setShown] = useState<number | null>(() => (value != null && !reducedMotion() ? 0 : value))
  useEffect(() => {
    if (value == null) { setShown(null); return }
    if (played.current || reducedMotion()) { played.current = true; setShown(value); return }
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      setShown(value * easeOut(t))
      if (t < 1) raf = requestAnimationFrame(tick)
      else played.current = true
    }
    raf = requestAnimationFrame(tick)
    // Przerwane odliczanie (zmiana wartości, StrictMode) zaczyna się od nowa przy kolejnym efekcie.
    return () => cancelAnimationFrame(raf)
  }, [value, duration])
  return shown
}

/**
 * Liczba z odliczaniem: widoczna cyfra jest dekoracyjna (aria-hidden), czytnik dostaje tylko wartość końcową,
 * więc region aria-live nie ogłasza każdej klatki.
 */
export function CountUp({ value, format, duration }: { value: number | null; format: (n: number) => string; duration?: number }) {
  const shown = useCountUp(value, duration)
  if (value == null || shown == null) return <>–</>
  return (
    <>
      <span aria-hidden="true">{format(shown)}</span>
      <span className="sr-only">{format(value)}</span>
    </>
  )
}

/**
 * Klasa, która zostaje tylko w renderze, w którym `flag` zmieniła się z false na true (np. ✓ po odhaczeniu).
 * Przy pierwszym renderze nic nie zwraca — bez animacji przy wejściu na ekran.
 */
export function useBecameTrue(flag: boolean): boolean {
  const prev = usePrevious(flag)
  const [pulse, setPulse] = useState(false)
  useEffect(() => {
    if (prev === false && flag) setPulse(true)
    else if (!flag) setPulse(false)
  }, [prev, flag])
  return pulse
}
