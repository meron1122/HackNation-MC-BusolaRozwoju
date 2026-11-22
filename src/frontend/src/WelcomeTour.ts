import { driver, type DriveStep } from 'driver.js'
import 'driver.js/dist/driver.css'
import './assistant/tours.css'
import { api, type Session } from './api'
import { TOUR_STARTED_EVENT, markGuideTried } from './assistant/tours'

/**
 * Przewodnik powitalny po każdym zalogowaniu (na potrzeby prezentacji). Każda rola dostaje własną opowieść o przepływie
 * oceny — oceniany, przełożony (oceniający), kadry, administrator — i przechodzi przez swoje kluczowe ekrany.
 * Krok z `view` przełącza ekran przed podświetleniem; element, który się nie pojawi (np. pusta lista), jest pomijany.
 */
export type TourView = { pageKey: string; openEvaluation?: number | null }
type Step = { view?: TourView; page?: string; element?: string; title: string; text: string }
type Persona = 'employee' | 'supervisor' | 'hr' | 'admin'

type ListItem = { id: number; isFinal: boolean; startDate: string }

// Korzeń strony z listą (CrudPage, Konta, Dziennik): działa też, gdy lista jest pusta.
const PAGE = '.content .m-page > div > section'

export function personaOf(s: Session): Persona {
  if (s.roles.includes('SuperAdmin') || s.roles.includes('ServiceAdmin')) return 'admin'
  if (s.roles.includes('Hr')) return 'hr'
  if (s.roles.includes('Supervisor')) return 'supervisor'
  return 'employee'
}

/** Ocena do pokazania w kreatorze: najdłużej trwający, niezakończony cykl — ma najwięcej treści. Ocenianemu API zwraca tylko jego oceny. */
async function sampleEvaluation(): Promise<number | null> {
  const rows = await api<ListItem[]>('evaluations').catch(() => [])
  const open = rows.filter((r) => !r.isFinal).sort((a, b) => a.startDate.localeCompare(b.startDate))
  return (open[0] ?? rows[0])?.id ?? null
}

// Konto bez pracownika (np. SuperAdmin) ma w nazwie e-mail — wtedy witamy bez imienia.
const greeting = (name: string) => (name.includes('@') ? 'Witaj!' : `Witaj, ${name.split(' ')[0]}!`)

const INTRO: Record<Persona, string> = {
  employee: 'Busola przeprowadzi Cię przez Twoją ocenę: zawsze wiesz, na jakim jest etapie, co masz zrobić i do kiedy. Pokażemy to w dwie minuty.',
  supervisor: 'Prowadzisz ocenę swojego zespołu. Busola bierze na siebie terminy, wzory arkuszy i przepisy, a Ty skupiasz się na rozmowie z pracownikiem. Pokażemy, jak wygląda cały cykl.',
  hr: 'Pilnujesz, żeby oceny w całej służbie szły zgodnie z przepisami i na czas. Pokażemy, gdzie to widać i jak zakłada się cykl oceny.',
  admin: 'Konfigurujesz Busolę dla służby: strukturę, stanowiska, konta i role. Pokażemy, gdzie to jest i jak przekłada się na proces oceny.',
}

const FLOW: Record<Persona, string> = {
  employee: 'Kroki jak we wzorze arkusza. Na start przełożony ustala z Tobą kryteria i oczekiwania. W trakcie cyklu przygotowujesz samoocenę albo sprawozdanie. Na koniec rozmowa oceniająca, zapoznanie z oceną i podpis, a gdy się nie zgadzasz, sprzeciw.',
  supervisor: 'Start cyklu: wybierasz ścieżkę, ustalasz kryteria i wskaźniki, prowadzisz rozmowę rozpoczynającą. W trakcie: notujesz obserwacje. Ocena: oceniasz wskaźniki, prowadzisz rozmowę oceniającą, przyznajesz ocenę i podpisujesz, a pracownik się zapoznaje. Etapy, na które jeszcze nie pora, są zablokowane.',
  hr: 'Każdą ocenę w służbie widzisz krok po kroku, tak jak przełożony: start cyklu z kryteriami i rozmową rozpoczynającą, obserwacje w trakcie, ocena, podpisy, zapoznanie i sprzeciw. Od razu widać, na którym etapie coś utknęło.',
  admin: 'Tak wygląda ocena oczami przełożonego: start cyklu, obserwacje w trakcie, ocena, podpisy, zapoznanie i sprzeciw. Kto kogo ocenia, wynika ze struktury i ról, które tu ustawiasz.',
}

