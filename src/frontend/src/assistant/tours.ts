import { driver } from 'driver.js'
import 'driver.js/dist/driver.css'
import './tours.css'

/**
 * Prowadzenie „za rękę” po interfejsie (driver.js: przyciemnia ekran, podświetla element, opis i Dalej/Wstecz).
 * Asystent proponuje je znacznikiem [[prowadzenie:ID]] w odpowiedzi. Te same ID i tytuły są w backendzie
 * (Busola.Api/Agent/Tours.cs) — przy zmianie katalogu zmień oba miejsca.
 */
type TourStep = { el: string; title: string; text: string }
export type Tour = { id: string; title: string; pages: string[]; step?: RegExp; steps: TourStep[] }

export const TOURS: Tour[] = [
  {
    id: 'nawigacja', title: 'Gdzie co jest w Busoli', pages: ['*'], steps: [
      { el: '.topbar nav', title: 'Moduły', text: 'Tu przełączasz się między pulpitem, zespołem, terminami i ocenami.' },
      { el: '.user-menu', title: 'Twoje konto', text: 'Mój profil, struktura organizacyjna i wylogowanie.' },
      { el: '.assistant-fab', title: 'Asystent', text: 'Pytaj o zasady albo o to, co widzisz. Może też poprowadzić Cię po ekranie.' },
    ],
  },
  {
    id: 'pulpit', title: 'Pulpit: od czego zacząć dzień', pages: ['dashboard'], steps: [
      { el: '.dash-hero', title: 'Następny krok', text: 'Najpilniejsza sprawa w Twoim zespole. Zacznij od niej.' },
      { el: '.dash-queue', title: 'W kolejce', text: 'Kolejne sprawy, ułożone według terminu.' },
      { el: '.dash-team', title: 'Twój zespół', text: 'Ludzie, za których odpowiadasz, i etap ich ocen. Kliknij osobę, żeby zobaczyć jej profil.' },
      { el: '.dash-ask', title: 'Szybkie pytania', text: 'Gotowe pytania do asystenta o zasady i terminy.' },
    ],
  },
  {
    id: 'ocena', title: 'Jak przejść przez ocenę', pages: ['evaluations'], steps: [
      { el: '.wizard-person', title: 'Kogo oceniasz', text: 'Osoba, jej stanowisko i rodzaj oceny.' },
      { el: 'nav[aria-label="Kroki oceny"]', title: 'Kroki oceny', text: 'Przechodzisz je po kolei. ✓ oznacza krok gotowy; do wcześniejszych możesz wracać.' },
      { el: '.due-box', title: 'Termin', text: 'Do kiedy trzeba zamknąć bieżący etap.' },
      { el: '.wizard-main', title: 'Bieżący krok', text: 'Tu wypełniasz to, czego wymaga ten etap.' },
      { el: '.wizard-toolbar', title: 'Arkusz', text: 'Podgląd i PDF arkusza oceny.' },
    ],
  },
  {
    id: 'kryteria', title: 'Jak wybrać kryteria oceny', pages: ['evaluations'], step: /kryteri/i, steps: [
      { el: '.sv2-mandatory', title: 'Kryteria obowiązkowe', text: 'Wynikają z rodzaju arkusza i są stałe.' },
      { el: '.sv2-slots', title: 'Kryteria dodatkowe', text: 'Do trzech, dobrane do obowiązków na stanowisku tej osoby.' },
      { el: '.sv2-catalog', title: 'Katalog kompetencji', text: 'Stąd wybierasz kryteria dodatkowe. Asystent może zaproponować pasujące.' },
    ],
  },
  {
    id: 'profil', title: 'Profil pracownika', pages: ['profile', 'my-profile'], steps: [
      { el: '.profile-side', title: 'Osoba', text: 'Zdjęcie, stanowisko i zakładki profilu.' },
      { el: '.profile-side nav', title: 'Zakładki', text: 'Dane, zatrudnienie, struktura przełożonych, historia ocen i kwalifikacje.' },
      { el: '.profile-main', title: 'Treść', text: 'Zawartość wybranej zakładki.' },
    ],
  },
]

export const tourById = (id: string) => TOURS.find((t) => t.id === id)

/** Prowadzenia sensowne na tym ekranie (najpierw dopasowane do kroku, ogólne na końcu). */
export function toursFor(page: string, step: string | null): Tour[] {
  return TOURS
    .filter((t) => (t.pages.includes(page) || t.pages.includes('*')) && (!t.step || (step != null && t.step.test(step))))
    .sort((a, b) => Number(a.pages.includes('*')) - Number(b.pages.includes('*')) || Number(!!b.step) - Number(!!a.step))
}

/** Zamyka okno asystenta na czas prowadzenia, żeby nie zasłaniało ekranu. */
export const TOUR_STARTED_EVENT = 'busola-tour-started'

/** Startuje prowadzenie; kroki, których elementu nie ma na ekranie, są pomijane. Zwraca false, gdy nie ma czego pokazać. */
export function startTour(id: string): boolean {
  const tour = tourById(id)
  const steps = (tour?.steps ?? []).filter((s) => document.querySelector(s.el))
  if (!tour || steps.length === 0) return false
  window.dispatchEvent(new Event(TOUR_STARTED_EVENT))
  driver({
    showProgress: true,
    progressText: '{{current}} z {{total}}',
    nextBtnText: 'Dalej',
    prevBtnText: 'Wstecz',
    doneBtnText: 'Gotowe',
    overlayOpacity: 0.55,
    stagePadding: 6,
    smoothScroll: true,
    popoverClass: 'busola-tour',
    steps: steps.map((s) => ({ element: s.el, popover: { title: s.title, description: s.text } })),
  }).drive()
  return true
}

const MARKER = /\[\[prowadzenie:([a-z0-9-]+)\]\]/g

/** Znaczniki prowadzeń z odpowiedzi asystenta: tekst bez nich i znane prowadzenia (nieznane ID — ignorujemy). */
export function extractTours(reply: string): { text: string; tours: Tour[] } {
  const ids = [...reply.matchAll(MARKER)].map((m) => m[1])
  const tours = [...new Set(ids)].map(tourById).filter((t): t is Tour => !!t)
  return { text: reply.replace(MARKER, '').replace(/\n{3,}/g, '\n\n').trim(), tours }
}

/** Użytkownik prosi wprost o pokazanie — wtedy startujemy od razu, bez klikania „Pokaż mi”. */
export const asksForTour = (question: string) => /\b(pokaż|poprowadź|przeprowadź|oprowadź|prowadź)\b/i.test(question)
