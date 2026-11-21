import { useState, type FormEvent } from 'react'
import { api } from './api'

export function Login({ onLogin }: { onLogin: (token: string) => void }) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setBusy(true)
    setError('')
    try {
      const { token } = await api<{ token: string }>('auth/login', 'POST', {
        email: form.get('email'),
        password: form.get('password'),
      })
      onLogin(token)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="login">
      <h1>Busola Rozwoju</h1>
      <form onSubmit={submit} className="form">
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
    </main>
  )
}
