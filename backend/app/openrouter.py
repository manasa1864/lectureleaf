"""OpenRouter: a backup AI provider. One key gives access to many models, including free ones.

Used when Groq is rate limited, unavailable or has no key. Get a key at https://openrouter.ai/keys
OpenRouter has no speech-to-text, so transcription still uses Groq or the offline Whisper model."""
import base64
import json
import logging
import re
import time

import httpx

from . import config
from .gemini import PROMPT as PHOTO_PROMPT, _jpeg, GeminiError
from .groq import BadJson, GroqError, RateLimited, TooLarge

BASE = "https://openrouter.ai/api/v1"
log = logging.getLogger("lectureleaf.openrouter")

# Model names change often, so the configured one is only a preference. Free (":free") models come first.
_TEXT_FALLBACKS = [
    "openai/gpt-oss-120b:free", "meta-llama/llama-3.3-70b-instruct:free", "openai/gpt-oss-20b:free",
    "deepseek/deepseek-chat-v3-0324:free", "qwen/qwen3-235b-a22b:free", "google/gemini-2.0-flash-exp:free",
]
_VISION_FALLBACKS = ["google/gemini-2.0-flash-exp:free", "meta-llama/llama-3.2-11b-vision-instruct:free"]  # free only: never pick a paid model unasked


_TRUSTED = ("nvidia/", "google/", "qwen/", "openai/", "meta-llama/", "deepseek/", "mistralai/", "cohere/", "thinkingmachines/", "microsoft/")
_NOT_FOR_EXAMS = ("preview", "mini", "nano", "small", "lite", "tiny", "safety", "guard", "code", "coder", "embed", "moderation", "note")


def _quality(model: dict) -> float:
    """A rough guess at how good a model is for writing and marking exams, from its name.
    Bigger models from well-known makers score higher; previews, tiny and special-purpose ones are avoided."""
    name = str(model["id"]).lower()
    sizes = [float(x) for x in re.findall(r"(\d+(?:\.\d+)?)b", name)]
    score = min(max(sizes, default=10.0), 130.0)  # past ~100B a model is mostly slower, not better, for this work
    if name.startswith(_TRUSTED):
        score += 100
    if any(word in name for word in _NOT_FOR_EXAMS):
        score -= 400
    if "ultra" in name or "reasoning" in name:
        score -= 150  # heavy reasoning models take minutes on shared free capacity
    return score


def _client() -> httpx.Client:  # separate function so tests can swap in a mock transport
    return httpx.Client(base_url=BASE, timeout=httpx.Timeout(120, connect=15))


def _headers() -> dict:
    return {
        "Authorization": f"Bearer {config.OPENROUTER_API_KEY}",
        "HTTP-Referer": config.OPENROUTER_SITE_URL, "X-Title": "LectureLeaf",
    }


_check_cache: dict = {"at": 0.0, "value": None}
_avoid_until: dict[str, float] = {}   # model -> time until which it is tried last (it was busy or too slow)
TIMEOUT_S = 45                         # a model slower than this is abandoned for the next one
AVOID_FOR_S = 600


def _penalize(model: str) -> None:
    _avoid_until[model] = time.time() + AVOID_FOR_S


def _by_health(models: list[str]) -> list[str]:
    """Models that recently failed or timed out go last (but are not dropped: they may have recovered)."""
    now = time.time()
    return sorted(models, key=lambda m: _avoid_until.get(m, 0) > now)  # stable: keeps the quality order otherwise


def check() -> dict:
    """{'status': 'not_set'|'ok'|'invalid_key'|'no_model'|'unreachable', 'models': [text models], 'vision': name|None}. Cached."""
    empty = {"models": [], "vision": None}
    if not config.OPENROUTER_API_KEY:
        return {"status": "not_set", **empty}
    if _check_cache["value"] and time.time() - _check_cache["at"] < 300:
        return _check_cache["value"]
    try:
        with _client() as client:
            key = client.get("/key", headers=_headers(), timeout=10)
            if key.status_code in (401, 403):
                value = {"status": "invalid_key", **empty}
                _check_cache.update(at=time.time(), value=value)
                return value
            res = client.get("/models", headers=_headers(), timeout=15)
    except Exception:
        value = {"status": "unreachable", **empty}
        _check_cache.update(at=time.time() - 240, value=value)  # remembered for a minute, not re-probed on every call
        return value
    if res.status_code != 200:
        value = {"status": "unreachable", **empty}
        _check_cache.update(at=time.time() - 240, value=value)
        return value
    models = {m["id"]: m for m in res.json().get("data", []) if isinstance(m, dict) and m.get("id")}

    def can_json(m): return "response_format" in (m.get("supported_parameters") or []) or "structured_outputs" in (m.get("supported_parameters") or [])
    def sees_images(m): return "image" in ((m.get("architecture") or {}).get("input_modalities") or [])
    def free(m): return str(m["id"]).endswith(":free")
    def sees_only_images(m): return ((m.get("architecture") or {}).get("output_modalities") or ["text"]) == ["image"]

    wanted = [config.OPENROUTER_MODEL, *_TEXT_FALLBACKS]
    ordered = [i for n, i in enumerate(wanted) if i in models and i not in wanted[:n]]  # each model once
    # Beyond the named preferences, the best-looking free models. JSON mode isn't required: replies are parsed.
    extra = sorted((m for i, m in models.items() if free(m) and i not in ordered and not sees_only_images(m) and _quality(m) > 0),
                   key=_quality, reverse=True)
    ordered += [m["id"] for m in extra][:2]
    wanted_v = [config.OPENROUTER_VISION_MODEL, *_VISION_FALLBACKS]
    vision_models = [i for n, i in enumerate(wanted_v) if i in models and i not in wanted_v[:n]]
    seers = sorted((m for m in models.values() if free(m) and sees_images(m) and _quality(m) > 0 and m["id"] not in vision_models),
                   key=_quality, reverse=True)
    vision_models = (vision_models + [m["id"] for m in seers])[:3]  # each free model has its own busy periods
    vision = vision_models[0] if vision_models else None
    value = {"status": "ok" if ordered else "no_model", "models": ordered[:3], "vision": vision, "vision_models": vision_models, "_json": {i: can_json(models[i]) for i in ordered[:3]}}
    _check_cache.update(at=time.time(), value=value)
    return value


