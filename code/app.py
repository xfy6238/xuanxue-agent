"""玄学Agent后端MVP：FastAPI :8322，排盘+档案+后台占位。"""

import contextlib
import json
import os
import sqlite3
import uuid
from pathlib import Path

from fastapi import FastAPI, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from auth import (
  bearer_uid,
  ensure_user_tables,
  hash_password,
  issue_token,
  verify_password,
  verify_token,
)
from chart import paipan
from llm import LLM_MODEL, has_key, llm_generate, llm_stream

DB = Path(__file__).parent / "xuanxue.db"
app = FastAPI(title="xuanxue-agent-mvp")
_CORS_ORIGINS = [
  o.strip()
  for o in os.environ.get(
    "CORS_ORIGINS",
    "http://127.0.0.1:3000,http://localhost:3000,http://127.0.0.1:3001,http://localhost:3001",
  ).split(",")
  if o.strip()
]
app.add_middleware(
  CORSMiddleware, allow_origins=_CORS_ORIGINS, allow_methods=["*"], allow_headers=["*"]
)


def db():
  con = sqlite3.connect(DB)
  con.execute(
    "CREATE TABLE IF NOT EXISTS charts(id TEXT PRIMARY KEY, birth TEXT, result TEXT, created TEXT default (datetime('now','localtime')))"
  )
  con.execute("CREATE TABLE IF NOT EXISTS configs(key TEXT PRIMARY KEY, value TEXT)")
  con.execute(
    "CREATE TABLE IF NOT EXISTS messages(id INTEGER PRIMARY KEY AUTOINCREMENT, chart_id TEXT, role TEXT, content TEXT, created TEXT default (datetime('now','localtime')))"
  )
  con.execute(
    "CREATE TABLE IF NOT EXISTS prompt_versions(id INTEGER PRIMARY KEY AUTOINCREMENT, persona TEXT, analyze_prompt TEXT, created TEXT default (datetime('now','localtime')))"
  )
  ensure_user_tables(con)
  with contextlib.suppress(OSError):
    os.chmod(DB, 0o600)
  return con


def _uid(authorization: str | None = None) -> int | None:
  return bearer_uid(authorization)


def save_msg(chart_id: str, role: str, content: str, uid: int | None = None):
  try:
    con = db()
    con.execute(
      "INSERT INTO messages(chart_id, role, content, user_id) VALUES(?,?,?,?)",
      (chart_id, role, content, uid),
    )
    con.commit()
    con.close()
  except (sqlite3.Error, OSError) as e:
    print(f"[xuanxue] save_msg failed: {e}")


def load_msgs(chart_id: str, limit: int = 20):
  try:
    con = db()
    rows = con.execute(
      "SELECT role, content FROM messages WHERE chart_id=? ORDER BY id DESC LIMIT ?",
      (chart_id, limit),
    ).fetchall()
    con.close()
    return [{"role": r, "content": c} for r, c in reversed(rows)]
  except (sqlite3.Error, OSError) as e:
    print(f"[xuanxue] load_msgs failed: {e}")
    return []


class ChartReq(BaseModel):
  year: int
  month: int
  day: int
  hour: int = 8
  minute: int = 30
  lon: float | None = 120.18
  gender: str = "男"
  birthplace: str = "杭州"
  unknown_hour: bool = False
  use_corr: bool = True


class AuthReq(BaseModel):
  username: str
  password: str


@app.post("/api/auth/register")
def auth_register(r: AuthReq):
  name = (r.username or "").strip()[:32]
  if not name or len(r.password) < 6:
    return {"ok": False, "error": "用户名非空且密码至少6位"}
  con = db()
  if con.execute("SELECT id FROM users WHERE username=?", (name,)).fetchone():
    con.close()
    return {"ok": False, "error": "用户名已存在"}
  cur = con.execute(
    "INSERT INTO users(username, pw_hash) VALUES(?,?)",
    (name, hash_password(r.password)),
  )
  con.commit()
  uid = cur.lastrowid
  con.close()
  if not uid:
    return {"ok": False, "error": "注册失败请重试"}
  return {"ok": True, "token": issue_token(uid, name), "username": name}


