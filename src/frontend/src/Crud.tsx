import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { api, ApiError, fieldKey } from './api'
import { ConfirmButton } from './ConfirmButton'
import { EmptyState } from './EmptyState'
import { DateInput } from './DateInput'
import { Field as FormField } from './Field'
import { ListSkeleton } from './dash-parts'
import { Loadable } from './v2/motion'
import './ml-motion.css'

// Wiersze to DTO z API, kształt zależy od strony.
export type Row = { id: number } & Record<string, any>

export type Field = {
  name: string
  label: string
  type?: 'text' | 'date' | 'url' | 'email' | 'checkbox'
  optional?: boolean
  /** Podpowiedź pod etykietą (np. kto spełnia warunek, format). */
  note?: ReactNode
  /** Tylko przy dodawaniu (np. e-mail, z którym powstaje konto); przy edycji pole jest ukryte i nie jest wysyłane. */
  createOnly?: boolean
  /** Pole wyboru z listy z API, wartość to id. */
  options?: { path: string; label: (row: Row) => string }
}

export type Column = [label: string, value: (row: Row) => ReactNode]

export function ServiceName({ name, logoUrl }: { name: string; logoUrl?: string | null }) {
  return (
    <span className="service">
      {logoUrl && <img src={logoUrl} alt="" width={28} height={28} loading="lazy" referrerPolicy="no-referrer" />}
      {name}
    </span>
  )
}

type Props = {
  title: string
  path: string
  /** Doklejane tylko do listy, np. `pageSize=200`. */
  query?: string
  columns: Column[]
  /** Stała tablica (poza komponentem), bo od niej zależy ładowanie list wyboru. */
  fields: Field[]
  canAdd: boolean
  canEdit: boolean
  canDelete: boolean
  /** Komunikat po dodaniu, z odpowiedzi API (np. hasło tymczasowe nowego konta). */
  createdNotice?: (created: any) => ReactNode
}

