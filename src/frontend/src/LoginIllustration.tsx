import { useEffect, useRef } from 'react'
import type { AnimationItem } from 'lottie-web'
import animationUrl from './assets/logowanie.json?url'
import posterUrl from './assets/logowanie.svg'

function followPointer(container: HTMLElement) {
  const stage = container.closest('main')
  const faces = Array.from(container.querySelectorAll<SVGGElement>('.login-gaze-head')).flatMap((head) => {
    const eyes = head.querySelector<SVGGElement>('.login-gaze-eyes')
    const space = head.parentNode
    if (!eyes || !(space instanceof SVGGraphicsElement)) return []

    const bounds = head.getBBox()
    const center = new DOMPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
    return [{ head, eyes, space, center }]
  })
  if (!stage || !faces.length) return

  let frame: number | null = null
  let clientX = 0
  let clientY = 0
  const limit = (value: number) => Math.max(-1, Math.min(1, value))

  const draw = () => {
    frame = null
    const bounds = container.getBoundingClientRect()
    // Neutralna pozycja jest liczona w przestrzeni postaci, bez bieżącego obrotu głowy.
    const positions = faces.map(({ space, center }) => {
      const matrix = space.getScreenCTM()
      return matrix ? center.matrixTransform(matrix) : null
    })

    faces.forEach(({ head, eyes }, index) => {
      const center = positions[index]
      if (!center) return
      const x = limit((clientX - center.x) / (bounds.width * .38))
      const y = limit((clientY - center.y) / (bounds.height * .52))
      head.style.transform = `translateY(${y * 2.5}px) rotate(${x * 5.5}deg)`
      eyes.style.transform = `translate(${x * 6}px, ${y * 4}px)`
    })
  }

  const move = (event: PointerEvent) => {
    if (event.pointerType === 'touch') return
    clientX = event.clientX
    clientY = event.clientY
    if (frame === null) frame = requestAnimationFrame(draw)
  }

  const reset = () => {
    if (frame !== null) cancelAnimationFrame(frame)
    frame = null
    for (const { head, eyes } of faces) {
      head.style.removeProperty('transform')
      eyes.style.removeProperty('transform')
    }
  }

  stage.addEventListener('pointermove', move, { passive: true })
  stage.addEventListener('pointerleave', reset)
  stage.addEventListener('pointercancel', reset)
  window.addEventListener('blur', reset)

  return () => {
    stage.removeEventListener('pointermove', move)
    stage.removeEventListener('pointerleave', reset)
    stage.removeEventListener('pointercancel', reset)
    window.removeEventListener('blur', reset)
    reset()
  }
}

export function LoginIllustration({ animate }: { animate: boolean }) {
  const player = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = player.current
    if (!container || !animate) return

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const desktop = window.matchMedia('(min-width: 900px)')
    let animation: AnimationItem | undefined
    let revision = 0
    let stopFollowing: (() => void) | undefined

    const stop = () => {
      revision++
      stopFollowing?.()
      stopFollowing = undefined
      container.removeAttribute('data-ready')
      animation?.destroy()
      animation = undefined
    }

    const sync = () => {
      stop()
      if (reducedMotion.matches || !desktop.matches) return

      const request = revision
      import('lottie-web/build/player/lottie_light').then(({ default: lottie }) => {
        if (request !== revision) return
        const instance = lottie.loadAnimation({
          container: container,
          renderer: 'svg',
          loop: false,
          autoplay: false,
          path: animationUrl,
        })
        animation = instance
        instance.addEventListener('DOMLoaded', () => {
          if (request !== revision) return
          container.setAttribute('data-ready', '')
          stopFollowing = followPointer(container)
          instance.play()
        })
        instance.addEventListener('data_failed', stop)
        instance.addEventListener('error', stop)
      }).catch(() => {
        if (request === revision) stop()
      })
    }

    sync()
    reducedMotion.addEventListener('change', sync)
    desktop.addEventListener('change', sync)
    return () => {
      reducedMotion.removeEventListener('change', sync)
      desktop.removeEventListener('change', sync)
      stop()
    }
  }, [animate])

  return (
    <div className="login-illustration" aria-hidden="true">
      <div className="login-illustration-motion" ref={player} />
      <img className="login-illustration-poster" src={posterUrl} alt="" width={1160} height={640} />
    </div>
  )
}