@app.post("/api/auth/login")
def auth_login(r: AuthReq):
  con = db()
  row = con.execute(
    "SELECT id, pw_hash FROM users WHERE username=?", ((r.username or "").strip(),)
  ).fetchone()
  con.close()
  if not row or not verify_password(r.password, row[1]):
    return {"ok": False, "error": "用户名或密码不对"}
  return {
    "ok": True,
    "token": issue_token(row[0], r.username.strip()),
    "username": r.username.strip(),
  }


@app.get("/api/auth/me")
def auth_me(authorization: str | None = Header(default=None)):
  token = (
    authorization[7:].strip()
    if authorization and authorization.startswith("Bearer ")
    else ""
  )
  if not token:
    return {"ok": False}
  info = verify_token(token)
  return {"ok": True, **info} if info else {"ok": False}


class ClaimReq(BaseModel):
  chartIds: list = []


@app.post("/api/auth/claim")
def auth_claim(r: ClaimReq, authorization: str | None = Header(default=None)):
  uid = _uid(authorization)
  if not uid:
    return {"ok": False, "error": "请先登录"}
  con = db()
  n = 0
  for cid in r.chartIds:
    cur = con.execute(
      "UPDATE charts SET user_id=? WHERE id=? AND user_id IS NULL", (uid, cid)
    )
    n += cur.rowcount
    con.execute(
      "UPDATE messages SET user_id=? WHERE chart_id=? AND user_id IS NULL", (uid, cid)
    )
  con.commit()
  con.close()
  return {"ok": True, "claimed": n}


class ChatReq(BaseModel):
  chartId: str
  message: str = "今年财运如何"


class ConfigReq(BaseModel):
  persona: str = "命理陪伴师，传统文化视角，娱乐参考口径"
  analyze_prompt: str = "只基于给定命盘JSON解说，禁止改干支；每段带引用；禁断言"
  temperature: float = 0.7
  model: str = "muse-spark-1.3-contributor-free"
  knowledge_enabled: bool = True
  knowledge_analyze: bool = True
  knowledge_chat: bool = True


DEFAULT_CONFIG = {
  "persona": "命理陪伴师，传统文化视角，娱乐参考口径",
  "analyze_prompt": "只基于给定命盘JSON解说，禁止改干支；每段带引用；禁断言",
  "temperature": 0.7,
  "model": "muse-spark-1.3-contributor-free",
  "knowledge_enabled": True,
  "knowledge_analyze": True,
  "knowledge_chat": True,
}


def _cfg() -> dict:
  con = db()
  row = con.execute("SELECT value FROM configs WHERE key='main'").fetchone()
  con.close()
  if row:
    try:
      d = json.loads(row[0])
      return {**DEFAULT_CONFIG, **d}
    except ValueError as e:
      print(f"[xuanxue] bad cfg in db, using default: {e}")
  return DEFAULT_CONFIG


ANALYZE_SYSTEM = "你是命理陪伴师（传统文化视角，娱乐参考口径）。只基于给定命盘JSON解说，绝不改动/编造干支；每段末尾带引用如[from:月柱庚辰]；若化用了“典籍参考”中的句子，该段必须额外追加[from:书名]（如[from:三命通会]），这是硬性要求；禁绝对断言（必/一定会）；结尾加一句“以上为娱乐参考”。只输出纯JSON（不要markdown围栏），键名必须是英文：{overview,career,love,wealth,classics,citations}。其中classics为固定“典籍说”段：必须化用“典籍参考”中的一句原文并注明[from:书名]，若典籍参考为空则写“暂无贴切典籍句”；citations数组必须包含该书名引用。"

KEYMAP = {
  "总览": "overview",
  "事业": "career",
  "感情": "love",
  "财运": "wealth",
  "典籍说": "classics",
  "引用": "citations",
}


