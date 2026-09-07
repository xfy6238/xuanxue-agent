"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { get, saveChart, type ChartData } from "@/lib/api";
import Markdown from "@/components/Markdown";

type Detail = {
  chartId: string;
  birth: Record<string, unknown>;
  created: string;
  result: ChartData;
  messages: { role: string; text?: string; content?: string }[];
};

export default function ArchiveDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [d, setD] = useState<Detail | null>(null);
  const [msg, setMsg] = useState("加载中…");
  useEffect(() => {
    let on = true;
    get(`/api/archives/${id}`)
      .then((r) => {
        const data = r as Detail & { error?: string };
        if (on) {
          if (data.error) setMsg("档案不存在");
          else {
            setD(data);
            setMsg("");
          }
        }
      })
      .catch((e) => on && setMsg(`失败：${e}`));
    return () => {
      on = false;
    };
  }, [id]);
  if (msg) return <p className="text-sm text-[#6f6350]">{msg}</p>;
  if (!d) return null;
  const p = (d.result.pillars || {}) as Record<string, string>;
  const dayun = (Array.isArray(d.result.dayun) ? d.result.dayun : []).filter(
    (x) => x && x.ganzhi,
  );
  function reload() {
    if (d) saveChart({ ...d.result, chartId: d.chartId });
  }
  return (
    <div className="flex flex-col gap-4">
      <Link href="/archives" className="text-sm text-[#5a6c5e] underline">
        ← 返回档案列表
      </Link>
      <h1 className="font-serif text-2xl font-bold">
        {Object.values(p).join(" ") || d.chartId}
      </h1>
      <div className="text-xs text-[#6f6350]">
        {d.created} · {d.chartId}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["年柱", p.year],
          ["月柱", p.month],
          ["日柱", p.day],
          ["时柱", p.time],
        ].map(([t, v]) => (
          <div
            key={t}
            className="rounded border border-[#d8cdb4] bg-white p-4 text-center"
          >
            <div className="text-xs text-[#6f6350]">{t}</div>
            <div className="font-serif text-2xl font-bold">{v}</div>
          </div>
        ))}
      </div>
      {dayun.length > 0 && (
        <div className="rounded border border-[#d8cdb4] bg-white p-4 text-sm">
          大运：
          {dayun
            .map((x) => `${x.ganzhi}(${x.startAge}–${x.endAge}岁)`)
            .join("、")}
        </div>
      )}
      <section className="flex flex-col gap-2">
        <h2 className="font-bold">对话记录（{d.messages.length}条）</h2>
        {d.messages.length === 0 && (
          <p className="text-sm text-[#6f6350]">
            暂无对话，去追问一轮会自动存档。
          </p>
        )}
        {d.messages.map((m, i) => (
          <div
            key={i}
            className={`max-w-[85%] rounded p-3 text-sm leading-7 whitespace-pre-wrap ${m.role === "user" ? "self-end bg-[#5a6c5e] text-white" : "bg-white border border-[#d8cdb4]"}`}
          >
            {m.role === "ai" ? (
              <Markdown text={String(m.text ?? m.content ?? "")} />
            ) : (
              String(m.text ?? m.content ?? "")
            )}
          </div>
        ))}
      </section>
      <Link
        href="/chat"
        onClick={reload}
        className="flex min-h-[48px] items-center justify-center rounded bg-[#5a6c5e] px-5 py-3 text-center font-bold text-white"
      >
        载入此盘继续追问
      </Link>
    </div>
  );
}
