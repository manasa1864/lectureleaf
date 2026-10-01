import uuid

from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from . import config
from .auth import current_user_id
from .db import get_client, signed_url
from .pipeline import is_youtube_url, run_job
from .schemas import JobCreate

app = FastAPI(title="LectureLeaf API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _frames(job_id: str) -> list[dict]:
    res = (get_client().table("job_frames").select("*").eq("job_id", job_id)
           .order("position").execute())
    return [
        {"index": r["position"], "seconds": r["seconds"], "time": r["time_label"],
         "path": r["storage_path"], "included": r["included"], "note": r["note"],
         "url": signed_url(r["storage_path"])}
        for r in res.data
    ]


def _public(job: dict, with_frames: bool = True) -> dict:
    keys = ("id", "url", "title", "duration_s", "status", "progress", "step", "error", "created_at")
    out = {k: job.get(k) for k in keys}
    out["frames"] = _frames(job["id"]) if with_frames else []
    out["has_pdf"] = bool(job.get("pdf_path"))
    return out


def _owned(job_id: str, user_id: str) -> dict:
    res = get_client().table("jobs").select("*").eq("id", job_id).eq("user_id", user_id).limit(1).execute()
    if not res.data:
        raise HTTPException(404, "Job not found")
    return res.data[0]


@app.get("/api/health")
def health():
    return {"ok": True}


@app.post("/api/jobs", status_code=202)
def create_job(body: JobCreate, tasks: BackgroundTasks, user_id: str = Depends(current_user_id)):
    if not is_youtube_url(body.url):
        raise HTTPException(422, "Please provide a valid YouTube link")
    job_id = str(uuid.uuid4())
    get_client().table("jobs").insert({
        "id": job_id,
        "user_id": user_id,
        "url": body.url,
        "settings": body.settings.model_dump(),
        "status": "queued",
    }).execute()
    tasks.add_task(run_job, job_id, user_id, body.url, body.settings)
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
        raise HTTPException(409, "PDF is not ready yet")
    return {"url": signed_url(job["pdf_path"])}
