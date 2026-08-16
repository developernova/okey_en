import hmac
import os

from fastapi import Header, HTTPException, status


def require_service_token(authorization: str | None = Header(default=None)) -> None:
    expected = os.getenv("LANGUAGE_ENGINE_TOKEN", "")
    supplied = ""
    if authorization and authorization.startswith("Bearer "):
        supplied = authorization.removeprefix("Bearer ").strip()

    if (
        len(expected) < 16
        or not supplied
        or not hmac.compare_digest(supplied, expected)
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid service token",
        )
