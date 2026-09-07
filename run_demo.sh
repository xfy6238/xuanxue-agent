#!/bin/bash
# 玄学Agent一键演示：后端8322 + 前端3001 + 自动打开浏览器
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT/code"
pip3 install -q -r requirements.txt 2>/dev/null || pip3 install -r requirements.txt
(uvicorn app:app --port 8322 >/tmp/xuanxue_8322.log 2>&1 &) || true
sleep 3
curl -s http://127.0.0.1:8322/api/health
echo
cd "$ROOT/web"
[ -d node_modules ] || npm install
(npm run dev -- --port 3001 >/tmp/xuanxue_web.log 2>&1 &) || true
sleep 8
open "http://127.0.0.1:3001" || xdg-open "http://127.0.0.1:3001" || true
echo "后端 http://127.0.0.1:8322/api/health ｜ 前端 http://127.0.0.1:3001"