MONTH_ALIAS = {
  "寅": "孟春初春",
  "卯": "仲春",
  "辰": "季春春末",
  "巳": "孟夏初夏",
  "午": "仲夏",
  "未": "季夏夏末",
  "申": "孟秋初秋",
  "酉": "仲秋",
  "戌": "季秋季末",
  "亥": "孟冬初冬",
  "子": "仲冬",
  "丑": "季冬冬末",
}


def _classics_ctx(result: dict, extra: str = "") -> str:
  """按日干/月支/十神组装检索：硬约束保证体例相关，失败返回空串由调用方降级。"""
  try:
    from knowledge import search as classics_search
  except ImportError:
    return ""
  p = result.get("pillars", {}) or {}
  day = p.get("day", "") or ""
  month = p.get("month", "") or ""
  day_gan = day[:1]
  ss = result.get("shishen", {}) or {}
  shishen_terms = []
  for v in ss.values():
    if isinstance(v, list):
      shishen_terms.append(str(v[0]))
      if isinstance(v[1], list):
        shishen_terms.extend(str(x) for x in v[1])
  seen, top_terms = set(), []
  for t in shishen_terms:
    if t not in ("日主",) and t not in seen:
      seen.add(t)
      top_terms.append(t)
  queries = []
  if day_gan:
    alias = MONTH_ALIAS.get(month[1:2] if len(month) > 1 else "", "")
    queries.append(
      (f"{day_gan}火{day_gan}木{month}月{alias}生用神", [day_gan], [f"{day_gan}日"])
    )
  for t in top_terms[:2]:
    queries.append((f"{t}格行事业财运吉凶", [t], [t]))
  if extra:
    queries.append((extra, [], []))
  lines, used = [], set()
  for q, must, phrases in queries:
    hits = classics_search(q, 4, must_have=must or None)
    if phrases:
      on_topic = [h for h in hits if any(ph in h["text"] for ph in phrases)]
      hits = on_topic  # 无体例命中宁可不要，不硬塞无关段落
    for h in hits[:2]:
      key = h["text"][:60]
      if key in used:
        continue
      used.add(key)
      lines.append(f"[{h['book']}] {h['text'][:220]}")
      if len(lines) >= 4:
        break
    if len(lines) >= 4:
      break
  if not lines:
    return ""
  return (
    "\n典籍参考（仅化用相关句，引用格式[from:书名]；无关则不用，不硬套）：\n"
    + "\n".join(lines)
  )


def _knowledge_on(cfg: dict, channel: str) -> bool:
  if channel in cfg:
    return bool(cfg[channel])
  return bool(cfg.get("knowledge_enabled", False))


def llm_analyze(result: dict, cfg: dict):
  dayun = [d for d in result.get("dayun", []) if d.get("ganzhi")]
  classics = _classics_ctx(result) if _knowledge_on(cfg, "knowledge_analyze") else ""
  user = (
    "命盘JSON："
    + json.dumps(
      {
        k: result.get(k)
        for k in ("pillars", "wuxing_count", "shishen", "canggan", "shengxiao")
      },
      ensure_ascii=False,
    )
    + "\n大运："
    + json.dumps(dayun[:5], ensure_ascii=False)
    + classics
    + "\n请输出总览/事业/感情/财运四段JSON。"
  )
  text = llm_generate(
    cfg.get("persona", "")
    + "\n"
    + cfg.get("analyze_prompt", "")
    + "\n"
    + ANALYZE_SYSTEM,
    user,
    model=cfg.get("model"),
    temperature=cfg.get("temperature"),
  )
  if not text:
    return None
  body = text.strip()
  if body.startswith("```"):
    body = body.strip("`").strip()
    if body.startswith("json"):
      body = body[4:].strip()
  try:
    d = json.loads(body)
  except ValueError:
    return None
  d = {KEYMAP.get(k, k): v for k, v in d.items()} if isinstance(d, dict) else None
  if not isinstance(d, dict) or not any(
    d.get(k) for k in ("overview", "career", "love", "wealth")
  ):
    return None
  for k in ("overview", "career", "love", "wealth", "classics"):
    d.setdefault(k, "")
  d.setdefault("citations", [])
  d["mode"] = "llm"
  d["model"] = cfg.get("model", LLM_MODEL)
  return d


