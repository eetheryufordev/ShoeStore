import hashlib
import hmac
import os
import secrets
from contextvars import ContextVar
from datetime import datetime, timedelta, timezone
from pathlib import Path

import jwt
from dotenv import load_dotenv
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

load_dotenv(Path(__file__).resolve().parent.parent / ".env")
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY")
if not JWT_SECRET_KEY:
    raise RuntimeError("JWT_SECRET_KEY must be configured in the environment")

JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60
PASSWORD_ITERATIONS = 600_000
AUTHORIZATION_CONTEXT: ContextVar[str | None] = ContextVar(
    "authorization_header",
    default=None,
)

bearer_scheme = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        PASSWORD_ITERATIONS,
    )
    return f"pbkdf2_sha256${PASSWORD_ITERATIONS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, encoded_password: str) -> bool:
    try:
        algorithm, iterations, salt_hex, expected_digest = encoded_password.split("$")
        if algorithm != "pbkdf2_sha256":
            return False
        actual_digest = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            bytes.fromhex(salt_hex),
            int(iterations),
        ).hex()
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(actual_digest, expected_digest)


def create_access_token(public_code: str, role: str) -> str:
    expires_at = datetime.now(timezone.utc) + timedelta(
        minutes=ACCESS_TOKEN_EXPIRE_MINUTES
    )
    return jwt.encode(
        {
            "sub": public_code,
            "role": role,
            "exp": expires_at,
            "iat": datetime.now(timezone.utc),
        },
        JWT_SECRET_KEY,
        algorithm=JWT_ALGORITHM,
    )


def decode_access_token(token: str) -> dict:
    try:
        claims = jwt.decode(
            token,
            JWT_SECRET_KEY,
            algorithms=[JWT_ALGORITHM],
            options={"require": ["sub", "role", "exp"]},
        )
    except jwt.PyJWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token khong hop le hoac da het han",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    if claims["role"] not in {"ADMIN", "CUSTOMER"}:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Vai tro trong token khong hop le",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return claims


def require_role(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> dict | None:
    path = request.url.path.rstrip("/")
    if path in {"/", "/health", "/auth/login", "/auth/register"}:
        return None

    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Vui long dang nhap",
            headers={"WWW-Authenticate": "Bearer"},
        )
    claims = decode_access_token(credentials.credentials)
    from user_service.database import SessionLocal
    from user_service.models import User

    with SessionLocal() as db:
        user = (
            db.query(User)
            .filter(User.public_code == claims["sub"])
            .first()
        )
        if user is None or user.role != claims["role"]:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Tai khoan khong con quyen truy cap",
                headers={"WWW-Authenticate": "Bearer"},
            )

    if path == "/auth/me":
        return {**claims, "role": user.role}

    if user.role != "ADMIN":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Chi tai khoan ADMIN duoc phep thuc hien thao tac nay",
        )
    return claims


def clear_authorization_context():
    AUTHORIZATION_CONTEXT.set(None)
