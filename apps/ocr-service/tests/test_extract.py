"""Unit tests for the pure parsing/filename logic in extract.py.

No PDFs, no OCR, no subprocesses — these exercise the regex/string logic
directly so they run fast and don't need tesseract installed.
"""

from datetime import date

from extract import (
    Result,
    build_filename,
    parse_customer,
    parse_fulfil_date,
    parse_invoice,
    slug,
    validate,
)


class TestSlug:
    def test_pascal_cases_and_keeps_accents(self):
        assert (
            slug("Fót és Környéke Természet- és Állatvédő Egyesüle")
            == "FótÉsKörnyékeTermészetÉsÁllatvédőEgyesüle"
        )

    def test_strips_illegal_filesystem_characters(self):
        assert slug('Horváth / Ildikó: "Ltd"') == "HorváthIldikóLtd"

    def test_single_word(self):
        assert slug("acme") == "Acme"

    def test_collapses_whitespace_runs(self):
        assert slug("foo   bar") == "FooBar"


class TestParseInvoice:
    def test_matches_labelled_line(self):
        text = "Egyéb szöveg\nSorszám: SPRVT-2026-9529\nTöbb szöveg"
        f = parse_invoice(text)
        assert f.ok
        assert f.value == "SPRVT-2026-9529"

    def test_prefers_labelled_line_over_other_matches(self):
        text = "Megrendelés: NOPE-2020-0001\nSorszám: SPRVT-2026-9529"
        f = parse_invoice(text)
        assert f.ok
        assert f.value == "SPRVT-2026-9529"

    def test_no_match_is_not_ok(self):
        f = parse_invoice("nothing relevant here")
        assert not f.ok
        assert f.value is None


class TestParseFulfilDate:
    def test_matches_teljesites_line(self):
        text = "Teljesítés dátuma: 2026.08.01"
        f = parse_fulfil_date(text)
        assert f.ok
        assert f.value == date(2026, 8, 1).isoformat()

    def test_ignores_other_dates_on_page(self):
        text = (
            "Kiállítás: 2026.07.15\n"
            "Teljesítés dátuma: 2026.08.01\n"
            "Fizetési határidő: 2026.08.20"
        )
        f = parse_fulfil_date(text)
        assert f.value == "2026-08-01"

    def test_rejects_impossible_date(self):
        f = parse_fulfil_date("Teljesítés dátuma: 2026.13.40")
        assert not f.ok

    def test_rejects_out_of_range_year(self):
        f = parse_fulfil_date("Teljesítés dátuma: 1990.01.01")
        assert not f.ok


class TestParseCustomer:
    def test_takes_first_line_under_heading(self):
        text = "VEVŐ\nFót és Környéke Egyesület\nEgyéb cím sor"
        f = parse_customer(text)
        assert f.ok
        assert f.value == "Fót és Környéke Egyesület"

    def test_snaps_to_roster_on_close_match(self):
        text = "VEVŐ\nFot es Kornyeke Egyesulet"
        f = parse_customer(text, roster=["Fót és Környéke Egyesület"])
        assert f.ok
        assert f.value == "Fót és Környéke Egyesület"

    def test_not_in_roster_is_not_ok(self):
        text = "VEVŐ\nValaki Más Kft"
        f = parse_customer(text, roster=["Fót és Környéke Egyesület"])
        assert not f.ok
        assert f.value == "Valaki Más Kft"


class TestBuildFilename:
    def test_full_pipeline(self):
        r = Result(source="x.pdf")
        r.invoice = parse_invoice("Sorszám: SPRVT-2026-9529")
        r.fulfil_date = parse_fulfil_date("Teljesítés dátuma: 2026.08.01")
        r.customer = parse_customer("VEVŐ\nFót és Környéke Egyesüle")
        assert (
            build_filename(r)
            == "2026.08.01-SPRVT-2026-9529-FótÉsKörnyékeEgyesüle.pdf"
        )

    def test_missing_field_yields_no_filename(self):
        r = Result(source="x.pdf")
        assert build_filename(r) is None


class TestValidate:
    def test_flags_year_mismatch(self):
        r = Result(source="x.pdf")
        r.invoice = parse_invoice("Sorszám: SPRVT-2025-9529")
        r.fulfil_date = parse_fulfil_date("Teljesítés dátuma: 2026.08.01")
        r.customer = parse_customer("VEVŐ\nFót Egyesüle")
        validate(r)
        assert any("year mismatch" in p for p in r.problems)

    def test_no_problems_when_all_ok_and_consistent(self):
        r = Result(source="x.pdf")
        r.invoice = parse_invoice("Sorszám: SPRVT-2026-9529")
        r.fulfil_date = parse_fulfil_date("Teljesítés dátuma: 2026.08.01")
        r.customer = parse_customer("VEVŐ\nFót Egyesüle")
        validate(r)
        assert r.problems == []
        assert r.confident
