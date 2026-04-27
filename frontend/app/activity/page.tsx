"use client";
import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getApiKey } from "@/lib/auth";
import SidebarLayout from "@/components/SidebarLayout";
import { apiFetch, ApiError } from "@/lib/api";

// ── Shared types ──────────────────────────────────────────────────────────────

interface RequestItem {
  request_id: string;
  modality: string;
  provider: string | null;
  model: string | null;
  status: string;
  credits_deducted: number;
  latency_ms: number | null;
  error_message: string | null;
  prompt: string | null;
  created_at: string;
  output_url: string | null;
  output_path: string | null;
}

// ── Shared helpers ────────────────────────────────────────────────────────────

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function fileUrl(item: RequestItem): string | null {
  if (item.output_url) return item.output_url;
  if (item.output_path) return `${BASE}/files/${item.output_path.split(/[/\\]/).pop()}`;
  return null;
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function fmtMs(ms: number | null) {
  if (!ms) return "—";
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

const STATUS_COLORS: Record<string, string> = {
  success: "bg-emerald-500/20 text-emerald-400",
  failed:  "bg-red-500/20 text-red-400",
  pending: "bg-yellow-500/20 text-yellow-400",
};

const MODALITY_COLORS: Record<string, string> = {
  text:  "bg-blue-500/20 text-blue-400",
  image: "bg-purple-500/20 text-purple-400",
  video: "bg-rose-500/20 text-rose-400",
  audio: "bg-amber-500/20 text-amber-400",
};

// ── History Tab ───────────────────────────────────────────────────────────────

function HistoryTab() {
  const router = useRouter();
  const [items, setItems] = useState<RequestItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const LIMIT = 25;

  const [modality, setModality] = useState("");
  const [provider, setProvider] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");

  const load = useCallback(async (off = 0) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(LIMIT), offset: String(off) });
      if (modality) params.set("modality", modality);
      if (provider) params.set("provider", provider);
      if (status) params.set("status", status);
      const data = await apiFetch<{ total: number; items: RequestItem[] }>(`/api/v1/usage?${params}`);
      setItems(data.items);
      setTotal(data.total);
      setOffset(off);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) router.replace("/login");
    } finally {
      setLoading(false);
    }
  }, [modality, provider, status, router]);

  useEffect(() => { load(0); }, [load]);

  function exportCSV() {
    const headers = ["request_id", "created_at", "modality", "provider", "model", "status", "credits", "latency_ms", "prompt"].join(",");
    const rows = items.map((r) =>
      [r.request_id, r.created_at, r.modality, r.provider ?? "", r.model ?? "", r.status, r.credits_deducted, r.latency_ms ?? "", `"${(r.prompt ?? "").replace(/"/g, '""')}"`].join(",")
    );
    const blob = new Blob([[headers, ...rows].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "syphakie_history.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  const visible = search
    ? items.filter((i) => (i.prompt ?? "").toLowerCase().includes(search.toLowerCase()) || (i.model ?? "").toLowerCase().includes(search.toLowerCase()))
    : items;

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-semibold text-primary">Request History</h2>
        <button onClick={exportCSV} className="text-xs px-3 py-1.5 border border-border-2 rounded-lg text-[#aaa] hover:text-primary hover:border-[#444] transition-colors">
          Export CSV
        </button>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <input
          type="text" placeholder="Search prompt or model…" value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-surface-2/50 border border-border-2 text-primary text-sm rounded-lg px-2.5 py-1.5 flex-1 min-w-48 focus:outline-none focus:border-violet-500 placeholder-[#444]"
        />
        {[
          { label: "All modalities", value: modality, set: setModality, opts: ["text", "image", "video", "audio"] },
          { label: "All providers",  value: provider,  set: setProvider,  opts: ["openai", "anthropic", "google", "fal", "kling", "luma", "wan", "elevenlabs", "qwen", "xai", "stability"] },
          { label: "All statuses",   value: status,    set: setStatus,    opts: ["success", "failed", "pending"] },
        ].map(({ label, value, set, opts }) => (
          <select
            key={label} value={value} onChange={(e) => set(e.target.value)}
            className="bg-surface-2/50 border border-border-2 text-[#aaa] rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-violet-500"
          >
            <option value="">{label}</option>
            {opts.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        ))}
      </div>

      <div className="text-xs text-[#555] mb-3">{total} total requests</div>

      {loading ? (
        <div className="text-sm text-[#888] text-center py-12">Loading…</div>
      ) : (
        <div className="border border-border rounded-xl overflow-hidden bg-surface-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-[#555] bg-surface border-b border-border uppercase tracking-wide">
                <th className="text-left px-4 py-2.5 font-medium">Time</th>
                <th className="text-left px-4 py-2.5 font-medium">Prompt</th>
                <th className="text-left px-4 py-2.5 font-medium">Model</th>
                <th className="text-left px-4 py-2.5 font-medium">Status</th>
                <th className="text-right px-4 py-2.5 font-medium">Credits</th>
                <th className="text-right px-4 py-2.5 font-medium">Latency</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1a1a1a]">
              {visible.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-[#555] text-sm">No requests found.</td></tr>
              )}
              {visible.map((item) => (
                <tr key={item.request_id} className="hover:bg-surface-2/50 transition-colors">
                  <td className="px-4 py-3 text-xs text-[#555] whitespace-nowrap">{fmtDate(item.created_at)}</td>
                  <td className="px-4 py-3 max-w-xs">
                    <p className="text-xs text-[#ccc] truncate">{item.prompt ?? "—"}</p>
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium mt-0.5 inline-block ${MODALITY_COLORS[item.modality] ?? "bg-[#222] text-[#888]"}`}>
                      {item.modality}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-[#888] font-mono max-w-xs truncate">{item.model ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${STATUS_COLORS[item.status] ?? "bg-[#222] text-[#888]"}`}>
                      {item.status}
                    </span>
                    {item.error_message && (
                      <p className="text-xs text-red-400 mt-0.5 truncate max-w-xs" title={item.error_message}>{item.error_message}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-xs font-mono text-[#aaa]">{item.credits_deducted}</td>
                  <td className="px-4 py-3 text-right text-xs text-[#888]">{fmtMs(item.latency_ms)}</td>
                  <td className="px-4 py-3 text-right">
                    {item.output_url && (
                      <a href={item.output_url} target="_blank" rel="noopener noreferrer" className="text-xs text-violet-400 hover:text-violet-300">View</a>
                    )}
                    {item.output_path && !item.output_url && (
                      <a href={`${BASE}/files/${item.output_path.split("/").pop()}`} target="_blank" rel="noopener noreferrer" className="text-xs text-violet-400 hover:text-violet-300">View</a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total > LIMIT && (
        <div className="flex items-center justify-between mt-4 text-sm text-[#888]">
          <button onClick={() => load(Math.max(0, offset - LIMIT))} disabled={offset === 0} className="px-3 py-1.5 border border-border-2 rounded-lg text-[#aaa] disabled:opacity-40 hover:border-[#444] hover:text-primary transition-colors">
            ← Prev
          </button>
          <span className="text-xs">{offset + 1}–{Math.min(offset + LIMIT, total)} of {total}</span>
          <button onClick={() => load(offset + LIMIT)} disabled={offset + LIMIT >= total} className="px-3 py-1.5 border border-border-2 rounded-lg text-[#aaa] disabled:opacity-40 hover:border-[#444] hover:text-primary transition-colors">
            Next →
          </button>
        </div>
      )}
    </div>
  );
}

// ── Analytics Tab ─────────────────────────────────────────────────────────────

interface Summary {
  total_requests: number; success_count: number; failed_count: number;
  error_rate: number; total_credits_used: number; avg_latency_ms: number | null;
  by_modality: Record<string, number>; by_provider: Record<string, number>;
}
interface DayRow { date: string; requests: number; credits: number; errors: number; avg_latency_ms: number | null; }
interface ModelRow { model_id: string; provider: string; modality: string; requests: number; credits: number; avg_latency_ms: number | null; errors: number; error_rate: number; }
interface Percentiles { count: number; p50: number | null; p75: number | null; p90: number | null; p95: number | null; p99: number | null; min: number | null; max: number | null; }

const MODALITY_BAR_COLOR: Record<string, string> = {
  text: "bg-blue-500", image: "bg-purple-500", video: "bg-rose-500", audio: "bg-amber-500",
};

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="border border-border rounded-xl bg-surface-2 px-4 py-4">
      <p className="text-xs text-[#888] mb-1">{label}</p>
      <p className="text-2xl font-semibold text-primary">{value}</p>
      {sub && <p className="text-xs text-[#555] mt-0.5">{sub}</p>}
    </div>
  );
}

function MiniBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-24 text-xs text-[#888] truncate capitalize">{label}</span>
      <div className="flex-1 bg-[#222] rounded-full h-2">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-[#aaa] w-8 text-right">{value}</span>
    </div>
  );
}

function AnalyticsTab() {
  const router = useRouter();
  const [days, setDays] = useState(30);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [daily, setDaily] = useState<DayRow[]>([]);
  const [models, setModels] = useState<ModelRow[]>([]);
  const [percentiles, setPercentiles] = useState<Percentiles | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [s, d, m, p] = await Promise.all([
        apiFetch<Summary>("/api/v1/usage/summary"),
        apiFetch<{ days: DayRow[] }>(`/api/v1/usage/daily?days=${days}`),
        apiFetch<{ models: ModelRow[] }>(`/api/v1/usage/by-model?days=${days}`),
        apiFetch<Percentiles>(`/api/v1/usage/latency-percentiles?days=${days}`),
      ]);
      setSummary(s); setDaily(d.days); setModels(m.models); setPercentiles(p);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) router.replace("/login");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [days]); // eslint-disable-line react-hooks/exhaustive-deps

  const maxRequests = Math.max(...daily.map((d) => d.requests), 1);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-primary">Analytics</h2>
        <div className="flex items-center gap-2">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                days === d ? "bg-violet-600 text-primary border-violet-600" : "bg-surface-2/50 text-[#888] border-border-2 hover:border-[#444] hover:text-primary"
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-[#888] py-12 text-center">Loading analytics…</div>
      ) : summary ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <StatCard label="Total Requests" value={summary.total_requests} sub={`${summary.success_count} successful`} />
            <StatCard label="Credits Used" value={summary.total_credits_used.toLocaleString()} />
            <StatCard label="Avg Latency" value={fmtMs(summary.avg_latency_ms)} />
            <StatCard label="Error Rate" value={`${(summary.error_rate * 100).toFixed(1)}%`} sub={`${summary.failed_count} failed`} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="md:col-span-2 border border-border rounded-xl bg-surface-2 p-4">
              <p className="text-xs font-medium text-[#888] mb-3">Requests per day</p>
              {daily.length === 0 ? (
                <p className="text-sm text-[#555] text-center py-6">No data yet</p>
              ) : (
                <div className="flex items-end gap-0.5 h-32">
                  {daily.map((row) => {
                    const h = Math.max(Math.round((row.requests / maxRequests) * 100), 2);
                    return (
                      <div
                        key={row.date}
                        className={`flex-1 rounded-sm ${row.errors > 0 ? "bg-rose-500" : "bg-violet-500"}`}
                        style={{ height: `${h}%` }}
                        title={`${row.date}: ${row.requests} req, ${row.credits} credits`}
                      />
                    );
                  })}
                </div>
              )}
              <div className="flex justify-between text-xs text-[#444] mt-1">
                <span>{daily[0]?.date}</span>
                <span>{daily[daily.length - 1]?.date}</span>
              </div>
            </div>

            <div className="border border-border rounded-xl bg-surface-2 p-4">
              <p className="text-xs font-medium text-[#888] mb-3">By modality</p>
              <div className="space-y-2">
                {Object.entries(summary.by_modality).map(([mod, count]) => (
                  <MiniBar key={mod} label={mod} value={count} max={summary.success_count} color={MODALITY_BAR_COLOR[mod] ?? "bg-[#444]"} />
                ))}
                {Object.keys(summary.by_modality).length === 0 && <p className="text-xs text-[#555]">No data yet</p>}
              </div>
            </div>
          </div>

          {percentiles && percentiles.count > 0 && (
            <div className="border border-border rounded-xl bg-surface-2 p-4 mb-6">
              <p className="text-xs font-medium text-[#888] mb-3">Latency percentiles ({percentiles.count} requests)</p>
              <div className="grid grid-cols-5 gap-3">
                {(["p50", "p75", "p90", "p95", "p99"] as const).map((k) => (
                  <div key={k} className="text-center">
                    <p className="text-xs text-[#555]">{k}</p>
                    <p className="text-lg font-semibold text-primary">{fmtMs(percentiles[k])}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {models.length > 0 && (
            <div className="border border-border rounded-xl bg-surface-2 overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <p className="text-xs font-medium text-[#888]">Model breakdown (last {days}d)</p>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-[#555] border-b border-border bg-surface">
                    <th className="text-left px-4 py-2 font-medium">Model</th>
                    <th className="text-right px-4 py-2 font-medium">Requests</th>
                    <th className="text-right px-4 py-2 font-medium">Credits</th>
                    <th className="text-right px-4 py-2 font-medium">Avg Latency</th>
                    <th className="text-right px-4 py-2 font-medium">Error Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1a1a1a]">
                  {models.map((m) => (
                    <tr key={`${m.provider}-${m.model_id}`} className="hover:bg-surface-2/50">
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-primary text-xs">{m.model_id}</div>
                        <div className="text-xs text-[#555]">{m.provider} · {m.modality}</div>
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs text-[#aaa]">{m.requests}</td>
                      <td className="px-4 py-2.5 text-right text-xs font-mono text-[#aaa]">{m.credits}</td>
                      <td className="px-4 py-2.5 text-right text-xs text-[#888]">{fmtMs(m.avg_latency_ms)}</td>
                      <td className="px-4 py-2.5 text-right text-xs">
                        <span className={m.error_rate > 0.05 ? "text-red-400 font-medium" : "text-[#555]"}>
                          {(m.error_rate * 100).toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {summary.total_requests === 0 && (
            <div className="text-center py-16 text-[#555] text-sm">
              No requests yet. <a href="/generate" className="text-violet-400 hover:underline">Generate something</a> to see analytics.
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

// ── Gallery Tab ───────────────────────────────────────────────────────────────

function downloadFile(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.click();
}

function GalleryTab() {
  const router = useRouter();
  const [items, setItems] = useState<RequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "image" | "video" | "audio">("all");
  const [selected, setSelected] = useState<RequestItem | null>(null);

  useEffect(() => {
    apiFetch<{ total: number; items: RequestItem[] }>("/api/v1/usage?limit=100&status=success")
      .then((d) => {
        setItems(d.items.filter((i) => i.modality !== "text" && fileUrl(i)));
        setLoading(false);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) router.replace("/login");
        setLoading(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visible = filter === "all" ? items : items.filter((i) => i.modality === filter);

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-semibold text-primary">Gallery</h2>
        <div className="flex gap-1.5">
          {(["all", "image", "video", "audio"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors capitalize ${
                filter === f ? "bg-violet-600 text-primary border-violet-600" : "bg-surface-2/50 text-[#888] border-border-2 hover:border-[#444] hover:text-primary"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-[#888] text-center py-16">Loading gallery…</div>
      ) : visible.length === 0 ? (
        <div className="text-center py-16 text-[#555] text-sm">
          No {filter === "all" ? "" : filter + " "}outputs yet.{" "}
          <a href="/generate" className="text-violet-400 hover:underline">Generate something.</a>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {visible.map((item) => {
            const url = fileUrl(item);
            return (
              <div
                key={item.request_id}
                onClick={() => setSelected(item)}
                className="group cursor-pointer rounded-xl overflow-hidden border border-border bg-surface-2 hover:border-[#333] transition-colors"
              >
                <div className="aspect-square bg-surface-2/50 flex items-center justify-center relative overflow-hidden">
                  {item.modality === "image" && url && (
                    <img src={url} alt={item.prompt ?? ""} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200" />
                  )}
                  {item.modality === "video" && url && (
                    <video src={url} className="w-full h-full object-cover" muted />
                  )}
                  {item.modality === "audio" && (
                    <div className="flex flex-col items-center gap-2 p-4">
                      <svg className="w-8 h-8 text-amber-400" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
                      </svg>
                      <span className="text-xs text-[#555] text-center truncate w-full">{item.model}</span>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                  {url && (
                    <button
                      onClick={(e) => { e.stopPropagation(); downloadFile(url, `${item.request_id}.${item.modality === "video" ? "mp4" : item.modality === "audio" ? "mp3" : "png"}`); }}
                      className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 hover:bg-black/80 text-primary rounded-lg p-1"
                      title="Download"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                    </button>
                  )}
                </div>
                <div className="px-2 py-1.5">
                  <p className="text-xs text-[#aaa] truncate">{item.prompt ?? "—"}</p>
                  <p className="text-xs text-[#555]">{item.provider}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setSelected(null)}>
          <div className="bg-surface-2 border border-border-2 rounded-xl max-w-3xl w-full max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div>
                <p className="text-sm font-medium text-primary">{selected.model}</p>
                <p className="text-xs text-[#888]">{selected.provider}</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-[#555] hover:text-primary">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4">
              {selected.modality === "image" && fileUrl(selected) && (
                <img src={fileUrl(selected)!} alt="" className="w-full rounded-lg" />
              )}
              {selected.modality === "video" && fileUrl(selected) && (
                <video src={fileUrl(selected)!} controls className="w-full rounded-lg" />
              )}
              {selected.modality === "audio" && fileUrl(selected) && (
                <audio src={fileUrl(selected)!} controls className="w-full" />
              )}
              {selected.prompt && <p className="mt-3 text-sm text-[#aaa]">{selected.prompt}</p>}
              {fileUrl(selected) && (
                <a href={fileUrl(selected)!} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-xs text-violet-400 hover:underline">
                  Open original ↗
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

type ActivityTab = "history" | "analytics" | "gallery";

function ActivityContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const tab: ActivityTab = (["history", "analytics", "gallery"] as ActivityTab[]).includes(tabParam as ActivityTab)
    ? (tabParam as ActivityTab)
    : "history";

  useEffect(() => {
    if (!getApiKey()) router.replace("/login");
  }, [router]);

  function setTab(t: ActivityTab) {
    router.replace(`/activity?tab=${t}`);
  }

  return (
    <SidebarLayout>
      <div className="px-6 py-8 max-w-6xl mx-auto w-full">
        <h1 className="text-xl font-semibold text-primary mb-6">Activity</h1>

        <div className="flex gap-1 mb-6 border-b border-border">
          {([
            { id: "history",   label: "History" },
            { id: "analytics", label: "Analytics" },
            { id: "gallery",   label: "Gallery" },
          ] as { id: ActivityTab; label: string }[]).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                tab === t.id ? "border-violet-500 text-primary" : "border-transparent text-[#888] hover:text-primary"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "history"   && <HistoryTab />}
        {tab === "analytics" && <AnalyticsTab />}
        {tab === "gallery"   && <GalleryTab />}
      </div>
    </SidebarLayout>
  );
}

export default function ActivityPage() {
  return (
    <Suspense fallback={null}>
      <ActivityContent />
    </Suspense>
  );
}
