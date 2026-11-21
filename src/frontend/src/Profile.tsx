import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { api } from './api'
import { Avatar } from './Avatar'
import { OrgChart } from './Org'

type Values = Record<string, string | number | null>
type Profile = {
  employee: {
    id: number; firstName: string; lastName: string; hireDate: string; departmentName: string; locationName: string
    serviceName: string; hasAvatar: boolean; email: string | null
  }
  personal: Values
  contact: Values
  job: Values
  emergencyContacts: Values[]
  dependents: Values[]
  qualifications: { workExperience: Values[]; education: Values[]; skills: Values[]; languages: Values[] }
  canEdit: boolean
  isOwn: boolean
}

type FieldDef = {
  name: string
  label: string
  type?: 'text' | 'date' | 'email' | 'number' | 'select'
  options?: string[] | [string, string][]
  required?: boolean
  /** Tylko kadry (edit_employee), pracownik u siebie widzi, ale nie zmienia. */
  hrOnly?: boolean
}

const GENDERS: [string, string][] = [['Male', 'Mężczyzna'], ['Female', 'Kobieta']]
const MARITAL: [string, string][] = [['Single', 'Kawaler / panna'], ['Married', 'Żonaty / zamężna'], ['Divorced', 'Rozwiedziony / rozwiedziona'], ['Widowed', 'Wdowiec / wdowa'], ['Other', 'Inny']]
const EMPLOYMENT = ['Służba stała', 'Służba przygotowawcza', 'Mianowanie', 'Umowa o pracę na czas nieokreślony', 'Umowa o pracę na czas określony', 'Umowa zlecenie']
const EDUCATION = ['Średnie', 'Licencjat', 'Inżynier', 'Magister', 'Doktor']
const LANGUAGE_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'Ojczysty']
const RELATIONSHIPS = ['Małżonek', 'Partner', 'Rodzic', 'Dziecko', 'Rodzeństwo', 'Inna']

const PERSONAL: FieldDef[] = [
  { name: 'firstName', label: 'Imię', required: true, hrOnly: true },
  { name: 'middleName', label: 'Drugie imię' },
  { name: 'lastName', label: 'Nazwisko', required: true, hrOnly: true },
  { name: 'employeeNumber', label: 'Nr ewidencyjny', hrOnly: true },
  { name: 'otherId', label: 'Inny identyfikator' },
  { name: 'driverLicenseNumber', label: 'Nr prawa jazdy' },
  { name: 'driverLicenseExpiry', label: 'Ważność prawa jazdy', type: 'date' },
  { name: 'nationality', label: 'Obywatelstwo' },
  { name: 'maritalStatus', label: 'Stan cywilny', type: 'select', options: MARITAL },
  { name: 'dateOfBirth', label: 'Data urodzenia', type: 'date', required: true, hrOnly: true },
  { name: 'gender', label: 'Płeć', type: 'select', options: GENDERS },
]
const CONTACT: FieldDef[] = [
  { name: 'street1', label: 'Ulica i numer' },
  { name: 'street2', label: 'Adres, cd.' },
  { name: 'city', label: 'Miejscowość' },
  { name: 'province', label: 'Województwo' },
  { name: 'postalCode', label: 'Kod pocztowy' },
  { name: 'country', label: 'Kraj' },
  { name: 'phoneHome', label: 'Telefon domowy' },
  { name: 'phoneMobile', label: 'Telefon komórkowy' },
  { name: 'phoneWork', label: 'Telefon służbowy' },
  { name: 'workEmail', label: 'E-mail służbowy', type: 'email' },
  { name: 'otherEmail', label: 'E-mail prywatny', type: 'email' },
]
const JOB: FieldDef[] = [
  { name: 'jobTitle', label: 'Stanowisko' },
  { name: 'employmentType', label: 'Forma zatrudnienia', type: 'select', options: EMPLOYMENT },
  { name: 'contractStart', label: 'Początek umowy / służby', type: 'date' },
  { name: 'contractEnd', label: 'Koniec umowy', type: 'date' },
]
const EMERGENCY: FieldDef[] = [
  { name: 'name', label: 'Imię i nazwisko', required: true },
  { name: 'relationship', label: 'Pokrewieństwo', type: 'select', options: RELATIONSHIPS },
  { name: 'phoneHome', label: 'Telefon domowy' },
  { name: 'phoneMobile', label: 'Telefon komórkowy' },
  { name: 'phoneWork', label: 'Telefon służbowy' },
]
const DEPENDENTS: FieldDef[] = [
  { name: 'name', label: 'Imię i nazwisko', required: true },
  { name: 'relationship', label: 'Pokrewieństwo', type: 'select', options: RELATIONSHIPS },
  { name: 'dateOfBirth', label: 'Data urodzenia', type: 'date' },
]
const EXPERIENCE: FieldDef[] = [
  { name: 'company', label: 'Pracodawca', required: true },
  { name: 'jobTitle', label: 'Stanowisko' },
  { name: 'from', label: 'Od', type: 'date' },
  { name: 'to', label: 'Do', type: 'date' },
  { name: 'comment', label: 'Uwagi' },
]
const EDUCATION_FIELDS: FieldDef[] = [
  { name: 'level', label: 'Poziom', type: 'select', options: EDUCATION, required: true },
  { name: 'institution', label: 'Uczelnia / szkoła' },
  { name: 'specialization', label: 'Kierunek' },
  { name: 'year', label: 'Rok ukończenia', type: 'number' },
]
const SKILLS: FieldDef[] = [
  { name: 'name', label: 'Umiejętność', required: true },
  { name: 'yearsOfExperience', label: 'Lata doświadczenia', type: 'number' },
  { name: 'comment', label: 'Uwagi' },
]
const LANGUAGES: FieldDef[] = [
  { name: 'language', label: 'Język', required: true },
  { name: 'level', label: 'Poziom', type: 'select', options: LANGUAGE_LEVELS },
]

