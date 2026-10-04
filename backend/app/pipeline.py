"""YouTube link -> distinct visual moments + transcript notes -> study PDF."""
import json
import logging
import os
import shutil
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor

import cv2

from . import config
from .db import get_client
from .errors import UserError
from . import groq, llm, local_asr, notes_local
from .groq import GroqError
from .media import chunk_audio, download_audio, download_video, fetch_info, local_info
from .notes import Section, Segment, build_notes, transcribe
from .pdf import PdfFrame, build_pdf
from .schemas import Settings
from .vision import detect_moments, limit_pages

log = logging.getLogger("lectureleaf.pipeline")

MAX_FRAMES = {"compact": 8, "balanced": 16, "detailed": 40}

# Indices match the steps shown on the Processing screen.
STEP_LOADED, STEP_DETECTED, STEP_CLEANED, STEP_ORGANIZING, STEP_PDF = range(5)


def fmt_time(seconds: float) -> str:
    s = int(seconds)
    h, rem = divmod(s, 3600)
    m, sec = divmod(rem, 60)
    return f"{h}:{m:02d}:{sec:02d}" if h else f"{m:02d}:{sec:02d}"


def _retry(fn, attempts: int = 4):
    """Run a Supabase call, retrying brief connection hiccups instead of failing the whole job."""
    for i in range(attempts):
        try:
            return fn()
        except Exception as exc:
            if i == attempts - 1:
                raise
            log.warning("Supabase call failed (%s), retrying", exc.__class__.__name__)
            time.sleep(1.5 * (i + 1))


def update(job_id: str, **fields) -> None:
    _retry(lambda: get_client().table("jobs").update(fields).eq("id", job_id).execute())


def update_progress(job_id: str, **fields) -> None:
    """Progress is only cosmetic: never let a failed progress write kill the job."""
    try:
        update(job_id, **fields)
    except Exception:
        log.warning("could not write progress for %s", job_id)


# ─────────────────────────── transcript (runs alongside frame detection) ───────────────────────────

def fetch_transcript(url: str, tmp: str, duration_s: float = 0, local_file: str | None = None) -> tuple[list[Segment], str]:
    """Never raises. Returns (segments, warning).

    Uses Groq when it is set up and healthy. Otherwise (no key, bad key, rate limited, down) it transcribes
    offline with a local Whisper model, so notes still get written."""
    state = groq.check()
    groq_state = "ok" if state["whisper"] else state["status"]
    local_ok = local_asr.available() and (not duration_s or duration_s <= config.LOCAL_ASR_MAX_MINUTES * 60)
    if groq_state != "ok" and not local_ok:
        why = {"not_set": "Transcription is turned off (no Groq key set)",
               "invalid_key": "The Groq API key was rejected"}.get(groq_state, "The transcription service is unavailable")
        return [], f"{why} and offline transcription isn't available, so the notes have no key points."
    try:
        os.makedirs(os.path.join(tmp, "audio"), exist_ok=True)
        audio = local_file or download_audio(url, os.path.join(tmp, "audio"))  # an upload already has its audio
        chunks = chunk_audio(audio, os.path.join(tmp, "audio"))
    except UserError as exc:
        return [], f"{exc} The notes have no key points."
    except Exception:
        log.exception("audio preparation failed")
        return [], "The audio couldn't be prepared, so the notes have no key points."

    reason = ""
    if groq_state == "ok":
        try:
            segments = transcribe(chunks)
            if segments:
                return segments, ""
            return [], "No speech was detected in this video, so the notes have no key points."
        except GroqError as exc:
            log.warning("Groq transcription failed: %s", exc)
            reason = "Groq transcription failed"
    else:
        reason = {"invalid_key": "The Groq API key was rejected", "unreachable": "Groq couldn't be reached"}.get(groq_state, "")
    if not local_ok:
        return [], f"{reason or 'Transcription failed'}, so the notes have no key points."
    try:
        segments = local_asr.transcribe(chunks, duration_s)
    except Exception:
        log.exception("offline transcription failed")
        return [], f"{reason or 'Transcription failed'}, and offline transcription failed too, so the notes have no key points."
    if not segments:
        return [], "No speech was detected in this video, so the notes have no key points."
    return segments, (f"{reason}; transcribed offline instead. " if reason else "") 


# ─────────────────────────── job runner ───────────────────────────

class Run:
    """Mutable state for one job so a failure can clean up whatever was already stored."""

    def __init__(self, job_id: str, user_id: str):
        self.job_id, self.user_id = job_id, user_id
        self.started = time.time()
        self.uploaded: list[str] = []

    def check_time(self) -> None:
        if time.time() - self.started > config.MAX_JOB_MINUTES * 60:
            raise UserError("Processing took too long and was stopped. Try a shorter lecture.")


def _cleanup(run: Run) -> None:
    db = get_client()
    try:
        _retry(lambda: db.table("job_frames").delete().eq("job_id", run.job_id).execute())
        if run.uploaded:
            _retry(lambda: db.storage.from_(config.STORAGE_BUCKET).remove(run.uploaded))
    except Exception:
        log.exception("cleanup failed for job %s", run.job_id)


