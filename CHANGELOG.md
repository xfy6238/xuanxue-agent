# CHANGELOG（玄学Agent）

## v0.3（2026-09-07）· 账号与分享

- 新增：本地登录注册（SQLite users + pbkdf2 + 手工HS256 JWT，零依赖）；档案按user_id隔离；登录自动认领匿名档案
- 新增：只读快照`/share/[id]`；命盘页复制分享链接+Canvas海报下载；全站按页title
- 加固：xuanxue.db/.jwt-secret/备份0600；`backup.sh`一键备份；CORS收紧本地端口

## v0.2（2026-09-07）· RAG与体验

- 新增：典籍RAG（三命通会/渊海子平/穷通宝鉴，824切片）；固定“典籍说”位，`eval_rag2.py`引用率5/5
- 新增：SSE流式追问+思考动画；对话历史持久化；追问chips；分析页折叠；档案搜索删除
- 新增：后台模型选择/温度/知识分开关/Prompt版本回滚
- 修复：hydration mismatch（三页）；Markdown裸奔（含单星号斜体）；Zen接口x-opencode-session头

## v0.1（2026-09-06）· MVP跑通

- FastAPI 8322六接口；Next.js六页；lunar-python排盘；muse-spark免费模型解盘；`run_demo.sh`一键演示
