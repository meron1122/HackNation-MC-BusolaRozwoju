const TOKEN_KEY = 'busola.token'
export const LOGOUT_EVENT = 'busola-logout'

export type Session = { name: string; roles: string[]; permissions: string[] }

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // brak localStorage (tryb prywatny) — sesja trwa tylko do odświeżenia
  }
}

// Tylko do pokazywania/ukrywania UI. Prawdziwe sprawdzenia robi API.
export function readSession(token: string): Session | null {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
    const payload = JSON.parse(new TextDecoder().decode(bytes))
    if (payload.exp * 1000 < Date.now()) return null
    const list = (v: unknown): string[] => (v == null ? [] : Array.isArray(v) ? v : [String(v)])
    return { name: payload.name, roles: list(payload.role), permissions: list(payload.permission) }
  } catch {
    return null
  }
}

export const isSuperAdmin = (s: Session) => s.roles.includes('SuperAdmin')
export const can = (s: Session, permission: string) => isSuperAdmin(s) || s.permissions.includes(permission)

// Komunikaty według guidelines: co się stało i co zrobić, bez przeprosin.
const STATUS_MESSAGES: Record<number, string> = {
  401: 'Nieprawidłowy e-mail lub hasło.',
  403: 'Nie masz uprawnień do tej operacji. Jeśli ich potrzebujesz, poproś administratora.',
  404: 'Nie znaleziono tych danych. Mogły zostać usunięte, odśwież stronę.',
  409: 'Nie udało się zapisać: taki wpis już istnieje albo jest używany w innym miejscu.',
}
const UNAVAILABLE = 'Serwer nie odpowiada. Sprawdź połączenie i spróbuj ponownie za chwilę.'
const OFFLINE = 'Nie udało się połączyć z serwerem. Sprawdź połączenie i spróbuj ponownie.'

/** Błąd z API. `fieldErrors`: komunikaty walidacji przypisane do pól (klucz to nazwa pola małymi literami). */
export class ApiError extends Error {
  readonly status: number
  readonly fieldErrors: Record<string, string>
  constructor(message: string, status: number, fieldErrors: Record<string, string> = {}) {
    super(message)
    this.status = status
    this.fieldErrors = fieldErrors
  }
}

/** „$.FirstName” / „FirstName” → „firstname”, żeby dopasować do nazw pól formularza. */
export const fieldKey = (name: string) => (name.replace(/^$./, '').split('.').pop() ?? name).toLowerCase()

async function apiError(res: Response): Promise<ApiError> {
  try {
    const problem = await res.json()
    if (problem.errors) {
      const entries = Object.entries(problem.errors as Record<string, string[]>)
      const fields = Object.fromEntries(entries.map(([k, v]) => [fieldKey(k), [v].flat().join(' ')]))
      return new ApiError(entries.flatMap(([, v]) => v).join(' '), res.status, fields)
    }
    if (problem.detail) return new ApiError(problem.detail, res.status)
  } catch {
    // pusta odpowiedź (np. 403 z Forbid())
  }
  const fallback = res.status >= 502 && res.status <= 504 ? UNAVAILABLE : `Nie udało się wykonać operacji (błąd serwera ${res.status}). Spróbuj ponownie za chwilę.`
  return new ApiError(STATUS_MESSAGES[res.status] ?? fallback, res.status)
}

// Dokleja token; 401 przy zalogowanym = sesja unieważniona (np. zmiana hasła na innym urządzeniu) → wylogowanie.
async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getToken()
  const headers = new Headers(init.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const res = await fetch(`/api/${path}`, { ...init, headers }).catch(() => {
    throw new ApiError(OFFLINE, 0)
  })
  if (res.status === 401 && token) {
    setToken(null)
    window.dispatchEvent(new Event(LOGOUT_EVENT))
  }
  return res
}

export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await request(path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) throw await apiError(res)
  if (res.status === 204) return undefined as T
  // np. statyczny hosting bez backendu odpowiada 200 z pustym ciałem albo HTML-em
  if (!res.headers.get('content-type')?.includes('json')) {
    throw new Error(`/api/${path} nie zwróciło JSON-a (${res.status}). Czy pod tym adresem działa API?`)
  }
  return (await res.json()) as T
}

/** Plik jako multipart; Content-Type z boundary ustawia przeglądarka. */
export async function apiUpload(path: string, file: File, method = 'PUT'): Promise<void> {
  const body = new FormData()
  body.append('file', file)
  const res = await request(path, { method, body })
  if (!res.ok) throw await apiError(res)
}

/** Plik z API (np. PDF arkusza) zapisany przez przeglądarkę; nazwa z Content-Disposition albo podana. */
export async function apiDownload(path: string, fileName: string): Promise<void> {
  const res = await request(path)
  if (!res.ok) throw await apiError(res)
  const disposition = res.headers.get('content-disposition') ?? ''
  const match = disposition.match(/filename\*=UTF-8''([^;]+)/i) ?? disposition.match(/filename="?([^";]+)"?/i)
  const url = URL.createObjectURL(await res.blob())
  const link = document.createElement('a')
  link.href = url
  link.download = match ? decodeURIComponent(match[1]) : fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Obrazek jako blob URL (null = brak). Wywołujący zwalnia go przez URL.revokeObjectURL. */
export async function apiBlobUrl(path: string): Promise<string | null> {
  const res = await request(path)
  return res.ok ? URL.createObjectURL(await res.blob()) : null
}