def rules_analyze(result: dict) -> dict:
  p = result.get("pillars", {})
  wx = result.get("wuxing_count", {})
  day = p.get("day", "?")
  cit = [
    f"[from:年柱{p.get('year')}]",
    f"[from:月柱{p.get('month')}]",
    f"[from:日柱{day}]",
    f"[from:时柱{p.get('time')}]",
  ]
  wx_line = "、".join(f"{k}{v}" for k, v in sorted(wx.items())) or "五行待定"
  return {
    "overview": f"日主{day}，命局{wx_line}。{result.get('note', '')}。以下为规则模板解说（娱乐参考）。",
    "career": f"月柱{p.get('month')}主事业早局，日柱{day}看执行。五行{wx_line}，缺者宜补位协作。"
    + cit[1],
    "love": f"日柱{day}看感情，年柱{p.get('year')}看缘分背景，宜多沟通少断言。"
    + cit[2],
    "wealth": f"时柱{p.get('time')}看晚运与财库，{wx_line}，稳中求进。" + cit[3],
    "citations": cit,
    "mode": "rules",
  }


@app.get("/api/health")
def health():
  return {
    "ok": True,
    "service": "xuanxue-agent",
    "paipan": "lunar-python",
    "llm": has_key(),
    "model": LLM_MODEL,
  }


@app.post("/api/chart")
def api_chart(r: ChartReq, authorization: str | None = Header(default=None)):
  res = paipan(
    r.year,
    r.month,
    r.day,
    r.hour,
    r.minute,
    r.lon,
    r.use_corr,
    r.unknown_hour,
    r.gender,
  )
  cid = uuid.uuid4().hex[:12]
  con = db()
  con.execute(
    "INSERT INTO charts(id, birth, result, user_id) VALUES(?,?,?,?)",
    (
      cid,
      r.model_dump_json(),
      json.dumps(res, ensure_ascii=False),
      _uid(authorization),
    ),
  )
  con.commit()
  con.close()
  return {"chartId": cid, **res}


@app.get("/api/archives")
def archives(authorization: str | None = Header(default=None)):
  con = db()
  uid = _uid(authorization)
  if uid is None:
    rows = con.execute(
      "SELECT id, birth, result, created FROM charts WHERE user_id IS NULL ORDER BY created DESC LIMIT 50"
    ).fetchall()
  else:
    rows = con.execute(
      "SELECT id, birth, result, created FROM charts WHERE user_id=? ORDER BY created DESC LIMIT 50",
      (uid,),
    ).fetchall()
  con.close()
  out = []
  for i, b, rs, c in rows:
    try:
      out.append(
        {"chartId": i, "birth": json.loads(b), "result": json.loads(rs), "created": c}
      )
    except ValueError:
      out.append(
        {"chartId": i, "birth": {}, "result": {}, "created": c, "broken": True}
      )
  return out


def _get_chart(chart_id: str, uid: int | None = None) -> dict:
  con = db()
  row = con.execute(
    "SELECT result, user_id FROM charts WHERE id=?", (chart_id,)
  ).fetchone()
  con.close()
  if not row:
    return {}
  if (row[1] if row[1] is not None else None) != uid:
    return {}
  try:
    return json.loads(row[0])
  except ValueError:
    return {}


class AnalyzeReq(BaseModel):
  chartId: str


@app.post("/api/analyze")
def api_analyze(r: AnalyzeReq, authorization: str | None = Header(default=None)):
  result = _get_chart(r.chartId, _uid(authorization))
  if not result:
    return {"chartId": r.chartId, "error": "chart not found", "mode": "rules"}
  d = llm_analyze(result, _cfg())
  if d:
    return {"chartId": r.chartId, **d}
  return {"chartId": r.chartId, **rules_analyze(result)}