function wizardSteps(persona: Persona, id: number): Step[] {
  const mine = persona === 'employee'
  return [
    { view: { pageKey: 'evaluations', openEvaluation: id }, element: '.wizard-nav', title: mine ? 'Twoja ścieżka oceny' : 'Ocena krok po kroku', text: FLOW[persona] },
    {
      element: '.wizard-main', title: 'Bieżący etap',
      text: mine
        ? 'Każdy krok mówi, co zrobić i do kiedy, z podstawą prawną. Kryteria i oczekiwania są opisane zachowaniami, więc wiesz, za co jesteś oceniany.'
        : 'Pytania behawioralne zamiast ogólników, średnia liczona automatycznie. „Sprawdź przed podpisaniem” wskaże braki z odwołaniem do konkretnego paragrafu.',
    },
    ...(mine ? [] : [{
      // Na szerokim ekranie panel jest rozwinięty, a pasek ikon ukryty.
      element: '.wz-rail, .wz-panel', title: 'Notatki i asystent pod ręką',
      text: 'Notatki z obserwacji z całego cyklu, z podpowiedzią, żeby opisywać fakty, a nie opinie. Obok asystent zasad do bieżącego etapu.',
    }]),
    {
      element: '.wizard-toolbar', title: 'Arkusz, PDF i podpis',
      text: 'Cały arkusz w jednym widoku i PDF zgodny ze wzorem. Podpis składa się odręcznie na telefonie, po zeskanowaniu kodu QR.',
    },
  ]
}

