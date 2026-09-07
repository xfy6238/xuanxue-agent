"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { API, get } from "@/lib/api";
import NeedLogin, { isLogged } from "@/components/NeedLogin";

type Row = {
  chartId: string;
  birth: Record<string, unknown>;
  result: { pillars?: Record<string, string> };
  created: string;
};

export default function ArchivesPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [msg, setMsg] = useState("加载中…");
  const [q, setQ] = useState("");
  const [authed, setAuthed] = useState<boolean | null>(null);
  function load() {
    setAuthed(isLogged());
    setMsg("加载中…");
    get("/api/archives")
      .then((d) => {
        setRows(d as Row[]);
        setMsg("");
      })
      .catch((e) => setMsg(`档案加载出错，请重试（${e}）`));
  }
  useEffect(load, []);
  useEffect(() => {
    document.title = "档案 | 玄学Agent";
  }, []);
  async function del(id: string) {
    if (!window.confirm("删除这条命盘档案（含对话记录）？")) return;
    try {
      const r = await fetch(`${API}/api/archives/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setRows((rows) => rows.filter((x) => x.chartId !== id));
    } catch (e) {
      setMsg(`删除失败，请重试（${e}）`);
    }
  }
  const shown = rows.filter((r) => {
    if (!q.trim()) return true;
    const hay = `${Object.values(r.result?.pillars || {}).join("")} ${r.created} ${r.chartId}`;
    return hay.includes(q.trim());
  });
  if (authed === null) return <p className="text-sm text-[#6f6350]">加载中…</p>;
  if (!authed) return <NeedLogin feature="档案" />;
  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-serif text-2xl font-bold">命盘档案</h1>
      {msg && <p className="text-sm text-[#6f6350]">{msg}</p>}
      <input
        aria-label="搜索档案"
        placeholder="搜干支 / 日期 / 编号…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="min-h-[48px] rounded border border-[#d8cdb4] bg-white px-3 py-2 text-base"
      />
      {shown.length === 0 && !msg && (
        <p className="text-sm text-[#6f6350]">
          {rows.length === 0
            ? "还没有档案，去录入生成第一张命盘吧。"
            : "没有匹配的档案，换个关键词试试。"}
        </p>
      )}
      {shown.map((r) => (
        <div
          key={r.chartId}
          className="flex items-center gap-2 rounded border border-[#d8cdb4] bg-white p-4 text-sm"
        >
          <Link
            href={`/archives/${r.chartId}`}
            className="flex-1 hover:underline"
          >
            <div className="font-bold">
              {r.result?.pillars
                ? Object.values(r.result.pillars).join(" ")
                : r.chartId}
            </div>
            <div className="mt-1 text-xs text-[#6f6350]">
              {r.created} · {r.chartId} · 查看详情→
            </div>
          </Link>
          <button
            aria-label={`删除档案${r.chartId}`}
            onClick={() => del(r.chartId)}
            className="min-h-[48px] rounded border border-[#d8cdb4] px-3 text-sm text-[#8a3b2e]"
          >
            删除
          </button>
        </div>
      ))}
    </div>
  );
}
