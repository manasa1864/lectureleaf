import os

from dotenv import load_dotenv

# override=True: values in backend/.env win over stale variables already set in the Windows/OS environment
load_dotenv(override=True)


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
GROQ_LLM_MODEL = os.environ.get("GROQ_LLM_MODEL", "openai/gpt-oss-120b")

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
LOCAL_WHISPER_MODEL = os.environ.get("LOCAL_WHISPER_MODEL", "auto")  # tiny|base|small|medium, or auto (small up to 25 min, else base)
LOCAL_ASR_MAX_MINUTES = _int("LOCAL_ASR_MAX_MINUTES", 90)           # longest lecture transcribed offline

# Optional: Google Gemini reads handwritten notes far better than the local OCR. Free key: https://aistudio.google.com/apikey
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")

# Optional backup AI provider, used when Groq is busy, unavailable or has no key. Get a key: https://openrouter.ai/keys
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
OPENROUTER_MODEL = os.environ.get("OPENROUTER_MODEL", "openai/gpt-oss-120b:free")
OPENROUTER_VISION_MODEL = os.environ.get("OPENROUTER_VISION_MODEL", "google/gemini-2.0-flash-exp:free")
OPENROUTER_SITE_URL = os.environ.get("OPENROUTER_SITE_URL", "http://localhost")
