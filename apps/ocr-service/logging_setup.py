"""Structured JSON logging — the container's equivalent of the worker's
pino-style logger. Each container instance gets a stable id (logged on
every line) so multiple concurrent instances can be told apart; each
request's logs carry the same requestId the worker generated, so a single
search finds the full web -> worker -> container trace for one failure.

Container stdout/stderr is captured by Cloudflare and surfaces alongside
the worker's logs — see the "viewing logs" notes in the README.
"""

from __future__ import annotations

import json
import logging
import sys
import uuid

INSTANCE_ID = uuid.uuid4().hex[:12]


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict = {
            "time": self.formatTime(record, "%Y-%m-%dT%H:%M:%S"),
            "level": record.levelname.lower(),
            "msg": record.getMessage(),
            "source": "ocr-service",
            "instanceId": INSTANCE_ID,
        }
        request_id = getattr(record, "requestId", None)
        if request_id:
            payload["requestId"] = request_id
        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)
        return json.dumps(payload)


def configure_logging() -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(logging.INFO)


def get_logger(request_id: str | None = None) -> logging.LoggerAdapter:
    """A logger pre-tagged with a requestId, for one request's lifetime."""
    return logging.LoggerAdapter(
        logging.getLogger("ocr_service"), {"requestId": request_id}
    )
