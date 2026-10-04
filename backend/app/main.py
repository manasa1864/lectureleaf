import logging
import os
import shutil
import threading
import tempfile
import uuid
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response

from . import config, gemini, groq, llm, local_asr, openrouter
from .auth import current_user_id
from .db import get_client, signed_url
from .media import ffmpeg_available, is_youtube_url
from .pdf import PdfFrame, build_pdf
from .pipeline import run_job
from .pool import executor, quiz_executor
from .quiz_api import router as quiz_router
from .schemas import FramePatch, JobCreate, JobPatch, Settings, SignUp

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("lectureleaf.api")

def _startup_checks() -> None:
    """Log the state of every provider. Runs in the background so a slow network never delays the server coming up."""
    if not config.OCR_ENABLED:
        log.info("Lite mode: reading slide text (OCR) is off")
    if not ffmpeg_available():
        log.warning("ffmpeg not found: transcription is disabled until it is installed")
    status = groq.check()
    if status["status"] == "not_set":
        log.warning("GROQ_API_KEY not set: PDFs will contain frames only")
    elif status["status"] == "invalid_key":
        log.error("GROQ_API_KEY was rejected by Groq (Invalid API Key): PDFs will have no key points. "
                  "Create a new key at https://console.groq.com/keys and update backend/.env")
    elif status["status"] == "model_missing":
        log.error("Groq has no usable %s model. Set GROQ_WHISPER_MODEL / GROQ_LLM_MODEL in backend/.env",
                  "transcription" if not status["whisper"] else "notes")
    else:
        log.info("Groq ready: transcription=%s notes=%s", status["whisper"], status["llm"])
    if openrouter.check()["status"] == "invalid_key":
        log.error("OPENROUTER_API_KEY was rejected by OpenRouter. Create a new key at https://openrouter.ai/keys")
    elif openrouter.check()["status"] == "ok":
        log.info("OpenRouter ready as the backup AI: %s", openrouter.check()["models"])


@asynccontextmanager
async def lifespan(_: FastAPI):
    threading.Thread(target=_startup_checks, daemon=True).start()
    try:
        # Jobs that were running when the server last stopped can never finish.
        get_client().table("jobs").update(
            {"status": "error", "error": "The server restarted while this was processing. Please try again."}
        ).in_("status", ["queued", "processing"]).execute()
        get_client().table("quizzes").update(
            {"status": "error", "error": "The server restarted while this quiz was being written. Please try again."}
        ).eq("status", "generating").execute()
    except Exception:
        log.exception("could not reset interrupted jobs")
    yield
    executor.shutdown(wait=False, cancel_futures=True)
    quiz_executor.shutdown(wait=False, cancel_futures=True)


app = FastAPI(title="LectureLeaf API", lifespan=lifespan)
app.include_router(quiz_router)
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_origin_regex=config.CORS_ORIGIN_REGEX or None,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def unhandled(_, exc: Exception):
    log.exception("unhandled error", exc_info=exc)
    return JSONResponse({"detail": "Something went wrong on the server."}, status_code=500)


def _frames(job_id: str) -> list[dict]:
    res = get_client().table("job_frames").select("*").eq("job_id", job_id).order("position").execute()
    return [
        {"index": r["position"], "seconds": r["seconds"], "time": r["time_label"], "path": r["storage_path"],
         "heading": r.get("heading"), "key_points": r.get("key_points") or [],
         "included": r["included"], "note": r.get("note"), "url": signed_url(r["storage_path"])}
        for r in res.data
    ]


def _public(job: dict, with_frames: bool = True) -> dict:
    keys = ("id", "url", "title", "duration_s", "status", "progress", "step", "error", "warning", "summary", "created_at")
    out = {k: job.get(k) for k in keys}
    out["frames"] = _frames(job["id"]) if with_frames else []
    out["has_pdf"] = bool(job.get("pdf_path"))
    return out


