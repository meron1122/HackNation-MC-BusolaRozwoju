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

const STATUS_MESSAGES: Record<number, string> = {
  401: 'Nieprawidłowy e-mail lub hasło.',
  403: 'Brak uprawnień do tej operacji.',
  404: 'Nie znaleziono.',
  409: 'Operacja narusza powiązania danych (duplikat albo rekord jest w użyciu).',
}

async function errorMessage(res: Response): Promise<string> {
  try {
    const problem = await res.json()
    if (problem.errors) return Object.values(problem.errors).flat().join(' ')
    if (problem.detail) return problem.detail
  } catch {
    // pusta odpowiedź (np. 403 z Forbid())
  }
  return STATUS_MESSAGES[res.status] ?? `Błąd serwera (${res.status}).`
}

// Dokleja token; 401 przy zalogowanym = sesja unieważniona (np. zmiana hasła na innym urządzeniu) → wylogowanie.
async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getToken()
  const headers = new Headers(init.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const res = await fetch(`/api/${path}`, { ...init, headers })
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
  if (!res.ok) throw new Error(await errorMessage(res))
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
  if (!res.ok) throw new Error(await errorMessage(res))
}

/** Obrazek jako blob URL (null = brak). Wywołujący zwalnia go przez URL.revokeObjectURL. */
export async function apiBlobUrl(path: string): Promise<string | null> {
  const res = await request(path)
  return res.ok ? URL.createObjectURL(await res.blob()) : null
}
