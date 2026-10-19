"""extract.process and the OCR plumbing around it, on generated PDFs.

Tesseract is faked except in the one test marked as needing it, which is
skipped when the binary is missing.
"""

import json
import shutil
import subprocess

import pytest

import extract
from tests.conftest import EXPECTED_FILENAME, make_pdf


@pytest.fixture(autouse=True)
def fixed_lang(monkeypatch):
    monkeypatch.setattr(extract, "_LANG_CACHE", "hun+eng")


def fail_if_called(*_args, **_kwargs):
    raise AssertionError("OCR should not run for a PDF with a text layer")


class TestProcess:
    def test_reads_the_text_layer_without_ocr(self, text_pdf, monkeypatch):
        monkeypatch.setattr(extract, "ocr", fail_if_called)

        r = extract.process(text_pdf)

        assert r.filename == EXPECTED_FILENAME
        assert r.confident
        assert r.fulfil_date.value == "2026-03-15"  # not the Kiállítás date
        assert r.ocr_dump["_source"] == "embedded text layer"

    def test_ocrs_each_region_of_a_scan(self, scanned_pdf, monkeypatch):
        texts = iter(
            [
                "Sorszám: ABC-2026-0042",
                "Teljesítés dátuma: 2026.03.15",
                "VEVŐ\nKovács Kft",
            ]
        )
        calls = []

        def fake_ocr(png, psm=6):
            assert png.startswith(b"\x89PNG")
            calls.append(psm)
            return next(texts)

        monkeypatch.setattr(extract, "ocr", fake_ocr)

        r = extract.process(scanned_pdf)

        assert r.filename == EXPECTED_FILENAME
        assert calls == [6, 6, 6]
        assert r.ocr_dump["_source"] == "OCR (hun+eng)"

    def test_falls_back_to_full_page_ocr_for_a_missed_field(
        self, scanned_pdf, monkeypatch
    ):
        texts = iter(
            [
                "Sorszám: ABC-2026-0042",
                "Teljesítés dátuma: 2026.03.15",
                "",  # customer box came back empty
                "VEVŐ\nKovács Kft\n1234 Budapest",
            ]
        )
        calls = []

        def fake_ocr(png, psm=6):
            calls.append(psm)
            return next(texts)

        monkeypatch.setattr(extract, "ocr", fake_ocr)

        r = extract.process(scanned_pdf)

        assert calls == [6, 6, 6, 4]
        assert r.customer.value == "Kovács Kft"
        assert r.filename == EXPECTED_FILENAME
        assert "_fullpage_retry" in r.ocr_dump

    def test_reports_fields_it_could_not_read(self, tmp_path, monkeypatch):
        pdf = make_pdf(tmp_path / "blank.pdf", lines=[], scanned=True)
        monkeypatch.setattr(extract, "ocr", lambda png, psm=6: "")

        r = extract.process(pdf)

        assert r.filename is None
        assert not r.confident
        assert len(r.problems) == 3

    @pytest.mark.skipif(not shutil.which("tesseract"), reason="needs tesseract")
    def test_real_tesseract_reads_a_scan(self, scanned_pdf, monkeypatch):
        monkeypatch.setattr(extract, "_LANG_CACHE", None)

        r = extract.process(scanned_pdf, roster=["Kovács Kft"])

        assert r.filename == EXPECTED_FILENAME, r.ocr_dump


class TestOcrPlumbing:
    def test_ocr_pipes_png_through_tesseract(self, monkeypatch):
        seen = {}

        def fake_run(cmd, input, capture_output, timeout):
            seen.update(cmd=cmd, input=input, timeout=timeout)
            return subprocess.CompletedProcess(cmd, 0, stdout=b"Sorsz\xc3\xa1m \xff")

        monkeypatch.setattr(subprocess, "run", fake_run)

        out = extract.ocr(b"png-bytes", psm=4)

        assert seen["cmd"] == [
            "tesseract", "stdin", "stdout", "--psm", "4", "-l", "hun+eng"
        ]
        assert seen["input"] == b"png-bytes"
        assert out == "Sorszám �"  # bad bytes replaced, not fatal

    def test_ocr_lang_uses_hungarian_when_installed(self, monkeypatch):
        monkeypatch.setattr(extract, "_LANG_CACHE", None)
        monkeypatch.setattr(
            subprocess,
            "run",
            lambda *a, **k: subprocess.CompletedProcess(
                a, 0, stdout="List of available languages (2):\neng\nhun\n"
            ),
        )

        assert extract.ocr_lang() == "hun+eng"

    def test_ocr_lang_falls_back_to_english(self, monkeypatch):
        monkeypatch.setattr(extract, "_LANG_CACHE", None)

        def missing(*_a, **_k):
            raise FileNotFoundError("tesseract")

        monkeypatch.setattr(subprocess, "run", missing)

        assert extract.ocr_lang() == "eng"

    def test_page_png_renders_page_one(self, text_pdf):
        assert extract.page_png(text_pdf).startswith(b"\x89PNG")


class TestCli:
    def run(self, monkeypatch, capsys, *args):
        monkeypatch.setattr("sys.argv", ["extract.py", *args])
        code = extract.main()
        return code, json.loads(capsys.readouterr().out)

    def test_prints_one_json_result(self, text_pdf, tmp_path, monkeypatch, capsys):
        roster = tmp_path / "roster.txt"
        roster.write_text("Kovács Kft\n", "utf-8")
        thumb = tmp_path / "thumb.png"

        code, out = self.run(
            monkeypatch, capsys, str(text_pdf), "--roster", str(roster),
            "--thumb", str(thumb),
        )

        assert code == 0
        assert out["filename"] == EXPECTED_FILENAME
        assert thumb.read_bytes().startswith(b"\x89PNG")

    def test_reports_errors_in_the_json_and_still_exits_0(
        self, tmp_path, monkeypatch, capsys
    ):
        code, out = self.run(monkeypatch, capsys, str(tmp_path / "missing.pdf"))

        assert code == 0
        assert out["filename"] is None
        assert out["problems"]
