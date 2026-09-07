"""D1评测：固定典籍位引用率。5个样本 -> chart -> analyze，检查classics非空且含[from:书名]。"""

import json
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:8322"
BOOKS = ("三命通会", "渊海子平", "穷通宝鉴")
SAMPLES = [
    {"year": 1990, "month": 5, "day": 1, "hour": 8, "minute": 30, "gender": "男"},
    {"year": 1988, "month": 11, "day": 23, "hour": 14, "minute": 0, "gender": "女"},
    {"year": 2000, "month": 2, "day": 4, "hour": 6, "minute": 15, "gender": "男"},
    {"year": 1995, "month": 8, "day": 17, "hour": 22, "minute": 45, "gender": "女"},
    {"year": 1983, "month": 12, "day": 9, "hour": 10, "minute": 5, "gender": "男"},
]


def post(path, body):
    url = BASE + path
    if not url.startswith("http://127.0.0.1:"):
        raise ValueError("只允许本地回环评测地址")
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            return json.loads(r.read().decode())
    except (urllib.error.URLError, TimeoutError, ValueError) as e:
        return {"error": str(e)}


def main():
    hits = 0
    for i, s in enumerate(SAMPLES):
        c = post("/api/chart", s)
        if "chartId" not in c:
            print(f"[{i + 1}/5] chart failed: {c.get('error')}")
            continue
        d = post("/api/analyze", {"chartId": c["chartId"]})
        classics = str(d.get("classics", ""))
        ok = bool(classics.strip()) and any(f"[from:{b}]" in classics for b in BOOKS)
        hits += ok
        print(f"[{i + 1}/5] {c['pillars']} mode={d.get('mode')} classics cited: {ok}")
        print("   ", classics[:140].replace("\n", " "))
    print(f"引用率: {hits}/5 = {hits / 5:.0%}（目标≥80%）")
    return 0 if hits / 5 >= 0.8 else 1


if __name__ == "__main__":
    raise SystemExit(main())
