export const API = process.env.NEXT_PUBLIC_API || "http://127.0.0.1:8322";

export type ChartData = {
  chartId: string;
  pillars?: Record<string, string>;
  wuxing_count?: Record<string, number>;
  shengxiao?: string;
  corrected_time?: string;
  note?: string;
  [k: string]: unknown;
};

export function loadChart(): ChartData | null {
  try {
    const s = localStorage.getItem("xx_chart");
    return s ? (JSON.parse(s) as ChartData) : null;
  } catch {
    return null;
  }
}
export function saveChart(c: ChartData) {
  try {
    localStorage.setItem("xx_chart", JSON.stringify(c));
  } catch {
    /* storage full/blocked: ignore, chart stays in memory */
  }
}

export function getToken(): string | null {
  try {
    return localStorage.getItem("xx_token");
  } catch {
    return null;
  }
}
export function setToken(t: string | null) {
  try {
    if (t) localStorage.setItem("xx_token", t);
    else localStorage.removeItem("xx_token");
  } catch {
    /* ignore */
  }
}
export function getUser(): string | null {
  try {
    return localStorage.getItem("xx_user");
  } catch {
    return null;
  }
}
export function setUser(u: string | null) {
  try {
    if (u) localStorage.setItem("xx_user", u);
    else localStorage.removeItem("xx_user");
  } catch {
    /* ignore */
  }
}

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  const t = getToken();
  if (t) h["Authorization"] = `Bearer ${t}`;
  return h;
}

export async function claimCharts(ids: string[]): Promise<number> {
  if (!getToken() || ids.length === 0) return 0;
  try {
    const d = await post("/api/auth/claim", { chartIds: ids });
    return Number(d.claimed ?? 0);
  } catch {
    return 0;
  }
}

export async function post(path: string, body: Record<string, unknown>) {
  const r = await fetch(`${API}${path}`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
export async function get(path: string) {
  const r = await fetch(`${API}${path}`, { headers: authHeaders() });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
