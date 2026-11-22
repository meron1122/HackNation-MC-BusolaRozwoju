# Źródła wiedzy asystenta

Oryginały dokumentów, z których powstaje baza wiedzy asystenta AI (`src/backend/Busola.Api/Agent/Knowledge/*.md`).
Asystent nie czyta tych plików bezpośrednio: najpierw zamienia się je na Markdown, a backend po starcie wektoryzuje Markdown.

| Plik | W bazie wiedzy |
|---|---|
| `ocena-okresowa/poradnik-kprm-oceny-okresowe.pdf` | `poradnik-oceny-okresowe.md` (po stronach) |
| `pierwsza-ocena/poradnik-kprm-pierwsza-ocena.pdf` | `poradnik-pierwsza-ocena.md` (po stronach) |
| `model-kompetencji.xlsx` | `model-kompetencji.md` (14 kompetencji, 49 wskaźników, 5 poziomów) |
| `*/arkusz-*.docx` | `arkusze-ocen-wzory.md` |
| `opisy-stanowisk/OSP *.docx` | `przyklady-osp.md` |
| `*/rozporzadzenie-*.pdf` | nie — w bazie są czystsze teksty z API ELI Sejmu (`rozporzadzenie-*.md`, `ustawa-o-sluzbie-cywilnej.md`) |

Po zmianie plików: konwersja skryptem `scripts/convert_knowledge_sources.py` (instrukcja w jego nagłówku), commit plików `.md`
i restart API — przeliczą się tylko embeddingi zmienionych fragmentów.
