"""D6本地账号：零依赖实现（pbkdf2密码哈希 + 手工HS256 JWT），只用标准库。

- 注册：username + password(≥6位) -> users表
- 登录：校验 -> 签发JWT（默认30天）
- 验签：Authorization: Bearer <token> -> user_id；游客（无token）记为NULL
- 隔离：charts/messages读写按user_id过滤；注册后旧匿名档案可一键认领
"""

import base64
import hashlib
import hmac
import json
import os
import secrets
import sqlite3
import time

SECRET_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".jwt-secret")


def _int_env(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, str(default)))
    except (TypeError, ValueError):
        return default


TOKEN_DAYS = _int_env("TOKEN_DAYS", 30)


def _secret() -> bytes:
    try:
        with open(SECRET_FILE, "rb") as f:
            s = f.read().strip()
            if len(s) >= 32:
                return s
    except OSError:
        pass
    s = secrets.token_bytes(32)
    try:
        with open(SECRET_FILE, "wb") as f:
            f.write(s)
        os.chmod(SECRET_FILE, 0o600)
    except OSError:
        pass
    return s


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _b64url_dec(data: str) -> bytes:
    return base64.urlsafe_b64decode(data + "=" * (-len(data) % 4))


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 200_000)
    return f"pbkdf2$200000${_b64url(salt)}${_b64url(dk)}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, iters, salt_b64, dk_b64 = stored.split("$")
        dk = hashlib.pbkdf2_hmac(
            "sha256", password.encode(), _b64url_dec(salt_b64), int(iters)
        )
        return hmac.compare_digest(_b64url(dk), dk_b64)
    except (ValueError, TypeError):
        return False


def issue_token(user_id: int, username: str) -> str:
    header = _b64url(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    body = _b64url(
        json.dumps(
            {
                "uid": user_id,
                "name": username,
                "exp": int(time.time()) + TOKEN_DAYS * 86400,
            }
        ).encode()
    )
    sig = _b64url(
        hmac.new(_secret(), f"{header}.{body}".encode(), hashlib.sha256).digest()
    )
    return f"{header}.{body}.{sig}"


def verify_token(token: str):
    try:
        header_b64, body_b64, sig = token.split(".")
        want = _b64url(
            hmac.new(
                _secret(), f"{header_b64}.{body_b64}".encode(), hashlib.sha256
            ).digest()
        )
        if not hmac.compare_digest(want, sig):
            return None
        payload = json.loads(_b64url_dec(body_b64))
        if payload.get("exp", 0) < time.time():
            return None
        return {"uid": int(payload["uid"]), "name": str(payload.get("name", ""))}
    except (ValueError, TypeError, KeyError):
        return None


def bearer_uid(auth_header: str | None):
    if not auth_header or not auth_header.startswith("Bearer "):
        return None
    info = verify_token(auth_header[7:].strip())
    return info["uid"] if info else None


def ensure_user_tables(con: sqlite3.Connection):
    con.execute(
        "CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, pw_hash TEXT, created TEXT default (datetime('now','localtime')))"
    )
    for table in ("charts", "messages"):
        try:
            cols = [r[1] for r in con.execute(f"PRAGMA table_info({table})").fetchall()]
            if "user_id" not in cols:
                con.execute(f"ALTER TABLE {table} ADD COLUMN user_id INTEGER")
        except sqlite3.Error:
            pass
