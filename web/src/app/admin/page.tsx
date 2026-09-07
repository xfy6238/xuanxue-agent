"use client";
import { useEffect, useState } from "react";
import { get } from "@/lib/api";
import { API } from "@/lib/api";
import NeedLogin, { isLogged } from "@/components/NeedLogin";

const MODELS = [
  "muse-spark-1.3-contributor-free",
  "muse-spark-1.2-contributor-free",
  "deepseek-v4-flash-free",
  "mimo-v2.5-free",
  "muse-spark-1.3-contributor",
];

type Version = {
  id: number;
  persona: string;
  analyze_prompt: string;
  created: string;
};

const EMPTY = {
  persona: "",
  analyze_prompt: "",
  temperature: 0.7,
  model: MODELS[0],
  knowledge_enabled: true,
  knowledge_analyze: true,
  knowledge_chat: true,
};

export default function AdminPage() {
  const [cfg, setCfg] = useState(EMPTY);
  const [msg, setMsg] = useState("加载中…");
  const [vers, setVers] = useState<Version[]>([]);
  const [authed, setAuthed] = useState<boolean | null>(null);
  function loadVers() {
    get("/api/admin/prompts")
      .then((d) => Array.isArray(d) && setVers(d as Version[]))
      .catch(() => {});
  }
  useEffect(() => {
    document.title = "后台 | 玄学Agent";
    setAuthed(isLogged());
    let on = true;
    get("/api/admin/config")
      .then((d) => {
        if (!on) return;
        setCfg({
          persona: String(d.persona || ""),
          analyze_prompt: String(d.analyze_prompt || ""),
          temperature: Number(d.temperature ?? 0.7),
          model: String(d.model || MODELS[0]),
          knowledge_enabled: d.knowledge_enabled ?? d.knowledge_analyze ?? true,
          knowledge_analyze: Boolean(
            d.knowledge_analyze ?? d.knowledge_enabled ?? true,
          ),
          knowledge_chat: Boolean(
            d.knowledge_chat ?? d.knowledge_enabled ?? true,
          ),
        });
        setMsg("");
      })
      .catch((e) => on && setMsg(`加载失败，请重试（${e}）`));
    loadVers();
    return () => {
      on = false;
    };
  }, []);
  async function save() {
    setMsg("保存中…");
    try {
      const r = await fetch(`${API}/api/admin/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cfg),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setMsg("已生效（旧Prompt已存档，可回滚）");
      loadVers();
    } catch (e) {
      setMsg(`保存失败，请重试（${e}）`);
    }
  }
  async function rollback(id: number) {
    if (!window.confirm(`回滚到版本#${id}？当前Prompt将被存档。`)) return;
    try {
      const r = await fetch(`${API}/api/admin/prompts/rollback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setCfg((c) => ({
        ...c,
        persona: d.cfg.persona,
        analyze_prompt: d.cfg.analyze_prompt,
      }));
      setMsg(`已回滚到版本#${id}`);
      loadVers();
    } catch (e) {
      setMsg(`回滚失败，请重试（${e}）`);
    }
  }
  if (authed === null) return <p className="text-sm text-[#6f6350]">加载中…</p>;
  if (!authed) return <NeedLogin feature="后台配置" />;
  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-serif text-2xl font-bold">后台配置</h1>
      {msg && <p className="text-sm text-[#6f6350]">{msg}</p>}
      <label className="flex flex-col gap-1 text-sm">
        人设
        <textarea
          value={cfg.persona}
          onChange={(e) => setCfg({ ...cfg, persona: e.target.value })}
          rows={2}
          className="rounded border border-[#d8cdb4] bg-white px-3 py-2 text-base"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        分析Prompt
        <textarea
          value={cfg.analyze_prompt}
          onChange={(e) => setCfg({ ...cfg, analyze_prompt: e.target.value })}
          rows={4}
          className="rounded border border-[#d8cdb4] bg-white px-3 py-2 text-base"
        />
      </label>
      <div className="flex gap-3">
        <label className="flex flex-1 flex-col gap-1 text-sm">
          模型
          <select
            value={cfg.model}
            onChange={(e) => setCfg({ ...cfg, model: e.target.value })}
            className="min-h-[48px] rounded border border-[#d8cdb4] bg-white px-3 py-2 text-base"
          >
            {MODELS.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-1 flex-col gap-1 text-sm">
          温度（0精确 ~ 2发散）
          <input
            type="number"
            min={0}
            max={2}
            step={0.1}
            value={cfg.temperature}
            onChange={(e) =>
              setCfg({ ...cfg, temperature: Number(e.target.value) })
            }
            className="min-h-[48px] rounded border border-[#d8cdb4] bg-white px-3 py-2 text-base"
          />
        </label>
      </div>
      <div className="flex gap-3 text-sm">
        <label className="flex flex-1 items-center gap-2">
          <input
            type="checkbox"
            checked={cfg.knowledge_analyze}
            onChange={(e) =>
              setCfg({ ...cfg, knowledge_analyze: e.target.checked })
            }
          />
          分析页用典籍RAG
        </label>
        <label className="flex flex-1 items-center gap-2">
          <input
            type="checkbox"
            checked={cfg.knowledge_chat}
            onChange={(e) =>
              setCfg({ ...cfg, knowledge_chat: e.target.checked })
            }
          />
          对话用典籍RAG
        </label>
      </div>
      <button
        onClick={save}
        className="min-h-[48px] rounded bg-[#5a6c5e] px-5 py-3 font-bold text-white"
      >
        保存生效
      </button>
      <section className="flex flex-col gap-2">
        <h2 className="font-bold">Prompt版本（{vers.length}）</h2>
        {vers.length === 0 && (
          <p className="text-sm text-[#6f6350]">
            暂无历史版本，改一次Prompt会自动存档。
          </p>
        )}
        {vers.map((v) => (
          <div
            key={v.id}
            className="rounded border border-[#d8cdb4] bg-white p-3 text-sm"
          >
            <div className="flex items-center justify-between">
              <span className="font-bold">#{v.id}</span>
              <span className="text-xs text-[#6f6350]">{v.created}</span>
            </div>
            <p className="mt-1 line-clamp-2 text-[#6f6350]">
              {v.analyze_prompt}
            </p>
            <button
              onClick={() => rollback(v.id)}
              className="mt-2 rounded border border-[#5a6c5e] px-3 py-1.5 text-sm font-bold text-[#5a6c5e]"
            >
              回滚到此版
            </button>
          </div>
        ))}
      </section>
    </div>
  );
}
