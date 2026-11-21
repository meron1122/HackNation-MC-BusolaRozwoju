import { useEffect, useState, type ReactNode } from 'react'
import { AccountPage } from './Account'
import { LOGOUT_EVENT, can, getToken, isSuperAdmin, readSession, setToken, type Session } from './api'
import { Avatar } from './Avatar'
import { CrudPage, ServiceName, type Column, type Field } from './Crud'
import { DeadlinesPage } from './Deadlines'
import { EvaluationsPage } from './Evaluations'
import { Login } from './Login'
import { UsersPage } from './Users'

// shortcut: lista pracowników to pierwsze 200 rekordów (API stronicuje); przy większej bazie dodać stronicowanie
const EMPLOYEES_QUERY = 'pageSize=200'

const employeeFields: Field[] = [
  { name: 'firstName', label: 'Imię' },
  { name: 'lastName', label: 'Nazwisko' },
  { name: 'dateOfBirth', label: 'Data urodzenia', type: 'date' },
  { name: 'hireDate', label: 'Data zatrudnienia', type: 'date' },
  { name: 'departmentId', label: 'Wydział', options: { path: 'departments', label: (d) => `${d.name} (${d.locationName})` } },
  {
    name: 'supervisorId',
    label: 'Przełożony',
    optional: true,
    options: { path: `employees?${EMPLOYEES_QUERY}`, label: (e) => `${e.lastName} ${e.firstName}` },
  },
]
const employeeColumns: Column[] = [
  ['Zdjęcie', (e) => (
    <Avatar path={e.hasAvatar ? `employees/${e.id}/avatar` : null} name={`${e.firstName} ${e.lastName}`} size={28} />
  )],
  ['Nazwisko i imię', (e) => `${e.lastName} ${e.firstName}`],
  ['Urodzony', (e) => e.dateOfBirth],
  ['Zatrudniony', (e) => e.hireDate],
  ['Wydział', (e) => e.departmentName],
  ['Lokalizacja', (e) => e.locationName],
  ['Służba', (e) => <ServiceName name={e.serviceName} logoUrl={e.serviceLogoUrl} />],
  ['Przełożony', (e) => e.supervisorName ?? '—'],
]

const locationFields: Field[] = [
  { name: 'name', label: 'Nazwa' },
  { name: 'serviceId', label: 'Służba', options: { path: 'services', label: (s) => s.name } },
]
const locationColumns: Column[] = [
  ['Nazwa', (l) => l.name],
  ['Służba', (l) => <ServiceName name={l.serviceName} logoUrl={l.serviceLogoUrl} />],
]

const departmentFields: Field[] = [
  { name: 'name', label: 'Nazwa' },
  { name: 'locationId', label: 'Lokalizacja', options: { path: 'locations', label: (l) => `${l.name} (${l.serviceName})` } },
]
const departmentColumns: Column[] = [
  ['Nazwa', (d) => d.name],
  ['Lokalizacja', (d) => d.locationName],
]

const serviceFields: Field[] = [
  { name: 'name', label: 'Nazwa' },
  { name: 'logoUrl', label: 'Adres logo (URL)', type: 'url', optional: true },
]
const serviceColumns: Column[] = [['Nazwa', (s) => <ServiceName name={s.name} logoUrl={s.logoUrl} />]]

/** Przejścia między stronami, np. z listy terminów prosto do karty oceny. */
type Nav = { openEvaluation: number | null; showEvaluation: (id: number | null) => void }
type Page = { key: string; label: string; visible: (s: Session) => boolean; render: (s: Session, nav: Nav) => ReactNode }

// Dostępne dla każdego zalogowanego, otwierane z nagłówka (avatar + imię), nie z zakładek.
const ACCOUNT_PAGE = 'account'

