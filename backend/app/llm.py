"""The one place the app asks an AI model to write or mark something.

Order: Groq first (fast), then OpenRouter as the backup when Groq is rate limited, over its token limit,
unavailable or has no working key. If neither is available the callers fall back to their offline versions."""
import logging

from . import config, groq, openrouter
from .groq import GroqError

log = logging.getLogger("lectureleaf.llm")


def _groq_usable() -> bool:
    """Try Groq unless it is known to be unusable. A passing hiccup while listing models doesn't count."""
    return bool(config.GROQ_API_KEY) and groq.check()["status"] not in ("not_set", "invalid_key", "model_missing")


def available() -> bool:
    return _groq_usable() or openrouter.check()["status"] == "ok"


def providers() -> dict:
    g, o = groq.check(), openrouter.check()
    return {"groq": g.get("status"), "openrouter": o["status"]}


def chat_json(system: str, user: str, *, temperature: float = 0.2, effort: str = "low") -> str:
    last: GroqError | None = None
    backup = openrouter.check()["status"] == "ok"
    if _groq_usable():
        try:
            return groq.chat_json(system, user, temperature=temperature, effort=effort, fast=backup)
        except GroqError as exc:  # rate limited, too large, malformed JSON, outage...
            last = exc
            if not backup:
                raise
            log.info("Groq couldn't answer (%s); trying OpenRouter", exc.__class__.__name__)
    if backup:
        try:
            return openrouter.chat_json(system, user, temperature=temperature, effort=effort)
        except GroqError as exc:
            last = exc
    raise last or GroqError("No AI model is available")
