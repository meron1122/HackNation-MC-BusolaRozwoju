import { driver } from 'driver.js'
import 'driver.js/dist/driver.css'
import './tours.css'

/**
 * Prowadzenie „za rękę” składane przez asystenta pod pytanie użytkownika (driver.js: przyciemnia ekran,
 * podświetla element, opis i Dalej/Wstecz). Przy każdym pytaniu front zbiera punkty orientacyjne, które są teraz
 * na ekranie (zakładki menu, kroki oceny, zakładki profilu, sekcje pulpitu), i wysyła je w kontekście.
 * Model wybiera z nich kroki i pisze opisy pod intencję, w bloku:
 *   [[prowadzenie]]
 *   id-punktu | Tytuł | Co tu zrobić
 *   [[/prowadzenie]]
 * Nieznane ID są pomijane, więc model nie wskaże niczego spoza ekranu.
 */
export type Landmark = { id: string; label: string; selector: string }
export type GuideStep = { id: string; title: string; text: string }

// Stałe sekcje ekranów; zakładki i kroki dochodzą dynamicznie z DOM.
const SECTIONS: Landmark[] = [
  { id: 'konto', label: 'Menu konta: Mój profil, Struktura, Wyloguj', selector: '.user-menu' },
  { id: 'asystent', label: 'Przycisk asystenta', selector: '.assistant-fab' },
  { id: 'pulpit-nastepny-krok', label: 'Pulpit: karta „Następny krok” (najpilniejsza sprawa)', selector: '.dash-hero' },
  { id: 'pulpit-kolejka', label: 'Pulpit: „W kolejce” (kolejne sprawy według terminu)', selector: '.dash-queue' },
  { id: 'pulpit-zespol', label: 'Pulpit: zespół i etapy ich ocen', selector: '.dash-team' },
  { id: 'pulpit-pytania', label: 'Pulpit: szybkie pytania do asystenta', selector: '.dash-ask' },
  { id: 'ocena-osoba', label: 'Ocena: kogo oceniasz (osoba, stanowisko, rodzaj oceny)', selector: '.wizard-person' },
  { id: 'ocena-termin', label: 'Ocena: termin bieżącego etapu', selector: '.due-box' },
  { id: 'ocena-tresc', label: 'Ocena: treść bieżącego kroku', selector: '.wizard-main' },
  { id: 'ocena-pdf', label: 'Ocena: podgląd i PDF arkusza', selector: '.wizard-toolbar' },
  { id: 'kryteria-obowiazkowe', label: 'Kryteria: obowiązkowe (stałe dla arkusza)', selector: '.sv2-mandatory' },
  { id: 'kryteria-dodatkowe', label: 'Kryteria: miejsca na kryteria dodatkowe (do 3)', selector: '.sv2-slots' },
  { id: 'kryteria-katalog', label: 'Kryteria: katalog kompetencji do wyboru', selector: '.sv2-catalog' },
  { id: 'profil-osoba', label: 'Profil: osoba i zakładki', selector: '.profile-side' },
  { id: 'profil-tresc', label: 'Profil: treść wybranej zakładki', selector: '.profile-main' },
]

const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30)

/** Przyciski z listy (zakładki, kroki): oznaczamy je data-guide w chwili zbierania, więc selektor nie zależy od układu DOM. */
function buttons(container: string, prefix: string, describe: (text: string) => string): Landmark[] {
  const seen = new Set<string>()
  return [...document.querySelectorAll<HTMLElement>(`${container} button`)].flatMap((b) => {
    const text = b.innerText.replace(/\s+/g, ' ').replace(/[✓]/g, '').trim()
    let id = `${prefix}-${slug(text)}`
    if (!text || id === `${prefix}-`) return []
    for (let n = 2; seen.has(id); n++) id = `${prefix}-${slug(text)}-${n}`
    seen.add(id)
    b.dataset.guide = id
    return [{ id, label: describe(text.slice(0, 60)), selector: `[data-guide="${id}"]` }]
  })
}

let current = new Map<string, Landmark>()

/** Co jest teraz na ekranie — wołane przy wysyłaniu pytania; wynik idzie do backendu (id + opis). */
export function collectLandmarks(): { id: string; label: string }[] {
  const all = [
    ...buttons('.topbar nav', 'menu', (t) => `Zakładka menu „${t}”`),
    ...buttons('nav[aria-label="Kroki oceny"]', 'krok', (t) => `Krok oceny „${t}” (lista kroków po lewej)`),
    ...buttons('.profile-side nav', 'zakladka', (t) => `Zakładka profilu „${t}”`),
    ...SECTIONS.filter((l) => document.querySelector(l.selector)),
  ]
  current = new Map(all.map((l) => [l.id, l]))
  return all.map(({ id, label }) => ({ id, label }))
}

const BLOCK = /\[\[prowadzenie\]\]([\s\S]*?)(?:\[\[\/prowadzenie\]\]|$)/

/** Blok prowadzenia z odpowiedzi: tekst bez bloku i kroki (tylko punkty, które znamy). */
export function extractGuide(reply: string): { text: string; steps: GuideStep[] } {
  const m = reply.match(BLOCK)
  if (!m) return { text: reply, steps: [] }
  const steps = m[1].split('\n')
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').split('|').map((p) => p.trim()))
    .filter(([id]) => id && current.has(id))
    .map(([id, title, text]) => ({ id, title: title || current.get(id)!.label, text: text ?? '' }))
  return { text: reply.replace(BLOCK, '').replace(/\n{3,}/g, '\n\n').trim(), steps }
}

/** Zamyka okno asystenta na czas prowadzenia, żeby nie zasłaniało ekranu. */
export const TOUR_STARTED_EVENT = 'busola-tour-started'

export function startGuide(steps: GuideStep[]): boolean {
  const shown = steps.filter((s) => current.has(s.id) && document.querySelector(current.get(s.id)!.selector))
  if (shown.length === 0) return false
  markGuideTried()
  window.dispatchEvent(new Event(TOUR_STARTED_EVENT))
  driver({
    showProgress: shown.length > 1,
    progressText: '{{current}} z {{total}}',
    nextBtnText: 'Dalej',
    prevBtnText: 'Wstecz',
    doneBtnText: 'Gotowe',
    overlayOpacity: 0.55,
    stagePadding: 6,
    smoothScroll: true,
    popoverClass: 'busola-tour',
    steps: shown.map((s) => ({ element: current.get(s.id)!.selector, popover: { title: s.title, description: s.text } })),
  }).drive()
  return true
}

/** Użytkownik prosi wprost o pokazanie — startujemy od razu, bez klikania „Pokaż mi”. */
export const asksForGuide = (question: string) =>
  /\b(pokaż|pokaz|poprowadź|poprowadz|przeprowadź|oprowadź|prowadź|gdzie (jest|są|znajd|kliknąć|klikn|mam))/i.test(question)

// Flaga zachęty: dopóki ktoś nie spróbuje prowadzenia, przycisk asystenta ma znacznik „Nowe”. Tylko wygoda w przeglądarce.
const TRIED_KEY = 'busola.guideTried'
export const GUIDE_TRIED_EVENT = 'busola-guide-tried'
export function guideTried(): boolean {
  try { return localStorage.getItem(TRIED_KEY) === '1' } catch { return false }
}
export function markGuideTried() {
  try { localStorage.setItem(TRIED_KEY, '1') } catch { /* tryb prywatny: znacznik wróci po odświeżeniu */ }
  window.dispatchEvent(new Event(GUIDE_TRIED_EVENT))
}
