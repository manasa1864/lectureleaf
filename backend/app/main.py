import logging
import os
import tempfile
import uuid
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import config
from .auth import current_user_id
from .db import get_client, signed_url
from .media import ffmpeg_available, is_youtube_url
from .pdf import PdfFrame, build_pdf
from .pipeline import run_job
from .schemas import FramePatch, JobCreate, Settings, SignUp

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("lectureleaf.api")

# Jobs run on a small worker pool; extra jobs wait in 'queued' instead of overloading the machine.
executor = ThreadPoolExecutor(max_workers=config.MAX_CONCURRENT_JOBS, thread_name_prefix="job")


@asynccontextmanager
async def lifespan(_: FastAPI):
    if not ffmpeg_available():
        log.warning("ffmpeg not found: transcription is disabled until it is installed")
    if not config.GROQ_API_KEY:
        log.warning("GROQ_API_KEY not set: PDFs will contain frames only")
    try:
        # Jobs that were running when the server last stopped can never finish.
        get_client().table("jobs").update(
            {"status": "error", "error": "The server restarted while this was processing. Please try again."}
        ).in_("status", ["queued", "processing"]).execute()
    except Exception:
        log.exception("could not reset interrupted jobs")
    yield
    executor.shutdown(wait=False, cancel_futures=True)


app = FastAPI(title="LectureLeaf API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
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


def _owned(job_id: str, user_id: str) -> dict:
    res = get_client().table("jobs").select("*").eq("id", job_id).eq("user_id", user_id).limit(1).execute()
    if not res.data:
        raise HTTPException(404, "Lecture not found")
    return res.data[0]


@app.get("/api/health")
def health():
    return {
        "ok": True,
        "supabase_configured": bool(config.SUPABASE_URL and config.SUPABASE_SERVICE_ROLE_KEY),
        "ffmpeg": ffmpeg_available(),
        "groq_configured": bool(config.GROQ_API_KEY),
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


@app.get("/api/jobs")
def list_jobs(user_id: str = Depends(current_user_id)):
    res = (get_client().table("jobs").select("*").eq("user_id", user_id)
           .order("created_at", desc=True).limit(50).execute())
    return [_public(j, with_frames=False) for j in res.data]


@app.get("/api/jobs/{job_id}")
def get_job(job_id: str, user_id: str = Depends(current_user_id)):
    job = _owned(job_id, user_id)
    return _public(job, with_frames=job["status"] == "done")


@app.get("/api/jobs/{job_id}/pdf")
def get_pdf(job_id: str, user_id: str = Depends(current_user_id)):
    job = _owned(job_id, user_id)
    if not job.get("pdf_path"):
        raise HTTPException(409, "The PDF isn't ready yet.")
    return {"url": signed_url(job["pdf_path"])}


@app.patch("/api/jobs/{job_id}/frames/{index}")
def patch_frame(job_id: str, index: int, body: FramePatch, user_id: str = Depends(current_user_id)):
    _owned(job_id, user_id)
    fields = body.model_dump(exclude_none=True)
    if not fields:
        raise HTTPException(422, "Nothing to update.")
    res = (get_client().table("job_frames").update(fields).eq("job_id", job_id).eq("position", index).execute())
    if not res.data:
        raise HTTPException(404, "Frame not found")
    return {"ok": True}


@app.post("/api/jobs/{job_id}/rebuild")
def rebuild_pdf(job_id: str, user_id: str = Depends(current_user_id)):
    """Regenerate the PDF from the frames the user kept (after removing frames or adding notes)."""
    job = _owned(job_id, user_id)
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
    return {"url": signed_url(job["pdf_path"])}


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