def _library_cards(jobs: list[dict]) -> list[dict]:
    """List view: each lecture with a cover image and its page count, without loading every frame."""
    cards = [_public(j, with_frames=False) for j in jobs]
    if not jobs:
        return cards
    rows = (get_client().table("job_frames").select("job_id,position,storage_path,included")
            .in_("job_id", [j["id"] for j in jobs]).order("position").execute().data)
    by_job: dict[str, list[dict]] = {}
    for r in rows:
        by_job.setdefault(r["job_id"], []).append(r)
    covers = {}
    for jid, frames in by_job.items():
        kept = [f for f in frames if f["included"]]
        covers[jid] = (kept or frames)[0]["storage_path"]
    urls = {}
    if covers:
        try:
            signed = get_client().storage.from_(config.STORAGE_BUCKET).create_signed_urls(
                list(covers.values()), config.SIGNED_URL_TTL)
            urls = {s["path"]: s.get("signedURL") or s.get("signedUrl") for s in signed if s.get("path")}
        except Exception:
            log.exception("could not sign library covers")
    for card in cards:
        frames = by_job.get(card["id"], [])
        card["frame_count"] = sum(1 for f in frames if f["included"])
        card["thumbnail"] = urls.get(covers.get(card["id"]))
    return cards


def _mark_stale(job_id: str) -> None:
    """Remember that the saved PDF no longer matches the edited notes, so it is rebuilt before next use."""
    try:
        get_client().table("jobs").update({"pdf_stale": True}).eq("id", job_id).execute()
    except Exception:
        log.warning("could not set pdf_stale (run the latest supabase/schema.sql)")


def _owned(job_id: str, user_id: str) -> dict:
    res = get_client().table("jobs").select("*").eq("id", job_id).eq("user_id", user_id).limit(1).execute()
    if not res.data:
        raise HTTPException(404, "Lecture not found")
    return res.data[0]


def _schema_ok() -> bool:
    try:
        get_client().table("jobs").select("pdf_stale").limit(1).execute()
        get_client().table("quizzes").select("id").limit(1).execute()
        get_client().table("quiz_attempts").select("id").limit(1).execute()
        return True
    except Exception:
        return False


@app.get("/api/healthz")
def healthz():
    """Instant liveness check for hosting platforms. (/api/health also probes every provider, so it is slower.)"""
    return {"ok": True}


@app.get("/api/health")
def health():
    return {
        "ok": True,
        "supabase_configured": bool(config.SUPABASE_URL and config.SUPABASE_SERVICE_ROLE_KEY),
        "ffmpeg": ffmpeg_available(),
        "groq": groq.check(),
        "gemini": gemini.check(),
        "openrouter": {k: v for k, v in openrouter.check().items() if not k.startswith("_")},
        "ai_available": llm.available(),
        "offline_transcription": local_asr.available(),
        "schema_up_to_date": _schema_ok(),
    }


def _find_user_by_email(email: str):
    admin = get_client().auth.admin
    for page in range(1, 51):  # up to 50 pages of 100 users
        users = admin.list_users(page=page, per_page=100)
        for u in users:
            if (u.email or "").lower() == email:
                return u
        if len(users) < 100:
            return None
    return None


@app.post("/api/signup", status_code=201)
def signup(body: SignUp):
    """Create an already-confirmed account so the user can sign in immediately (no confirmation email).

    If the email belongs to an account that was never confirmed (made before this route existed), it is
    confirmed and given the new password instead of failing."""
    email = body.email.strip().lower()
    admin = get_client().auth.admin
    try:
        admin.create_user({"email": email, "password": body.password, "email_confirm": True})
        return {"ok": True}
    except Exception as exc:
        msg = str(exc).lower()
        if not ("already" in msg or "registered" in msg or "exists" in msg):
            if "password" in msg:
                raise HTTPException(422, "That password isn't accepted. Try a longer one.")
            log.exception("signup failed")
            raise HTTPException(400, "Couldn't create the account. Please try again.")
    existing = _find_user_by_email(email)
    if existing and not getattr(existing, "email_confirmed_at", None):
        admin.update_user_by_id(existing.id, {"email_confirm": True, "password": body.password})
        return {"ok": True}
    raise HTTPException(409, "An account with this email already exists. Try signing in.")


