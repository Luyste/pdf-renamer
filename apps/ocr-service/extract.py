"""
extract.py — core pipeline. No web dependencies.

Flow per PDF:
  rasterize region -> preprocess -> OCR -> regex on anchor labels
  -> normalise -> validate -> confidence score -> filename
"""

from __future__ import annotations

import re
import subprocess
import unicodedata
from dataclasses import dataclass, field, asdict
from datetime import date
from difflib import get_close_matches
from pathlib import Path

import pymupdf

# --------------------------------------------------------------------------
# Config
# --------------------------------------------------------------------------

OCR_LANG = "hun+eng"      # falls back to "eng" automatically if hun missing
OCR_DPI = 300             # 200dpi source; 300 render gives tesseract more to chew on

# Regions as fractions of the page (x0, y0, x1, y1).
# Fractions, not pixels, so this survives A4 vs Letter and any DPI change.
# Deliberately generous — a bit of surrounding noise is harmless because we
# anchor on label text, but a clipped digit is fatal.
REGIONS = {
    "invoice": (0.60, 0.19, 1.00, 0.26),
    "dates":   (0.50, 0.25, 1.00, 0.35),
    "customer": (0.03, 0.26, 0.45, 0.35),
}

# Full-page OCR is the fallback when a region anchor fails.
FULLPAGE = (0.0, 0.0, 1.0, 0.55)   # top half only; bottom is stamp + footer noise

DATE_RE = r"(\d{4})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{1,2})"
INVOICE_RE = r"([A-Z]{2,10})\s*[-–—]\s*(\d{4})\s*[-–—]\s*(\d{1,6})"

# OCR routinely confuses these in all-caps prefixes and digit runs.
DIGIT_FIXES = str.maketrans({"O": "0", "o": "0", "l": "1", "I": "1", "|": "1", "S": "5"})

# --------------------------------------------------------------------------
# Result types
# --------------------------------------------------------------------------

@dataclass
class Field:
    value: str | None = None
    raw: str = ""             # what OCR actually returned, for the review screen
    ok: bool = False
    note: str = ""


@dataclass
class Result:
    source: str
    invoice: Field = field(default_factory=Field)
    fulfil_date: Field = field(default_factory=Field)
    customer: Field = field(default_factory=Field)
    filename: str | None = None
    problems: list[str] = field(default_factory=list)
    ocr_dump: dict[str, str] = field(default_factory=dict)

    @property
    def confident(self) -> bool:
        return not self.problems and all(
            f.ok for f in (self.invoice, self.fulfil_date, self.customer)
        )

    def to_dict(self) -> dict:
        d = asdict(self)
        d["confident"] = self.confident
        return d


# --------------------------------------------------------------------------
# OCR
# --------------------------------------------------------------------------

_LANG_CACHE: str | None = None


def ocr_lang() -> str:
    """Use hun+eng if the Hungarian pack is installed, else eng."""
    global _LANG_CACHE
    if _LANG_CACHE is None:
        try:
            out = subprocess.run(
                ["tesseract", "--list-langs"], capture_output=True, text=True, timeout=15
            ).stdout
            _LANG_CACHE = OCR_LANG if "hun" in out.split() else "eng"
        except Exception:
            _LANG_CACHE = "eng"
    return _LANG_CACHE


def render(page: pymupdf.Page, box: tuple[float, float, float, float], dpi: int = OCR_DPI) -> bytes:
    """Render a normalised region of the page to PNG bytes."""
    r = page.rect
    clip = pymupdf.Rect(
        box[0] * r.width, box[1] * r.height, box[2] * r.width, box[3] * r.height
    )
    return page.get_pixmap(dpi=dpi, clip=clip).tobytes("png")


def ocr(png: bytes, psm: int = 6) -> str:
    """Run tesseract on PNG bytes via stdin/stdout. No temp files."""
    p = subprocess.run(
        ["tesseract", "stdin", "stdout", "--psm", str(psm), "-l", ocr_lang()],
        input=png, capture_output=True, timeout=60,
    )
    return p.stdout.decode("utf-8", "replace")


