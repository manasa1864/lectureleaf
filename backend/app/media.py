"""Getting video and audio out of YouTube."""
import glob
import logging
import os
import shutil
import subprocess
import time
from urllib.parse import urlparse

import yt_dlp

from . import config
from .errors import UserError, friendly_download_error

log = logging.getLogger("lectureleaf.media")

YOUTUBE_HOSTS = {"youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "music.youtube.com"}
CHUNK_SECONDS = 600
RELOAD = "needs to be reloaded"  # what yt-dlp says when YouTube rejects the cookies' session
_cookies_rejected = False       # once YouTube rejects our cookies, stop sending them until the server restarts


def is_youtube_url(url: str) -> bool:
    try:
        p = urlparse(url.strip())
    except ValueError:
        return False
    return p.scheme in ("http", "https") and (p.hostname or "").lower() in YOUTUBE_HOSTS


def ffmpeg_available() -> bool:
    return shutil.which("ffmpeg") is not None


def _opts(tmp: str, name: str, fmt: str) -> dict:
    opts = {
        "format": fmt,
        "outtmpl": os.path.join(tmp, f"{name}.%(ext)s"),
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "noprogress": True,
        "retries": 5,
        "fragment_retries": 5,
        "socket_timeout": 30,
        "max_filesize": config.MAX_DOWNLOAD_MB * 1024 * 1024,
    }
    if config.YTDLP_COOKIES_FILE and not _cookies_rejected:
        opts["cookiefile"] = config.YTDLP_COOKIES_FILE
    if config.YTDLP_PROXY:
        opts["proxy"] = config.YTDLP_PROXY
    return opts


def _drop_cookies_if_rejected(exc: Exception) -> bool:
    """Stale or rotated cookies make YouTube answer "The page needs to be reloaded". Retry without them."""
    global _cookies_rejected
    if config.YTDLP_COOKIES_FILE and not _cookies_rejected and RELOAD in str(exc).lower():
        _cookies_rejected = True
        log.warning("YouTube rejected the cookies (%s): continuing without them. Export fresh cookies to use them again.", exc)
        return True
    return False


def fetch_info(url: str) -> dict:
    """Metadata only. Rejects live streams and over-long lectures before anything is downloaded."""
    for attempt in range(2):
        try:
            with yt_dlp.YoutubeDL(_opts("", "info", "best")) as ydl:
                info = ydl.extract_info(url, download=False, process=False)
            break
        except Exception as exc:
            if attempt == 0 and _drop_cookies_if_rejected(exc):
                continue
            raise friendly_download_error(exc)
    if not info:
        raise UserError("Couldn't read this video's details.")
    if info.get("is_live") or info.get("live_status") in ("is_live", "is_upcoming"):
        raise UserError("Live streams and premieres can't be processed until they finish.")
    duration = float(info.get("duration") or 0)
    if duration > config.MAX_LECTURE_MINUTES * 60:
        raise UserError(f"This lecture is longer than {config.MAX_LECTURE_MINUTES} minutes, which is the current limit.")
    if 0 < duration < 20:
        raise UserError("This video is too short to make study notes from.")
    return info


TRANSIENT = ("403", "forbidden", "timed out", "timeout", "connection", "temporary failure", "502", "503")


def _download(url: str, tmp: str, name: str, fmt: str) -> str:
    os.makedirs(tmp, exist_ok=True)
    for attempt in range(3):
        try:
            with yt_dlp.YoutubeDL(_opts(tmp, name, fmt)) as ydl:
                ydl.download([url])
            break
        except Exception as exc:
            if _drop_cookies_if_rejected(exc):
                continue
            # YouTube sometimes refuses a request once and accepts the next: retry those with a pause.
            if attempt < 2 and any(t in str(exc).lower() for t in TRANSIENT):
                time.sleep(3 * (attempt + 1))
                continue
            raise friendly_download_error(exc)
    files = glob.glob(os.path.join(tmp, f"{name}.*"))
    files = [f for f in files if not f.endswith((".part", ".ytdl"))]
    if not files:
        raise UserError("The download finished but no file was produced. The video may be too large.")
    return files[0]


def download_video(url: str, tmp: str) -> str:
    # Frames only need the picture. YouTube serves video and audio separately, so ask for a
    # video-only H.264 stream (OpenCV decodes it reliably) and fall back to anything usable.
    h = config.VIDEO_MAX_HEIGHT
    return _download(url, tmp, "video", f"bv*[height<={h}][vcodec^=avc1]/bv*[height<={h}][ext=mp4]/bv*[height<={h}]/b[height<={h}]/b")


def download_audio(url: str, tmp: str) -> str:
    return _download(url, tmp, "audio", "ba[abr<=96]/ba/b")


def chunk_audio(src: str, tmp: str) -> list[tuple[int, str]]:
    """Re-encode to small mono MP3 pieces so each fits comfortably under the transcription size limit."""
    if not ffmpeg_available():
        raise UserError("ffmpeg isn't installed on the server, so audio can't be transcribed.")
    pattern = os.path.join(tmp, "chunk_%03d.mp3")
    cmd = [
        "ffmpeg", "-nostdin", "-y", "-loglevel", "error", "-i", src, "-vn", "-ac", "1", "-ar", "16000",
        "-b:a", "32k", "-f", "segment", "-segment_time", str(CHUNK_SECONDS), "-reset_timestamps", "1", pattern,
    ]
    try:
        subprocess.run(cmd, check=True, capture_output=True, timeout=900)
    except subprocess.TimeoutExpired:
        raise UserError("Preparing the audio took too long.")
    except subprocess.CalledProcessError:
        raise UserError("The audio track couldn't be read.")
    chunks = sorted(glob.glob(os.path.join(tmp, "chunk_*.mp3")))
    if not chunks:
        raise UserError("This video has no audio track to transcribe.")
    return [(i * CHUNK_SECONDS, p) for i, p in enumerate(chunks)]
