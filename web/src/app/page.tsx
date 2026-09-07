"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { post, saveChart } from "@/lib/api";

export default function Home() {
  useEffect(() => {
    document.title = "录入 | 玄学Agent";
  }, []);
  const router = useRouter();
  const [f, setF] = useState({
    year: 1990,
    month: 5,
    day: 1,
    hour: 8,
    minute: 30,
    gender: "男",
    birthplace: "杭州",
  });
  const [msg, setMsg] = useState("");
  const set = (k: string, v: string | number) =>
    setF((s) => ({ ...s, [k]: v }));

  async function submit() {
    setMsg("排盘中…");
    try {
      const d = await post("/api/chart", {
        ...f,
        lon: 120.18,
        use_corr: true,
        unknown_hour: false,
      });
      saveChart(d);
      router.push("/chart");
    } catch (e) {
      setMsg(`失败：${e}（确认后端8322已启动）`);
    }
  }

  const num = (
    k: "year" | "month" | "day" | "hour" | "minute",
    label: string,
    min: number,
    max: number,
  ) => (
    <label className="flex flex-col gap-1 text-sm">
      {label}
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        enterKeyHint="next"
        value={f[k]}
        onChange={(e) => {
          const n = Number(e.target.value.replace(/[^0-9]/g, ""));
          if (e.target.value === "") return;
          if (Number.isFinite(n)) set(k, Math.min(max, Math.max(min, n)));
        }}
        className="min-h-[48px] rounded border border-[#d8cdb4] bg-white px-3 py-2 text-base"
      />
    </label>
  );

  return (
    <div className="flex flex-col gap-5">
      <h1 className="font-serif text-2xl font-bold">出生信息录入</h1>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
        {num("year", "年", 1900, 2026)}
        {num("month", "月", 1, 12)}
        {num("day", "日", 1, 31)}
        {num("hour", "时", 0, 23)}
        {num("minute", "分", 0, 59)}
      </div>
      <div className="flex gap-3">
        <label className="flex flex-1 flex-col gap-1 text-sm">
          性别
          <select
            value={f.gender}
            onChange={(e) => set("gender", e.target.value)}
            className="min-h-[48px] rounded border border-[#d8cdb4] bg-white px-3 py-2 text-base"
          >
            <option>男</option>
            <option>女</option>
          </select>
        </label>
        <label className="flex flex-1 flex-col gap-1 text-sm">
          出生地
          <input
            value={f.birthplace}
            enterKeyHint="done"
            onChange={(e) => set("birthplace", e.target.value)}
            className="min-h-[48px] rounded border border-[#d8cdb4] bg-white px-3 py-2 text-base"
          />
        </label>
      </div>
      <button
        onClick={submit}
        className="min-h-[48px] rounded bg-[#5a6c5e] px-5 py-3 font-bold text-white hover:opacity-90"
      >
        生成命盘
      </button>
      {msg && <p className="text-sm text-[#6f6350]">{msg}</p>}
    </div>
  );
}
