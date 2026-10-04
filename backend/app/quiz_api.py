"""Quiz endpoints: create a quiz from a lecture, take it, get it marked, review and practise."""
import base64
import json
import logging
import uuid
from datetime import datetime, timezone

import cv2
import numpy as np
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from . import config, gemini, llm, ocr, openrouter
from .auth import current_user_id
from .db import get_client
from .errors import UserError
from .groq import GroqError
from .pool import quiz_executor
from .quiz_gen import build_pages, generate, offline_questions, plan, spoken_by_page
from .quiz_grade import grade_attempt, parse_conditions
from .quiz_schemas import AttemptSave, AttemptSubmit, DeriveIn, ImageIn, QuizConfig, QuizCreate

log = logging.getLogger("lectureleaf.quiz")
router = APIRouter(prefix="/api")

MAX_ANSWER_CHARS = 8000
MAX_IMAGE_BYTES = 6 * 1024 * 1024
GRACE_S = 45  # slack on the time limit for network delay when the page auto-submits


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.isoformat()


def _parse(ts: str) -> datetime:
    return datetime.fromisoformat(ts.replace("Z", "+00:00"))


def _tables_ready() -> None:
    try:
        get_client().table("quizzes").select("id").limit(1).execute()
        get_client().table("quiz_attempts").select("id").limit(1).execute()
    except Exception:
        raise HTTPException(503, "Quizzes need the latest database setup. Run supabase/schema.sql in the Supabase SQL Editor.")


def _owned_quiz(quiz_id: str, user_id: str) -> dict:
    res = get_client().table("quizzes").select("*").eq("id", quiz_id).eq("user_id", user_id).limit(1).execute()
    if not res.data:
        raise HTTPException(404, "Quiz not found")
    return res.data[0]


def _owned_attempt(attempt_id: str, user_id: str) -> dict:
    res = get_client().table("quiz_attempts").select("*").eq("id", attempt_id).eq("user_id", user_id).limit(1).execute()
    if not res.data:
        raise HTTPException(404, "Attempt not found")
    return res.data[0]


# ───────────── what the browser may see before submitting: never the answers ─────────────

def public_question(q: dict) -> dict:
    out = {k: q[k] for k in ("id", "type", "difficulty", "text", "marks") if k in q}
    if q["type"] == "numerical":
        out["numerical_format"] = q.get("numerical_format")
        out["unit"] = q.get("unit", "")
    if q.get("options"):
        out["options"] = q["options"]
    return out


def public_quiz(row: dict) -> dict:
    cfg = row.get("config") or {}
    return {
        "id": row["id"], "job_id": row["job_id"], "title": row.get("title"), "status": row["status"],
        "error": row.get("error"), "warning": row.get("warning"), "created_at": row["created_at"],
        "config": {
            "difficulty": cfg.get("difficulty"), "time_limit_min": cfg.get("time_limit_min"), "strict": bool(cfg.get("strict")),
            "numerical_format": cfg.get("numerical_format"), "n": len(row.get("questions") or []),
        },
        "progress": (cfg.get("_progress") or None),
        "rules": row.get("conditions") or [],
        "questions": [public_question(q) for q in (row.get("questions") or [])],
    }


# ───────────── creating a quiz ─────────────

def _decode_images(images: list) -> list[bytes]:
    out = []
    for img in images:
        data = img.data.split(",", 1)[1] if img.data.startswith("data:") else img.data
        try:
            raw = base64.b64decode(data, validate=False)
        except Exception:
            raise HTTPException(422, f"'{img.name}' couldn't be read as an image.")
        if len(raw) > MAX_IMAGE_BYTES:
            raise HTTPException(422, f"'{img.name}' is larger than 6 MB.")
        if cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR) is None:
            raise HTTPException(422, f"'{img.name}' isn't a picture the server can read (use PNG or JPG).")
        out.append(raw)
    return out


def read_photo(raw: bytes) -> tuple[str, str]:
    """(text, reader). Gemini reads handwriting best, so it goes first when a key is set; otherwise, or if it
    fails, the built-in OCR is used."""
    if gemini.check()["status"] == "ok":
        try:
            text = gemini.read_text(raw)
            if text:
                return text, "gemini"
        except gemini.GeminiError as exc:
            log.warning("Gemini couldn't read a photo (%s); using the built-in OCR", exc)
    if openrouter.check()["status"] == "ok" and openrouter.check().get("vision"):
        try:
            text = openrouter.read_image(raw)
            if text:
                return text, "openrouter"
        except gemini.GeminiError as exc:
            log.warning("OpenRouter couldn't read a photo (%s); using the built-in OCR", exc)
    if ocr.available():
        text, _ = ocr.read(cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR))
        return text.strip(), "local"
    raise HTTPException(503, "Reading text from photos isn't set up on this server. Install requirements-ocr.txt or set GEMINI_API_KEY.")


