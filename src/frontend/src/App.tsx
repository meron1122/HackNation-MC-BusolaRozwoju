import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AccountPage } from './Account'
import { LOGOUT_EVENT, can, getToken, isSuperAdmin, readSession, setToken, type Session } from './api'
import { AssistantWidget } from './assistant/AssistantWidget'
import { Person } from './Person'
import { CrudPage, ServiceName, type Column, type Field, type Row } from './Crud'
import { TeamDashboard, TeamPage } from './Dashboard'
import { DepartmentHead } from './DepartmentHead'
import { DeadlinesPage } from './Deadlines'
import { DevPage } from './Dev'
import { EvaluationsPage } from './Evaluations'
import { fmtDate } from './evaluation/types'
import { HrPanel } from './HrPanel'
import { MyEvaluationPage } from './MyEvaluation'
import { EmptyState } from './EmptyState'
import { Login } from './Login'
import { LoginHandoff, type LoginPhase } from './LoginHandoff'
import { Logo } from './Logo'
import { ProfilePage, type ProfileTab } from './Profile'
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
    name: 'positionId',
    label: 'Stanowisko',
    optional: true,
    note: 'Ze słownika służby wydziału; trafia do arkusza oceny.',
    options: { path: 'positions', label: (p) => `${p.name} (${p.serviceName})` },
  },
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
        (rozmowa wstępna do 21 dni, sprawozdanie w terminie wyznaczonym przez przełożonego — domyślnie 8.–10. mies.,
        ocena w 8.–11. mies.). Bez zaznaczenia od razu
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

const absenceFields: Field[] = [
  {
    name: 'employeeId',
    label: 'Pracownik',
    options: { path: `employees?${EMPLOYEES_QUERY}`, label: (e) => `${e.lastName} ${e.firstName}` },
  },
  { name: 'startDate', label: 'Od', type: 'date' },
  { name: 'endDate', label: 'Do', type: 'date', optional: true, note: 'Puste — nieobecność trwa.' },
  { name: 'reasonId', label: 'Powód', options: { path: 'absence-reasons', label: (r) => r.name } },
]

const ABSENCE_KINDS: Record<string, string> = {
  Justified: 'usprawiedliwiona',
  OfficialDuty: 'obowiązki poza miejscem pracy',
  Unjustified: 'nieusprawiedliwiona',
}

/** Dni od–do włącznie; dla trwającej — do dziś. */
const absenceDays = (a: Row) =>
  Math.max(0, Math.floor(((a.endDate ? Date.parse(a.endDate) : Date.now()) - Date.parse(a.startDate)) / 86_400_000) + 1)

const absenceColumns = (nav: Nav): Column[] => [
  ['Pracownik', (a) => <button className="link person-link" onClick={() => nav.showProfile(a.employeeId)}>{a.employeeName}</button>],
  ['Od', (a) => fmtDate(a.startDate)],
  ['Do', (a) => (a.endDate ? fmtDate(a.endDate) : <strong>trwa</strong>)],
  ['Dni', (a) => absenceDays(a)],
  ['Powód', (a) => a.reasonName],
  ['Rodzaj', (a) => <span className="muted small">{ABSENCE_KINDS[a.kind] ?? a.kind}</span>],
]