const TABS = [
  ['personal', 'Dane osobowe'],
  ['contact', 'Kontakt'],
  ['emergency', 'Kontakty alarmowe'],
  ['dependents', 'Członkowie rodziny'],
  ['job', 'Zatrudnienie'],
  ['structure', 'Struktura'],
  ['evaluations', 'Oceny'],
  ['qualifications', 'Kwalifikacje'],
  ['account', 'Konto'],
] as const
export type ProfileTab = (typeof TABS)[number][0]

/** Profil pracownika: lewa kolumna ze zdjęciem i zakładkami, po prawej sekcja (układ jak w OrangeHRM). */
export function ProfilePage({ employeeId, onOpenProfile, onOpenEvaluation, initialTab = 'personal', account, avatarVersion = 0 }: {
  employeeId: number | 'me'
  onOpenProfile: (id: number) => void
  onOpenEvaluation: (id: number) => void
  initialTab?: ProfileTab
  /** Ustawienia konta (zdjęcie, hasło, 2FA): zakładka Konto we własnym profilu. */
  account?: ReactNode
  avatarVersion?: number
}) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<ProfileTab>(initialTab)

  const load = useCallback(
    () => api<Profile>(employeeId === 'me' ? 'employees/me/profile' : `employees/${employeeId}/profile`)
      .then((p) => { setProfile(p); setError('') }, (e: Error) => setError(e.message)),
    [employeeId],
  )
  useEffect(() => {
    load()
  }, [load])

  if (!profile) {
    // Konto bez pracownika (np. SuperAdmin) nie ma profilu, ale ustawienia konta muszą być dostępne.
    if (error && account) {
      return (
        <section>
          <div className="toolbar"><h2>Moje konto</h2></div>
          <p className="muted">Konto nie jest powiązane z pracownikiem, więc nie ma profilu. Poniżej ustawienia konta.</p>
          {account}
        </section>
      )
    }
    return error ? <p role="alert" className="error">{error}</p> : <p>Ładowanie…</p>
  }

  const e = profile.employee
  const name = `${e.firstName} ${e.lastName}`
  const canSelf = profile.canEdit || profile.isOwn
  const base = `employees/${e.id}/profile`
  const save = (section: string, body: unknown) => api(`${base}/${section}`, 'PUT', body).then(load)

  return (
    <div className="profile">
      <aside className="profile-side card">
        <Avatar path={e.hasAvatar ? `employees/${e.id}/avatar` : null} name={name} size={112} version={avatarVersion} />
        <h2>{name}</h2>
        {profile.job.jobTitle && <p className="muted">{profile.job.jobTitle}</p>}
        <nav aria-label="Sekcje profilu">
          {TABS.filter(([key]) => key !== 'account' || (account && profile.isOwn)).map(([key, label]) => (
            <button key={key} className={tab === key ? 'profile-tab active' : 'profile-tab'} aria-current={tab === key ? 'page' : undefined}
              onClick={() => setTab(key)}>
              {label}
            </button>
          ))}
        </nav>
      </aside>

      <div className="profile-main">
        {tab === 'personal' && (
          <SectionForm key={`p${e.id}`} title="Dane osobowe" fields={PERSONAL} values={profile.personal}
            editable={canSelf} hr={profile.canEdit} onSave={(v) => save('personal', v)} />
        )}
        {tab === 'contact' && (
          <SectionForm key={`c${e.id}`} title="Dane kontaktowe" fields={CONTACT} values={profile.contact}
            editable={canSelf} hr={profile.canEdit} onSave={(v) => save('contact', v)} />
        )}
        {tab === 'emergency' && (
          <ListSection title="Kontakty alarmowe" fields={EMERGENCY} items={profile.emergencyContacts}
            editable={canSelf} onSave={(items) => save('emergency-contacts', items)} />
        )}
        {tab === 'dependents' && (
          <ListSection title="Członkowie rodziny" fields={DEPENDENTS} items={profile.dependents}
            editable={canSelf} onSave={(items) => save('dependents', items)} />
        )}
        {tab === 'job' && (
          <>
            <section className="card profile-section">
              <h3>Przydział</h3>
              <dl className="readonly-grid">
                <div><dt>Data zatrudnienia</dt><dd>{e.hireDate}</dd></div>
                <div><dt>Służba</dt><dd>{e.serviceName}</dd></div>
                <div><dt>Lokalizacja</dt><dd>{e.locationName}</dd></div>
                <div><dt>Wydział</dt><dd>{e.departmentName}</dd></div>
                <div><dt>Konto</dt><dd>{e.email ?? '—'}</dd></div>
              </dl>
            </section>
            <SectionForm key={`j${e.id}`} title="Zatrudnienie" fields={JOB} values={profile.job}
              editable={profile.canEdit} hr={profile.canEdit} onSave={(v) => save('job', v)} />
          </>
        )}
        {tab === 'account' && account && profile.isOwn && account}
        {tab === 'evaluations' && (
          <section className="card profile-section">
            <h3>Historia ocen</h3>
            <EvaluationHistory employeeId={e.id} onOpen={onOpenEvaluation} />
          </section>
        )}
        {tab === 'structure' && (
          <section className="card profile-section">
            <h3>Struktura</h3>
            <OrgChart key={e.id} startId={e.id} onOpenProfile={onOpenProfile} />
          </section>
        )}
        {tab === 'qualifications' && (
          <>
            {([
              ['Doświadczenie zawodowe', EXPERIENCE, 'workExperience'],
              ['Wykształcenie', EDUCATION_FIELDS, 'education'],
              ['Umiejętności', SKILLS, 'skills'],
              ['Języki', LANGUAGES, 'languages'],
            ] as const).map(([title, fields, key]) => (
              <ListSection key={key} title={title} fields={fields} items={profile.qualifications[key]} editable={canSelf}
                onSave={(items) => save('qualifications', { ...profile.qualifications, [key]: items })} />
            ))}
          </>
        )}
      </div>
    </div>
  )
}