def _chat_ctx(result: dict, message: str = "", use_classics: bool = False) -> str:
  p = result.get("pillars", {})
  dayun = [d for d in result.get("dayun", []) if d.get("ganzhi")][:5]
  base = "命盘" + json.dumps(
    {
      "pillars": p,
      "wuxing": result.get("wuxing_count"),
      "shishen": result.get("shishen"),
    },
    ensure_ascii=False,
  )
  ctx = base + "\n大运：" + json.dumps(dayun, ensure_ascii=False)
  if use_classics:
    ctx += _classics_ctx(result, extra=message)
  return ctx


CHAT_SYSTEM = "你是命理陪伴师（传统文化视角，娱乐参考口径）。只基于给定命盘作答，不编造干支，禁绝对断言，结尾提示娱乐参考。若化用了“典籍参考”中的句子，必须标注[from:书名]。"


@app.post("/api/chat")
def api_chat(r: ChatReq, authorization: str | None = Header(default=None)):
  uid = _uid(authorization)
  result = _get_chart(r.chartId, uid)
  if not result:
    return {"chartId": r.chartId, "reply": "请先生成命盘", "mode": "rules"}
  p = result.get("pillars", {})
  hist = load_msgs(r.chartId, 10)
  hist_txt = "\n".join(f"{m['role']}:{m['content'][:300]}" for m in hist)
  cfg = _cfg()
  text = llm_generate(
    CHAT_SYSTEM,
    _chat_ctx(result, r.message, _knowledge_on(cfg, "knowledge_chat"))
    + (f"\n前情：{hist_txt}" if hist_txt else "")
    + f"\n用户追问：{r.message}",
    max_tokens=8192,
    model=cfg.get("model"),
    temperature=cfg.get("temperature"),
  )
  save_msg(r.chartId, "user", r.message, uid)
  if text:
    save_msg(r.chartId, "ai", text, uid)
    return {"chartId": r.chartId, "reply": text, "mode": "llm", "model": LLM_MODEL}
  return {
    "chartId": r.chartId,
    "reply": f"已带命盘（日柱{p.get('day')}）作答（规则版）：{r.message}——建议结合事业/感情/财运三段看，娱乐参考。",
    "mode": "rules",
  }


@app.post("/api/chat/stream")
def api_chat_stream(r: ChatReq, authorization: str | None = Header(default=None)):
  uid = _uid(authorization)
  result = _get_chart(r.chartId, uid)
  if not result:

    def _nf():
      yield 'data: {"error": "chart not found"}\n\n'

    return StreamingResponse(_nf(), media_type="text/event-stream")
  hist = load_msgs(r.chartId, 10)
  hist_txt = "\n".join(f"{m['role']}:{m['content'][:300]}" for m in hist)
  cfg = _cfg()
  use_classics = _knowledge_on(cfg, "knowledge_chat")
  prompt = (
    _chat_ctx(result, r.message, use_classics)
    + (f"\n前情：{hist_txt}" if hist_txt else "")
    + f"\n用户追问：{r.message}"
  )
  save_msg(r.chartId, "user", r.message, uid)

  def _gen():
    yield 'data: {"type": "start", "mode": "llm"}\n\n'
    buf = []
    cfg = _cfg()
    for delta in llm_stream(
      CHAT_SYSTEM, prompt, model=cfg.get("model"), temperature=cfg.get("temperature")
    ):
      buf.append(delta)
      yield (
        "data: "
        + json.dumps({"type": "delta", "text": delta}, ensure_ascii=False)
        + "\n\n"
      )
    full = "".join(buf).strip()
    if full:
      save_msg(r.chartId, "ai", full, uid)
      yield 'data: {"type": "done"}\n\n'
    else:
      p = result.get("pillars", {})
      fb = f"已带命盘（日柱{p.get('day')}）作答（规则版）：{r.message}——LLM暂不可用，娱乐参考。"
      save_msg(r.chartId, "ai", fb, uid)
      yield (
        "data: "
        + json.dumps({"type": "fallback", "text": fb}, ensure_ascii=False)
        + "\n\n"
      )

  return StreamingResponse(_gen(), media_type="text/event-stream")


