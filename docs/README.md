# Dokumentacja Busoli

Dokumenty piszemy w Markdown w folderze `docs/`. Skrypt `build.py` składa je do PDF w układzie aplikacji: logo Busoli w nagłówku po lewej, tytuł rozdziału na środku, numer strony w stopce.

## Jak pisać

- Każdy nagłówek `#` to rozdział. Zaczyna nową stronę, a jego tytuł pojawia się w nagłówku strony.
- `##` i `###` dzielą rozdział na sekcje.
- Teksty piszemy jak w interfejsie: prostymi zdaniami, daty w formacie DD.MM.RRRR.

> Notatkę lub ostrzeżenie zapisz jako cytat (`>`). W PDF wygląda jak karta z błękitnym obrysem.

| Element Markdown | W PDF |
| --- | --- |
| `# Rozdział` | nowa strona, tytuł w nagłówku |
| tabela | nagłówek wersalikami, linie między wierszami |
| blok kodu | granatowe tło jak w guidelines |

# Budowanie PDF

Jednorazowo:

```bash
python3 -m venv docs/.venv
docs/.venv/bin/pip install -r docs/requirements.txt
```

Potem:

```bash
docs/.venv/bin/python docs/build.py
```

PDF trafia do `docs/pdf/`. Font Inter musi być zainstalowany w systemie, inaczej użyty zostanie zastępczy font bezszeryfowy.
