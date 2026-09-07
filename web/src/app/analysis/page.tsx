"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { claimCharts, loadChart, post, type ChartData } from "@/lib/api";
import ThinkingDots from "@/components/ThinkingDots";
import Markdown from "@/components/Markdown";
import NeedLogin, { isLogged } from "@/components/NeedLogin";

export default function AnalysisPage() {
  const [c, setC] = useState<ChartData | null>(null);
  const [authed, setAuthed] = useState<boolean | null>(null);
  // localStorage只在客户端可读：首渲染与服务端一致(null)，挂载后同步，避免hydration mismatch
  useEffect(() => {
    document.title = "分析 | 玄学Agent";
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 空依赖只跑一次，非级联渲染；lazy initializer会在hydration时与服务端HTML不一致
    setC(loadChart());
    setAuthed(isLogged());
  }, []);
  const [a, setA] = useState<Record<string, string> | null>(null);
  const [msg, setMsg] = useState("");
  async function run() {
    if (!c) return;
    setMsg("解盘中（免费模型思考约半分钟，请稍候）…");
    try {
      let d = await post("/api/analyze", { chartId: c.chartId });
      if (
        d.error === "chart not found" &&
        (await claimCharts([c.chartId])) > 0
      ) {
        d = await post("/api/analyze", { chartId: c.chartId });
      }
      if (d.error) {
        setMsg("该命盘不存在或不属于当前账号，请重新录入生成。");
        return;
      }
      setA(d);
      setMsg("");
    } catch (e) {
      setMsg(`解盘失败，请重试（${e}）`);
    }
  }
  if (authed === null) return <p className="text-sm text-[#6f6350]">加载中…</p>;
  if (!authed) return <NeedLogin feature="AI分析" />;
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
    <div className="flex flex-col gap-4">
      <h1 className="font-serif text-2xl font-bold">结构化分析</h1>
      <button
        onClick={run}
        className="min-h-[48px] rounded bg-[#5a6c5e] px-5 py-3 font-bold text-white"
      >
        生成分析（约半分钟）
      </button>
      {msg && (
        <p className="text-sm text-[#6f6350]">
          {msg.startsWith("解盘中") ? (
            <ThinkingDots text={msg.replace(/…+$/, "")} />
          ) : (
            msg
          )}
        </p>
      )}
      {a && (
        <>
          {[
            ["总览", a.overview],
            ["事业", a.career],
            ["感情", a.love],
            ["财运", a.wealth],
          ].map(([t, v]) => (
            <details
              key={t}
              open
              className="rounded border border-[#d8cdb4] bg-white p-4"
            >
              <summary className="cursor-pointer font-bold">{t}</summary>
              <div className="mt-2 text-sm leading-7">
                <Markdown text={String(v ?? "")} />
              </div>
            </details>
          ))}
          {a.classics ? (
            <section className="rounded border border-[#5a6c5e] bg-white p-4">
              <h2 className="mb-2 font-bold">典籍说</h2>
              <div className="text-sm leading-7">
                <Markdown text={String(a.classics)} />
              </div>
            </section>
          ) : null}
          <Link
            href="/chat"
            className="rounded border border-[#5a6c5e] px-5 py-3 text-center font-bold text-[#5a6c5e]"
          >
            继续追问
          </Link>
        </>
      )}
    </div>
  );
}
