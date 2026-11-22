import { QRCodeSVG } from 'qrcode.react'
import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { api, apiUpload } from './api'
import { Avatar } from './Avatar'
import { Loadable, SaveButton, Skeleton } from './v2/motion'
import './ml-motion.css'

type Account = {
  email: string
  employeeName: string | null
  hasAvatar: boolean
  twoFactorEnabled: boolean
  recoveryCodesLeft: number
}
type Setup = { sharedKey: string; authenticatorUri: string; token: string }
type RecoveryCodes = { recoveryCodes: string[]; token: string }

type Props = {
  /** Zmiana hasła i 2FA unieważniają stary token — API odsyła nowy. */
  onToken: (token: string) => void
  avatarVersion: number
  onAvatarChange: () => void
  /** false = osadzone w zakładce profilu, bez własnego nagłówka. */
  showTitle?: boolean
}

export function AccountPage({ onToken, avatarVersion, onAvatarChange, showTitle = true }: Props) {
  const [account, setAccount] = useState<Account | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(() => api<Account>('account').then(setAccount, (e: Error) => setError(e.message)), [])
  useEffect(() => {
    load()
  }, [load])

  return (
    <section className="account">
      {showTitle && <div className="toolbar"><h2>Moje konto</h2></div>}
      <Loadable loading={!account && !error} error={account ? '' : error} onRetry={() => { setError(''); load() }} skeleton={<Skeleton variant="cards" rows={3} />}>
      {() => account && <AccountBody account={account} avatarVersion={avatarVersion} onAvatarChange={onAvatarChange} onToken={onToken} load={load} />}
      </Loadable>
    </section>
  )
}

function AccountBody({ account, avatarVersion, onAvatarChange, onToken, load }: {
  account: Account; avatarVersion: number; onAvatarChange: () => void; onToken: (token: string) => void; load: () => void
}) {
  return (
    <div className="m-stagger ml-account">
      <AvatarSection account={account} version={avatarVersion} onChange={() => { onAvatarChange(); load() }} />
      <PasswordSection onToken={onToken} />
      <TwoFactorSection account={account} onToken={onToken} onChange={load} />
    </div>
  )
}

function AvatarSection({ account, version, onChange }: { account: Account; version: number; onChange: () => void }) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const name = account.employeeName ?? account.email

  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    setError('')
    try {
      await action()
      onChange()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  function upload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) run(() => apiUpload('account/avatar', file))
  }

  return (
    <div className="card panel">
      <h3>Zdjęcie</h3>
      <div className="avatar-row">
        <Avatar path={account.hasAvatar ? 'account/avatar' : null} name={name} size={96} version={version} />
        <div className="stack">
          <p className="muted">{name}<br />{account.email}</p>
          <div className="buttons">
            <label className={busy ? 'button disabled' : 'button'}>
              {account.hasAvatar ? 'Zmień zdjęcie' : 'Dodaj zdjęcie'}
              <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={upload} disabled={busy} className="sr-only" />
            </label>
            {account.hasAvatar && (
              <button className="secondary" disabled={busy} onClick={() => run(() => api('account/avatar', 'DELETE'))}>Usuń</button>
            )}
          </div>
          <p className="muted small">JPG, PNG, WebP lub GIF, do 2 MB. Zdjęcie zostanie zmniejszone do 256 px.</p>
        </div>
      </div>
      {error && <p role="alert" className="error">{error}</p>}
    </div>
  )
}

function PasswordSection({ onToken }: { onToken: (token: string) => void }) {
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formElement = e.currentTarget
    const form = new FormData(formElement)
    setDone(false)
    if (form.get('newPassword') !== form.get('confirmPassword')) {
      setError('Nowe hasła się różnią.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const { token } = await api<{ token: string }>('account/password', 'POST', {
        currentPassword: form.get('currentPassword'),
        newPassword: form.get('newPassword'),
      })
      onToken(token)
      formElement.reset()
      setDone(true)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="form card panel">
      <h3>Zmiana hasła</h3>
      <label>Obecne hasło<input name="currentPassword" type="password" autoComplete="current-password" required /></label>
      <label>Nowe hasło<input name="newPassword" type="password" autoComplete="new-password" required /></label>
      <label>Powtórz nowe hasło<input name="confirmPassword" type="password" autoComplete="new-password" required /></label>
      <p className="muted">Min. 6 znaków, wielka i mała litera, cyfra i znak specjalny. Pozostałe sesje zostaną wylogowane.</p>
      {error && <p role="alert" className="error">{error}</p>}
      {done && <p role="status" className="success">Hasło zostało zmienione.</p>}
      <div className="buttons"><SaveButton type="submit" state={busy ? 'saving' : 'idle'}>Zmień hasło</SaveButton></div>
    </form>
  )
}

