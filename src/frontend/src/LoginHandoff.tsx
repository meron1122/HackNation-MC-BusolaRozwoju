import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { AnimationItem } from 'lottie-web'
import markUrl from './assets/znak-busoli.svg'
import morphUrl from './assets/wejscie-uscisk.json?url'

export type LoginPhase = 'idle' | 'checking' | 'morphing' | 'revealing'

export function LoginHandoff({ phase, wordmark, onMorphComplete }: {
  phase: LoginPhase
  wordmark: DOMRect | null
  onMorphComplete: () => void
}) {
  const player = useRef<HTMLDivElement>(null)
  const animation = useRef<AnimationItem | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading')
  const active = phase !== 'idle'

  useEffect(() => {
    const container = player.current
    if (!active || !container || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let cancelled = false
    setStatus('loading')

    const fail = () => {
      if (!cancelled) setStatus('failed')
    }

    import('lottie-web/build/player/lottie_light').then(({ default: lottie }) => {
      if (cancelled) return
      const instance = lottie.loadAnimation({
        container,
        renderer: 'svg',
        loop: false,
        autoplay: false,
        path: morphUrl,
      })
      animation.current = instance
      instance.addEventListener('DOMLoaded', () => {
        if (!cancelled) setStatus('ready')
      })
      instance.addEventListener('complete', onMorphComplete)
      instance.addEventListener('data_failed', fail)
      instance.addEventListener('error', fail)
    }).catch(fail)

    return () => {
      cancelled = true
      container.removeAttribute('data-playing')
      animation.current?.destroy()
      animation.current = null
    }
  }, [active, onMorphComplete])

  useEffect(() => {
    if (phase !== 'morphing') return
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (reducedMotion.matches || status === 'failed') {
      onMorphComplete()
      return
    }

    if (status === 'ready') {
      player.current?.setAttribute('data-playing', '')
      animation.current?.goToAndPlay(0, true)
    }

    const timeout = window.setTimeout(onMorphComplete, status === 'ready' ? 2200 : 500)
    const onPreferenceChanged = () => {
      if (!reducedMotion.matches) return
      animation.current?.pause()
      onMorphComplete()
    }
    reducedMotion.addEventListener('change', onPreferenceChanged)
    return () => {
      window.clearTimeout(timeout)
      reducedMotion.removeEventListener('change', onPreferenceChanged)
    }
  }, [phase, status, onMorphComplete])

  // W poziomym logo znak zajmuje pierwszy kwadrat w viewBox 2372 × 1024.
  const markSize = wordmark ? wordmark.width * 1024 / 2372 : 0
  const dialMarkSize = Math.min(290, window.innerWidth * .72) * .81 * .78
  const origin = wordmark ? {
    '--login-start-x': `${wordmark.left + markSize / 2 - window.innerWidth / 2}px`,
    '--login-start-y': `${wordmark.top + wordmark.height / 2 - window.innerHeight / 2}px`,
    '--login-start-scale': markSize / dialMarkSize,
  } as CSSProperties : undefined
  const message = phase === 'checking' ? 'Logowanie…' : active ? 'Otwieranie Busoli…' : ''
  return (
    <>
      <p className="sr-only" role="status">{message}</p>
      <div className="login-handoff" data-phase={phase} aria-hidden="true" style={origin}>
        <div className="login-handoff-content">
          <div className="login-handoff-orbit">
            <span className="login-handoff-dot" />
            <div className="login-handoff-dial">
              <div className="login-handoff-morph" ref={player} />
              <img src={markUrl} alt="" width={180} height={180} />
            </div>
          </div>
          <p>{message || 'Logowanie…'}</p>
        </div>
      </div>
    </>
  )
}
