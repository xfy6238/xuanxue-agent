"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { get, type ChartData } from "@/lib/api";
import Markdown from "@/components/Markdown";

type Detail = {
    chartId: string;
    created: string;
    result: ChartData;
    messages: { role: string; text?: string; content?: string }[];
    error?: string;
};

/** 只读快照：公开分享页，无需登录，无操作按钮 */
export default function SharePage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = use(params);
    const [d, setD] = useState<Detail | null>(null);
    const [msg, setMsg] = useState("加载中…");
    useEffect(() => {
        document.title = "命盘快照 | 玄学Agent";
        let on = true;
        get(`/api/archives/${id}`)
            .then((r) => {
                const data = r as Detail;
                if (on) {
                    if (data.error) setMsg("该快照不存在或已被删除。");
                    else {
                        setD(data);
                        setMsg("");
                    }
                }
            })
            .catch(() => on && setMsg("加载失败，请重试。"));
        return () => {
            on = false;
        };
    }, [id]);
    if (msg) return <p className="text-sm text-[#6f6350]">{msg}</p>;
    if (!d) return null;
    const p = (d.result.pillars || {}) as Record<string, string>;
    return (
        <div className="flex flex-col gap-4">
            <h1 className="font-serif text-2xl font-bold">
                命盘快照 · {Object.values(p).join(" ")}
            </h1>
            <div className="text-xs text-[#6f6350]">{d.created}</div>
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
            {d.messages.length > 0 && (
                <section className="flex flex-col gap-2">
                    <h2 className="font-bold">解语摘选</h2>
                    {d.messages
                        .filter((m) => m.role === "ai")
                        .slice(0, 3)
                        .map((m, i) => (
                            <div
                                key={i}
                                className="rounded border border-[#d8cdb4] bg-white p-3 text-sm leading-7"
                            >
                                <Markdown
                                    text={String(
                                        m.text ?? m.content ?? "",
                                    ).slice(0, 300)}
                                />
                            </div>
                        ))}
                </section>
            )}
            <p className="text-xs text-[#6f6350]">
                传统文化视角 · 娱乐参考，不做确定性断言
            </p>
            <Link
                href="/"
                className="rounded bg-[#5a6c5e] px-5 py-3 text-center font-bold text-white"
            >
                我也要测一张
            </Link>
        </div>
    );
}
