from functools import lru_cache

from supabase import Client, create_client

from . import config


@lru_cache(maxsize=1)
def get_client() -> Client:
    if not config.SUPABASE_URL or not config.SUPABASE_SERVICE_ROLE_KEY:
        raise RuntimeError("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in backend/.env")
    return create_client(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY)


def signed_url(path: str) -> str:
    res = get_client().storage.from_(config.STORAGE_BUCKET).create_signed_url(path, config.SIGNED_URL_TTL)
    return res.get("signedURL") or res.get("signedUrl", "")
