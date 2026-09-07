"use client";
import { Suspense, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { claimCharts, loadChart, post, setToken, setUser } from "@/lib/api";

function LoginInner() {
  const router = useRouter();
  const back = useSearchParams().get("back") || "/";
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const flying = useRef(false);

  async function done() {
    if (!username.trim() || !password) {
      setMsg("请输入用户名和密码。");
      return;
    }
    if (flying.current) return;
    flying.current = true;
    setBusy(true);
    setMsg("登录中…");
    try {
      const d = await post("/api/auth/login", {
        username: username.trim(),
        password,
      });
      if (!d.ok) {
        setMsg(`登录失败：${d.error || "未知错误"}`);
        return;
      }
      setToken(d.token as string);
      setUser(d.username as string);
      const local = loadChart();
      if (local) await claimCharts([local.chartId]);
      router.push(back);
    } catch (e) {
      setMsg(`出错，请重试（${e}）`);
    } finally {
      flying.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-serif text-2xl font-bold">登录</h1>
      {msg && <p className="text-sm text-[#6f6350]">{msg}</p>}
      <label className="flex flex-col gap-1 text-sm">
        用户名
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          className="min-h-[48px] rounded border border-[#d8cdb4] bg-white px-3 py-2 text-base"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        密码
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && done()}
          autoComplete="current-password"
          className="min-h-[48px] rounded border border-[#d8cdb4] bg-white px-3 py-2 text-base"
        />
      </label>
      <button
        onClick={done}
        disabled={busy}
        className="min-h-[48px] rounded bg-[#5a6c5e] px-5 py-3 font-bold text-white disabled:opacity-50"
      >
        登录
      </button>
      <p className="text-sm text-[#6f6350]">
        还没有账号？
        <Link
          href={`/register?back=${encodeURIComponent(back)}`}
          className="underline"
        >
          去注册
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  );
}
