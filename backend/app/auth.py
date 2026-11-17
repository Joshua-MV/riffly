"""Request authentication.

* ``local`` mode: every request acts as one fixed developer user. Only for running the
  product on a laptop without credentials; ``Settings`` refuses it in production.
* ``supabase`` mode: verifies the ``Authorization: Bearer <access token>`` issued by
  Supabase Auth — HS256 with the project JWT secret, or asymmetric keys via the project's
  JWKS endpoint.
"""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from typing import Annotated

import jwt
from fastapi import Depends, Header, HTTPException, status

from .config import Settings, get_settings

LOCAL_USER_ID = "00000000-0000-0000-0000-000000000001"


@dataclass(frozen=True)
class CurrentUser:
    id: str
    email: str | None = None


@lru_cache
def _jwks_client(url: str) -> jwt.PyJWKClient:
    return jwt.PyJWKClient(f"{url.rstrip('/')}/auth/v1/.well-known/jwks.json", cache_keys=True)


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


def verify_supabase_token(token: str, settings: Settings) -> CurrentUser:
    try:
        if settings.supabase_jwt_secret:
            claims = jwt.decode(
                token, settings.supabase_jwt_secret, algorithms=["HS256"], audience="authenticated"
            )
        else:
            assert settings.supabase_url
            key = _jwks_client(settings.supabase_url).get_signing_key_from_jwt(token)
            claims = jwt.decode(
                token, key.key, algorithms=["ES256", "RS256"], audience="authenticated"
            )
    except jwt.ExpiredSignatureError as exc:
        raise _unauthorized("Session expired") from exc
    except jwt.PyJWTError as exc:
        raise _unauthorized("Invalid access token") from exc
    sub = claims.get("sub")
    if not sub:
        raise _unauthorized("Token has no subject")
    return CurrentUser(id=sub, email=claims.get("email"))


def get_current_user(
    settings: Annotated[Settings, Depends(get_settings)],
    authorization: Annotated[str | None, Header()] = None,
) -> CurrentUser:
    if settings.auth_mode == "local":
        return CurrentUser(id=LOCAL_USER_ID, email="local@riffly.dev")
    if not authorization or not authorization.lower().startswith("bearer "):
        raise _unauthorized("Missing bearer token")
    return verify_supabase_token(authorization.split(" ", 1)[1].strip(), settings)


UserDep = Annotated[CurrentUser, Depends(get_current_user)]