const PAGES: Page[] = [
  {
    key: 'deadlines',
    label: 'Terminy',
    visible: (s) => can(s, 'read_evaluations'),
    render: (_, nav) => <DeadlinesPage onOpen={(id) => nav.showEvaluation(id)} />,
  },
  {
    key: 'evaluations',
    label: 'Oceny',
    visible: (s) => can(s, 'read_evaluations'),
    render: (s, nav) => <EvaluationsPage canAdd={can(s, 'add_evaluation')} openId={nav.openEvaluation} onOpen={nav.showEvaluation} />,
  },
  {
    key: 'employees',
    label: 'Pracownicy',
    visible: (s) => can(s, 'read_employees'),
    render: (s) => (
      <CrudPage title="Pracownicy" path="employees" query={EMPLOYEES_QUERY} fields={employeeFields} columns={employeeColumns}
        canAdd={can(s, 'add_employee')} canEdit={can(s, 'edit_employee')} canDelete={can(s, 'delete_employee')} />
    ),
  },
  {
    key: 'departments',
    label: 'Wydziały',
    visible: (s) => can(s, 'read_departments'),
    render: (s) => (
      <CrudPage title="Wydziały" path="departments" fields={departmentFields} columns={departmentColumns}
        canAdd={can(s, 'add_department')} canEdit={can(s, 'edit_department')} canDelete={can(s, 'delete_department')} />
    ),
  },
  {
    key: 'locations',
    label: 'Lokalizacje',
    visible: (s) => can(s, 'read_locations'),
    render: (s) => (
      <CrudPage title="Lokalizacje" path="locations" fields={locationFields} columns={locationColumns}
        canAdd={can(s, 'add_location')} canEdit={can(s, 'edit_location')} canDelete={can(s, 'delete_location')} />
    ),
  },
  {
    key: 'services',
    label: 'Służby',
    visible: (s) => can(s, 'read_locations'),
    render: (s) => (
      <CrudPage title="Służby" path="services" fields={serviceFields} columns={serviceColumns}
        canAdd={isSuperAdmin(s)} canEdit={false} canDelete={false} />
    ),
  },
  {
    key: 'users',
    label: 'Konta',
    visible: (s) => can(s, 'manage_users'),
    render: (s) => <UsersPage superAdmin={isSuperAdmin(s)} />,
  },
]

export default function App() {
  const [token, setTokenState] = useState(getToken)
  const [pageKey, setPageKey] = useState(PAGES[0].key)
  const [avatarVersion, setAvatarVersion] = useState(0)
  const [openEvaluation, setOpenEvaluation] = useState<number | null>(null)
  const session = token ? readSession(token) : null
  const nav: Nav = {
    openEvaluation,
    showEvaluation: (id) => {
      setOpenEvaluation(id)
      setPageKey('evaluations')
    },
  }

  useEffect(() => {
    const logout = () => setTokenState(null)
    window.addEventListener(LOGOUT_EVENT, logout)
    return () => window.removeEventListener(LOGOUT_EVENT, logout)
  }, [])

  function login(newToken: string) {
    setToken(newToken)
    setTokenState(newToken)
  }

  function logout() {
    setToken(null)
    setTokenState(null)
  }

  if (!session) return <Login onLogin={login} />

  const pages = PAGES.filter((p) => p.visible(session))
  const onAccount = pageKey === ACCOUNT_PAGE
  const page = onAccount ? undefined : pages.find((p) => p.key === pageKey) ?? pages[0]

  return (
    <>
      <header className="topbar">
        <strong>Busola Rozwoju</strong>
        <nav>
          {pages.map((p) => (
            <button key={p.key} className={p === page ? 'tab active' : 'tab'} aria-current={p === page ? 'page' : undefined}
              onClick={() => { setPageKey(p.key); setOpenEvaluation(null) }}>
              {p.label}
            </button>
          ))}
        </nav>
        <span className="user">
          <button className={onAccount ? 'tab active account-link' : 'tab account-link'} aria-current={onAccount ? 'page' : undefined}
            onClick={() => setPageKey(ACCOUNT_PAGE)} title="Moje konto">
            <Avatar path="account/avatar" name={session.name} size={28} version={avatarVersion} />
            {session.name}
          </button>
          <button className="secondary" onClick={logout}>Wyloguj</button>
        </span>
      </header>
      <main className="content">
        {onAccount ? (
          <AccountPage onToken={login} avatarVersion={avatarVersion} onAvatarChange={() => setAvatarVersion((v) => v + 1)} />
        ) : page ? (
          <div key={page.key}>{page.render(session, nav)}</div>
        ) : (
          <p>Brak dostępnych modułów dla Twojej roli.</p>
        )}
      </main>
    </>
  )
}
