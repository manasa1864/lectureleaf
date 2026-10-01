from fastapi import Header, HTTPException

from .db import get_client


def current_user_id(authorization: str = Header(default="")) -> str:
    """Validate the Supabase access token sent by the frontend and return the user's id."""
    if not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Missing bearer token")
    token = authorization.split(" ", 1)[1].strip()
    try:
        res = get_client().auth.get_user(token)
    except Exception:
        raise HTTPException(401, "Invalid or expired token")
    if not res or not res.user:
        raise HTTPException(401, "Invalid or expired token")
    return res.user.id
