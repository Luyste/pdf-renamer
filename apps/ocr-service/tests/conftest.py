"""Unit tests configuration module."""

from pathlib import Path

import pymupdf
import pytest

# Text placed inside the REGIONS boxes in extract.py on an A4 page (points).
INVOICE_LINES = [
    (365, 195, "Sorszám: ABC-2026-0042"),
    (305, 250, "Teljesítés dátuma: 2026.03.15"),
    (305, 266, "Kiállítás dátuma: 2026.03.20"),
    (25, 240, "VEVO"),
    (25, 256, "Kovács Kft"),
]
EXPECTED_FILENAME = "2026.03.15-ABC-2026-0042-KovácsKft.pdf"


def make_pdf(path: Path, lines=INVOICE_LINES, scanned: bool = False) -> Path:
    """Write a one-page A4 invoice. `scanned` flattens it to an image, like
    the customer's 200 dpi scanner output, so there is no text layer and
    extract.process has to OCR it."""
    doc = pymupdf.open()
    page = doc.new_page(width=595, height=842)
    for x, y, text in lines:
        page.insert_text((x, y), text, fontsize=11)
    if scanned:
        pix = page.get_pixmap(dpi=200)
        doc = pymupdf.open()
        doc.new_page(width=595, height=842).insert_image(
            pymupdf.Rect(0, 0, 595, 842), pixmap=pix
        )
    doc.save(path)
    return path


@pytest.fixture
def text_pdf(tmp_path: Path) -> Path:
    return make_pdf(tmp_path / "text.pdf")


@pytest.fixture
def scanned_pdf(tmp_path: Path) -> Path:
    return make_pdf(tmp_path / "scan.pdf", scanned=True)