function screens(persona: Persona): Step[] {
  switch (persona) {
    case 'employee':
      return [{
        view: { pageKey: 'my' }, page: 'my', element: '.dash-my', title: 'Twoje zadania w ocenie',
        text: 'Etap Twojej oceny i to, co masz zrobić teraz: zapoznać się z kryteriami i oczekiwaniami, przygotować samoocenę, zapoznać się z oceną i ją podpisać.',
      }]
    case 'supervisor':
      return [
        {
          view: { pageKey: 'dashboard' }, page: 'dashboard', element: '.dash-hero', title: 'Następny krok',
          text: 'Pulpit zaczyna od najpilniejszej sprawy: kto, który etap oceny i ile dni zostało. Termin ma odnośnik do przepisu, z którego wynika.',
        },
        { page: 'dashboard', element: '.dash-queue', title: 'W kolejce', text: 'Kolejne sprawy zespołu ułożone według terminów, więc nic nie umknie.' },
        { page: 'dashboard', element: '.dash-team', title: 'Zespół w cyklu oceny', text: 'Każdy pracownik na osi czasu: w którym etapie jest jego ocena i co go czeka.' },
        {
          view: { pageKey: 'deadlines' }, page: 'deadlines', element: '.hifi-deadlines', title: 'Terminy liczone z przepisów',
          text: 'Busola liczy terminy etapów z ustawy o służbie cywilnej i rozporządzenia, z pominięciem dni wolnych. Nieobecność pracownika przesuwa termin, a każda zmiana zostaje w historii.',
        },
      ]
    case 'hr':
      return [
        {
          view: { pageKey: 'hr' }, page: 'hr', element: '.dash-hr', title: 'Panel HR',
          text: 'Cała służba w jednym miejscu: co wymaga uwagi, kto jest po terminie i kto nie ma otwartej oceny. Przypomnienie wysyłasz jednym kliknięciem.',
        },
        {
          view: { pageKey: 'employees' }, page: 'employees', element: PAGE, title: 'Pracownik to od razu cykl oceny',
          text: 'Dodając pracownika, zakładasz mu konto i od razu cykl: pierwszą ocenę albo okresową (arkusz B dla kierujących, C dla pozostałych), z terminami od daty zatrudnienia.',
        },
        {
          view: { pageKey: 'absences' }, page: 'absences', element: PAGE, title: 'Nieobecności przesuwają terminy',
          text: 'Dłuższa nieobecność przesuwa terminy etapów zgodnie z przepisami. Każda zmiana terminu zostaje w historii oceny.',
        },
        {
          view: { pageKey: 'evaluations' }, page: 'evaluations', element: '.table-wrap', title: 'Rejestr ocen',
          text: 'Wszystkie oceny w służbie z fazą i najbliższym terminem. Tu też zakładasz nową ocenę.',
        },
      ]
    case 'admin':
      return [
        {
          view: { pageKey: 'users' }, page: 'users', element: PAGE, title: 'Konta i role',
          text: 'Pracownik, przełożony, kadry, administrator służby. Każda rola ma swoje uprawnienia i widzi tylko dane ze swojego zakresu.',
        },
        {
          view: { pageKey: 'departments' }, page: 'departments', element: PAGE, title: 'Struktura organizacyjna',
          text: 'Wydziały i kierujący komórkami. Ze struktury i przełożonych wynika, kto kogo ocenia i kto widzi czyje oceny.',
        },
        {
          view: { pageKey: 'audit' }, page: 'audit', element: `${PAGE} > .toolbar`, title: 'Dziennik audytu',
          text: 'Każda zmiana danych i dostęp do API, tylko dopisywane. Przegląd i eksport do CSV.',
        },
        {
          view: { pageKey: 'evaluations' }, page: 'evaluations', element: '.table-wrap', title: 'Rejestr ocen',
          text: 'Wszystkie oceny w zakresie z fazą i najbliższym terminem.',
        },
      ]
  }
}

const ASSISTANT: Record<Persona, string> = {
  employee: 'Nie wiesz, co oznacza kryterium albo ile masz czasu na sprzeciw? Zapytaj asystenta: odpowie i zawsze poda źródło. Napisz „pokaż mi”, a poprowadzi Cię po ekranie.',
  supervisor: 'Jak poprowadzić rozmowę, co wpisać w notatce, kiedy mija termin? Asystent odpowie ze źródłem, a na „pokaż mi” poprowadzi po ekranie.',
  hr: 'Pytania o procedury, terminy i przepisy: asystent odpowiada i zawsze podaje źródło. Na „pokaż mi” poprowadzi po ekranie.',
  admin: 'Asystent zna procedury oceny i zawsze podaje źródło. Na „pokaż mi” poprowadzi po ekranie.',
}

function buildSteps(session: Session, persona: Persona, has: (page: string) => boolean, evaluationId: number | null, home: TourView): Step[] {
  return [
    { title: greeting(session.name), text: INTRO[persona] },
    { element: '.topbar nav', title: 'Menu skrojone pod Twoją rolę', text: 'Widzisz tylko swoje moduły i tylko dane ze swojego zakresu.' },
    ...screens(persona).filter((s) => !s.page || has(s.page)),
    ...(has('evaluations') && evaluationId !== null ? wizardSteps(persona, evaluationId) : []),
    // W kreatorze asystent siedzi w panelu bocznym, bez pływającego przycisku — wracamy na stronę startową.
    { view: home, element: '.assistant-fab', title: 'Asystent zasad', text: ASSISTANT[persona] },
    { element: '.user-menu', title: 'Twoje konto', text: 'Profil, struktura organizacyjna, hasło i logowanie dwuetapowe.' },
    { title: 'Różne role, jedna busola', text: 'Wspólnie w kierunku rozwoju.' },
  ]
}