# --------------------------------------------------------------------------
# Parsing
# --------------------------------------------------------------------------

def _norm(s: str) -> str:
    """Strip accents and lowercase — for matching labels only, never values.

    OCR mangles Hungarian accents constantly ('Teljesítés' -> 'Teljesités'),
    so label matching must be accent-blind.
    """
    return "".join(
        c for c in unicodedata.normalize("NFD", s.lower())
        if unicodedata.category(c) != "Mn"
    )


def parse_invoice(text: str) -> Field:
    """Sorszám: PREFIX-YYYY-NNNN. Prefer the line carrying the label."""
    lines = text.splitlines()
    hits = [ln for ln in lines if "sorsz" in _norm(ln)] or lines

    for ln in hits:
        body = re.sub(r"(?i)sorsz\w*\s*:?", " ", ln)
        m = re.search(INVOICE_RE, body.upper())
        if m:
            prefix = re.sub(r"[^A-Z]", "", m.group(1))
            year = m.group(2).translate(DIGIT_FIXES)
            seq = m.group(3).translate(DIGIT_FIXES)
            if not prefix:
                continue
            return Field(f"{prefix}-{year}-{seq}", ln.strip(), True)

    return Field(None, text.strip()[:120], False, "no PREFIX-YEAR-NUMBER pattern found")


def parse_fulfil_date(text: str) -> Field:
    """The 'Teljesítés dátuma' line specifically.

    The page carries three dates (teljesítés / kiállítás / fizetési határidő)
    and they differ. Never take 'the first date on the page'.
    """
    for ln in text.splitlines():
        n = _norm(ln)
        if "teljesit" not in n:
            continue
        m = re.search(DATE_RE, ln)
        if not m:
            continue
        y, mo, d = (int(g) for g in m.groups())
        try:
            dt = date(y, mo, d)
        except ValueError:
            return Field(None, ln.strip(), False, f"impossible date {y}-{mo}-{d}")
        if not (2000 <= y <= date.today().year + 1):
            return Field(None, ln.strip(), False, f"year {y} out of range")
        return Field(dt.isoformat(), ln.strip(), True)

    return Field(None, text.strip()[:120], False, "'Teljesítés dátuma' label not found")


def parse_customer(text: str, roster: list[str] | None = None) -> Field:
    """First real line under the VEVŐ heading, then snap to the roster."""
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    start = 0
    for i, ln in enumerate(lines):
        if _norm(ln).startswith("vev"):
            start = i + 1
            break

    for ln in lines[start:]:
        if re.match(r"^\s*\d", ln):
            continue
        cleaned = re.sub(r"[^\w\s'\-.]", "", ln, flags=re.UNICODE).strip(" .-")
        if len(cleaned) < 3 or not re.search(r"[A-Za-zÁ-ű]", cleaned):
            continue

        if roster:
            hit = get_close_matches(cleaned, roster, n=1, cutoff=0.75)
            if hit:
                note = "" if hit[0] == cleaned else f"matched roster: '{cleaned}'"
                return Field(hit[0], ln, True, note)
            return Field(cleaned, ln, False, "not in customer roster")

        return Field(cleaned, ln, True)

    return Field(None, text.strip()[:120], False, "no name found under VEVŐ")


# --------------------------------------------------------------------------
# Filename
# --------------------------------------------------------------------------

def slug(name: str) -> str:
    """PascalCase a name into a filename-safe run, keeping accents as-is.

    Fót és Környéke Természet- és Állatvédő Egyesüle -> FótÉsKörnyékeTermészetÉsÁllatvédőEgyesüle
    """
    s = unicodedata.normalize("NFC", name)
    out = []
    for word in re.split(r"\s+", s.strip()):
        word = re.sub(r'[\\/:*?"<>|]+', "", word).strip("._-")
        if not word:
            continue
        out.append(word[0].upper() + word[1:])
    return "".join(out)


def build_filename(r: Result) -> str | None:
    if not (r.invoice.value and r.fulfil_date.value and r.customer.value):
        return None
    d = r.fulfil_date.value.replace("-", ".")
    return f"{d}-{r.invoice.value}-{slug(r.customer.value)}.pdf"


