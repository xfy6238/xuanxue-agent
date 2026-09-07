# 玄学Agent · 八字命理MVP（v0.3）

> 排盘要准（规则算），解盘要稳（LLM+典籍RAG+引用约束），档案可回看（登录隔离），后台可调。
> 后端 FastAPI :8322（Python零新增依赖）｜前端 Next.js :3001｜无Key规则降级不断线。

## 一键演示

```bash
./run_demo.sh  # 后端8322 + 前端3001 + 自动打开浏览器
python3 code/eval_chart.py   # D5：排盘10例+4接口，全绿秒级
python3 code/eval_rag2.py    # D1：5样本典籍引用率（约3~8分钟，调免费模型）
./backup.sh                  # D7：备份db+密钥（0600）
```

## 5分钟演示脚本

1. `/`录入1990-05-01 08:30杭州男→`/chart`命盘（四柱+十神/藏干+大运）→复制分享链接/生成海报。
2. `/analysis`生成分析→总览/事业/感情/财运+**典籍说**（`[from:渊海子平]`）。
3. `/chat`追问“今年适合跳槽吗”→流式逐字+思考动画。
4. `/login`注册→匿名档案自动认领→`/archives`搜索/删除。
5. `/admin`换模型/温度/知识开关/Prompt回滚，即时生效。

## 目录

- `code/`：app.py（接口+鉴权）/chart.py（排盘）/llm.py（Zen免费模型）/knowledge.py（824切片RAG）/auth.py（pbkdf2+JWT）/eval_*.py
- `web/src/app/`：录入/命盘/分析/对话/档案/后台/登录/分享快照
- `data/classics/`：三命通会/渊海子平/穷通宝鉴（公有领域，见README）
- 文档：01_PRD/02_技术方案/04_后续优化/05_两周开发计划/CHANGELOG

## 面试话术（对标星创AI应用全栈）

> “八字排盘必须算准，所以排盘是规则引擎（lunar-python），大模型只做解说且被命盘JSON约束；RAG灌了29万字三书原文，解盘带典籍引用，引用率评测5/5；登录是SQLite+JWT零依赖手写；SSE流式、无Key降级、后台可配模型/Prompt全齐。免费模型慢（约30~90秒），瓶颈在推理token，不在架构。”
