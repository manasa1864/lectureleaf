import threading

from supabase import Client, create_client

from . import config

_local = threading.local()


def get_client() -> Client:
    """A Supabase client for the current thread. Sharing one connection between the job workers and the
    API request threads caused sporadic connection errors, so each thread gets its own."""
    client = getattr(_local, "client", None)
    if client is None:
        if not config.SUPABASE_URL or not config.SUPABASE_SERVICE_ROLE_KEY:
            raise RuntimeError("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in backend/.env")
        client = _local.client = create_client(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY)
    return client


def signed_url(path: str) -> str:
    res = get_client().storage.from_(config.STORAGE_BUCKET).create_signed_url(path, config.SIGNED_URL_TTL)
    return res.get("signedURL") or res.get("signedUrl", "")
