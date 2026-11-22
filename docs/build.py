#!/usr/bin/env python3
"""Markdown z docs/ -> PDF w układzie Busoli (docs/layout/busola.css).

Użycie: python docs/build.py [plik.md ...]   (bez argumentów: wszystkie docs/*.md)
Wynik: docs/pdf/<nazwa>.pdf
"""
import re
import sys
from html import escape, unescape
from pathlib import Path

import markdown
from weasyprint import HTML

DOCS = Path(__file__).resolve().parent
CSS = DOCS / "layout" / "busola.css"
OUT = DOCS / "pdf"


def build(src: Path) -> Path:
    body = markdown.markdown(
        src.read_text(encoding="utf-8"),
        extensions=["tables", "fenced_code", "sane_lists", "attr_list", "toc"],
    )
    # Guidelines (dostępność): PDF ma tytuł i język, tytuł to pierwszy nagłówek #.
    h1 = re.search(r"<h1[^>]*>(.*?)</h1>", body, re.S)
    title = unescape(re.sub(r"<[^>]+>", "", h1.group(1))) if h1 else src.stem
    html = (
        f'<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>{escape(title)}</title>'
        f'<link rel="stylesheet" href="{CSS.as_uri()}"></head><body>{body}</body></html>'
    )
    OUT.mkdir(exist_ok=True)
    out = OUT / f"{src.stem}.pdf"
    HTML(string=html, base_url=str(src.parent)).write_pdf(out, pdf_variant="pdf/ua-1")
    return out


if __name__ == "__main__":
    files = [Path(a) for a in sys.argv[1:]] or sorted(DOCS.glob("*.md"))
    for f in files:
        print(build(f))