function TwoFactorSection({ account, onToken, onChange }: { account: Account; onToken: (token: string) => void; onChange: () => void }) {
  const [setup, setSetup] = useState<Setup | null>(null)
  const [codes, setCodes] = useState<string[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function run<T extends { token: string }>(action: () => Promise<T>, after: (result: T) => void) {
    setBusy(true)
    setError('')
    try {
      const result = await action()
      onToken(result.token)
      after(result)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const start = () => run(() => api<Setup>('account/two-factor/setup', 'POST'), (s) => { setSetup(s); setCodes(null) })

  function enable(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const code = new FormData(e.currentTarget).get('code')
    run(() => api<RecoveryCodes>('account/two-factor/enable', 'POST', { code }), (r) => {
      setSetup(null)
      setCodes(r.recoveryCodes)
      onChange()
    })
  }

  function withPassword(path: string, after: (result: { token: string; recoveryCodes?: string[] }) => void) {
    return (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault()
      const formElement = e.currentTarget
      const password = new FormData(formElement).get('password')
      run(() => api<{ token: string; recoveryCodes?: string[] }>(path, 'POST', { password }), (r) => {
        formElement.reset()
        after(r)
        onChange()
      })
    }
  }

  return (
    <div className="card panel">
      <h3>Weryfikacja dwuetapowa</h3>
      {codes && <RecoveryCodeList codes={codes} onDone={() => setCodes(null)} />}

      {!account.twoFactorEnabled && !setup && (
        <>
          <p className="muted">
            Przy logowaniu, oprócz hasła, poprosimy o kod z aplikacji na telefonie
            (np. Microsoft Authenticator, Google Authenticator).
          </p>
          <div className="buttons"><button onClick={start} disabled={busy}>Włącz</button></div>
        </>
      )}

      {setup && (
        <form onSubmit={enable} className="form">
          <ol className="steps">
            <li>Zeskanuj kod aplikacją uwierzytelniającą.</li>
            <li>Albo wpisz klucz ręcznie: <code>{setup.sharedKey}</code></li>
            <li>Wpisz 6-cyfrowy kod, który pokaże aplikacja.</li>
          </ol>
          <div className="qr"><QRCodeSVG value={setup.authenticatorUri} size={180} marginSize={2} title="Kod QR do aplikacji uwierzytelniającej" /></div>
          <label>Kod z aplikacji<input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" required autoFocus /></label>
          <div className="buttons">
            <button type="submit" disabled={busy}>Potwierdź i włącz</button>
            <button type="button" className="secondary" onClick={() => setSetup(null)}>Anuluj</button>
          </div>
        </form>
      )}

      {account.twoFactorEnabled && (
        <>
          <p><strong>Włączona.</strong> Pozostałe kody odzyskiwania: {account.recoveryCodesLeft}.</p>
          <form onSubmit={withPassword('account/two-factor/recovery-codes', (r) => setCodes(r.recoveryCodes ?? null))} className="form inline-form">
            <label>Hasło<input name="password" type="password" autoComplete="current-password" required /></label>
            <button type="submit" className="secondary" disabled={busy}>Nowe kody odzyskiwania</button>
          </form>
          <form onSubmit={withPassword('account/two-factor/disable', () => setCodes(null))} className="form inline-form">
            <label>Hasło<input name="password" type="password" autoComplete="current-password" required /></label>
            <button type="submit" className="secondary danger" disabled={busy}>Wyłącz weryfikację dwuetapową</button>
          </form>
        </>
      )}
      {error && <p role="alert" className="error">{error}</p>}
    </div>
  )
}

function RecoveryCodeList({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  return (
    <div className="recovery" role="status">
      <p>
        <strong>Zapisz kody odzyskiwania w bezpiecznym miejscu.</strong> Każdy pozwala raz zalogować się bez telefonu.
        Nie pokażemy ich ponownie.
      </p>
      <ul className="codes">{codes.map((c) => <li key={c}><code>{c}</code></li>)}</ul>
      <div className="buttons">
        <button type="button" className="secondary" onClick={() => navigator.clipboard?.writeText(codes.join('\n'))}>Kopiuj</button>
        <button type="button" onClick={onDone}>Kody zapisane</button>
      </div>
    </div>
  )
}
