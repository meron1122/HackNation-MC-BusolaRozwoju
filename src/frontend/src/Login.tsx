import { useState, type FormEvent } from 'react'
import { api } from './api'
import { Logo } from './Logo'

type LoginResponse = { token: string | null; requiresTwoFactor: boolean }

// Przy 2FA wysyłamy hasło jeszcze raz razem z kodem — API nie ma kroku „sam kod”, który dałoby się obejść.
export function Login({ onLogin }: { onLogin: (token: string) => void }) {
  const [credentials, setCredentials] = useState<{ email: string; password: string } | null>(null)
  const [useRecoveryCode, setUseRecoveryCode] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function signIn(body: Record<string, unknown>) {
    setBusy(true)
    setError('')
    try {
      const res = await api<LoginResponse>('auth/login', 'POST', body)
      if (res.token) onLogin(res.token)
      else if (res.requiresTwoFactor) setCredentials({ email: String(body.email), password: String(body.password) })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
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
    <main className="login">
      <h1 className="brand-heading"><Logo layout="vertical" width={120} /></h1>
      {credentials === null ? (
        <form onSubmit={submitPassword} className="form">
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
        <form onSubmit={submitCode} className="form" key={useRecoveryCode ? 'recovery' : 'totp'}>
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
    </main>
  )
}
