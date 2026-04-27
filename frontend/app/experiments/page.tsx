"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getApiKey } from "@/lib/auth";
import SidebarLayout from "@/components/SidebarLayout";
import { apiFetch } from "@/lib/api";

interface Variant { model_id: string; provider: string; weight: number }
interface Experiment {
  id: string;
  name: string;
  modality: string;
  variants: Variant[];
  status: string;
  winner_model_id: string | null;
  created_at: string;
}
interface VariantStats {
  requests: number;
  avg_latency_ms: number | null;
  avg_credits: number | null;
  avg_rating: number | null;
}

export default function ExperimentsPage() {
  const router = useRouter();
  const [exps, setExps] = useState<Experiment[]>([]);
  const [selected, setSelected] = useState<Experiment | null>(null);
  const [stats, setStats] = useState<Record<string, VariantStats>>({});
  const [loading, setLoading] = useState(true);

  // Create form
  const [name, setName] = useState("");
  const [modality, setModality] = useState("image");
  const [variants, setVariants] = useState<Variant[]>([
    { model_id: "", provider: "", weight: 50 },
    { model_id: "", provider: "", weight: 50 },
  ]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!getApiKey()) { router.replace("/login"); return; }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    setLoading(true);
    try {
      const d = await apiFetch<{ experiments: Experiment[] }>("/api/v1/experiments");
      setExps(d.experiments);
    } catch {}
    setLoading(false);
  }

  async function selectExp(exp: Experiment) {
    setSelected(exp);
    try {
      const d = await apiFetch<{ stats: Record<string, VariantStats> }>(`/api/v1/experiments/${exp.id}`);
      setStats(d.stats);
    } catch {}
  }

  async function create() {
    if (!name.trim() || variants.some((v) => !v.model_id || !v.provider)) return;
    setCreating(true);
    try {
      await apiFetch("/api/v1/experiments", { method: "POST", body: JSON.stringify({ name, modality, variants }) });
      setName(""); setModality("image");
      setVariants([{ model_id: "", provider: "", weight: 50 }, { model_id: "", provider: "", weight: 50 }]);
      await load();
    } catch {}
    setCreating(false);
  }

  async function conclude(expId: string) {
    try {
      await apiFetch(`/api/v1/experiments/${expId}/conclude`, { method: "POST" });
      await load();
      setSelected(null);
    } catch {}
  }

  async function deleteExp(expId: string) {
    try {
      await apiFetch(`/api/v1/experiments/${expId}`, { method: "DELETE" });
      await load();
      setSelected(null);
    } catch {}
  }

  function updateVariant(i: number, field: keyof Variant, val: string | number) {
    setVariants((prev) => prev.map((v, idx) => idx === i ? { ...v, [field]: val } : v));
  }

  const totalWeight = variants.reduce((s, v) => s + v.weight, 0);

  return (
    <SidebarLayout>
      <div className="px-6 py-8 max-w-5xl mx-auto w-full">
        <h1 className="text-xl font-semibold text-white mb-1">A/B Model Experiments</h1>
        <p className="text-xs text-[#666] mb-6">Split traffic between models, measure quality + latency, auto-conclude to the winner.</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Left — list */}
          <div className="md:col-span-1 space-y-2">
            <h2 className="text-xs font-medium text-[#555] uppercase tracking-wide mb-2">Experiments</h2>
            {loading ? <p className="text-xs text-[#666]">Loading…</p> : null}
            {exps.map((e) => (
              <button
                key={e.id}
                onClick={() => selectExp(e)}
                className={`w-full text-left border rounded-xl px-3 py-2.5 transition-colors ${selected?.id === e.id ? "border-violet-500/50 bg-violet-500/10" : "border-[#1f1f1f] bg-[#141414] hover:bg-[#181818]"}`}
              >
                <p className={`text-sm font-medium ${selected?.id === e.id ? "text-white" : "text-[#ccc]"}`}>{e.name}</p>
                <p className="text-xs text-[#666]">{e.modality} · {e.status}</p>
                {e.winner_model_id && <p className="text-xs text-emerald-400 mt-0.5">Winner: {e.winner_model_id}</p>}
              </button>
            ))}
            {!loading && exps.length === 0 && <p className="text-xs text-[#555]">No experiments yet.</p>}
          </div>

          {/* Right — detail or create */}
          <div className="md:col-span-2">
            {selected ? (
              <div className="border border-[#1f1f1f] rounded-xl bg-[#141414] p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base font-semibold text-white">{selected.name}</h2>
                  <div className="flex gap-2">
                    {selected.status === "active" && (
                      <button onClick={() => conclude(selected.id)} className="text-xs px-3 py-1 bg-violet-600 text-white rounded hover:bg-violet-500 transition-colors">
                        Conclude
                      </button>
                    )}
                    <button onClick={() => deleteExp(selected.id)} className="text-xs text-[#555] hover:text-red-400 transition-colors">Delete</button>
                  </div>
                </div>
                <div className="space-y-3">
                  {selected.variants.map((v) => {
                    const s = stats[v.model_id];
                    return (
                      <div key={v.model_id} className={`border rounded-xl p-3 ${selected.winner_model_id === v.model_id ? "border-emerald-500/40 bg-emerald-500/5" : "border-[#2a2a2a] bg-[#111]"}`}>
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-sm font-medium text-white">{v.model_id}</p>
                          <span className="text-xs text-[#666]">{v.weight}% traffic</span>
                        </div>
                        <p className="text-xs text-[#666]">{v.provider}</p>
                        {s && (
                          <div className="grid grid-cols-4 gap-2 mt-2 text-xs text-[#888]">
                            <div><span className="text-[#555] block">Requests</span>{s.requests}</div>
                            <div><span className="text-[#555] block">Avg Latency</span>{s.avg_latency_ms ? `${s.avg_latency_ms}ms` : "—"}</div>
                            <div><span className="text-[#555] block">Avg Credits</span>{s.avg_credits ?? "—"}</div>
                            <div><span className="text-[#555] block">Avg Rating</span>{s.avg_rating ? `${s.avg_rating}/5` : "—"}</div>
                          </div>
                        )}
                        {!s && <p className="text-xs text-[#444] mt-1">No results yet</p>}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="border border-[#1f1f1f] rounded-xl bg-[#141414] p-5">
                <h2 className="text-sm font-medium text-white mb-4">New Experiment</h2>
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <input
                      placeholder="Experiment name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="flex-1 border border-[#2a2a2a] rounded-lg px-2.5 py-1.5 text-sm bg-[#1a1a1a] text-white placeholder-[#555] focus:outline-none focus:border-violet-500"
                    />
                    <select value={modality} onChange={(e) => setModality(e.target.value)} className="border border-[#2a2a2a] rounded-lg px-2.5 py-1.5 text-sm bg-[#1a1a1a] text-white focus:outline-none focus:border-violet-500">
                      {["text", "image", "video", "audio"].map((m) => <option key={m}>{m}</option>)}
                    </select>
                  </div>
                  {variants.map((v, i) => (
                    <div key={i} className="grid grid-cols-3 gap-2">
                      <input placeholder="model_id" value={v.model_id} onChange={(e) => updateVariant(i, "model_id", e.target.value)} className="border border-[#2a2a2a] rounded-lg px-2.5 py-1.5 text-xs bg-[#1a1a1a] text-white placeholder-[#555] focus:outline-none focus:border-violet-500" />
                      <input placeholder="provider" value={v.provider} onChange={(e) => updateVariant(i, "provider", e.target.value)} className="border border-[#2a2a2a] rounded-lg px-2.5 py-1.5 text-xs bg-[#1a1a1a] text-white placeholder-[#555] focus:outline-none focus:border-violet-500" />
                      <div className="flex items-center gap-1">
                        <input type="number" min={0} max={100} value={v.weight} onChange={(e) => updateVariant(i, "weight", Number(e.target.value))} className="w-16 border border-[#2a2a2a] rounded-lg px-2 py-1.5 text-xs bg-[#1a1a1a] text-white focus:outline-none focus:border-violet-500" />
                        <span className="text-xs text-[#555]">%</span>
                      </div>
                    </div>
                  ))}
                  {totalWeight !== 100 && <p className="text-xs text-red-400">Weights must sum to 100 (currently {totalWeight})</p>}
                  <div className="flex gap-2">
                    <button
                      onClick={() => setVariants((v) => [...v, { model_id: "", provider: "", weight: 0 }])}
                      className="text-xs text-violet-400 hover:text-violet-300 transition-colors"
                    >
                      + Add variant
                    </button>
                    <button
                      onClick={create}
                      disabled={creating || totalWeight !== 100}
                      className="ml-auto px-4 py-1.5 bg-violet-600 text-white text-sm rounded-lg disabled:opacity-40 hover:bg-violet-500 transition-colors"
                    >
                      {creating ? "Creating…" : "Create"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </SidebarLayout>
  );
}
