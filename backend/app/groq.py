"""Minimal Groq client (OpenAI-compatible REST) with retries for rate limits and server errors."""
import logging
import time

import httpx

from . import config

BASE = "https://api.groq.com/openai/v1"
log = logging.getLogger("lectureleaf.groq")


class GroqError(Exception):
    pass


class TooLarge(GroqError):
    """The request is bigger than the model's per-minute token limit allows. Send less."""


class BadJson(GroqError):
    """The model produced malformed JSON (Groq answers 400 json_validate_failed). Usually fine on a retry."""


class RateLimited(GroqError):
    """Still being rate limited after retrying. Another model has its own limit, so try that one."""


def _client() -> httpx.Client:  # separate function so tests can swap in a mock transport
    return httpx.Client(base_url=BASE, timeout=httpx.Timeout(180, connect=15))


def request(path: str, *, attempts: int = 5, max_wait: float = 60, **kwargs) -> dict:
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
                if "audio" in path:
                    raise GroqError("audio chunk too large for Groq")
                raise TooLarge("the request is too large for this model's token limit")
            if res.status_code == 429 or res.status_code >= 500:
                last = f"HTTP {res.status_code}"
                try:
                    wait = float(res.headers.get("retry-after", 0))
                except ValueError:
                    wait = 0
                if res.status_code == 429 and wait > max_wait:
                    # The limit won't lift soon. Rather than sitting idle, let the caller use another model or provider.
                    raise RateLimited(f"rate limited for {wait:.0f}s")
                time.sleep(min(max(wait, 2 ** attempt), 60))
                continue
            if res.status_code == 400 and "json_validate_failed" in res.text:
                raise BadJson("the model's JSON was malformed")
            raise GroqError(f"HTTP {res.status_code}: {res.text[:200]}")
    if last == "HTTP 429":
        raise RateLimited("rate limited")
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
            order = [config.GROQ_LLM_MODEL, *_LLM_FALLBACKS]
            models = [m for i, m in enumerate(order) if m in ids and m not in order[:i]]  # each has its own limits
            value = {"status": "ok" if whisper and llm else "model_missing", "whisper": whisper, "llm": llm, "llm_models": models}
    except Exception:
        value = {"status": "unreachable", "whisper": None, "llm": None}
        _check_cache.update(at=time.time() - 240, value=value)  # remembered for a minute, so a slow network isn't re-probed on every call
        return value
    _check_cache.update(at=time.time(), value=value)
    return value


def chat_json(system: str, user: str, *, temperature: float = 0.2, effort: str = "low", fast: bool = False) -> str:
    """One JSON-mode chat completion. If a model is busy (rate limited), the next available model is tried:
    every model has its own token limit, so this spreads the load. Raises TooLarge if the request itself is too big."""
    state = check()
    models = state.get("llm_models") or [state.get("llm") or config.GROQ_LLM_MODEL]
    last: GroqError = GroqError("no model available")
    for model in models:
        body = {
            "model": model, "temperature": temperature, "response_format": {"type": "json_object"},
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        }
        if model.startswith("openai/gpt-oss"):
            body["reasoning_effort"] = effort
        for attempt in range(2):  # a malformed answer is usually fine on a second try
            try:
                res = request("/chat/completions", json=body, attempts=2 if (fast or len(models) > 1) else 5,
                              max_wait=3 if (fast or len(models) > 1) else 60)
                return res["choices"][0]["message"]["content"]
            except BadJson as exc:
                log.info("%s returned malformed JSON (try %d)", model, attempt + 1)
                last = exc
            except RateLimited as exc:
                log.info("%s is rate limited; trying the next model", model)
                last = exc
                break
            except (KeyError, IndexError, TypeError):
                raise GroqError("the model returned an unreadable answer")
    raise last
