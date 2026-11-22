import type { CSSProperties } from 'react'
import markUrl from './assets/znak-busoli.svg'

export type LoginPhase = 'idle' | 'checking' | 'revealing'

export function LoginHandoff({ phase, wordmark }: { phase: LoginPhase; wordmark: DOMRect | null }) {
  // W poziomym logo znak zajmuje pierwszy kwadrat w viewBox 2372 × 1024.
  const markSize = wordmark ? wordmark.width * 1024 / 2372 : 0
  const dialMarkSize = Math.min(290, window.innerWidth * .72) * .81 * .78
  const origin = wordmark ? {
    '--login-start-x': `${wordmark.left + markSize / 2 - window.innerWidth / 2}px`,
    '--login-start-y': `${wordmark.top + wordmark.height / 2 - window.innerHeight / 2}px`,
    '--login-start-scale': markSize / dialMarkSize,
  } as CSSProperties : undefined
  const message = phase === 'checking' ? 'Logowanie…' : phase === 'revealing' ? 'Otwieranie Busoli…' : ''
  return (
    <>
      <p className="sr-only" role="status">{message}</p>
      <div className="login-handoff" data-phase={phase} aria-hidden="true" style={origin}>
        <div className="login-handoff-content">
          <div className="login-handoff-orbit">
            <span className="login-handoff-dot" />
            <div className="login-handoff-dial">
              <img src={markUrl} alt="" width={180} height={180} />
            </div>
          </div>
          <p>{message || 'Logowanie…'}</p>
        </div>
      </div>
    </>
  )
}
