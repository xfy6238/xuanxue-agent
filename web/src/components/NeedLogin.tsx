"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";

/** 游客门禁卡：未登录时替代受限页，讲清权益+一键去登录/注册 */
export default function NeedLogin({ feature }: { feature: string }) {
  const router = useRouter();
  const back = typeof window !== "undefined" ? window.location.pathname : "/";
  return (
    <div className="flex flex-col items-center gap-4 rounded border border-[#d8cdb4] bg-white p-8 text-center">
      <h1 className="font-serif text-xl font-bold">登录后使用{feature}</h1>
      <p className="text-sm leading-7 text-[#6f6350]">
        游客可免费排盘、看命盘。
        <br />
        {feature}需要登录才能使用（只需名字+密码，档案自动存档）。
      </p>
      <div className="flex w-full gap-2">
        <button
          onClick={() => router.push(`/login?back=${encodeURIComponent(back)}`)}
          className="min-h-[48px] flex-1 rounded bg-[#5a6c5e] px-5 py-3 font-bold text-white"
        >
          去登录
        </button>
        <button
          onClick={() =>
            router.push(`/register?back=${encodeURIComponent(back)}`)
          }
          className="min-h-[48px] flex-1 rounded border border-[#5a6c5e] px-5 py-3 font-bold text-[#5a6c5e]"
        >
          去注册
        </button>
      </div>
      <Link href="/" className="text-sm text-[#6f6350] underline">
        先去免费排盘
      </Link>
    </div>
  );
}

export function isLogged(): boolean {
  try {
    return !!localStorage.getItem("xx_token");
  } catch {
    return false;
  }
}