def _json_text(content: str) -> str:
    """The JSON object in a model's reply, even if it wrapped it in a code fence or added a sentence."""
    t = content.strip()
    t = re.sub(r"^```(?:json)?\s*|\s*```$", "", t)
    a, b = t.find("{"), t.rfind("}")
    return t[a:b + 1] if a != -1 and b > a else t


def _post(body: dict, attempts: int = 2) -> dict:
    last = "unknown error"
    with _client() as client:
        for attempt in range(attempts):
            try:
                res = client.post("/chat/completions", json=body, headers=_headers(), timeout=httpx.Timeout(TIMEOUT_S, connect=10))
            except httpx.TimeoutException:
                _penalize(body["model"])
                raise RateLimited(f"no answer within {TIMEOUT_S}s")  # too slow: hand over to the next model now
            except httpx.TransportError as exc:
                last = exc.__class__.__name__
                time.sleep(2 ** attempt)
                continue
            if res.status_code == 200:
                data = res.json()
                if data.get("error"):  # OpenRouter sometimes returns 200 with an error body
                    code = (data["error"] or {}).get("code")
                    if code == 429:
                        raise RateLimited("rate limited")
                    raise GroqError(f"OpenRouter error: {str(data['error'])[:160]}")
                return data
            if res.status_code in (401, 403):
                raise GroqError("OpenRouter rejected the API key")
            if res.status_code == 402:
                raise GroqError("The OpenRouter account is out of credits for this model")
            if res.status_code == 429:
                last = "HTTP 429"
                time.sleep(2 ** attempt)
                continue
            if res.status_code in (404, 503):
                raise RateLimited("model unavailable")  # try the next model
            text = res.text.lower()
            if res.status_code in (400, 413) and ("context" in text or "too large" in text or "maximum" in text or "tokens" in text):
                raise TooLarge("the request is too large for this model")
            if res.status_code >= 500:
                last = f"HTTP {res.status_code}"
                time.sleep(2 ** attempt)
                continue
            raise GroqError(f"OpenRouter HTTP {res.status_code}: {res.text[:160]}")
    if last == "HTTP 429":
        raise RateLimited("rate limited")
    raise GroqError(f"OpenRouter kept failing ({last})")


def chat_json(system: str, user: str, *, temperature: float = 0.2, effort: str = "low") -> str:
    """One JSON reply. Each model has its own limits, so a busy model hands over to the next one."""
    state = check()
    if state["status"] != "ok":
        raise GroqError(f"OpenRouter isn't available ({state['status']})")
    last: GroqError = GroqError("no OpenRouter model available")
    for model in _by_health(state["models"]):
        body = {
            "model": model, "temperature": temperature,
            "messages": [{"role": "system", "content": system + "\nReply with a single JSON object and nothing else."}, {"role": "user", "content": user}],
        }
        if state.get("_json", {}).get(model):
            body["response_format"] = {"type": "json_object"}
        try:
            data = _post(body)
            text = _json_text(data["choices"][0]["message"]["content"] or "")
            json.loads(text)  # a reply that isn't JSON counts as a failure of this model
            return text
        except (RateLimited, BadJson) as exc:
            _penalize(model)
            last = exc
        except (ValueError, KeyError, IndexError, TypeError):
            _penalize(model)
            last = BadJson("the model's reply wasn't valid JSON")
    raise last


def read_image(raw: bytes) -> str:
    """Transcribe a photo of notes with a vision model, trying the next one if a free model is busy.
    Raises GeminiError so the photo reader can fall through to the built-in OCR."""
    state = check()
    if state["status"] != "ok" or not state.get("vision_models"):
        raise GeminiError("no OpenRouter vision model available")
    data_url = "data:image/jpeg;base64," + base64.b64encode(_jpeg(raw)).decode()
    last = "unknown error"
    for model in _by_health(state["vision_models"]):
        body = {
            "model": model, "temperature": 0,
            "messages": [{"role": "user", "content": [{"type": "text", "text": PHOTO_PROMPT}, {"type": "image_url", "image_url": {"url": data_url}}]}],
        }
        try:
            data = _post(body, attempts=2)
            text = (data["choices"][0]["message"]["content"] or "").strip()
            if text:
                return text
            last = "empty reply"
        except (RateLimited, BadJson) as exc:
            _penalize(model)
            last = str(exc)
        except (GroqError, KeyError, IndexError, TypeError) as exc:
            raise GeminiError(f"OpenRouter couldn't read the photo ({exc})")
    raise GeminiError(f"OpenRouter couldn't read the photo ({last})")