@app.post("/api/jobs", status_code=202)
def create_job(body: JobCreate, user_id: str = Depends(current_user_id)):
    url = body.url.strip()
    if not is_youtube_url(url):
        raise HTTPException(422, "Please provide a valid YouTube link.")
    db = get_client()
    active = (db.table("jobs").select("id").eq("user_id", user_id).in_("status", ["queued", "processing"]).execute())
    if len(active.data) >= config.MAX_ACTIVE_JOBS_PER_USER:
        raise HTTPException(429, "You already have lectures processing. Wait for one to finish first.")
    job_id = str(uuid.uuid4())
    db.table("jobs").insert({
        "id": job_id, "user_id": user_id, "url": url, "settings": body.settings.model_dump(), "status": "queued",
    }).execute()
    executor.submit(run_job, job_id, user_id, url, body.settings)
    return {"id": job_id}


VIDEO_EXTS = (".mp4", ".mov", ".mkv", ".webm", ".avi", ".m4v")


@app.post("/api/jobs/upload", status_code=202)
def create_job_from_upload(file: UploadFile = File(...), settings: str = Form("{}"),
                           user_id: str = Depends(current_user_id)):
    """Same as /api/jobs, but the lecture is a video file the user uploads instead of a YouTube link."""
    name = os.path.basename(file.filename or "lecture.mp4")
    if not name.lower().endswith(VIDEO_EXTS):
        raise HTTPException(422, "Please upload a video file (MP4, MOV, MKV, WEBM or AVI).")
    try:
        s = Settings.model_validate_json(settings or "{}")
    except Exception:
        raise HTTPException(422, "The settings were not valid.")
    db = get_client()
    active = (db.table("jobs").select("id").eq("user_id", user_id).in_("status", ["queued", "processing"]).execute())
    if len(active.data) >= config.MAX_ACTIVE_JOBS_PER_USER:
        raise HTTPException(429, "You already have lectures processing. Wait for one to finish first.")
    folder = tempfile.mkdtemp(prefix="ll-upload-")
    path = os.path.join(folder, "lecture" + os.path.splitext(name)[1].lower())
    limit, size = config.MAX_UPLOAD_MB * 1024 * 1024, 0
    try:
        with open(path, "wb") as out:
            while chunk := file.file.read(1024 * 1024):
                size += len(chunk)
                if size > limit:
                    raise HTTPException(413, f"This video is larger than {config.MAX_UPLOAD_MB} MB. Upload a shorter or lower-resolution clip.")
                out.write(chunk)
        if size == 0:
            raise HTTPException(422, "That file is empty.")
    except BaseException:
        shutil.rmtree(folder, ignore_errors=True)
        raise
    job_id = str(uuid.uuid4())
    url = f"upload:{name}"[:500]
    db.table("jobs").insert({
        "id": job_id, "user_id": user_id, "url": url, "settings": s.model_dump(), "status": "queued",
    }).execute()
    executor.submit(run_job, job_id, user_id, url, s, path)
    return {"id": job_id}


@app.get("/api/jobs")
def list_jobs(status: str | None = None, user_id: str = Depends(current_user_id)):
    """The user's lectures, newest first. `?status=done` gives the library."""
    q = get_client().table("jobs").select("*").eq("user_id", user_id)
    if status:
        q = q.eq("status", status)
    res = q.order("created_at", desc=True).limit(100).execute()
    return _library_cards(res.data)


@app.patch("/api/jobs/{job_id}")
def rename_job(job_id: str, body: JobPatch, user_id: str = Depends(current_user_id)):
    _owned(job_id, user_id)
    title = " ".join(body.title.split())
    if not title:
        raise HTTPException(422, "The title can't be empty.")
    get_client().table("jobs").update({"title": title}).eq("id", job_id).execute()
    _mark_stale(job_id)  # the title is printed in the PDF
    return {"ok": True, "title": title}


@app.get("/api/jobs/{job_id}")
def get_job(job_id: str, user_id: str = Depends(current_user_id)):
    job = _owned(job_id, user_id)
    return _public(job, with_frames=job["status"] == "done")