@app.delete("/api/archives/{chart_id}")
def archive_delete(chart_id: str, authorization: str | None = Header(default=None)):
  uid = _uid(authorization)
  if not _get_chart(chart_id, uid):
    return {"chartId": chart_id, "deleted": False, "error": "not found"}
  con = db()
  cur = con.execute("DELETE FROM charts WHERE id=?", (chart_id,))
  con.execute("DELETE FROM messages WHERE chart_id=?", (chart_id,))
  con.commit()
  con.close()
  return {"chartId": chart_id, "deleted": cur.rowcount > 0}


@app.get("/api/archives/{chart_id}")
def archive_detail(chart_id: str, authorization: str | None = Header(default=None)):
  result = _get_chart(chart_id, _uid(authorization))
  if not result:
    return {"chartId": chart_id, "error": "chart not found"}
  con = db()
  birth = con.execute(
    "SELECT birth, created FROM charts WHERE id=?", (chart_id,)
  ).fetchone()
  con.close()
  try:
    b = json.loads(birth[0]) if birth else {}
    birth_broken = False
  except ValueError:
    b = {}
    birth_broken = True
  return {
    "chartId": chart_id,
    "birth": b,
    "birth_broken": birth_broken,
    "created": birth[1] if birth else "",
    "result": result,
    "messages": load_msgs(chart_id, 100),
  }


@app.get("/api/admin/config")
def admin_get():
  con = db()
  row = con.execute("SELECT value FROM configs WHERE key='main'").fetchone()
  con.close()
  if row:
    try:
      return json.loads(row[0])
    except ValueError as e:
      print(f"[xuanxue] bad admin config in db, using default: {e}")
  return DEFAULT_CONFIG


@app.put("/api/admin/config")
def admin_put(r: ConfigReq):
  con = db()
  old = con.execute("SELECT value FROM configs WHERE key='main'").fetchone()
  if old:
    try:
      o = json.loads(old[0])
      if o.get("persona") != r.persona or o.get("analyze_prompt") != r.analyze_prompt:
        con.execute(
          "INSERT INTO prompt_versions(persona, analyze_prompt) VALUES(?,?)",
          (o.get("persona", ""), o.get("analyze_prompt", "")),
        )
    except ValueError as e:
      print(f"[xuanxue] skip prompt snapshot: {e}")
  con.execute(
    "INSERT OR REPLACE INTO configs(key, value) VALUES('main',?)",
    (r.model_dump_json(),),
  )
  con.commit()
  con.close()
  return r.model_dump()


@app.get("/api/admin/prompts")
def admin_prompts():
  con = db()
  rows = con.execute(
    "SELECT id, persona, analyze_prompt, created FROM prompt_versions ORDER BY id DESC LIMIT 20"
  ).fetchall()
  con.close()
  return [
    {"id": i, "persona": p, "analyze_prompt": a, "created": c} for i, p, a, c in rows
  ]


class RollbackReq(BaseModel):
  id: int


@app.post("/api/admin/prompts/rollback")
def admin_rollback(r: RollbackReq):
  con = db()
  row = con.execute(
    "SELECT persona, analyze_prompt FROM prompt_versions WHERE id=?", (r.id,)
  ).fetchone()
  if not row:
    con.close()
    return {"ok": False, "error": "version not found"}
  cur = con.execute("SELECT value FROM configs WHERE key='main'").fetchone()
  try:
    cfg = json.loads(cur[0]) if cur else dict(DEFAULT_CONFIG)
  except ValueError:
    cfg = dict(DEFAULT_CONFIG)
  cfg["persona"], cfg["analyze_prompt"] = row[0], row[1]
  con.execute(
    "INSERT OR REPLACE INTO configs(key, value) VALUES('main',?)",
    (json.dumps(cfg, ensure_ascii=False),),
  )
  con.commit()
  con.close()
  return {"ok": True, "cfg": cfg}
