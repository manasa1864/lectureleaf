import os

from dotenv import load_dotenv

load_dotenv()


def _int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except ValueError:
        return default


SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
STORAGE_BUCKET = os.environ.get("STORAGE_BUCKET", "lectureleaf")
CORS_ORIGINS = [o.strip() for o in os.environ.get("CORS_ORIGINS", "http://localhost:5173").split(",") if o.strip()]
SIGNED_URL_TTL = 60 * 60  # seconds

# Groq (transcription + notes). Without a key the app still makes frame-only PDFs.
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
GROQ_WHISPER_MODEL = os.environ.get("GROQ_WHISPER_MODEL", "whisper-large-v3-turbo")
GROQ_LLM_MODEL = os.environ.get("GROQ_LLM_MODEL", "llama-3.3-70b-versatile")

# YouTube often blocks downloads from cloud IPs. Cookies and/or a proxy are the usual workaround.
YTDLP_COOKIES_FILE = os.environ.get("YTDLP_COOKIES_FILE", "")
YTDLP_PROXY = os.environ.get("YTDLP_PROXY", "")

# Limits
MAX_LECTURE_MINUTES = _int("MAX_LECTURE_MINUTES", 180)
MAX_JOB_MINUTES = _int("MAX_JOB_MINUTES", 45)             # wall-clock budget for one job
MAX_CONCURRENT_JOBS = _int("MAX_CONCURRENT_JOBS", 2)      # jobs processed at once by this server
MAX_ACTIVE_JOBS_PER_USER = _int("MAX_ACTIVE_JOBS_PER_USER", 2)
MAX_DOWNLOAD_MB = _int("MAX_DOWNLOAD_MB", 1000)
VIDEO_MAX_HEIGHT = _int("VIDEO_MAX_HEIGHT", 720)         # higher = sharper slide text, bigger download
OCR_BUDGET_S = _int("OCR_BUDGET_S", 240)                  # max seconds per job spent reading text off frames
