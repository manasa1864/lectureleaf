"""Minimal Groq client (OpenAI-compatible REST) with retries for rate limits and server errors."""
import logging
import time

import httpx

from . import config

BASE = "https://api.groq.com/openai/v1"
log = logging.getLogger("lectureleaf.groq")


class GroqError(Exception):
    pass


def _client() -> httpx.Client:  # separate function so tests can swap in a mock transport
    return httpx.Client(base_url=BASE, timeout=httpx.Timeout(180, connect=15))


def request(path: str, *, attempts: int = 5, **kwargs) -> dict:
    if not config.GROQ_API_KEY:
        raise GroqError("GROQ_API_KEY is not set")
    headers = {"Authorization": f"Bearer {config.GROQ_API_KEY}"}
    last = "unknown error"
    with _client() as client:
        for attempt in range(attempts):
            try:
                res = client.post(path, headers=headers, **kwargs)
            except (httpx.TimeoutException, httpx.TransportError) as exc:
                last = f"network error: {exc.__class__.__name__}"
                time.sleep(min(2 ** attempt, 20))
                continue
            if res.status_code == 200:
                return res.json()
            if res.status_code in (401, 403):
                raise GroqError("Groq rejected the API key")
            if res.status_code == 413:
                raise GroqError("audio chunk too large for Groq")
            if res.status_code == 429 or res.status_code >= 500:
                last = f"HTTP {res.status_code}"
                try:
                    wait = float(res.headers.get("retry-after", 0))
                except ValueError:
                    wait = 0
                time.sleep(min(max(wait, 2 ** attempt), 60))
                continue
            raise GroqError(f"HTTP {res.status_code}: {res.text[:200]}")
    raise GroqError(f"Groq kept failing ({last})")


_check_cache: dict = {"at": 0.0, "value": None}
_LLM_FALLBACKS = ["openai/gpt-oss-120b", "llama-3.3-70b-versatile", "openai/gpt-oss-20b", "qwen/qwen3-32b"]
_WHISPER_FALLBACKS = ["whisper-large-v3-turbo", "whisper-large-v3"]


def _pick(wanted: str, fallbacks: list[str], available: set[str]):
    """The configured model if Groq still offers it, otherwise the first available fallback."""
    for name in [wanted, *fallbacks]:
        if name in available:
            return name
    return None


def check() -> dict:
    """Is the key valid, and which transcription / notes models can we actually use? Cached for a few minutes.

    Groq retires models from time to time, so the configured names are only a preference."""
    if not config.GROQ_API_KEY:
        return {"status": "not_set", "whisper": None, "llm": None}
    if _check_cache["value"] and time.time() - _check_cache["at"] < 300:
        return _check_cache["value"]
    try:
        with _client() as client:
            res = client.get("/models", headers={"Authorization": f"Bearer {config.GROQ_API_KEY}"}, timeout=10)
        if res.status_code in (401, 403):
            value = {"status": "invalid_key", "whisper": None, "llm": None}
        elif res.status_code != 200:
            value = {"status": "error", "http": res.status_code, "whisper": None, "llm": None}
        else:
            ids = {m["id"] for m in res.json().get("data", [])}
            whisper = _pick(config.GROQ_WHISPER_MODEL, _WHISPER_FALLBACKS, ids)
            llm = _pick(config.GROQ_LLM_MODEL, _LLM_FALLBACKS, ids)
            value = {"status": "ok" if whisper and llm else "model_missing", "whisper": whisper, "llm": llm}
    except Exception:
        return {"status": "unreachable", "whisper": None, "llm": None}  # not cached: try again next time
    _check_cache.update(at=time.time(), value=value)
    return value