def _upload(run: Run, remote: str, data: bytes, content_type: str) -> None:
    _retry(lambda: get_client().storage.from_(config.STORAGE_BUCKET).upload(
        remote, data, {"content-type": content_type, "upsert": "true"}
    ))
    run.uploaded.append(remote)


def run_job(job_id: str, user_id: str, url: str, s: Settings, local_file: str | None = None) -> None:
    run = Run(job_id, user_id)
    try:
        _run(run, url, s, local_file)
    except UserError as exc:
        _cleanup(run)
        update(job_id, status="error", error=str(exc)[:500])
    except Exception as exc:
        log.exception("job %s failed", job_id)
        _cleanup(run)
        update(job_id, status="error",
               error=f"Something went wrong while processing this lecture ({exc.__class__.__name__}). Please try again.")
    finally:
        if local_file:
            shutil.rmtree(os.path.dirname(local_file), ignore_errors=True)


def _run(run: Run, url: str, s: Settings, local_file: str | None = None) -> None:
    job_id, user_id = run.job_id, run.user_id
    update(job_id, status="processing", progress=3, step=STEP_LOADED)
    info = local_info(local_file, url.removeprefix("upload:")) if local_file else fetch_info(url)
    title = info.get("title") or "Untitled lecture"
    duration = float(info.get("duration") or 0)
    update(job_id, title=title, duration_s=int(duration), progress=8)

    warnings: list[str] = []
    with tempfile.TemporaryDirectory() as tmp, ThreadPoolExecutor(max_workers=1) as pool:
        video = local_file or download_video(url, os.path.join(tmp, "video"))
        update(job_id, progress=20, step=STEP_DETECTED)
        transcript_future = pool.submit(fetch_transcript, url, tmp, duration, local_file) if s.wants_text else None

        last_pct = [-1]

        def scan_progress(frac: float) -> None:
            run.check_time()
            pct = 20 + int(frac * 42)
            if pct != last_pct[0]:
                last_pct[0] = pct
                update_progress(job_id, progress=pct)

        moments = detect_moments(video, duration, s, scan_progress)
        update(job_id, progress=62, step=STEP_CLEANED)
        moments = limit_pages(moments, s.max_pages or MAX_FRAMES.get(s.page_density, 16))
        if not moments:
            raise UserError("No usable frames were found in this video.")
        if len(moments) == 1 and duration > 300:
            warnings.append("Only one distinct frame was found. This video may not contain slides or visuals.")

        update(job_id, progress=66, step=STEP_ORGANIZING)
        times = [int(m.t) for m in moments]
        sections = [Section() for _ in moments]
        summary = ""
        segments: list[Segment] = []
        if transcript_future:
            segments, warn = transcript_future.result()
            if warn:
                warnings.append(warn)
            run.check_time()
            update(job_id, progress=74)
            if segments:
                slide_texts = [m.text for m in moments]
                if llm.available():
                    sections, summary, warn = build_notes(title, times, segments, s.page_density, slide_texts)
                    if warn:
                        warnings.append(warn)
                # Whatever the LLM did not provide (or all of it, without Groq) comes from the transcript itself.
                had_llm = any(sec.heading for sec in sections)
                sections, summary = notes_local.fill_missing(
                    title, times, segments, sections, summary, s.page_density, slide_texts)
                if not had_llm:
                    warnings.append("Key points were picked from the transcript offline (no AI model), so they are "
                                    "less polished.")
        update(job_id, progress=82)

        base = f"{user_id}/{job_id}"
        rows, pdf_frames = [], []
        for i, (m, sec) in enumerate(zip(moments, sections), 1):
            t, img = m.t, m.frame
            local = os.path.join(tmp, f"frame_{i}.jpg")
            cv2.imwrite(local, img, [cv2.IMWRITE_JPEG_QUALITY, 88])
            remote = f"{base}/frame_{i}.jpg"
            with open(local, "rb") as fh:
                _upload(run, remote, fh.read(), "image/jpeg")
            rows.append({
                "job_id": job_id, "user_id": user_id, "position": i, "seconds": int(t),
                "time_label": fmt_time(t), "storage_path": remote,
                "heading": sec.heading or None, "key_points": sec.key_points,
                "ocr_text": m.text or None,
            })
            pdf_frames.append(PdfFrame(int(t), local, sec.heading, sec.key_points))
        _retry(lambda: get_client().table("job_frames").insert(rows).execute())

        transcript_path = None
        if segments:
            transcript_path = f"{base}/transcript.json"
            payload = json.dumps([{"start": g.start, "end": g.end, "text": g.text} for g in segments])
            _upload(run, transcript_path, payload.encode("utf-8"), "application/json")

        update(job_id, progress=90, step=STEP_PDF)
        pdf_local = os.path.join(tmp, "notes.pdf")
        build_pdf(pdf_local, title, pdf_frames, s, summary, int(duration))
        pdf_remote = f"{base}/notes.pdf"
        with open(pdf_local, "rb") as fh:
            _upload(run, pdf_remote, fh.read(), "application/pdf")

    update(
        job_id, status="done", progress=100, step=STEP_PDF + 1, pdf_path=pdf_remote, summary=summary or None,
        transcript_path=transcript_path, warning=" ".join(w.strip() for w in warnings if w.strip()) or None,
    )
