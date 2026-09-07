"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  API,
  claimCharts,
  getToken,
  loadChart,
  type ChartData,
} from "@/lib/api";
import ThinkingDots from "@/components/ThinkingDots";
import Markdown from "@/components/Markdown";
import NeedLogin, { isLogged } from "@/components/NeedLogin";

type Msg = { role: string; text?: string; content?: string };

/** AI气泡永远不留白：空内容直接给明确提示 */
function showText(m: Msg): string {
  const t = (m.text ?? m.content ?? "").trim();
  if (t) return t;
  return m.role === "ai" ? "暂时没有返回内容，请重试" : "（空消息）";
}

export default function ChatPage() {
  const [c, setC] = useState<ChartData | null>(null);
  const [authed, setAuthed] = useState<boolean | null>(null);
  // localStorage只在客户端可读：effect里同步，避免hydration mismatch（见analysis页同模式）
  useEffect(() => {
    document.title = "对话 | 玄学Agent";
    setC(loadChart());
    setAuthed(isLogged());
  }, []);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("今年财运如何");
  const [busy, setBusy] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const SUGGESTS = [
    "今年财运如何",
    "感情走向",
    "适合的行业",
    "今年适合跳槽吗",
    "健康方面注意什么",
  ];

  useEffect(() => {
    if (!c) return;
    let on = true;
    fetch(`${API}/api/archives/${c.chartId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (on && d && Array.isArray(d.messages)) {
          setMsgs(
            d.messages
              .filter((m: Msg) => m.role === "user" || m.role === "ai")
              .map((m: Msg) => ({
                role: m.role,
                text: m.content ?? m.text ?? "",
              })),
          );
        }
      })
      .catch(() => {});
    return () => {
      on = false;
    };
  }, [c]);

  async function send() {
    if (!c || busy || !input.trim()) return;
    setBusy(true);
    setStreaming(false);
    const q = input;
    setMsgs((m) => [...m, { role: "user", text: q }]);
    setInput("");
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      const t = getToken();
      if (t) headers["Authorization"] = `Bearer ${t}`;
      const r = await fetch(`${API}/api/chat/stream`, {
        method: "POST",
        headers,
        body: JSON.stringify({ chartId: c.chartId, message: q }),
      });
      if (!r.ok || !r.body) throw new Error(`HTTP ${r.status}`);
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let ai = "";
      let gotDelta = false;
      setMsgs((m) => [
        ...m,
        { role: "ai", text: "思考中（免费模型，约半分钟）…" },
      ]);
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() || "";
        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data:")) continue;
          const ev = JSON.parse(line.slice(5));
          if (ev.type === "error") {
            const n = c ? await claimCharts([c.chartId]) : 0;
            const snap =
              n > 0
                ? "该命盘已认领到你名下，请再点一次发送。"
                : "该命盘不存在或不属于当前账号，请重新录入生成。";
            setMsgs((m) => {
              const nn = [...m];
              nn[nn.length - 1] = { role: "ai", text: snap };
              return nn;
            });
            gotDelta = true;
          } else if (ev.type === "delta" && ev.text) {
            gotDelta = true;
            setStreaming(true);
            ai += ev.text;
            const snap = ai;
            setMsgs((m) => {
              const n = [...m];
              n[n.length - 1] = { role: "ai", text: snap };
              return n;
            });
          } else if (ev.type === "fallback" && ev.text) {
            const snap = ev.text + "（规则降级）";
            setMsgs((m) => {
              const n = [...m];
              n[n.length - 1] = { role: "ai", text: snap };
              return n;
            });
          }
        }
      }
      if (!gotDelta) {
        setMsgs((m) => {
          const n = [...m];
          n[n.length - 1] = { role: "ai", text: "（无响应，请重试）" };
          return n;
        });
      }
    } catch (e) {
      setMsgs((m) => [
        ...m,
        { role: "ai", text: `对话出错了，请重试（${e}）` },
      ]);
    } finally {
      setBusy(false);
      setStreaming(false);
    }
  }
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [msgs, streaming]);
  if (authed === null) return <p className="text-sm text-[#6f6350]">加载中…</p>;
  if (!authed) return <NeedLogin feature="追问对话" />;
  if (!c)
    return (
      <p className="text-sm">
        暂无命盘，请先去
        <Link className="underline" href="/">
          录入
        </Link>
        生成。
      </p>
    );
  return (
    <div className="flex h-[calc(100dvh-220px)] min-h-[420px] flex-col gap-2">
      <h1 className="font-serif text-2xl font-bold">
        追问对话
        {streaming && (
          <span className="ml-2 text-sm text-[#6f6350]">输出中…</span>
        )}
      </h1>
      <div
        ref={listRef}
        className="chat-scroller flex flex-1 flex-col gap-2 overflow-y-auto pr-1"
      >
        {msgs.length === 0 && (
          <div className="flex flex-wrap gap-2">
            {SUGGESTS.map((s) => (
              <button
                key={s}
                onClick={() => setInput(s)}
                className="rounded-full border border-[#d8cdb4] bg-white px-3 py-1.5 text-sm text-[#5a6c5e] hover:border-[#5a6c5e]"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        {msgs.map((m, i) => (
          <div
            key={i}
            className={`max-w-[85%] rounded p-3 text-sm leading-7 whitespace-pre-wrap ${m.role === "user" ? "self-end bg-[#5a6c5e] text-white" : "bg-white border border-[#d8cdb4]"}`}
          >
            {m.role === "ai" &&
            (m.text ?? m.content ?? "").startsWith("思考中") ? (
              <ThinkingDots text={showText(m).replace(/…+$/, "")} />
            ) : m.role === "ai" ? (
              <Markdown text={showText(m)} />
            ) : (
              showText(m)
            )}
          </div>
        ))}
      </div>
      <div className="sticky bottom-0 flex gap-2 bg-[#f5f1e8] pt-2 pb-1">
        <span aria-live="polite" className="visually-hidden">
          {busy ? "" : msgs.length ? "回答完毕" : ""}
        </span>
        <input
          aria-label="输入追问"
          enterKeyHint="send"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          className="min-h-[48px] flex-1 rounded border border-[#d8cdb4] bg-white px-3 py-2 text-base"
        />
        <button
          onClick={send}
          disabled={busy}
          className="min-h-[48px] rounded bg-[#5a6c5e] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
        >
          {busy ? "…" : "发送"}
        </button>
      </div>
    </div>
  );
}
