
## Menu w nagłówku

Na wierzchu jest codzienna praca: Pulpit, Mój zespół, Panel HR, Moja ocena, Terminy, Oceny (każdy widzi tylko to, do czego ma uprawnienia).
Reszta siedzi w menu tematycznych (`NAV_GROUPS` w `App.tsx`, komponent `NavMore.tsx`): **Kadry** (pracownicy, nieobecności),
**Organizacja** (wydziały, stanowiska, lokalizacje, służby), **Administracja** (konta, dziennik audytu, dev). Grupa z jedną widoczną
stroną wyświetla się jako zwykła zakładka. Nowa strona administracyjna: dopisz jej `key` do właściwej grupy.

**Mój zespół** (`TeamPage` w `Dashboard.tsx`) to drzewko: karta przełożonego (`GET /api/org`) na górze, pod nią kafelki
bezpośrednich podwładnych (`GET /api/dashboard/team`) ze ścieżką, etapem, fazą i terminem oceny. Style kart dzieli z drzewkiem
w profilu (`.org-*` w `index.css`), kafelki mają dodatkowo `.team-tile` w `dash-v2.css`.
