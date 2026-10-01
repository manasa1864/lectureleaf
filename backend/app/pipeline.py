"""Download a lecture, pick its distinct visual moments, upload them and build the study PDF."""
import os
import tempfile
from urllib.parse import urlparse

import cv2
import numpy as np
import yt_dlp

from . import config
from .db import get_client
from .pdf import build_pdf
from .schemas import Settings

YOUTUBE_HOSTS = {"youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "music.youtube.com"}
SAMPLE_EVERY_S = 2.0
MAX_FRAMES = {"compact": 8, "balanced": 16, "detailed": 40}

# Indices match the steps shown on the Processing screen.
STEP_LOADED, STEP_DETECTED, STEP_CLEANED, STEP_ORGANIZING, STEP_PDF = range(5)


def is_youtube_url(url: str) -> bool:
    try:
        p = urlparse(url)
    except ValueError:
        return False
    return p.scheme in ("http", "https") and (p.hostname or "").lower() in YOUTUBE_HOSTS


def fmt_time(seconds: float) -> str:
    s = int(seconds)
    h, rem = divmod(s, 3600)
    m, sec = divmod(rem, 60)
    return f"{h}:{m:02d}:{sec:02d}" if h else f"{m:02d}:{sec:02d}"


def update(job_id: str, **fields) -> None:
    get_client().table("jobs").update(fields).eq("id", job_id).execute()


def download(url: str, tmp: str) -> tuple[str, str, float]:
    opts = {
        # Frames only need the picture. YouTube serves video and audio separately, so ask for a
        # video-only H.264 stream (OpenCV decodes it reliably) and fall back to anything usable.
        "format": "bv*[height<=480][vcodec^=avc1]/bv*[height<=480][ext=mp4]/bv*[height<=480]/b[height<=480]/b",
        "outtmpl": os.path.join(tmp, "video.%(ext)s"),
        "noplaylist": True,
        "quiet": True,
        "noprogress": True,
        "no_warnings": True,
    }
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=False)
        duration = float(info.get("duration") or 0)
        if duration > config.MAX_LECTURE_MINUTES * 60:
            raise ValueError(f"Lecture is longer than {config.MAX_LECTURE_MINUTES} minutes")
        ydl.download([url])
    files = [f for f in os.listdir(tmp) if f.startswith("video.")]
    if not files:
        raise RuntimeError("Download failed")
    return os.path.join(tmp, files[0]), info.get("title") or "Untitled lecture", duration


def _small(frame: np.ndarray) -> np.ndarray:
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    return cv2.resize(gray, (160, 90), interpolation=cv2.INTER_AREA).astype(np.float32) / 255.0


def _diff(a: np.ndarray, b: np.ndarray) -> float:
    """Fraction of pixels that changed noticeably (ignores sensor noise and compression shimmer)."""
    return float(np.mean(np.abs(a - b) > 0.12))


def _good_quality(frame: np.ndarray, s: Settings) -> bool:
    if not s.skip_low_quality:
        return True
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    return 15 < gray.mean() < 245 and cv2.Laplacian(gray, cv2.CV_64F).var() > 20


def detect_moments(video: str, duration: float, s: Settings, on_progress) -> list[tuple[float, np.ndarray]]:
    cap = cv2.VideoCapture(video)
    if not cap.isOpened():
        raise RuntimeError("Could not open downloaded video")
    if duration <= 0:
        fps = cap.get(cv2.CAP_PROP_FPS) or 25
        duration = (cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0) / fps

    change_thr = max(0.02 - 0.0002 * s.sensitivity, 0.004)  # more sensitive -> smaller change counts
    dupe_thr = 0.00006 * s.dupe_sensitivity      # stricter -> wider "same as before" band
    kept: list[tuple[float, np.ndarray, np.ndarray]] = []  # (time, full frame, small gray)
    prev_small = None
    last_t = -1e9
    t = 0.0
    last_reported = -1
    while t < max(duration, SAMPLE_EVERY_S):
        cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000)
        ok, frame = cap.read()
        if not ok:
            break
        small = _small(frame)
        stable = prev_small is None or not s.skip_transitions or _diff(prev_small, small) < 0.002
        prev_small = small

        if stable and _good_quality(frame, s):
            if not kept:
                kept.append((t, frame, small))
                last_t = t
            elif t - last_t >= s.min_time_between and _diff(kept[-1][2], small) > change_thr:
                is_dupe = s.remove_dupes and any(_diff(k[2], small) < dupe_thr for k in kept)
                if not is_dupe:
                    kept.append((t, frame, small))
                    last_t = t
        if duration:
            pct = int(min(t / duration, 1.0) * 10)
            if pct != last_reported:
                last_reported = pct
                on_progress(pct / 10)
        t += SAMPLE_EVERY_S
    cap.release()
    return [(k[0], k[1]) for k in kept]


def limit_pages(moments: list, s: Settings) -> list:
    cap = s.max_pages or MAX_FRAMES.get(s.page_density, 16)
    if len(moments) <= cap:
        return moments
    idx = np.linspace(0, len(moments) - 1, cap).round().astype(int)
    return [moments[i] for i in sorted(set(idx.tolist()))]


def run_job(job_id: str, user_id: str, url: str, s: Settings) -> None:
    db = get_client()
    try:
        update(job_id, status="processing", progress=3, step=STEP_LOADED)
        with tempfile.TemporaryDirectory() as tmp:
            video, title, duration = download(url, tmp)
            update(job_id, title=title, duration_s=int(duration), progress=20, step=STEP_DETECTED)

            moments = detect_moments(
                video, duration, s, lambda frac: update(job_id, progress=20 + int(frac * 45))
            )
            update(job_id, progress=68, step=STEP_CLEANED)
            moments = limit_pages(moments, s)
            if not moments:
                raise RuntimeError("No usable frames were found in this video")
            update(job_id, progress=75, step=STEP_ORGANIZING)

            bucket = db.storage.from_(config.STORAGE_BUCKET)
            base = f"{user_id}/{job_id}"
            frames, files = [], []
            for i, (t, img) in enumerate(moments, 1):
                local = os.path.join(tmp, f"frame_{i}.jpg")
                cv2.imwrite(local, img, [cv2.IMWRITE_JPEG_QUALITY, 88])
                remote = f"{base}/frame_{i}.jpg"
                with open(local, "rb") as fh:
                    bucket.upload(remote, fh.read(), {"content-type": "image/jpeg"})
                frames.append({"index": i, "seconds": int(t), "time": fmt_time(t), "path": remote})
                files.append((int(t), local))

            db.table("job_frames").insert([
                {"job_id": job_id, "user_id": user_id, "position": f["index"], "seconds": f["seconds"],
                 "time_label": f["time"], "storage_path": f["path"]}
                for f in frames
            ]).execute()
            update(job_id, progress=88, step=STEP_PDF)
            pdf_local = os.path.join(tmp, "notes.pdf")
            build_pdf(pdf_local, title, files, s)
            pdf_remote = f"{base}/notes.pdf"
            with open(pdf_local, "rb") as fh:
                bucket.upload(pdf_remote, fh.read(), {"content-type": "application/pdf"})
        update(job_id, status="done", progress=100, step=STEP_PDF + 1, pdf_path=pdf_remote)
    except Exception as exc:  # surface the reason to the UI
        update(job_id, status="error", error=str(exc)[:500])