class OcrRequest(BaseModel):
    images: list[ImageIn] = Field(min_length=1, max_length=4)


@router.post("/ocr")
def read_photos(body: OcrRequest, user_id: str = Depends(current_user_id)):
    """The text read from photos of notes, so the student can fix mistakes before it is used for a quiz."""
    out = []
    for img, raw in zip(body.images, _decode_images(body.images)):
        text, reader = read_photo(raw)
        out.append({"name": img.name, "text": text[:6000], "chars": len(text), "reader": reader})
    return out


@router.post("/quizzes", status_code=202)
def create_quiz(body: QuizCreate, user_id: str = Depends(current_user_id)):
    _tables_ready()
    db = get_client()
    jobs = db.table("jobs").select("*").eq("id", body.job_id).eq("user_id", user_id).limit(1).execute().data
    if not jobs:
        raise HTTPException(404, "Lecture not found")
    job = jobs[0]
    if job["status"] != "done":
        raise HTTPException(409, "That lecture isn't finished processing.")
    cfg = body.config
    if cfg.strict and not cfg.conditions.strip():
        raise HTTPException(422, "Strict mode needs at least one rule for your answers.")
    active = db.table("quizzes").select("id").eq("user_id", user_id).eq("status", "generating").execute()
    if len(active.data) >= config.MAX_ACTIVE_JOBS_PER_USER:
        raise HTTPException(429, "You already have quizzes being written. Wait for one to finish first.")
    images = _decode_images(cfg.images)
    quiz_id = str(uuid.uuid4())
    stored_cfg = cfg.model_dump(exclude={"images"})
    stored_cfg["image_count"] = len(images)
    db.table("quizzes").insert({
        "id": quiz_id, "user_id": user_id, "job_id": body.job_id, "title": job.get("title"),
        "config": stored_cfg, "status": "generating", "questions": [], "conditions": [],
    }).execute()
    quiz_executor.submit(_run_quiz_job, quiz_id, user_id, job, cfg, images)
    return {"id": quiz_id}


def _fail(quiz_id: str, message: str) -> None:
    get_client().table("quizzes").update({"status": "error", "error": message[:400]}).eq("id", quiz_id).execute()


def _run_quiz_job(quiz_id: str, user_id: str, job: dict, cfg: QuizConfig, images: list[bytes]) -> None:
    db = get_client()
    try:
        frames = (db.table("job_frames").select("*").eq("job_id", job["id"]).order("position").execute().data)
        pages = build_pages(frames)
        if not pages:
            return _fail(quiz_id, "This lecture has no pages left to make questions from. Include at least one frame.")
        if job.get("transcript_path"):
            try:
                segs = json.loads(db.storage.from_(config.STORAGE_BUCKET).download(job["transcript_path"]))
                spoken_by_page(segs, pages, frames)
            except Exception:
                log.warning("could not load the transcript for quiz %s", quiz_id)

        notes = cfg.notes_text.strip()
        warnings: list[str] = []
        texts = []
        for k, raw in enumerate(images, 1):
            try:
                text, _reader = read_photo(raw)
            except HTTPException:
                text = ""
            if text.strip():
                texts.append(f"[Image {k}] {text.strip()}")
            else:
                warnings.append(f"No text could be read from notes image {k}.")
        notes = "\n\n".join(x for x in [notes, *texts] if x)[:14000]

        specs = plan(cfg)

        def report(done: int) -> None:  # shown to the student while they wait; never worth failing the quiz over
            try:
                row = db.table("quizzes").select("config").eq("id", quiz_id).limit(1).execute().data[0]["config"] or {}
                db.table("quizzes").update({"config": {**row, "_progress": {"done": done, "total": len(specs)}}}).eq("id", quiz_id).execute()
            except Exception:
                pass

        report(0)
        questions: list[dict] = []
        if llm.available():
            try:
                questions = generate(specs, job.get("title") or "Lecture", job.get("summary") or "", pages, notes, report)
            except GroqError as exc:
                log.warning("AI question writing failed: %s", exc)
        if not questions:
            extra = []
            if notes:
                sentences = [s.strip() for s in notes.replace("\n", ". ").split(". ") if len(s.split()) >= 5][:30]
                extra = [{"n": 0, "time": "", "heading": "Your notes", "points": sentences, "screen": "", "note": "", "spoken": ""}]
            questions = offline_questions(specs, pages + extra)
            if questions:
                warnings.append("The AI question writer wasn't available, so this is a basic quiz (fill in the blank, "
                                "multiple choice, short and long answer from your notes). Other question types were swapped for these.")
        if not questions:
            return _fail(quiz_id, "Couldn't make questions from this lecture. Try again, or process a lecture with more content.")
        wanted = len(specs)
        if len(questions) < wanted:
            warnings.append(f"Only {len(questions)} of the {wanted} questions could be written.")
        for i, q in enumerate(questions, 1):  # keep ids dense after any dropped questions
            q["id"] = f"q{i}"
        conds = parse_conditions(cfg.conditions) if cfg.strict else []
        db.table("quizzes").update({
            "status": "ready", "questions": questions, "conditions": conds, "warning": " ".join(warnings) or None,
        }).eq("id", quiz_id).execute()
    except UserError as exc:
        _fail(quiz_id, str(exc))
    except Exception as exc:
        log.exception("quiz %s failed", quiz_id)
        _fail(quiz_id, f"Something went wrong while writing the quiz ({exc.__class__.__name__}). Please try again.")


