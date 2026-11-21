import { useEffect, useState, type ReactNode } from 'react'
import { LOGOUT_EVENT, can, getToken, isSuperAdmin, readSession, setToken, type Session } from './api'
import { CrudPage, ServiceName, type Column, type Field } from './Crud'
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

type Page = { key: string; label: string; visible: (s: Session) => boolean; render: (s: Session) => ReactNode }

const PAGES: Page[] = [
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
  const session = token ? readSession(token) : null

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
  const page = pages.find((p) => p.key === pageKey) ?? pages[0]

  return (
    <>
      <header className="topbar">
        <strong>Busola Rozwoju</strong>
        <nav>
          {pages.map((p) => (
            <button key={p.key} className={p === page ? 'tab active' : 'tab'} aria-current={p === page ? 'page' : undefined}
              onClick={() => setPageKey(p.key)}>
              {p.label}
            </button>
          ))}
        </nav>
        <span className="user">
          {session.name}
          <button className="secondary" onClick={logout}>Wyloguj</button>
        </span>
      </header>
      <main className="content">
        {page ? <div key={page.key}>{page.render(session)}</div> : <p>Brak dostępnych modułów dla Twojej roli.</p>}
      </main>
    </>
  )
}
