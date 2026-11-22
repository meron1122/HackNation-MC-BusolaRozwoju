import { useEffect, useRef, useState, type FormEvent } from 'react'
import { api, readSession } from './api'
import { Logo } from './Logo'
import { LoginIllustration } from './LoginIllustration'
import './hifi-pages.css'

type LoginResponse = { token: string | null; requiresTwoFactor: boolean }

// Przy 2FA wysyłamy hasło jeszcze raz razem z kodem — API nie ma kroku „sam kod”, który dałoby się obejść.
export function Login({ onLogin, onChecking }: {
  onLogin: (token: string) => void
  onChecking: (checking: boolean, wordmark?: DOMRect) => void
}) {
  const [credentials, setCredentials] = useState<{ email: string; password: string } | null>(null)
  const [useRecoveryCode, setUseRecoveryCode] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const requestInFlight = useRef(false)
  const formPanel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!busy && error) {
      formPanel.current?.querySelector<HTMLInputElement>('input')?.focus()
    }
  }, [busy, error])

  async function signIn(body: Record<string, unknown>) {
    if (requestInFlight.current) return
    requestInFlight.current = true
    const wordmark = formPanel.current?.querySelector('.brand-heading img')?.getBoundingClientRect()
    setBusy(true)
    setError('')
    onChecking(true, wordmark)
    const started = performance.now()
    let entering = false
    try {
      const res = await api<LoginResponse>('auth/login', 'POST', body)
      if (res.token) {
        if (!readSession(res.token)) throw new Error('Nie udało się otworzyć sesji. Spróbuj ponownie.')
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        const remaining = 580 - (performance.now() - started)
        if (!reduced && remaining > 0) {
          await new Promise<void>((resolve) => window.setTimeout(resolve, remaining))
        }
        entering = true
        onLogin(res.token)
      } else if (res.requiresTwoFactor) {
        setCredentials({ email: String(body.email), password: String(body.password) })
      } else {
        setError('Nie udało się zalogować. Spróbuj ponownie.')
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      if (!entering) {
        requestInFlight.current = false
        setBusy(false)
        onChecking(false)
      }
    }
  }

  function submitPassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    signIn({ email: form.get('email'), password: form.get('password') })
  }

  function submitCode(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const code = String(new FormData(e.currentTarget).get('code') ?? '')
    signIn({ ...credentials, ...(useRecoveryCode ? { recoveryCode: code } : { twoFactorCode: code }) })
  }

  function back() {
    setCredentials(null)
    setUseRecoveryCode(false)
    setError('')
  }

  return (
    <main className="login hifi-login">
      <LoginIllustration animate={credentials === null} />
      <div className="hifi-login-form" ref={formPanel} inert={busy}>
        <h1 className="brand-heading"><Logo width={158} /></h1>
        <div className="hifi-login-intro">
          <h2 className="hifi-login-title">{credentials === null ? 'Zaloguj się' : 'Weryfikacja dwuetapowa'}</h2>
          <p className="muted">Ocena okresowa i pierwsza ocena w służbie cywilnej, krok po kroku.</p>
        </div>
        {credentials === null ? (
          <form onSubmit={submitPassword} className="form hifi-login-card">
            <label>
              E-mail
              <input name="email" type="email" autoComplete="username" required autoFocus />
            </label>
            <label>
              Hasło
              <input name="password" type="password" autoComplete="current-password" required />
            </label>
            {error && <p role="alert" className="error">{error}</p>}
            <button type="submit" disabled={busy}>{busy ? 'Logowanie…' : 'Zaloguj'}</button>
          </form>
        ) : (
          <form onSubmit={submitCode} className="form hifi-login-card" key={useRecoveryCode ? 'recovery' : 'totp'}>
            <p className="muted">
              {useRecoveryCode
                ? 'Wpisz jeden z kodów odzyskiwania. Każdy działa tylko raz.'
                : 'Wpisz 6-cyfrowy kod z aplikacji uwierzytelniającej.'}
            </p>
            <label>
              {useRecoveryCode ? 'Kod odzyskiwania' : 'Kod weryfikacyjny'}
              {useRecoveryCode ? (
                <input name="code" autoComplete="off" required autoFocus />
              ) : (
                <input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" required autoFocus />
              )}
            </label>
            {error && <p role="alert" className="error">{error}</p>}
            <button type="submit" disabled={busy}>{busy ? 'Sprawdzanie…' : 'Potwierdź'}</button>
            <div className="buttons">
              <button type="button" className="link" onClick={() => { setUseRecoveryCode(!useRecoveryCode); setError('') }}>
                {useRecoveryCode ? 'Użyj kodu z aplikacji' : 'Nie mam telefonu — użyj kodu odzyskiwania'}
              </button>
            </div>
            <button type="button" className="secondary" onClick={back}>Wróć</button>
          </form>
        )}
      </div>
    </main>
  )
}
