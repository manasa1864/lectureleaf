import os

from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
STORAGE_BUCKET = os.environ.get("STORAGE_BUCKET", "lectureleaf")
CORS_ORIGINS = [o.strip() for o in os.environ.get("CORS_ORIGINS", "http://localhost:5173").split(",") if o.strip()]
MAX_LECTURE_MINUTES = int(os.environ.get("MAX_LECTURE_MINUTES", "180"))
SIGNED_URL_TTL = 60 * 60  # seconds
