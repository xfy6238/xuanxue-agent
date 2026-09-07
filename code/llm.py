"""LLM接入：OpenCode Zen免费模型（Responses API），失败返回None由调用方降级规则模板。"""

import json
import os
import stat
import sys
import time
import urllib.error
import urllib.request
import uuid
from urllib.parse import urlparse

SESSION_ID = f"xuanxue-{uuid.uuid4().hex[:12]}"

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"

LLM_BASE = os.environ.get("LLM_BASE_URL", "https://opencode.ai/zen/v1")
LLM_MODEL = os.environ.get("LLM_MODEL", "muse-spark-1.3-contributor-free")
LLM_KEY_FILE = os.environ.get(
    "LLM_KEY_FILE", "/tmp/pi_auth_copy.json"
)  # 用户授权拷入的凭据副本，只读不写
LLM_REASONING_EFFORT = os.environ.get(
    "LLM_REASONING_EFFORT", "low"
)  # 免费推理模型默认低思考量，约16-40秒可回；要质量设high（约90秒）


def _read_key_file(path):
    """只读用户授权拷入的凭据副本；拒绝非属主/非常规文件（防/tmp符号链接植入）。"""
    try:
        st = os.stat(path)
    except OSError:
        return None
    if not stat.S_ISREG(st.st_mode) or st.st_uid != os.getuid():
        print("[llm] refuse key file: not owned regular file")
        return None
    if st.st_mode & 0o077:
        print("[llm] warn key file is group/other readable, want 0600")
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        return data.get("opencode-go", {}).get("key")
    except (OSError, ValueError, AttributeError):
        return None


def _resolve_key():
    for k in ("OPENAI_API_KEY", "LLM_API_KEY"):
        if os.environ.get(k):
            return os.environ[k]
    return _read_key_file(LLM_KEY_FILE)


def _extract_text(resp: dict) -> str:
    texts = []
    for item in resp.get("output", []) or []:
        if item.get("type") != "message":
            continue
        for c in item.get("content", []) or []:
            if c.get("type") == "output_text" and c.get("text"):
                texts.append(c["text"])
    return "".join(texts).strip()


def _should_retry_429(err, attempt: int, retries: int) -> bool:
    code = getattr(err, "code", None)
    return isinstance(err, urllib.error.HTTPError) and code == 429 and attempt < retries


LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1"}


def _build_request(api_key: str, payload: str, stream: bool):
    """构造Responses请求；只允许https，http仅放行本地回环（本地代理联调）。"""
    parts = urlparse(LLM_BASE)
    host = parts.hostname or ""
    if parts.scheme == "https" or (parts.scheme == "http" and host in LOCAL_HOSTS):
        endpoint = parts.geturl().rstrip("/") + "/responses"
    else:
        raise ValueError(f"refuse llm endpoint scheme: {parts.scheme!r}")
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "User-Agent": UA,
        "x-opencode-session": SESSION_ID,
    }
    if stream:
        headers["Accept"] = "text/event-stream"
    return urllib.request.Request(
        endpoint, data=payload.encode(), headers=headers, method="POST"
    )


def llm_generate(
    system: str,
    user: str,
    max_tokens: int = 16384,
    retries: int = 2,
    model: str | None = None,
    temperature: float | None = None,
):
    """走Responses API；无Key/失败返回None让调用方降级为规则模板。"""
    api_key = _resolve_key()
    if not api_key:
        return None
    body = {
        "model": model or LLM_MODEL,
        "input": f"{system}\n\n{user}",
        "max_output_tokens": max_tokens,
        "reasoning": {"effort": LLM_REASONING_EFFORT},
    }
    if temperature is not None:
        body["temperature"] = temperature
    payload = json.dumps(body)
    for attempt in range(retries + 1):
        try:
            req = _build_request(api_key, payload, stream=False)
            with urllib.request.urlopen(req, timeout=150) as r:
                resp = json.loads(r.read().decode())
            return _extract_text(resp) or None
        except urllib.error.HTTPError:
            if _should_retry_429(sys.exc_info()[1], attempt, retries):
                time.sleep(5 * (attempt + 1))
                continue
            return None
        except (urllib.error.URLError, TimeoutError, ValueError) as e:
            print(f"[llm] generate failed: {e}")
            return None
    return None


def llm_stream(
    system: str,
    user: str,
    max_tokens: int = 8192,
    model: str | None = None,
    temperature: float | None = None,
):
    """走Responses流式API，逐个yield文本增量；失败即结束，由调用方降级。"""
    api_key = _resolve_key()
    if not api_key:
        return
    body = {
        "model": model or LLM_MODEL,
        "input": f"{system}\n\n{user}",
        "max_output_tokens": max_tokens,
        "reasoning": {"effort": LLM_REASONING_EFFORT},
        "stream": True,
    }
    if temperature is not None:
        body["temperature"] = temperature
    payload = json.dumps(body)
    try:
        req = _build_request(api_key, payload, stream=True)
        with urllib.request.urlopen(req, timeout=300) as r:
            for raw in r:
                line = raw.decode(errors="ignore").strip()
                if not line.startswith("data:"):
                    continue
                data = line[5:].strip()
                if data == "[DONE]":
                    break
                try:
                    ev = json.loads(data)
                except ValueError:
                    print("[llm] skip bad sse chunk")
                    continue
                if ev.get("type") == "response.output_text.delta" and ev.get("delta"):
                    yield ev["delta"]
    except urllib.error.HTTPError:
        print(f"[llm] stream http error: {sys.exc_info()[1]}")
        return
    except (urllib.error.URLError, TimeoutError, ValueError) as e:
        print(f"[llm] stream failed: {e}")
        return


def has_key() -> bool:
    return bool(_resolve_key())
