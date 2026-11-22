import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { api } from './api'
import { ConfirmButton } from './ConfirmButton'
import type { Row } from './Crud'

type User = { id: string; email: string; employeeId: number | null; roles: string[]; twoFactorEnabled: boolean }

// Employee i Supervisor wynikają z danych pracownika, API nie pozwala ich nadawać.
const ROLES = ['Hr', 'ServiceAdmin', 'SuperAdmin']

const checkedRoles = (form: FormData) => ROLES.filter((r) => form.get(r) === 'on')

export function UsersPage({ superAdmin }: { superAdmin: boolean }) {
  const [users, setUsers] = useState<User[] | null>(null)
  const [employees, setEmployees] = useState<Row[]>([])
  const [error, setError] = useState('')
  const [adding, setAdding] = useState(false)
  const roles = superAdmin ? ROLES : ROLES.filter((r) => r !== 'SuperAdmin')

  const load = useCallback(() => api<User[]>('users').then(setUsers, (e: Error) => setError(e.message)), [])
  useEffect(() => {
    load()
    // shortcut: max 200 pracowników na liście wyboru; przy większej bazie potrzebne wyszukiwanie
    api<Row[]>('employees?pageSize=200').then(setEmployees, () => setEmployees([]))
  }, [load])

  const employeeName = (id: number | null) => {
    const e = employees.find((x) => x.id === id)
    return id == null ? '—' : e ? `${e.lastName} ${e.firstName}` : `#${id}`
  }

  async function run(action: () => Promise<unknown>) {
    try {
      await action()
      setError('')
      load()
      return true
    } catch (e) {
      setError((e as Error).message)
      return false
    }
  }

  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const employeeId = String(form.get('employeeId') ?? '')
    const ok = await run(() =>
      api('users', 'POST', {
        email: form.get('email'),
        password: form.get('password'),
        employeeId: employeeId === '' ? null : Number(employeeId),
        roles: checkedRoles(form),
      }),
    )
    if (ok) setAdding(false)
  }

  function resetTwoFactor(user: User) {
    run(() => api(`users/${user.id}/two-factor`, 'DELETE'))
  }

  function saveRoles(e: FormEvent<HTMLFormElement>, user: User) {
    e.preventDefault()
    run(() => api(`users/${user.id}/roles`, 'PUT', { roles: checkedRoles(new FormData(e.currentTarget)) }))
  }

  return (
    <section>
      <div className="toolbar">
        <h2>Konta</h2>
        {!adding && <button onClick={() => setAdding(true)}>Dodaj użytkownika</button>}
      </div>
      {error && <p role="alert" className="error">{error}</p>}
      {adding && (
        <form onSubmit={create} className="form card">
          <label>E-mail<input name="email" type="email" required /></label>
          <label>Hasło<input name="password" type="password" autoComplete="new-password" required /></label>
          <label>
            Pracownik
            <select name="employeeId" defaultValue="">
              <option value="">{superAdmin ? '— brak (konto techniczne) —' : '— wybierz —'}</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.lastName} {e.firstName}</option>)}
            </select>
          </label>
          <fieldset>
            <legend>Role</legend>
            {roles.map((r) => <label key={r} className="check"><input type="checkbox" name={r} />{r}</label>)}
          </fieldset>
          <p className="muted">Hasło: min. 6 znaków, duża i mała litera, cyfra i znak specjalny.</p>
          <div className="buttons">
            <button type="submit">Dodaj użytkownika</button>
            <button type="button" className="secondary" onClick={() => setAdding(false)}>Anuluj</button>
          </div>
        </form>
      )}
      {users === null ? (
        <p>Ładowanie…</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>E-mail</th><th>Pracownik</th><th>Weryfikacja dwuetapowa</th><th>Role</th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.email}</td>
                  <td>{employeeName(u.employeeId)}</td>
                  <td className="nowrap">
                    {u.twoFactorEnabled ? (
                      <>włączona <ConfirmButton compact question={`Wyłączyć weryfikację dwuetapową dla ${u.email}? Użytkownik zostanie wylogowany i skonfiguruje ją od nowa.`}
                        confirmLabel="Wyłącz weryfikację" onConfirm={() => resetTwoFactor(u)}>Resetuj</ConfirmButton></>
                    ) : '—'}
                  </td>
                  <td>
                    <form onSubmit={(e) => saveRoles(e, u)} className="inline" key={u.roles.join()}>
                      {roles.map((r) => (
                        <label key={r} className="check">
                          <input type="checkbox" name={r} defaultChecked={u.roles.includes(r)} />{r}
                        </label>
                      ))}
                      <button type="submit" className="link">Zapisz role</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