type EvaluationRow = {
  id: number; templateTitle: string; statusLabel: string; isFinal: boolean; startDate: string
  nextStageTitle: string | null; nextDueTo: string | null
}

/** Oceny pracownika (najnowsze pierwsze). API ocen pilnuje zakresu: przełożony widzi oceny swoich podwładnych. */
function EvaluationHistory({ employeeId, onOpen }: { employeeId: number; onOpen: (id: number) => void }) {
  const [rows, setRows] = useState<EvaluationRow[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api<EvaluationRow[]>(`evaluations?employeeId=${employeeId}`).then(setRows, (e: Error) => setError(e.message))
  }, [employeeId])

  if (error) return <p role="alert" className="error">{error}</p>
  if (!rows) return <p>Ładowanie…</p>
  if (!rows.length) return <p className="muted">Brak ocen.</p>
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr><th>Arkusz</th><th>Status</th><th>Początek</th><th>Najbliższy etap</th><th>Termin</th><th><span className="sr-only">Akcje</span></th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.templateTitle}</td>
              <td>{r.isFinal ? <strong>{r.statusLabel}</strong> : r.statusLabel}</td>
              <td>{r.startDate}</td>
              <td>{r.nextStageTitle ?? '—'}</td>
              <td>{r.nextDueTo ?? '—'}</td>
              <td className="actions"><button className="link" onClick={() => onOpen(r.id)}>Otwórz</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Pola z formularza: puste → null, liczby jako liczby. */
function readForm(form: HTMLFormElement, fields: readonly FieldDef[]): Values {
  const data = new FormData(form)
  return Object.fromEntries(fields.map((f) => {
    const raw = String(data.get(f.name) ?? '').trim()
    return [f.name, raw === '' ? null : f.type === 'number' ? Number(raw) : raw]
  }))
}