@app.get("/api/jobs/{job_id}/pdf")
def get_pdf(job_id: str, user_id: str = Depends(current_user_id)):
    job = _owned(job_id, user_id)
    if not job.get("pdf_path"):
        raise HTTPException(409, "The PDF isn't ready yet.")
    if job.get("pdf_stale"):
        job = _rebuild(job)
    return {"url": signed_url(job["pdf_path"])}


@app.get("/api/jobs/{job_id}/pdf/file")
def get_pdf_file(job_id: str, user_id: str = Depends(current_user_id)):
    """The PDF itself, streamed through the API (so the page can preview it without cross-site embedding)."""
    job = _owned(job_id, user_id)
    if not job.get("pdf_path"):
        raise HTTPException(409, "The PDF isn't ready yet.")
    if job.get("pdf_stale"):
        job = _rebuild(job)
    data = get_client().storage.from_(config.STORAGE_BUCKET).download(job["pdf_path"])
    return Response(data, media_type="application/pdf", headers={"Cache-Control": "no-store"})


@app.patch("/api/jobs/{job_id}/frames/{index}")
def patch_frame(job_id: str, index: int, body: FramePatch, user_id: str = Depends(current_user_id)):
    _owned(job_id, user_id)
    fields = body.model_dump(exclude_none=True)
    if not fields:
        raise HTTPException(422, "Nothing to update.")
    res = (get_client().table("job_frames").update(fields).eq("job_id", job_id).eq("position", index).execute())
    if not res.data:
        raise HTTPException(404, "Frame not found")
    _mark_stale(job_id)
    return {"ok": True}


@app.post("/api/jobs/{job_id}/rebuild")
def rebuild_pdf(job_id: str, user_id: str = Depends(current_user_id)):
    """Regenerate the PDF from the frames the user kept (after removing frames or adding notes)."""
    job = _rebuild(_owned(job_id, user_id))
    return {"url": signed_url(job["pdf_path"])}


def _rebuild(job: dict) -> dict:
    job_id = job["id"]
    if job["status"] != "done":
        raise HTTPException(409, "This lecture isn't finished processing.")
    rows = [r for r in get_client().table("job_frames").select("*").eq("job_id", job_id).order("position").execute().data
            if r["included"]]
    if not rows:
        raise HTTPException(422, "Keep at least one frame to build a PDF.")
    settings = Settings(**(job.get("settings") or {}))
    bucket = get_client().storage.from_(config.STORAGE_BUCKET)
    with tempfile.TemporaryDirectory() as tmp:
        frames = []
        for r in rows:
            local = os.path.join(tmp, f"{r['position']}.jpg")
            with open(local, "wb") as fh:
                fh.write(bucket.download(r["storage_path"]))
            frames.append(PdfFrame(r["seconds"], local, r.get("heading") or "", r.get("key_points") or [], r.get("note") or ""))
        out = os.path.join(tmp, "notes.pdf")
        build_pdf(out, job.get("title") or "Lecture", frames, settings, job.get("summary") or "", job.get("duration_s"))
        with open(out, "rb") as fh:
            bucket.upload(job["pdf_path"], fh.read(), {"content-type": "application/pdf", "upsert": "true"})
    try:
        get_client().table("jobs").update({"pdf_stale": False}).eq("id", job_id).execute()
    except Exception:
        log.warning("could not clear pdf_stale (run the latest supabase/schema.sql)")
    return {**job, "pdf_stale": False}


@app.delete("/api/jobs/{job_id}", status_code=204)
def delete_job(job_id: str, user_id: str = Depends(current_user_id)):
    job = _owned(job_id, user_id)
    if job["status"] in ("queued", "processing"):
        raise HTTPException(409, "This lecture is still processing.")
    db = get_client()
    prefix = f"{user_id}/{job_id}"
    try:
        names = [f"{prefix}/{o['name']}" for o in db.storage.from_(config.STORAGE_BUCKET).list(prefix)]
        if names:
            db.storage.from_(config.STORAGE_BUCKET).remove(names)
    except Exception:
        log.exception("could not remove files for %s", job_id)
    db.table("jobs").delete().eq("id", job_id).execute()  # job_frames cascade
