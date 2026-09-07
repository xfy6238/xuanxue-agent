"""典籍RAG：三书原文 -> 按句切片 -> Chroma本地库 -> 按日干/月支/十神检索。

切片直接复用求职Agent验证过的按句聚合链路（500字/重叠100，句界截断），
本文件内聚一份实现，保持玄学Agent可独立部署。
"""

import os
import re

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CLASSICS_DIR = os.environ.get(
    "CLASSICS_DIR", os.path.join(BASE_DIR, "..", "data", "classics")
)
CHROMA_DIR = os.environ.get(
    "CLASSICS_CHROMA_DIR", os.path.join(BASE_DIR, "classics_db")
)
COLLECTION = "classics"


def _int_env(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, str(default)))
    except (TypeError, ValueError):
        return default


CHUNK_SIZE = _int_env("CLASSICS_CHUNK_SIZE", 500)
CHUNK_OVERLAP = _int_env("CLASSICS_CHUNK_OVERLAP", 100)

BOOKS = [
    ("三命通会.txt", "三命通会"),
    ("渊海子平.txt", "渊海子平"),
    ("穷通宝鉴-五行总论.wiki.txt", "穷通宝鉴"),
    ("穷通宝鉴-十干月令.txt", "穷通宝鉴"),
]

_SENT_SPLIT_RE = re.compile(r"([。！？\n；;]+)")
_BOUNDARY_CHARS = "。！？\n；; "


def clean_wiki(text: str) -> str:
    text = re.sub(r"\{\{[^}]*\}\}", "", text)
    text = re.sub(r"\[\[(?:[^|\]]*\|)?([^\]]+)\]\]", r"\1", text)
    text = re.sub(r"^=+\s*(.*?)\s*=+$", r"\1", text, flags=re.M)
    text = re.sub(r"''+", "", text)
    return text


def chunk_text(text: str, size=CHUNK_SIZE, overlap=CHUNK_OVERLAP) -> list:
    norm = re.sub(r"[ \t\x0b\x0c]+", " ", (text or "").replace("\r\n", "\n")).strip()
    if not norm:
        return []
    if len(norm) <= size:
        return [norm]
    parts = _SENT_SPLIT_RE.split(norm)
    sentences, pending = [], ""
    for i in range(0, len(parts), 2):
        body = parts[i]
        delim = parts[i + 1] if i + 1 < len(parts) else ""
        if not body.strip():
            if delim:
                if sentences:
                    sentences[-1] += delim
                else:
                    pending += delim
            continue
        sentences.append(pending + body + delim)
        pending = ""
    sentences = [s for s in sentences if s.strip()]
    chunks, idx, carry = [], 0, ""
    while idx < len(sentences):
        cur = carry
        carry = ""
        start = idx
        while idx < len(sentences) and len(cur) + len(sentences[idx]) <= size:
            cur += sentences[idx]
            idx += 1
        if idx == start:
            carry = ""
            if len(cur) > size:
                chunks.append(cur[:size])
            continue
        chunks.append(cur)
        if idx < len(sentences) and overlap > 0 and len(cur) > overlap:
            tail = cur[-overlap:]
            for s in range(len(tail)):
                if (
                    tail[s - 1] in _BOUNDARY_CHARS
                    if s > 0
                    else cur[-overlap - 1] in _BOUNDARY_CHARS
                ):
                    carry = tail[s:]
                    break
            else:
                carry = tail
    return [c for c in chunks if c.strip()]


def get_collection():
    import chromadb

    client = chromadb.PersistentClient(path=CHROMA_DIR)
    return client.get_or_create_collection(COLLECTION)


def ingest():
    import contextlib

    import chromadb

    client = chromadb.PersistentClient(path=CHROMA_DIR)
    with contextlib.suppress(Exception):
        client.delete_collection(COLLECTION)
    col = client.get_or_create_collection(COLLECTION)
    ids, docs, metas = [], [], []
    for bi, (fname, book) in enumerate(BOOKS):
        path = os.path.join(CLASSICS_DIR, fname)
        try:
            with open(path, encoding="utf-8") as f:
                text = f.read()
        except OSError as e:
            print(f"[classics] skip {fname}: {e}")
            continue
        if fname.endswith(".wiki.txt"):
            text = clean_wiki(text)
        chunks = chunk_text(text)
        print(f"[classics] {book}: {len(text)}字 -> {len(chunks)}片")
        for k, ch in enumerate(chunks):
            ids.append(f"{book}-{bi}-{k}")
            docs.append(f"《{book}》{ch}")
            metas.append({"book": book, "chunk": k})
    BATCH = 100
    for s in range(0, len(ids), BATCH):
        col.upsert(
            ids=ids[s : s + BATCH],
            documents=docs[s : s + BATCH],
            metadatas=metas[s : s + BATCH],
        )
    print(f"[classics] done. count={col.count()}")
    return col.count()


def _rerank(query: str, docs: list, metas: list, n: int) -> list:
    """向量Top10 -> 字面覆盖重排：古文embedding弱，2字词命中数能有效纠偏。"""
    grams = {
        query[i : i + 2] for i in range(len(query) - 1) if query[i : i + 2].strip()
    }
    scored = []
    for rank, (d, m) in enumerate(zip(docs, metas, strict=True)):
        hit = sum(1 for g in grams if g in (d or ""))
        scored.append((hit - rank * 0.1, d, m))
    scored.sort(key=lambda x: -x[0])
    return [{"book": (m or {}).get("book", ""), "text": d} for _, d, m in scored[:n]]


def search(query: str, n: int = 3, must_have: list | None = None) -> list:
    """返回 [{book, text}]，库空/失败返回空列表由调用方降级。

    must_have：硬约束字词（如日干"丙"+月支"辰"），先过滤再重排；
    过滤掏空则回退纯向量结果，保证不断线。"""
    try:
        col = get_collection()
        if col.count() == 0:
            return []
        r = col.query(query_texts=[query], n_results=min(30, col.count()))
        docs = (r.get("documents") or [[]])[0]
        metas = (r.get("metadatas") or [[]])[0]
        pairs = list(zip(docs, metas, strict=True))
        if must_have:
            kept = [(d, m) for d, m in pairs if all(t in (d or "") for t in must_have)]
            if kept:
                pairs = kept
        docs2 = [d for d, _ in pairs]
        metas2 = [m for _, m in pairs]
        return _rerank(query, docs2, metas2, n)
    except Exception as e:
        print(f"[classics] search failed: {e}")
        return []


if __name__ == "__main__":
    ingest()