# ───────────── reading quizzes ─────────────

@router.get("/quizzes")
def list_quizzes(job_id: str | None = None, user_id: str = Depends(current_user_id)):
    _tables_ready()
    db = get_client()
    q = db.table("quizzes").select("*").eq("user_id", user_id)
    if job_id:
        q = q.eq("job_id", job_id)
    rows = q.order("created_at", desc=True).limit(100).execute().data
    attempts_by: dict[str, list[dict]] = {}
    if rows:
        att = (db.table("quiz_attempts").select("id,quiz_id,status,submitted_at,score,max_score,percent,mode")
               .in_("quiz_id", [r["id"] for r in rows]).order("submitted_at", desc=True).execute().data)
        for a in att:
            attempts_by.setdefault(a["quiz_id"], []).append(a)
    out = []
    for r in rows:
        cfg = r.get("config") or {}
        out.append({
            "id": r["id"], "job_id": r["job_id"], "title": r.get("title"), "status": r["status"], "error": r.get("error"),
            "created_at": r["created_at"], "n_questions": len(r.get("questions") or []),
            "strict": bool(cfg.get("strict")), "difficulty": cfg.get("difficulty"), "time_limit_min": cfg.get("time_limit_min"),
            "attempts": [a for a in attempts_by.get(r["id"], []) if a["status"] == "submitted"],
            "in_progress": next((a["id"] for a in attempts_by.get(r["id"], []) if a["status"] == "in_progress"), None),
        })
    return out


@router.get("/quizzes/{quiz_id}")
def get_quiz(quiz_id: str, user_id: str = Depends(current_user_id)):
    return public_quiz(_owned_quiz(quiz_id, user_id))


@router.delete("/quizzes/{quiz_id}", status_code=204)
def delete_quiz(quiz_id: str, user_id: str = Depends(current_user_id)):
    _owned_quiz(quiz_id, user_id)
    get_client().table("quizzes").delete().eq("id", quiz_id).execute()  # attempts cascade


@router.post("/quizzes/{quiz_id}/derive", status_code=201)
def derive_quiz(quiz_id: str, body: DeriveIn, user_id: str = Depends(current_user_id)):
    """A new quiz from just the questions that were missed and/or skipped in an attempt (no AI needed)."""
    quiz = _owned_quiz(quiz_id, user_id)
    attempt = _owned_attempt(body.attempt_id, user_id)
    if attempt["quiz_id"] != quiz_id or attempt["status"] != "submitted":
        raise HTTPException(409, "That attempt isn't finished.")
    wanted = {"missed": ("wrong", "partial"), "skipped": ("skipped", "unanswered"),
              "missed_or_skipped": ("wrong", "partial", "skipped", "unanswered")}.get(body.which, ())
    status = {r["id"]: r["status"] for r in (attempt.get("results") or {}).get("questions", [])}
    picked = [q for q in quiz["questions"] if status.get(q["id"]) in wanted]
    if not picked:
        raise HTTPException(422, "Nothing to practise: no questions were missed or skipped.")
    new_id = str(uuid.uuid4())
    questions = [{**q, "id": f"q{i}"} for i, q in enumerate(picked, 1)]
    get_client().table("quizzes").insert({
        "id": new_id, "user_id": user_id, "job_id": quiz["job_id"], "title": quiz.get("title"), "config": quiz["config"],
        "status": "ready", "questions": questions, "conditions": quiz.get("conditions") or [],
        "warning": "Practice quiz: only the questions you missed or skipped.",
    }).execute()
    return {"id": new_id}


