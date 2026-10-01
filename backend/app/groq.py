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
