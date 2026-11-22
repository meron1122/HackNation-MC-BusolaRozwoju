# Zasady dla agentów (Claude Code i inni)

## Przed każdym pushem

- **Zaktualizuj dokumentację tak, żeby opisywała to, co wypychasz.** Sprawdź, czego dotyczy zmiana, i popraw:
  - `docs/*.md` — dokumenty dla zespołu i jury (np. `docs/sztuczna-inteligencja.md`, `docs/technologie-i-architektura.md`);
  - `src/backend/README.md` — API, konfiguracja, uprawnienia, asystent AI;
  - `src/frontend/README.md` i `src/frontend/src/v2/README.md` — komponenty i konwencje frontu;
  - `zrodla-wiedzy/README.md` — gdy zmieniają się źródła bazy wiedzy asystenta.
- Docs aktualizujesz w tym samym commicie albo w commicie tuż przed pushem — nie „później”.
- Jeśli zmiana nie wpływa na żaden dokument, napisz to w opisie commita („bez zmian w docs”).

## Inne

- Nie dopisuj do commitów ani PR-ów współautorstwa ani podpisów asystenta AI.
- Nie commituj cudzych, niedokończonych zmian z katalogu roboczego — dodawaj tylko swoje pliki.
