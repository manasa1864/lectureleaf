"""Offline transcription (faster-whisper on the CPU). Used when Groq is missing, invalid or failing.

Audio is decoded with ffmpeg and passed in as raw samples, so the library's own audio decoder (PyAV)
is never needed. Speech in other languages (including Hindi-English mixes) is translated to English so the
notes are always in English."""
import importlib.util
import os
import logging
import subprocess
import threading

import numpy as np

from . import config
from .notes import Segment

log = logging.getLogger("lectureleaf.asr")
os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")

_models: dict = {}
_lock = threading.Lock()  # models are shared by all jobs; transcribe one chunk at a time


def available() -> bool:
    return importlib.util.find_spec("faster_whisper") is not None


def model_name(duration_s: float) -> str:
    if config.LOCAL_WHISPER_MODEL != "auto":
        return config.LOCAL_WHISPER_MODEL
    return "small" if duration_s <= 25 * 60 else "base"  # bigger is more accurate but slower on a CPU


def _get_model(name: str):
    if name not in _models:
        from faster_whisper import WhisperModel

        log.info("loading local Whisper model '%s' (the first use downloads it)", name)
        _models[name] = WhisperModel(name, device="cpu", compute_type="int8")
    return _models[name]


def _samples(path: str) -> np.ndarray:
    raw = subprocess.run(
        ["ffmpeg", "-nostdin", "-loglevel", "error", "-i", path, "-f", "f32le", "-ac", "1", "-ar", "16000", "-"],
        capture_output=True, check=True, timeout=600,
    ).stdout
    return np.frombuffer(raw, np.float32)


def transcribe(chunks: list[tuple[int, str]], duration_s: float = 0) -> list[Segment]:
    segments: list[Segment] = []
    with _lock:
        model = _get_model(model_name(duration_s))
        task = None
        for offset, path in chunks:
            audio = _samples(path)
            if audio.size == 0:
                continue
            if task is None:  # decide once per lecture from its first chunk
                lang, prob, _ = model.detect_language(audio[: 16000 * 30])
                task = "transcribe" if lang == "en" else "translate"
                log.info("detected language %s (%.0f%%): %s", lang, prob * 100, task)
            found, _ = model.transcribe(audio, task=task, beam_size=1, vad_filter=True, condition_on_previous_text=False)
            for seg in found:
                text = seg.text.strip()
                if text and seg.no_speech_prob < 0.85:
                    segments.append(Segment(offset + seg.start, offset + seg.end, text))
    return segments
