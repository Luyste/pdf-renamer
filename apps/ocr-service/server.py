"""server.py — FastAPI wrapper around extract.py. The hosted service entrypoint."""

from __future__ import annotations

import asyncio
import base64
import tempfile
import traceback
from pathlib import Path

from fastapi import FastAPI, File, Request, UploadFile
from fastapi.responses import JSONResponse

import extract
from logging_setup import configure_logging, get_logger

configure_logging()

app = FastAPI()

ROSTER_PATH = Path(__file__).parent / "roster.txt"


def _load_roster() -> list[str]:
    if not ROSTER_PATH.exists():
        return []
    return [
        ln.strip()
        for ln in ROSTER_PATH.read_text("utf-8").splitlines()
        if ln.strip() and not ln.strip().startswith("#")
    ]


@app.post("/parse")
async def parse(request: Request, file: UploadFile = File(...)):
    log = get_logger(request.headers.get("x-request-id"))
    log.info(f"parse.start filename={file.filename!r}")

    tmp = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)
    tmp_path = Path(tmp.name)
    try:
        tmp.write(await file.read())
        tmp.close()

        roster = _load_roster()
        try:
            result = await asyncio.to_thread(extract.process, tmp_path, roster)
            out = result.to_dict()
            thumb = await asyncio.to_thread(extract.page_png, tmp_path, 110)
            out["thumb"] = base64.b64encode(thumb).decode("ascii")
            log.info(
                f"parse.done confident={out['confident']} "
                f"problems={len(out['problems'])}"
            )
        except Exception as e:
            log.error(f"parse.failed error={type(e).__name__}: {e}", exc_info=True)
            out = {
                "source": file.filename or tmp_path.name,
                "filename": None,
                "confident": False,
                "problems": [f"{type(e).__name__}: {e}"],
                "invoice": {}, "fulfil_date": {}, "customer": {},
                "ocr_dump": {"_traceback": traceback.format_exc()},
            }

        return JSONResponse(out)
    finally:
        tmp_path.unlink(missing_ok=True)


@app.get("/health")
async def health(request: Request):
    log = get_logger(request.headers.get("x-request-id"))
    lang = extract.ocr_lang()
    log.info(f"health.checked ocr_lang={lang}")
    return {"ocr_lang": lang}
