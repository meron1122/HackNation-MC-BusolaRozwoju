"""Pliki źródłowe zespołu (poradniki PDF, arkusze i OSP w docx, model kompetencji xlsx) -> Markdown bazy wiedzy agenta.
python3 -I scripts/convert_knowledge_sources.py zrodla-wiedzy <katalog z txt/csv> src/backend/Busola.Api/Agent/Knowledge
Najpierw docx/xlsx -> txt/csv (LibreOffice):
  soffice --headless --convert-to "txt:Text (encoded):UTF8" --outdir <txt> zrodla-wiedzy/*/*.docx
  soffice --headless --convert-to csv:"Text - txt - csv (StarCalc)":44,34,76,1,,0,false,true,false,false,false,-1 --outdir <txt> zrodla-wiedzy/model-kompetencji.xlsx
Rozporządzenia nie są stąd: lepsze teksty są z API ELI Sejmu (pliki rozporzadzenie-*.md, ustawa-*.md)."""
import csv, glob, os, re, subprocess, sys

src, txt, out = sys.argv[1:4]


def clean(text):
    lines = [l.rstrip() for l in text.replace("\r", "").split("\n")]
    lines = [l for l in lines if not re.fullmatch(r"\s*\d{1,3}\s*", l)]  # same numery stron
    return re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()


def pdf(path, title, name):
    pages = subprocess.run(["pdftotext", path, "-"], capture_output=True, text=True, check=True).stdout.split("\f")
    body = [f"## s. {i}\n\n{clean(p)}" for i, p in enumerate(pages, 1) if clean(p)]
    open(os.path.join(out, name), "w").write(f"# {title}\n\nŹródło: plik zespołu „{os.path.basename(path)}”.\n\n" + "\n\n".join(body) + "\n")
    return len(body)


def docs(files, title, name, label):
    parts = [f"## {label(f)}\n\n{clean(open(f, encoding='utf-8-sig').read())}" for f in sorted(files)]
    open(os.path.join(out, name), "w").write(f"# {title}\n\n" + "\n\n".join(parts) + "\n")
    return len(parts)


n1 = pdf(f"{src}/ocena-okresowa/poradnik-kprm-oceny-okresowe.pdf",
         "Poradnik KPRM: Oceny okresowe w służbie cywilnej (2016)", "poradnik-oceny-okresowe.md")
n2 = pdf(f"{src}/pierwsza-ocena/poradnik-kprm-pierwsza-ocena.pdf",
         "Poradnik KPRM: Pierwsza ocena w służbie cywilnej (2016)", "poradnik-pierwsza-ocena.md")
n3 = docs(glob.glob(f"{txt}/arkusz-*.txt"), "Wzory arkuszy ocen (pliki docx zespołu)", "arkusze-ocen-wzory.md",
          lambda f: (lambda n: n[0].upper() + n[1:])(os.path.basename(f)[:-4].replace("-", " ")))
n4 = docs(glob.glob(f"{txt}/OSP*.txt"), "Przykładowe opisy stanowisk pracy (OSP) — wzory do doboru kryteriów", "przyklady-osp.md",
          lambda f: os.path.basename(f)[:-4])

# Model kompetencji: arkusz wstępu + po jednym arkuszu na kompetencję (wskaźnik × 5 poziomów).
sheets = sorted(glob.glob(f"{txt}/model-kompetencji-*.csv"))
intro = [s for s in sheets if s.endswith("-Model kompetencji.csv")]
md = ["# Model kompetencji w służbie cywilnej (14 kompetencji, wskaźniki behawioralne, 5 poziomów)", ""]
for s in intro:
    rows = [r for r in csv.reader(open(s, encoding="utf-8")) if any(c.strip() for c in r)]
    md += ["## Jak korzystać z modelu", ""] + list(dict.fromkeys(" | ".join(dict.fromkeys(c.strip() for c in r if c.strip())) for r in rows)) + [""]
competencies = 0
for s in sheets:
    if s in intro:
        continue
    rows = [r for r in csv.reader(open(s, encoding="utf-8")) if any(c.strip() for c in r)]
    name = rows[0][0].strip()
    header = next(i for i, r in enumerate(rows) if r and r[0].strip().lower().startswith("wskaźnik"))
    levels = [c.strip() for c in rows[header][1:]]
    md += [f"## Kompetencja: {name}", ""]
    for r in rows[header + 1:]:
        if not r[0].strip():
            continue
        md += [f"### {name}: {' '.join(r[0].split())}", ""] + [f"- {lvl}: {' '.join(v.split())}" for lvl, v in zip(levels, r[1:]) if v.strip()] + [""]
    competencies += 1
open(os.path.join(out, "model-kompetencji.md"), "w").write("\n".join(md))
print(f"poradnik okresowy: {n1} stron, poradnik pierwsza ocena: {n2} stron, arkusze: {n3}, OSP: {n4}, kompetencje: {competencies}")
