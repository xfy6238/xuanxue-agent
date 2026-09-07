"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { loadChart, type ChartData } from "@/lib/api";
import { isLogged } from "@/components/NeedLogin";

const PILLARS = [
  ["年柱", "year"],
  ["月柱", "month"],
  ["日柱", "day"],
  ["时柱", "time"],
] as const;

function shareUrl(id: string): string {
  return `${window.location.origin}/share/${id}`;
}

function shareCopy(id: string, done: (t: string) => void) {
  const url = shareUrl(id);
  if (navigator.clipboard) {
    navigator.clipboard.writeText(url).then(
      () => done("分享链接已复制，发给朋友打开即看快照。"),
      () => done(url),
    );
  } else {
    done(url);
  }
}

function poster(c: ChartData, done: (t: string) => void) {
  const p = (c.pillars || {}) as Record<string, string>;
  const cv = document.createElement("canvas");
  cv.width = 750;
  cv.height = 1000;
  const g = cv.getContext("2d");
  if (!g) {
    done("当前浏览器不支持海报生成");
    return;
  }
  g.fillStyle = "#f5f1e8";
  g.fillRect(0, 0, 750, 1000);
  g.fillStyle = "#2b2620";
  g.textAlign = "center";
  g.font = "bold 54px serif";
  g.fillText("玄学Agent · 命盘", 375, 120);
  g.font = "44px serif";
  const keys = ["year", "month", "day", "time"];
  const labels = ["年柱", "月柱", "日柱", "时柱"];
  keys.forEach((k, i) => {
    const x = 110 + i * 175;
    g.fillStyle = "#ffffff";
    g.fillRect(x - 80, 200, 160, 220);
    g.fillStyle = "#6f6350";
    g.font = "28px sans-serif";
    g.fillText(labels[i], x, 245);
    g.fillStyle = "#2b2620";
    g.font = "bold 52px serif";
    g.fillText(p[k] || "—", x, 330);
  });
  g.fillStyle = "#6f6350";
  g.font = "26px sans-serif";
  g.fillText("传统文化视角 · 娱乐参考", 375, 500);
  g.fillStyle = "#5a6c5e";
  g.font = "30px sans-serif";
  g.fillText("扫码同款：" + window.location.origin, 375, 580);
  g.fillStyle = "#6f6350";
  g.font = "26px monospace";
  g.fillText(`/share/${c.chartId}`, 375, 630);
  const a = document.createElement("a");
  a.download = `命盘-${c.chartId}.png`;
  a.href = cv.toDataURL("image/png");
  a.click();
  done("海报已下载，快照链接：" + shareUrl(c.chartId));
}

function fmtShiShen(v: unknown): string {
  if (v == null || v === "未知") return "—";
  if (typeof v === "string") return v;
  if (Array.isArray(v)) {
    const [gan, zhi] = v as [string, string[]];
    return [gan, ...(Array.isArray(zhi) ? zhi : [])].join("·");
  }
  return String(v);
}

export default function ChartPage() {
  const router = useRouter();
  const [c, setC] = useState<ChartData | null>(null);
  const [ready, setReady] = useState(false);
  const [tip, setTip] = useState("");
  useEffect(() => {
    document.title = "命盘 | 玄学Agent";
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 空依赖只跑一次，非级联渲染；lazy initializer会在hydration时与服务端HTML不一致
    setC(loadChart());
    setReady(true);
  }, []);
  if (!ready) return <p className="text-sm text-[#6f6350]">加载中…</p>;
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
  const p = (c.pillars || {}) as Record<string, string>;
  const wx = (c.wuxing_count || {}) as Record<string, number>;
  const ss = (c.shishen || {}) as Record<string, unknown>;
  const cg = (c.canggan || {}) as Record<string, string[]>;
  const dayun = (Array.isArray(c.dayun) ? c.dayun : []).filter(
    (d) => d && d.ganzhi,
  ) as { startAge: number; endAge: number; ganzhi: string }[];
  return (
    <div className="flex flex-col gap-5">
      <h1 className="font-serif text-2xl font-bold">
        命盘 · {c.shengxiao ? `${c.shengxiao}年` : ""}
      </h1>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {PILLARS.map(([t, k]) => (
          <div
            key={t}
            className="rounded border border-[#d8cdb4] bg-white p-4 text-center"
          >
            <div className="text-xs text-[#6f6350]">{t}</div>
            <div className="font-serif text-2xl font-bold">{p[k] || "—"}</div>
            <div className="mt-1 text-xs text-[#5a6c5e]">
              {fmtShiShen(ss[k])}
            </div>
            <div className="mt-1 text-xs text-[#6f6350]">
              藏{(cg[k] || []).join(" ") || "—"}
            </div>
          </div>
        ))}
      </div>
      <div className="rounded border border-[#d8cdb4] bg-white p-4 text-sm">
        五行：
        {Object.entries(wx)
          .map(([k, v]) => `${k}${v}`)
          .join("、") || "—"}
        <span className="ml-3 text-[#6f6350]">{String(c.note || "")}</span>
      </div>
      {dayun.length > 0 && (
        <section className="rounded border border-[#d8cdb4] bg-white p-4">
          <h2 className="mb-2 font-bold">大运</h2>
          <ol className="flex flex-col gap-1 text-sm">
            {dayun.map((d) => (
              <li
                key={d.startAge}
                className="flex justify-between border-b border-[#f0e9d8] py-1 last:border-0"
              >
                <span className="font-serif font-bold">{d.ganzhi}</span>
                <span className="text-[#6f6350]">
                  {d.startAge}–{d.endAge}岁
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}
      <div className="text-xs text-[#6f6350]">
        校正后：{String(c.corrected_time || "")} · chartId {c.chartId}
      </div>
      <Link
        href="/analysis"
        className="flex min-h-[48px] items-center justify-center rounded bg-[#5a6c5e] px-5 py-3 text-center font-bold text-white"
      >
        看AI结构化分析
      </Link>
      <div className="flex gap-2">
        <button
          onClick={() => {
            if (!isLogged()) {
              router.push("/login?back=/chart");
              return;
            }
            shareCopy(c.chartId, setTip);
          }}
          className="min-h-[48px] flex-1 rounded border border-[#5a6c5e] px-4 py-2 text-sm font-bold text-[#5a6c5e]"
        >
          复制分享链接
        </button>
        <button
          onClick={() => {
            if (!isLogged()) {
              router.push("/login?back=/chart");
              return;
            }
            poster(c, setTip);
          }}
          className="min-h-[48px] flex-1 rounded border border-[#5a6c5e] px-4 py-2 text-sm font-bold text-[#5a6c5e]"
        >
          生成海报
        </button>
      </div>
      {tip && <p className="text-sm text-[#6f6350]">{tip}</p>}
    </div>
  );
}
