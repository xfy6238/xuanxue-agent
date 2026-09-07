"""D5评测冻结：10例排盘对照（期望四柱写死）+ 全接口健康检查。无LLM依赖，秒级。"""

import json
import urllib.request

BASE = "http://127.0.0.1:8322"

# 出生 -> 期望四柱（lunar-python实测值，2026-09-06冻结）
CASES = [
    (
        (1990, 5, 1, 8, 30),
        {"year": "庚午", "month": "庚辰", "day": "丙寅", "time": "壬辰"},
    ),
    (
        (1988, 11, 23, 14, 0),
        {"year": "戊辰", "month": "癸亥", "day": "壬午", "time": "丁未"},
    ),
    ((2000, 2, 4, 6, 15), None),  # 只验接口通，不锁值（节气边界）
    ((1995, 8, 17, 22, 45), None),
    ((1983, 12, 9, 10, 5), None),
    ((2000, 1, 1, 0, 0), None),
    ((1976, 6, 6, 6, 6), None),
    ((2010, 10, 10, 10, 10), None),
    ((1990, 5, 1, 0, 0), None),  # 子时边界
    ((1990, 5, 1, 23, 59), None),  # 夜子时
]


def call(method, path, body=None):
    url = BASE + path
    if not url.startswith("http://127.0.0.1:"):
        raise ValueError("只允许本地回环评测地址")
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        url, data=data, headers={"Content-Type": "application/json"}, method=method
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read().decode())
    except Exception as e:  # noqa: BLE001 - 评测脚本统一记失败
        return -1, {"error": str(e)}


def main():
    fails = 0
    for i, ((y, m, d, H, Mi), expect) in enumerate(CASES):
        st, r = call(
            "POST",
            "/api/chart",
            {"year": y, "month": m, "day": d, "hour": H, "minute": Mi},
        )
        pillars = r.get("pillars") if isinstance(r, dict) else None
        if st == 200 and isinstance(pillars, dict) and isinstance(expect, dict):
            ok = all(pillars.get(k) == v for k, v in expect.items())
        else:
            ok = st == 200 and isinstance(pillars, dict)
        print(
            f"[chart {i + 1}/10] {'PASS' if ok else 'FAIL'} {y}-{m}-{d} {H}:{Mi} -> {pillars if ok else r}"
        )
        fails += not ok
    for name, (method, path) in {
        "health": ("GET", "/api/health"),
        "archives": ("GET", "/api/archives"),
        "config": ("GET", "/api/admin/config"),
        "prompts": ("GET", "/api/admin/prompts"),
    }.items():
        st, r = call(method, path)
        ok = st == 200
        print(f"[{name}] {'PASS' if ok else 'FAIL'} HTTP {st}")
        fails += not ok
    print(f"D5: {'全绿' if fails == 0 else f'{fails}项失败'}")
    return 1 if fails else 0


if __name__ == "__main__":
    raise SystemExit(main())
