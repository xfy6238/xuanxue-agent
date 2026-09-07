"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getUser, setToken, setUser } from "@/lib/api";

const NAV = [
        ["录入", "/"],
        ["命盘", "/chart"],
        ["分析", "/analysis"],
        ["对话", "/chat"],
        ["档案", "/archives"],
        ["后台", "/admin"],
] as const;

export default function Nav() {
        const path = usePathname();
        const router = useRouter();
        const [user, setU] = useState<string | null>(null);
        useEffect(() => {
                setU(getUser());
        }, [path]);
        function logout() {
                setToken(null);
                setUser(null);
                setU(null);
                router.push("/");
        }
        return (
                <nav className="mx-auto flex max-w-3xl items-center gap-1 px-4 py-3">
                        <span className="mr-3 font-serif text-lg font-bold">
                                玄学Agent
                        </span>
                        {NAV.map(([t, h]) => {
                                const active =
                                        h === "/"
                                                ? path === "/"
                                                : path.startsWith(h);
                                return (
                                        <Link
                                                key={h}
                                                href={h}
                                                aria-current={
                                                        active
                                                                ? "page"
                                                                : undefined
                                                }
                                                className={`rounded px-2.5 py-1.5 text-sm font-bold transition-colors ${
                                                        active
                                                                ? "bg-[#5a6c5e] text-white shadow"
                                                                : "text-[#2b2620] hover:bg-[#e9e0cf]"
                                                }`}
                                        >
                                                {t}
                                        </Link>
                                );
                        })}
                        <span className="ml-auto flex items-center gap-2">
                                {user ? (
                                        <>
                                                <span className="text-sm text-[#6f6350]">
                                                        {user}
                                                </span>
                                                <button
                                                        onClick={logout}
                                                        className="rounded px-2.5 py-1.5 text-sm hover:bg-[#e9e0cf]"
                                                >
                                                        退出
                                                </button>
                                        </>
                                ) : (
                                        <Link
                                                href="/login"
                                                aria-current={
                                                        path.startsWith(
                                                                "/login",
                                                        )
                                                                ? "page"
                                                                : undefined
                                                }
                                                className={`rounded px-2.5 py-1.5 text-sm font-bold transition-colors ${
                                                        path.startsWith(
                                                                "/login",
                                                        ) ||
                                                        path.startsWith(
                                                                "/register",
                                                        )
                                                                ? "bg-[#5a6c5e] text-white shadow"
                                                                : "text-[#2b2620] hover:bg-[#e9e0cf]"
                                                }`}
                                        >
                                                登录
                                        </Link>
                                )}
                        </span>
                </nav>
        );
}