# ───────────── taking a quiz ─────────────

def _attempt_view(a: dict, with_results: bool) -> dict:
    out = {"id": a["id"], "quiz_id": a["quiz_id"], "status": a["status"], "started_at": a["started_at"],
           "answers": a.get("answers") or {}, "skips": a.get("skips") or {}, "server_now": _iso(_now())}
    if a["status"] == "submitted" and with_results:
        out.update(results=a.get("results"), score=a.get("score"), max_score=a.get("max_score"), percent=a.get("percent"),
                   time_taken_s=a.get("time_taken_s"), over_time=a.get("over_time"), submitted_at=a.get("submitted_at"))
    return out


@router.post("/quizzes/{quiz_id}/attempts", status_code=201)
def start_attempt(quiz_id: str, user_id: str = Depends(current_user_id)):
    quiz = _owned_quiz(quiz_id, user_id)
    if quiz["status"] != "ready":
        raise HTTPException(409, "This quiz isn't ready yet.")
    db = get_client()
    existing = (db.table("quiz_attempts").select("*").eq("quiz_id", quiz_id).eq("user_id", user_id)
                .eq("status", "in_progress").limit(1).execute().data)
    if existing:  # resume where the student left off
        return _attempt_view(existing[0], False)
    row = {"id": str(uuid.uuid4()), "quiz_id": quiz_id, "user_id": user_id, "status": "in_progress",
           "started_at": _iso(_now()), "answers": {}, "skips": {}, "mode": "strict" if (quiz.get("config") or {}).get("strict") else "normal"}
    db.table("quiz_attempts").insert(row).execute()
    return _attempt_view(row, False)


def _clean_answers(quiz: dict, answers: dict) -> dict:
    ids = {q["id"] for q in quiz["questions"]}
    out = {}
    for k, v in answers.items():
        if k not in ids:
            continue
        if isinstance(v, str):
            v = v[:MAX_ANSWER_CHARS]
        elif isinstance(v, list):
            v = [i for i in v if isinstance(i, int)][:10]
        elif not isinstance(v, int) or isinstance(v, bool):
            continue
        out[k] = v
    return out


def _clean_skips(quiz: dict, skips: dict) -> dict:
    ids = {q["id"] for q in quiz["questions"]}
    return {k: v.model_dump() for k, v in skips.items() if k in ids}


@router.patch("/attempts/{attempt_id}")
def save_attempt(attempt_id: str, body: AttemptSave, user_id: str = Depends(current_user_id)):
    """Progress is saved as you go, so a refresh or a closed tab doesn't lose your answers."""
    a = _owned_attempt(attempt_id, user_id)
    if a["status"] != "in_progress":
        raise HTTPException(409, "This attempt is already submitted.")
    quiz = _owned_quiz(a["quiz_id"], user_id)
    get_client().table("quiz_attempts").update(
        {"answers": _clean_answers(quiz, body.answers), "skips": _clean_skips(quiz, body.skips)}
    ).eq("id", attempt_id).execute()
    return {"ok": True}


@router.post("/attempts/{attempt_id}/submit")
def submit_attempt(attempt_id: str, body: AttemptSubmit, user_id: str = Depends(current_user_id)):
    a = _owned_attempt(attempt_id, user_id)
    if a["status"] == "submitted":
        return _attempt_view(a, True)
    quiz = _owned_quiz(a["quiz_id"], user_id)
    cfg = quiz.get("config") or {}
    answers = _clean_answers(quiz, body.answers)
    skips = _clean_skips(quiz, body.skips)
    results = grade_attempt(quiz["questions"], answers, skips, quiz.get("conditions") or [], bool(cfg.get("strict")))
    started = _parse(a["started_at"])
    elapsed = int((_now() - started).total_seconds())
    limit = (cfg.get("time_limit_min") or 0) * 60
    over = bool(limit and elapsed > limit + GRACE_S)
    results["time_limit_s"] = limit or None
    upd = {
        "status": "submitted", "answers": answers, "skips": skips, "results": results, "score": results["score"],
        "max_score": results["max_score"], "percent": results["percent"], "submitted_at": _iso(_now()),
        "time_taken_s": min(body.time_taken_s, elapsed) if body.time_taken_s is not None else elapsed, "over_time": over,
    }
    get_client().table("quiz_attempts").update(upd).eq("id", attempt_id).execute()
    return _attempt_view({**a, **upd}, True)


@router.get("/attempts/{attempt_id}")
def get_attempt(attempt_id: str, user_id: str = Depends(current_user_id)):
    return _attempt_view(_owned_attempt(attempt_id, user_id), True)
