"""server.py — FastAPI wrapper around extract.py. The hosted service entrypoint."""

from __future__ import annotations

import asyncio
import base64
import tempfile
import traceback
from pathlib import Path

from fastapi import FastAPI, UploadFile, File
from fastapi.responses import JSONResponse

import extract

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
async def parse(file: UploadFile = File(...)):
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
        except Exception as e:
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
async def health():
    return {"ocr_lang": extract.ocr_lang()}
