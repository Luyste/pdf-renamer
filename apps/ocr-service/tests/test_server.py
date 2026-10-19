"""The FastAPI service the worker calls, plus its JSON log format."""

import base64
import json
import logging
import tempfile

import pytest
from fastapi.testclient import TestClient

import extract
import server
from logging_setup import JsonFormatter
from tests.conftest import EXPECTED_FILENAME


@pytest.fixture
def client(monkeypatch, tmp_path):
    monkeypatch.setattr(extract, "_LANG_CACHE", "hun+eng")
    monkeypatch.setattr(server, "ROSTER_PATH", tmp_path / "no-roster.txt")
    # Uploads are spooled to a temp file; point that at tmp_path so the test
    # can check nothing is left behind.
    spool = tmp_path / "spool"
    spool.mkdir()
    monkeypatch.setattr(tempfile, "tempdir", str(spool))
    return TestClient(server.app)


def post_pdf(client, data: bytes, name="scan.pdf"):
    return client.post(
        "/parse",
        files={"file": (name, data, "application/pdf")},
        headers={"X-Request-Id": "req-1"},
    )


def test_parse_returns_the_result_and_a_thumbnail(client, text_pdf, tmp_path):
    res = post_pdf(client, text_pdf.read_bytes())

    assert res.status_code == 200
    body = res.json()
    assert body["filename"] == EXPECTED_FILENAME
    assert body["confident"] is True
    assert base64.b64decode(body["thumb"]).startswith(b"\x89PNG")
    assert list((tmp_path / "spool").iterdir()) == []


def test_a_broken_pdf_is_a_problem_in_the_result_not_a_server_error(
    client, tmp_path
):
    # The worker retries 5xx as a cold start, so a bad file must come back
    # as a normal result the UI can show.
    res = post_pdf(client, b"not a pdf at all", name="broken.pdf")

    assert res.status_code == 200
    body = res.json()
    assert body["source"] == "broken.pdf"
    assert body["filename"] is None
    assert body["confident"] is False
    assert body["problems"]
    assert list((tmp_path / "spool").iterdir()) == []


def test_parse_snaps_the_customer_to_the_roster(client, monkeypatch, tmp_path):
    roster = tmp_path / "roster.txt"
    roster.write_text("# customers\n\nKovács Kft.\n", "utf-8")
    monkeypatch.setattr(server, "ROSTER_PATH", roster)
    pdf = tmp_path / "t.pdf"
    from tests.conftest import make_pdf

    make_pdf(pdf)

    body = post_pdf(client, pdf.read_bytes()).json()

    assert body["customer"]["value"] == "Kovács Kft."


def test_parse_without_a_file_is_rejected(client):
    assert client.post("/parse").status_code == 422


def test_health_reports_the_ocr_language(client):
    res = client.get("/health")

    assert res.json() == {"ocr_lang": "hun+eng"}


def test_roster_skips_blank_lines_and_comments(monkeypatch, tmp_path):
    roster = tmp_path / "roster.txt"
    roster.write_text("# header\n\n  Acme Kft  \n#Old Name\nBeta Bt\n", "utf-8")
    monkeypatch.setattr(server, "ROSTER_PATH", roster)

    assert server._load_roster() == ["Acme Kft", "Beta Bt"]


def test_missing_roster_means_no_roster(monkeypatch, tmp_path):
    monkeypatch.setattr(server, "ROSTER_PATH", tmp_path / "absent.txt")

    assert server._load_roster() == []


def test_log_lines_are_json_tagged_with_the_request_id():
    record = logging.makeLogRecord(
        {"msg": "parse.start", "levelname": "INFO", "requestId": "req-9"}
    )

    line = json.loads(JsonFormatter().format(record))

    assert line["msg"] == "parse.start"
    assert line["level"] == "info"
    assert line["requestId"] == "req-9"
    assert line["source"] == "ocr-service"
    assert line["instanceId"]
