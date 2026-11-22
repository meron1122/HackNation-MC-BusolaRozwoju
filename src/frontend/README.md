
## Menu w nagłówku

Na wierzchu jest codzienna praca: Pulpit, Mój zespół, Panel HR, Moja ocena, Terminy, Oceny (każdy widzi tylko to, do czego ma uprawnienia).
Reszta siedzi w menu tematycznych (`NAV_GROUPS` w `App.tsx`, komponent `NavMore.tsx`): **Kadry** (pracownicy, nieobecności),
**Organizacja** (wydziały, stanowiska, lokalizacje, służby), **Administracja** (konta, dziennik audytu, dev). Grupa z jedną widoczną
stroną wyświetla się jako zwykła zakładka. Nowa strona administracyjna: dopisz jej `key` do właściwej grupy.

**Mój zespół** (`TeamPage` w `Dashboard.tsx`) to drzewko: karta przełożonego (`GET /api/org`) na górze, pod nią kafelki
bezpośrednich podwładnych (`GET /api/dashboard/team`) ze ścieżką, etapem, fazą i terminem oceny. Style kart dzieli z drzewkiem
w profilu (`.org-*` w `index.css`), kafelki mają dodatkowo `.team-tile` w `dash-v2.css`.

**Przewodnik powitalny** (`WelcomeTour.ts`, driver.js) rusza po każdym zalogowaniu (nie po odświeżeniu strony) — na potrzeby
prezentacji. Każda rola ma własną opowieść o przepływie oceny (`personaOf`: administrator → kadry → przełożony → oceniany):
oceniany — Moja ocena i własna ocena w kreatorze; przełożony — pulpit, terminy i ocena krok po kroku; kadry — Panel HR,
pracownicy, nieobecności i rejestr ocen; administrator — konta, struktura, dziennik audytu i rejestr ocen. Kreator pokazuje
przykładową ocenę (najdłużej trwający niezakończony cykl), na koniec asystent i menu konta. Krok z `view` przełącza stronę;
element, który nie pojawi się w 5 s (np. pusta lista), jest pomijany. Po zamknięciu wraca na stronę startową.
Wyłączenie: usuń `welcomeTourPending.current = true` w `finishEntry` w `App.tsx`.
