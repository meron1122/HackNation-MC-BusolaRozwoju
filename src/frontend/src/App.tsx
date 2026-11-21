import { useEffect, useState, type ReactNode } from 'react'
import { AccountPage } from './Account'
import { LOGOUT_EVENT, can, getToken, isSuperAdmin, readSession, setToken, type Session } from './api'
import { Avatar } from './Avatar'
import { CrudPage, ServiceName, type Column, type Field } from './Crud'
import { DeadlinesPage } from './Deadlines'
import { DevPage } from './Dev'
import { EvaluationsPage } from './Evaluations'
import { Login } from './Login'
import { ProfilePage } from './Profile'
import { UserMenu } from './UserMenu'
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
  { name: 'email', label: 'E-mail (login do konta)', type: 'email', createOnly: true },
  {
    name: 'subjectToFirstEvaluation',
    label: 'Pierwsza ocena w służbie cywilnej',
    type: 'checkbox',
    note: <FirstEvaluationNote />,
  },
]

// Źródła: art. 35 ust. 1 ustawy o służbie cywilnej oraz przypisy 1 i 5 do arkusza pierwszej oceny.
function FirstEvaluationNote() {
  return (
    <>
      <p>
        Zaznacz, jeśli pracownik podlega pierwszej ocenie — system założy jej cykl od daty zatrudnienia
        (rozmowa wstępna do 21 dni, sprawozdanie do 7 mies., ocena w 8.–11. mies.). Bez zaznaczenia od razu
        rusza cykl oceny okresowej (24 mies.).
      </p>
      <p>Pierwszej ocenie podlega:</p>
      <ul>
        <li>osoba podejmująca <strong>po raz pierwszy</strong> pracę w służbie cywilnej (umowa na czas określony 12 miesięcy),</li>
        <li>
          pracownik zatrudniony <strong>na zastępstwo</strong> nieobecnego członka korpusu służby cywilnej — jeśli strony
          ustaliły, że podlega pierwszej ocenie (terminy liczy się wtedy od dnia tego ustalenia),
        </li>
        <li>absolwent <strong>KSAP</strong>, który nie złożył wniosku o mianowanie w służbie cywilnej,</li>
        <li>pracownik zatrudniony <strong>na wyższym stanowisku</strong> w służbie cywilnej.</li>
      </ul>
      <p>Trzy ostatnie grupy nie zdają egzaminu ze służby przygotowawczej (przypis 5 arkusza).</p>
    </>
  )
}

// Hasło tymczasowe API zwraca tylko raz, przy zakładaniu pracownika (= jego konta).
const employeeCreatedNotice = (created: { email: string; temporaryPassword: string; evaluationTitle: string }) => (
  <p>
    Założono konto <strong>{created.email}</strong> z hasłem tymczasowym <code className="password">{created.temporaryPassword}</code>.
    Przekaż je pracownikowi — nie pokażemy go ponownie. Hasło zmienia się w „Moje konto”.
    <br />Założono też cykl: <strong>{created.evaluationTitle}</strong> — terminy są już w zakładce „Terminy”.
  </p>
)

const employeeColumns = (nav: Nav): Column[] => [
  ['Zdjęcie', (e) => (
    <Avatar path={e.hasAvatar ? `employees/${e.id}/avatar` : null} name={`${e.firstName} ${e.lastName}`} size={28} />
  )],
  ['Nazwisko i imię', (e) => <button className="link person-link" onClick={() => nav.showProfile(e.id)}>{e.lastName} {e.firstName}</button>],
  ['E-mail', (e) => e.email ?? '—'],
  ['Urodzony', (e) => e.dateOfBirth],
  ['Zatrudniony', (e) => e.hireDate],
  ['Pierwsza ocena', (e) => (e.subjectToFirstEvaluation ? 'tak' : '—')],
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
type Nav = {
  openEvaluation: number | null
  showEvaluation: (id: number | null) => void
  showProfile: (employeeId: number) => void
}
type Page = { key: string; label: string; visible: (s: Session) => boolean; render: (s: Session, nav: Nav) => ReactNode }

// Dostępne dla każdego zalogowanego, otwierane z nagłówka (avatar + imię), nie z zakładek.
const ACCOUNT_PAGE = 'account'
// Profil innego pracownika: otwierany z listy albo ze struktury w innym profilu.
const PROFILE_PAGE = 'profile'
// Własny profil: z menu pod loginem.
const MY_PROFILE_PAGE = 'my-profile'

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
    render: (s, nav) => (
      <CrudPage title="Pracownicy" path="employees" query={EMPLOYEES_QUERY} fields={employeeFields} columns={employeeColumns(nav)}
        canAdd={can(s, 'add_employee')} canEdit={can(s, 'edit_employee')} canDelete={can(s, 'delete_employee')}
        createdNotice={employeeCreatedNotice} />
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
  {
    key: 'dev',
    label: 'Dev',
    visible: isSuperAdmin,
    render: () => <DevPage />,
  },
]

export default function App() {
  const [token, setTokenState] = useState(getToken)
  const [pageKey, setPageKey] = useState(PAGES[0].key)
  const [avatarVersion, setAvatarVersion] = useState(0)
  const [openEvaluation, setOpenEvaluation] = useState<number | null>(null)
  const [profileId, setProfileId] = useState<number | null>(null)
  const session = token ? readSession(token) : null
  const nav: Nav = {
    openEvaluation,
    showEvaluation: (id) => {
      setOpenEvaluation(id)
      setPageKey('evaluations')
    },
    showProfile: (id) => {
      setProfileId(id)
      setPageKey(PROFILE_PAGE)
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
  const onProfile = pageKey === PROFILE_PAGE && profileId !== null
  const onMyProfile = pageKey === MY_PROFILE_PAGE
  const page = onAccount || onProfile || onMyProfile ? undefined : pages.find((p) => p.key === pageKey) ?? pages[0]

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
        <UserMenu name={session.name} avatarVersion={avatarVersion} active={onAccount || onMyProfile}
          onProfile={() => setPageKey(MY_PROFILE_PAGE)} onAccount={() => setPageKey(ACCOUNT_PAGE)} onLogout={logout} />
      </header>
      <main className="content">
        {onAccount ? (
          <AccountPage onToken={login} avatarVersion={avatarVersion} onAvatarChange={() => setAvatarVersion((v) => v + 1)} />
        ) : onMyProfile ? (
          <ProfilePage employeeId="me" onOpenProfile={nav.showProfile} />
        ) : onProfile ? (
          <ProfilePage key={profileId} employeeId={profileId} onOpenProfile={nav.showProfile} />
        ) : page ? (
          <div key={page.key}>{page.render(session, nav)}</div>
        ) : (
          <p>Brak dostępnych modułów dla Twojej roli.</p>
        )}
      </main>
    </>
  )
}
