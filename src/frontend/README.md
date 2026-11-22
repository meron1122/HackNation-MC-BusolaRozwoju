
## Menu w nagłówku

Na wierzchu jest codzienna praca: Pulpit, Mój zespół, Panel HR, Moja ocena, Terminy, Oceny (każdy widzi tylko to, do czego ma uprawnienia).
Reszta siedzi w menu tematycznych (`NAV_GROUPS` w `App.tsx`, komponent `NavMore.tsx`): **Kadry** (pracownicy, nieobecności),
**Organizacja** (wydziały, stanowiska, lokalizacje, służby), **Administracja** (konta, dziennik audytu, dev). Grupa z jedną widoczną
stroną wyświetla się jako zwykła zakładka. Nowa strona administracyjna: dopisz jej `key` do właściwej grupy.