export function CrudPage({ title, path, query, columns, fields, canAdd, canEdit, canDelete, createdNotice }: Props) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<Row | 'new' | null>(null)
  const [notice, setNotice] = useState<ReactNode>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    return api<Row[]>(query ? `${path}?${query}` : path)
      .then((r) => { setRows(r); setError('') }, (e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [path, query])
  useEffect(() => {
    load()
  }, [load])

  async function save(body: Record<string, unknown>) {
    if (editing === 'new') {
      const created = await api(path, 'POST', body)
      setNotice(createdNotice?.(created) ?? null)
    } else if (editing) {
      await api(`${path}/${editing.id}`, 'PUT', body)
    }
    setEditing(null)
    setError('')
    load()
  }

  async function remove(row: Row) {
    try {
      await api(`${path}/${row.id}`, 'DELETE')
      setError('')
      load()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <section>
      <div className="toolbar">
        <h2>{title}</h2>
        {canAdd && editing === null && <button onClick={() => { setEditing('new'); setNotice(null) }}>Dodaj wpis</button>}
      </div>
      {rows && error && <p role="alert" className="error">{error}</p>}
      {notice && (
        <div className="created-notice" role="status">
          {notice}
          <button className="link" onClick={() => setNotice(null)}>Zamknij</button>
        </div>
      )}
      {editing !== null && (
        <EntityForm
          key={editing === 'new' ? 'new' : editing.id}
          fields={fields}
          row={editing === 'new' ? null : editing}
          onSave={save}
          onCancel={() => setEditing(null)}
        />
      )}
      <Loadable loading={loading && !rows} error={rows ? '' : error} onRetry={load} skeleton={<ListSkeleton rows={6} card={false} />}
        empty={rows?.length === 0} emptyNode={
        <EmptyState title="Ta lista jest jeszcze pusta"
          action={canAdd && editing === null && <button onClick={() => { setEditing('new'); setNotice(null) }}>Dodaj pierwszy wpis</button>}>
          {canAdd ? 'Dodaj pierwszy wpis, a pojawi się w tej tabeli.' : 'Gdy ktoś doda pierwszy wpis, pojawi się w tej tabeli.'}
        </EmptyState>}>
      {() => rows && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {columns.map(([label]) => <th key={label}>{label}</th>)}
                {(canEdit || canDelete) && <th><span className="sr-only">Akcje</span></th>}
              </tr>
            </thead>
            <tbody className="ml-stagger">
              {rows.map((row) => (
                <tr key={row.id}>
                  {columns.map(([label, value]) => <td key={label}>{value(row)}</td>)}
                  {(canEdit || canDelete) && (
                    <td className="actions">
                      {canEdit && <button className="link" onClick={() => setEditing(row)}>Edytuj</button>}
                      {canDelete && <ConfirmButton compact question="Usunąć ten wpis? Tego nie da się cofnąć." confirmLabel="Usuń" onConfirm={() => remove(row)}>Usuń</ConfirmButton>}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </Loadable>
    </section>
  )
}

function EntityForm({ fields, row, onSave, onCancel }: {
  fields: Field[]
  row: Row | null
  onSave: (body: Record<string, unknown>) => Promise<void>
  onCancel: () => void
}) {
  const [options, setOptions] = useState<Record<string, Row[]>>({})
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const visibleFields = row ? fields.filter((f) => !f.createOnly) : fields

  useEffect(() => {
    for (const f of fields) {
      if (!f.options) continue
      api<Row[]>(f.options.path).then(
        (list) => setOptions((o) => ({ ...o, [f.name]: list })),
        () => setOptions((o) => ({ ...o, [f.name]: [] })),
      )
    }
  }, [fields])

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const body: Record<string, unknown> = {}
    for (const f of visibleFields) {
      if (f.type === 'checkbox') {
        body[f.name] = form.get(f.name) === 'on'
        continue
      }
      const raw = String(form.get(f.name) ?? '')
      body[f.name] = raw === '' && f.optional ? null : f.options ? Number(raw) : raw
    }
    setBusy(true)
    setError('')
    setFieldErrors({})
    try {
      await onSave(body)
    } catch (err) {
      // Błędy walidacji trafiają pod swoje pola; ogólny komunikat tylko dla reszty.
      const byField = err instanceof ApiError ? err.fieldErrors : {}
      const known = visibleFields.some((f) => byField[fieldKey(f.name)])
      setFieldErrors(byField)
      setError(known ? 'Popraw zaznaczone pola i zapisz ponownie.' : (err as Error).message)
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="form card">
      {visibleFields.map((f) => f.type === 'checkbox' ? (
        <div key={f.name} className="checkbox-field">
          <label className="check">
            <input name={f.name} type="checkbox" defaultChecked={!!row?.[f.name]} />
            {f.label}
          </label>
          {f.note && <div className="field-note">{f.note}</div>}
        </div>
      ) : (
        <FormField key={f.name} label={f.label} hint={f.note} error={fieldErrors[fieldKey(f.name)]}>
          {f.options && !options[f.name] ? (
            <select key="loading" disabled><option>Ładowanie…</option></select>
          ) : f.options ? (
            // montowany dopiero z gotową listą, inaczej defaultValue nie trafi w opcję
            <select key="ready" name={f.name} defaultValue={row?.[f.name] ?? ''} required={!f.optional}>
              <option value="">{f.optional ? '— brak —' : '— wybierz —'}</option>
              {options[f.name].map((o) => <option key={o.id} value={o.id}>{f.options!.label(o)}</option>)}
            </select>
          ) : f.type === 'date' ? (
            <DateInput name={f.name} defaultValue={row?.[f.name] ?? ''} required={!f.optional} />
          ) : (
            <input name={f.name} type={f.type ?? 'text'} defaultValue={row?.[f.name] ?? ''} required={!f.optional} />
          )}
        </FormField>
      ))}
      {error && <p role="alert" className="error">{error}</p>}
      <div className="buttons">
        <button type="submit" disabled={busy}>{row ? 'Zapisz zmiany' : 'Dodaj wpis'}</button>
        <button type="button" className="secondary" onClick={onCancel}>Anuluj</button>
      </div>
    </form>
  )
}