/** Pierwszy widoczny element z listy selektorów (ukryte CSS-em mają zerowy rozmiar). */
const visible = (selector: string) =>
  [...document.querySelectorAll(selector)].find((e) => e.getBoundingClientRect().width > 0)

/** Czeka, aż element pojawi się na ekranie (strona ładuje dane); false po limicie. */
function appears(selector: string, timeoutMs = 5000): Promise<boolean> {
  const start = Date.now()
  return new Promise((resolve) => {
    const tick = () => {
      if (visible(selector)) resolve(true)
      else if (Date.now() - start > timeoutMs) resolve(false)
      else window.setTimeout(tick, 100)
    }
    tick()
  })
}

/** `show` przełącza ekran aplikacji; po zamknięciu przewodnika wracamy na `home`. */
export async function startWelcomeTour(session: Session, visiblePages: string[], show: (view: TourView) => void, home: TourView) {
  const has = (page: string) => visiblePages.includes(page)
  const persona = personaOf(session)
  const steps = buildSteps(session, persona, has, has('evaluations') ? await sampleEvaluation() : null, home)
  // Krok bez `view` zostaje na ekranie poprzedniego.
  const views: (TourView | undefined)[] = []
  steps.forEach((s, i) => { views[i] = s.view ?? views[i - 1] })
  const key = (v?: TourView) => (v ? `${v.pageKey}:${v.openEvaluation ?? ''}` : '')
  let shown = ''

  window.dispatchEvent(new Event(TOUR_STARTED_EVENT))
  markGuideTried()

  const tour = driver({
    showProgress: true,
    progressText: '{{current}} z {{total}}',
    nextBtnText: 'Dalej',
    prevBtnText: 'Wstecz',
    doneBtnText: 'Zaczynamy',
    overlayOpacity: 0.6,
    stagePadding: 6,
    smoothScroll: true,
    // Na środek, nie do górnej krawędzi — tam element chowa się pod przyklejonym nagłówkiem.
    scrollIntoView: { block: 'center' },
    popoverClass: 'busola-tour busola-welcome',
    // Przypadkowe kliknięcie w tło podczas prezentacji nie zamyka przewodnika; Esc i × nadal tak.
    overlayClickBehavior: 'none',
    steps: steps.map((s): DriveStep => ({
      element: s.element && (() => visible(s.element!)!),
      popover: { title: s.title, description: s.text },
    })),
    // Strony wjeżdżają animacją, a listy doładowują się po chwili: po niej przeliczamy podświetlenie.
    onHighlighted: () => { window.setTimeout(() => tour.refresh(), 500) },
    onNextClick: () => goTo((tour.getActiveIndex() ?? 0) + 1, 1),
    onPrevClick: () => goTo((tour.getActiveIndex() ?? 1) - 1, -1),
    onDestroyed: () => { if (shown) show(home) },
  })

  // Pomijanie brakujących elementów robimy sami, nie przez skipMissingElement driver.js — ten przeskakuje kroki
  // z pominięciem przełączania ekranu, więc kolejny krok szukałby elementu na złej stronie.
  let busy = false
  async function goTo(i: number, dir: 1 | -1) {
    if (busy) return
    busy = true
    try {
      for (; i >= 0 && i < steps.length; i += dir) {
        const k = key(views[i])
        if (k && k !== shown) {
          shown = k
          show(views[i]!)
          // Poprzednia strona może mieć ten sam element (np. tabelę) — czekamy, aż React podmieni stronę.
          await new Promise((r) => window.setTimeout(r, 250))
        }
        const selector = steps[i].element
        if (!selector || (await appears(selector))) return tour.moveTo(i)
      }
      if (i >= steps.length) tour.destroy()
    } finally {
      busy = false
    }
  }

  tour.drive()
}