# --------------------------------------------------------------------------
# Cross-field validation
# --------------------------------------------------------------------------

def validate(r: Result) -> None:
    for label, f in (("invoice no.", r.invoice), ("fulfilment date", r.fulfil_date),
                     ("customer", r.customer)):
        if not f.ok:
            r.problems.append(f"{label}: {f.note or 'not read'}")

    if r.invoice.value and r.fulfil_date.value:
        inv_year = r.invoice.value.split("-")[1]
        if inv_year != r.fulfil_date.value[:4]:
            r.problems.append(
                f"year mismatch: invoice says {inv_year}, date says {r.fulfil_date.value[:4]}"
            )


# --------------------------------------------------------------------------
# Entry point
# --------------------------------------------------------------------------

def process(pdf_path: str | Path, roster: list[str] | None = None) -> Result:
    pdf_path = Path(pdf_path)
    r = Result(source=pdf_path.name)

    with pymupdf.open(pdf_path) as doc:
        if doc.page_count == 0:
            r.problems.append("PDF has no pages")
            return r
        page = doc[0]

        if page.get_text().strip():
            texts = {k: page.get_text() for k in REGIONS}
            r.ocr_dump["_source"] = "embedded text layer"
        else:
            texts = {k: ocr(render(page, box)) for k, box in REGIONS.items()}
            r.ocr_dump["_source"] = f"OCR ({ocr_lang()})"

        r.ocr_dump.update(texts)

        r.invoice = parse_invoice(texts["invoice"])
        r.fulfil_date = parse_fulfil_date(texts["dates"])
        r.customer = parse_customer(texts["customer"], roster)

        if not all(f.ok for f in (r.invoice, r.fulfil_date, r.customer)):
            wide = ocr(render(page, FULLPAGE), psm=4)
            r.ocr_dump["_fullpage_retry"] = wide
            if not r.invoice.ok:
                if (f := parse_invoice(wide)).ok:
                    r.invoice = f
            if not r.fulfil_date.ok:
                if (f := parse_fulfil_date(wide)).ok:
                    r.fulfil_date = f
            if not r.customer.ok:
                if (f := parse_customer(wide, roster)).ok:
                    r.customer = f

    validate(r)
    r.filename = build_filename(r)
    return r


def page_png(pdf_path: str | Path, dpi: int = 110) -> bytes:
    """Page 1 as PNG, for the review screen."""
    with pymupdf.open(pdf_path) as doc:
        return doc[0].get_pixmap(dpi=dpi).tobytes("png")


def main() -> int:
    """CLI contract (used for local testing only — the hosted service uses
    server.py, not this entrypoint):

        python extract.py FILE.pdf [--roster roster.txt] [--thumb out.png]

    Always prints exactly one JSON object to stdout, and always exits 0 —
    even on failure. Errors are reported in the JSON, never on stderr.
    """
    import argparse, json, sys, traceback

    ap = argparse.ArgumentParser()
    ap.add_argument("pdf")
    ap.add_argument("--roster", help="text file, one customer name per line")
    ap.add_argument("--thumb", help="also write page 1 as PNG to this path")
    ap.add_argument("--thumb-dpi", type=int, default=110)
    a = ap.parse_args()

    try:
        names = []
        if a.roster and Path(a.roster).exists():
            names = [ln.strip() for ln in
                     Path(a.roster).read_text("utf-8").splitlines() if ln.strip()]

        out = process(a.pdf, roster=names).to_dict()

        if a.thumb:
            Path(a.thumb).write_bytes(page_png(a.pdf, dpi=a.thumb_dpi))
            out["thumb"] = a.thumb

    except Exception as e:
        out = {
            "source": Path(a.pdf).name, "filename": None, "confident": False,
            "problems": [f"{type(e).__name__}: {e}"],
            "invoice": {}, "fulfil_date": {}, "customer": {},
            "ocr_dump": {"_traceback": traceback.format_exc()},
        }

    json.dump(out, sys.stdout, ensure_ascii=False)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
