"use client";
import { Suspense, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { API, post, setToken, setUser } from "@/lib/api";

function RegisterInner() {
  const router = useRouter();
  const back = useSearchParams().get("back") || "/";
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [msg, setMsg] = useState("注册后命盘归你所有，旧匿名档案自动认领。");
  const [busy, setBusy] = useState(false);
  const flying = useRef(false);

  async function done() {
    if (!username.trim()) {
      setMsg("请输入用户名。");
      return;
    }
    if (password.length < 6) {
      setMsg("密码至少6位。");
      return;
    }
    if (password !== password2) {
      setMsg("两次输入的密码不一致。");
      return;
    }
    if (flying.current) return;
    flying.current = true;
    setBusy(true);
    setMsg("注册中…");
    try {
      let anon: string[] = [];
      try {
        const r = await fetch(`${API}/api/archives`);
        if (r.ok)
          anon = ((await r.json()) as { chartId: string }[]).map(
            (x) => x.chartId,
          );
      } catch {
        anon = [];
      }
      const d = await post("/api/auth/register", {
        username: username.trim(),
        password,
      });
      if (!d.ok) {
        setMsg(`注册失败：${d.error || "未知错误"}`);
        return;
      }
      setToken(d.token as string);
      setUser(d.username as string);
      if (anon.length > 0) {
        try {
          const c = await post("/api/auth/claim", { chartIds: anon });
          setMsg(
            `欢迎，${d.username}！已认领${c.claimed ?? 0}条旧档案，马上跳转…`,
          );
        } catch {
          setMsg(`欢迎，${d.username}！马上跳转…`);
        }
      }
      setTimeout(() => router.push(back), 800);
    } catch (e) {
      setMsg(`出错，请重试（${e}）`);
    } finally {
      flying.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-serif text-2xl font-bold">注册</h1>
      <p className="text-sm text-[#6f6350]">{msg}</p>
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
        密码（至少6位，本地加密存储）
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          className="min-h-[48px] rounded border border-[#d8cdb4] bg-white px-3 py-2 text-base"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        确认密码
        <input
          type="password"
          value={password2}
          onChange={(e) => setPassword2(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && done()}
          autoComplete="new-password"
          className="min-h-[48px] rounded border border-[#d8cdb4] bg-white px-3 py-2 text-base"
        />
      </label>
      <button
        onClick={done}
        disabled={busy}
        className="min-h-[48px] rounded bg-[#5a6c5e] px-5 py-3 font-bold text-white disabled:opacity-50"
      >
        注册
      </button>
      <p className="text-sm text-[#6f6350]">
        已有账号？
        <Link
          href={`/login?back=${encodeURIComponent(back)}`}
          className="underline"
        >
          去登录
        </Link>
      </p>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterInner />
    </Suspense>
  );
}