function Inputs({ fields, values, disabled, hr }: { fields: readonly FieldDef[]; values: Values; disabled: boolean; hr: boolean }) {
  return (
    <div className="field-grid">
      {fields.map((f) => {
        const value = values[f.name] ?? ''
        const off = disabled || (f.hrOnly && !hr)
        return (
          <label key={f.name}>
            <span>{f.label}{f.required && <span aria-hidden="true"> *</span>}</span>
            {f.type === 'select' ? (
              <select name={f.name} defaultValue={String(value)} disabled={off} required={f.required}>
                <option value="">— wybierz —</option>
                {f.options!.map((o) => {
                  const [v, l] = Array.isArray(o) ? o : [o, o]
                  return <option key={v} value={v}>{l}</option>
                })}
              </select>
            ) : (
              <input name={f.name} type={f.type ?? 'text'} defaultValue={String(value)} disabled={off} required={f.required} />
            )}
            {/* Wyłączone pole nie trafia do FormData; API i tak go nie nadpisze, ale wartość musi przejść walidację. */}
            {off && <input type="hidden" name={f.name} value={String(value)} />}
          </label>
        )
      })}
    </div>
  )
}

function SectionForm({ title, fields, values, editable, hr, onSave }: {
  title: string
  fields: FieldDef[]
  values: Values
  editable: boolean
  hr: boolean
  onSave: (values: Values) => Promise<unknown>
}) {
  const [status, setStatus] = useState('')

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setStatus('Zapisywanie…')
    try {
      await onSave(readForm(e.currentTarget, fields))
      setStatus('Zapisano.')
    } catch (err) {
      setStatus((err as Error).message)
    }
  }

  return (
    <form onSubmit={submit} className="card profile-section">
      <h3>{title}</h3>
      <Inputs fields={fields} values={values} disabled={!editable} hr={hr} />
      {editable && (
        <div className="section-footer">
          <span role="status" className="muted">{status}</span>
          {fields.some((f) => f.required) && <span className="muted small">* wymagane</span>}
          <button type="submit">Zapisz</button>
        </div>
      )}
    </form>
  )
}

/** Lista rekordów jak w OrangeHRM: „+ Dodaj”, tabela z liczbą rekordów, edycja i usuwanie w wierszu; każda zmiana zapisuje listę. */
function ListSection({ title, fields, items, editable, onSave }: {
  title: string
  fields: readonly FieldDef[]
  items: Values[]
  editable: boolean
  onSave: (items: Values[]) => Promise<unknown>
}) {
  const [editing, setEditing] = useState<number | 'new' | null>(null)
  const [error, setError] = useState('')

  async function persist(next: Values[]) {
    try {
      await onSave(next)
      setEditing(null)
      setError('')
    } catch (err) {
      setError((err as Error).message)
    }
  }

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const row = readForm(e.currentTarget, fields)
    persist(editing === 'new' ? [...items, row] : items.map((item, i) => (i === editing ? row : item)))
  }

  const label = (f: FieldDef, value: Values[string]) => {
    if (value == null || value === '') return '—'
    const option = f.options?.find((o) => (Array.isArray(o) ? o[0] : o) === value)
    return Array.isArray(option) ? option[1] : String(value)
  }

  return (
    <section className="card profile-section">
      <div className="toolbar">
        <h3>{title}</h3>
        {editable && editing === null && <button className="secondary" onClick={() => setEditing('new')}>+ Dodaj</button>}
      </div>
      {editing !== null && (
        <form onSubmit={submit} className="list-editor" key={String(editing)}>
          <Inputs fields={fields} values={editing === 'new' ? {} : items[editing]} disabled={false} hr />
          <div className="buttons">
            <button type="submit">Zapisz</button>
            <button type="button" className="secondary" onClick={() => setEditing(null)}>Anuluj</button>
          </div>
        </form>
      )}
      {error && <p role="alert" className="error">{error}</p>}
      <p className="muted small">{items.length ? `Rekordy: ${items.length}` : 'Brak rekordów.'}</p>
      {items.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {fields.map((f) => <th key={f.name}>{f.label}</th>)}
                {editable && <th><span className="sr-only">Akcje</span></th>}
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={i}>
                  {fields.map((f) => <td key={f.name}>{label(f, item[f.name])}</td>)}
                  {editable && (
                    <td className="actions">
                      <button className="link" onClick={() => setEditing(i)}>Edytuj</button>
                      <button className="link danger" onClick={() => confirm('Usunąć ten rekord?') && persist(items.filter((_, j) => j !== i))}>
                        Usuń
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