const employeeColumns = (nav: Nav): Column[] => [
  ['Pracownik', (e) => (
    <Person id={e.id} name={`${e.firstName} ${e.lastName}`} detail={e.positionName} hasAvatar={e.hasAvatar}
      onOpen={() => nav.showProfile(e.id)} />
  )],
  ['E-mail', (e) => e.email ?? '—'],
  ['Urodzony', (e) => fmtDate(e.dateOfBirth)],
  ['Zatrudniony', (e) => fmtDate(e.hireDate)],
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
const departmentColumns = (canEdit: boolean): Column[] => [
  ['Nazwa', (d) => d.name],
  ['Lokalizacja', (d) => d.locationName],
  // key: po zapisie wydziału lista się przeładowuje i wiersz bierze nowego kierującego z API.
  ['Kierujący komórką', (d) => <DepartmentHead key={`${d.id}-${d.headId ?? ''}`} department={d} canEdit={canEdit} />],
]

// Słownik stanowisk służby (HR wybiera je w profilu). Kadry dodają w swojej służbie; SuperAdmin musi ją wskazać.
const positionFields: Field[] = [{ name: 'name', label: 'Nazwa stanowiska' }]
const positionFieldsForAdmin: Field[] = [
  { name: 'name', label: 'Nazwa stanowiska' },
  { name: 'serviceId', label: 'Służba', createOnly: true, options: { path: 'services', label: (s) => s.name } },
]
const positionColumns = (allServices: boolean): Column[] => [
  ['Nazwa', (p) => p.name],
  ...(allServices ? [['Służba', (p: Row) => p.serviceName] as Column] : []),
  ['Pracowników', (p) => p.employeesCount],
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

// Profil innego pracownika: otwierany z listy albo ze struktury w innym profilu.
const PROFILE_PAGE = 'profile'
// Własny profil (z kontem: zdjęcie, hasło, 2FA): z menu pod loginem.
const MY_PROFILE_PAGE = 'my-profile'

const isSupervisor = (s: Session) => isSuperAdmin(s) || s.roles.includes('Supervisor')

const PAGES: Page[] = [
  {
    key: 'dashboard',
    label: 'Pulpit',
    visible: (s) => isSupervisor(s) && can(s, 'read_evaluations'),
    render: (s, nav) => <TeamDashboard userName={s.name} onOpenEvaluation={nav.showEvaluation} onOpenProfile={nav.showProfile} />,
  },
  {
    key: 'team',
    label: 'Mój zespół',
    visible: (s) => isSupervisor(s) && can(s, 'read_evaluations'),
    render: (_, nav) => <TeamPage onOpenEvaluation={nav.showEvaluation} onOpenProfile={nav.showProfile} />,
  },
  {
    key: 'hr',
    label: 'Panel HR',
    visible: (s) => can(s, 'remind_evaluations'),
    render: (s, nav) => <HrPanel canRemind={can(s, 'remind_evaluations')} onOpenEvaluation={nav.showEvaluation} />,
  },
  {
    // Strona startowa ocenianego: jego zadania w ocenie (rola Employee = konto powiązane z pracownikiem).
    key: 'my',
    label: 'Moja ocena',
    visible: (s) => s.roles.includes('Employee') && can(s, 'read_evaluations'),
    render: (_, nav) => <MyEvaluationPage onOpen={nav.showEvaluation} />,
  },
  {
    // Terminy etapów to zadania prowadzących ocenę (przełożony, HR), nie ocenianego.
    key: 'deadlines',
    label: 'Terminy',
    visible: (s) => can(s, 'edit_evaluation'),
    render: (_, nav) => <DeadlinesPage onOpen={(id) => nav.showEvaluation(id)} />,
  },
  {
    key: 'evaluations',
    label: 'Oceny',
    visible: (s) => can(s, 'read_evaluations'),
    render: (s, nav) => <EvaluationsPage canAdd={can(s, 'add_evaluation')} openId={nav.openEvaluation} onOpen={nav.showEvaluation} />,
  },
  {
    // Kartoteka dla kadr; przełożonemu wystarczy „Mój zespół”, pracownikowi własny profil.
    key: 'employees',
    label: 'Pracownicy',
    visible: (s) => can(s, 'add_employee') || can(s, 'edit_employee'),
    render: (s, nav) => (
      <CrudPage title="Pracownicy" path="employees" query={EMPLOYEES_QUERY} fields={employeeFields} columns={employeeColumns(nav)}
        canAdd={can(s, 'add_employee')} canEdit={can(s, 'edit_employee')} canDelete={can(s, 'delete_employee')}
        createdNotice={employeeCreatedNotice} />
    ),
  },
  {
    // Nieobecności wszystkich pracowników w zakresie kadr; własne każdy widzi w profilu.
    key: 'absences',
    label: 'Nieobecności',
    visible: (s) => can(s, 'edit_employee'),
    render: (s, nav) => (
      <CrudPage title="Nieobecności" path="absences" fields={absenceFields} columns={absenceColumns(nav)}
        canAdd={can(s, 'edit_employee')} canEdit={can(s, 'edit_employee')} canDelete={can(s, 'edit_employee')} />
    ),
  },
  {
    key: 'departments',
    label: 'Wydziały',
    visible: (s) => can(s, 'read_departments'),
    render: (s) => (
      <CrudPage title="Wydziały" path="departments" fields={departmentFields} columns={departmentColumns(can(s, 'edit_department'))}
        canAdd={can(s, 'add_department')} canEdit={can(s, 'edit_department')} canDelete={can(s, 'delete_department')} />
    ),
  },
  {
    // Zmiana nazwy obejmuje wszystkich na tym stanowisku; usunąć można tylko nieużywane (inaczej 409).
    key: 'positions',
    label: 'Stanowiska',
    visible: (s) => can(s, 'manage_positions') || can(s, 'read_departments'),
    render: (s) => (
      <CrudPage title="Stanowiska" path="positions" fields={isSuperAdmin(s) ? positionFieldsForAdmin : positionFields}
        columns={positionColumns(isSuperAdmin(s))}
        canAdd={can(s, 'manage_positions')} canEdit={can(s, 'manage_positions')} canDelete={can(s, 'manage_positions')} />
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

type View = { pageKey: string; openEvaluation: number | null; profileId: number | null; evaluationReturn: string | null; myProfileTab: ProfileTab }
const START_VIEW: View = { pageKey: PAGES[0].key, openEvaluation: null, profileId: null, evaluationReturn: null, myProfileTab: 'personal' }

export default function App() {
  const [token, setTokenState] = useState(getToken)
  const [loginPhase, setLoginPhase] = useState<LoginPhase>('idle')
  const [wordmark, setWordmark] = useState<DOMRect | null>(null)
  const serviceMain = useRef<HTMLElement>(null)
  const [avatarVersion, setAvatarVersion] = useState(0)
  // Stan nawigacji trzymany w historii przeglądarki, żeby „Wstecz”/„Dalej” działały w obrębie aplikacji.
  const [view, setView] = useState<View>(() => (history.state?.pageKey ? history.state : START_VIEW))
  const { pageKey, openEvaluation, profileId, evaluationReturn, myProfileTab } = view
  const go = (next: Partial<View>) => {
    const v = { ...view, ...next }
    history.pushState(v, '')
    setView(v)
  }
  const session = token ? readSession(token) : null
  const nav: Nav = {
    openEvaluation,
    showEvaluation: (id) => {
      if (id === null && evaluationReturn) {
        go({ openEvaluation: null, pageKey: evaluationReturn, evaluationReturn: null })
        return
      }
      go({
        openEvaluation: id,
        pageKey: 'evaluations',
        evaluationReturn: id !== null && pageKey !== 'evaluations' ? pageKey : evaluationReturn,
      })
    },
    showProfile: (id) => go({ profileId: id, pageKey: PROFILE_PAGE }),
  }

  useEffect(() => {
    if (!history.state?.pageKey) history.replaceState(START_VIEW, '')
    const pop = (e: PopStateEvent) => setView(e.state?.pageKey ? e.state : START_VIEW)
    window.addEventListener('popstate', pop)
    return () => window.removeEventListener('popstate', pop)
  }, [])

  useEffect(() => {
    const logout = () => setTokenState(null)
    window.addEventListener(LOGOUT_EVENT, logout)
    return () => window.removeEventListener(LOGOUT_EVENT, logout)
  }, [])

  useEffect(() => {
    if (loginPhase !== 'revealing') return
    const timer = window.setTimeout(() => {
      setLoginPhase('idle')
      setWordmark(null)
      serviceMain.current?.focus({ preventScroll: true })
    }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 520)
    return () => window.clearTimeout(timer)
  }, [loginPhase])

  function login(newToken: string) {
    setToken(newToken)
    setTokenState(newToken)
  }

  function openMyProfile(tab: ProfileTab) {
    go({ myProfileTab: tab, pageKey: MY_PROFILE_PAGE })
  }

  function logout() {
    setToken(null)
    setTokenState(null)
    history.replaceState(START_VIEW, '')
    setView(START_VIEW)
  }

  const handoff = <LoginHandoff phase={loginPhase} wordmark={wordmark} />

  if (!session) {
    return (
      <>
        {handoff}
        <Login
          onChecking={(checking, origin) => {
            setWordmark(origin ?? null)
            setLoginPhase(checking ? 'checking' : 'idle')
          }}
          onLogin={(newToken) => {
            setLoginPhase('revealing')
            login(newToken)
          }}
        />
      </>
    )
  }

  const pages = PAGES.filter((p) => p.visible(session))
  const onProfile = pageKey === PROFILE_PAGE && profileId !== null
  const onMyProfile = pageKey === MY_PROFILE_PAGE
  const page = onProfile || onMyProfile ? undefined : pages.find((p) => p.key === pageKey) ?? pages[0]

  return (
    <>
      {handoff}
      <header className="topbar">
        <Logo width={128} />
        <nav>
          {pages.map((p) => (
            <button key={p.key} className={p === page ? 'tab active' : 'tab'} aria-current={p === page ? 'page' : undefined}
              onClick={() => go({ pageKey: p.key, openEvaluation: null, evaluationReturn: null })}>
              {p.label}
            </button>
          ))}
        </nav>
        <UserMenu name={session.name} avatarVersion={avatarVersion} active={onMyProfile}
          onProfile={() => openMyProfile('personal')} onStructure={() => openMyProfile('structure')} onLogout={logout} />
      </header>
      <main className="content" ref={serviceMain} tabIndex={-1}>
        {onMyProfile ? (
          <ProfilePage key={`me-${myProfileTab}`} employeeId="me" initialTab={myProfileTab} avatarVersion={avatarVersion}
            onOpenProfile={nav.showProfile} onOpenEvaluation={nav.showEvaluation}
            account={<AccountPage onToken={login} avatarVersion={avatarVersion} onAvatarChange={() => setAvatarVersion((v) => v + 1)} showTitle={false} />} />
        ) : onProfile ? (
          <ProfilePage key={profileId} employeeId={profileId} onOpenProfile={nav.showProfile} onOpenEvaluation={nav.showEvaluation} />
        ) : page ? (
          <div key={page.key}>{page.render(session, nav)}</div>
        ) : (
          <EmptyState title="Nie masz jeszcze dostępu do żadnego modułu">Poproś administratora o nadanie roli, a moduły pojawią się w menu.</EmptyState>
        )}
      </main>
      <AssistantWidget screen={{
        page: onMyProfile ? MY_PROFILE_PAGE : onProfile ? PROFILE_PAGE : page?.key ?? '',
        evaluationId: page?.key === 'evaluations' ? openEvaluation : null,
        employeeId: onProfile ? profileId : null,
      }} />
    </>
  )
}
