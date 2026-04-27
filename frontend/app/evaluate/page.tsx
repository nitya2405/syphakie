"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getApiKey } from "@/lib/auth";
import SidebarLayout from "@/components/SidebarLayout";
import { apiFetch, fetchAllModels, type ModelFull } from "@/lib/api";

interface Slot {
  model_id: string;
  provider: string;
  result: ResultData | null;
  loading: boolean;
  error: string | null;
}

interface ResultData {
  request_id: string;
  output_content: string | null;
  output_url: string | null;
  latency_ms: number;
  credits_used: number;
  provider: string;
  model: string;
}

const MAX_SLOTS = 4;

export default function EvaluatePage() {
  const router = useRouter();
  const [models, setModels] = useState<ModelFull[]>([]);
  const [modality, setModality] = useState("image");
  const [prompt, setPrompt] = useState("");
  const [slots, setSlots] = useState<Slot[]>([
    { model_id: "", provider: "", result: null, loading: false, error: null },
    { model_id: "", provider: "", result: null, loading: false, error: null },
  ]);
  const [running, setRunning] = useState(false);
  const [ratings, setRatings] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!getApiKey()) { router.replace("/login"); return; }
    fetchAllModels(modality).then(setModels).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modality]);

  function updateSlot(i: number, model_id: string) {
    const m = models.find((m) => m.model_id === model_id);
    setSlots((prev) => prev.map((s, idx) => idx === i ? { ...s, model_id, provider: m?.provider || "" } : s));
  }

  async function runEval() {
    if (!prompt.trim()) return;
    const active = slots.filter((s) => s.model_id);
    if (active.length < 2) return;
    setRunning(true);
    setRatings({});

    setSlots((prev) =>
      prev.map((s) => s.model_id ? { ...s, loading: true, result: null, error: null } : s)
    );

    await Promise.all(
      active.map(async (slot, i) => {
        const slotIdx = slots.findIndex((s) => s.model_id === slot.model_id);
        try {
          const data = await apiFetch<{
            request_id: string; provider: string; model: string;
            output: { content: string | null; url: string | null };
            meta: { latency_ms: number; credits_used: number };
          }>("/api/v1/generate", {
            method: "POST",
            body: JSON.stringify({ modality, mode: "manual", model: slot.model_id, provider: slot.provider, prompt }),
          });
          setSlots((prev) =>
            prev.map((s, idx) =>
              idx === slotIdx ? {
                ...s, loading: false,
                result: {
                  request_id: data.request_id,
                  output_content: data.output.content,
                  output_url: data.output.url,
                  latency_ms: data.meta.latency_ms,
                  credits_used: data.meta.credits_used,
                  provider: data.provider,
                  model: data.model,
                },
              } : s
            )
          );
        } catch (e: unknown) {
          setSlots((prev) =>
            prev.map((s, idx) =>
              idx === slotIdx ? { ...s, loading: false, error: e instanceof Error ? e.message : "Failed" } : s
            )
          );
        }
      })
    );
    setRunning(false);
  }

  async function rate(requestId: string, rating: number) {
    setRatings((prev) => ({ ...prev, [requestId]: rating }));
    try {
      await apiFetch("/api/v1/leaderboard/rate", {
        method: "POST",
        body: JSON.stringify({ request_id: requestId, rating }),
      });
    } catch {}
  }

  const activeSlots = slots.filter((s) => s.model_id);

  return (
    <SidebarLayout>
      <div className="px-6 py-8 max-w-6xl mx-auto w-full">
        <h1 className="text-xl font-semibold text-white mb-1">Evaluation Playground</h1>
        <p className="text-xs text-[#666] mb-6">Run the same prompt across multiple models. Rate results to update the leaderboard.</p>

        {/* Config bar */}
        <div className="border border-[#1f1f1f] rounded-xl bg-[#141414] p-4 mb-5 space-y-3">
          <div className="flex gap-3 items-center">
            <select
              value={modality}
              onChange={(e) => { setModality(e.target.value); setSlots((s) => s.map((sl) => ({ ...sl, model_id: "", provider: "", result: null }))); }}
              className="border border-[#2a2a2a] rounded px-2.5 py-1.5 text-sm bg-[#1a1a1a] text-white focus:outline-none focus:border-violet-500"
            >
              {["text", "image", "video", "audio"].map((m) => <option key={m}>{m}</option>)}
            </select>
            <textarea
              placeholder="Enter prompt to evaluate across all selected models…"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={2}
              className="flex-1 border border-[#2a2a2a] rounded px-2.5 py-1.5 text-sm bg-[#1a1a1a] text-white placeholder-[#555] focus:outline-none focus:border-violet-500 resize-none"
            />
            <button
              onClick={runEval}
              disabled={running || !prompt.trim() || activeSlots.length < 2}
              className="px-4 py-2 bg-violet-600 text-white text-sm rounded disabled:opacity-40 hover:bg-violet-500 whitespace-nowrap transition-colors"
            >
              {running ? "Running…" : `Run on ${activeSlots.length} models`}
            </button>
          </div>

          {/* Model slot selectors */}
          <div className="flex gap-2 flex-wrap">
            {slots.map((slot, i) => (
              <div key={i} className="flex items-center gap-1">
                <select
                  value={slot.model_id}
                  onChange={(e) => updateSlot(i, e.target.value)}
                  className="border border-[#2a2a2a] rounded px-2 py-1 text-xs bg-[#1a1a1a] text-white focus:outline-none focus:border-violet-500"
                >
                  <option value="">— Model {i + 1} —</option>
                  {models.map((m) => (
                    <option key={m.model_id} value={m.model_id}>{m.display_name}</option>
                  ))}
                </select>
                {slots.length > 2 && (
                  <button onClick={() => setSlots((prev) => prev.filter((_, idx) => idx !== i))} className="text-[#444] hover:text-red-400 text-xs transition-colors">✕</button>
                )}
              </div>
            ))}
            {slots.length < MAX_SLOTS && (
              <button onClick={() => setSlots((prev) => [...prev, { model_id: "", provider: "", result: null, loading: false, error: null }])} className="text-xs text-violet-400 hover:text-violet-300 transition-colors">+ Model</button>
            )}
          </div>
        </div>

        {/* Results grid */}
        <div className={`grid gap-4 ${slots.filter((s) => s.model_id).length <= 2 ? "grid-cols-2" : "grid-cols-2 md:grid-cols-4"}`}>
          {slots.filter((s) => s.model_id).map((slot) => (
            <div key={slot.model_id} className="border border-[#1f1f1f] rounded-xl bg-[#141414] overflow-hidden">
              <div className="px-3 py-2 border-b border-[#1f1f1f] bg-[#111]">
                <p className="text-xs font-medium text-white truncate">{slot.model_id}</p>
                <p className="text-xs text-[#666] capitalize">{slot.provider}</p>
              </div>
              <div className="p-3">
                {slot.loading && <div className="animate-pulse h-24 bg-[#1a1a1a] rounded" />}
                {slot.error && <p className="text-xs text-red-400">{slot.error}</p>}
                {slot.result && (
                  <>
                    {slot.result.output_url && modality === "image" && (
                      <img src={slot.result.output_url} alt="output" className="w-full rounded mb-2" />
                    )}
                    {slot.result.output_url && modality === "video" && (
                      <video src={slot.result.output_url} controls className="w-full rounded mb-2" />
                    )}
                    {slot.result.output_content && (
                      <p className="text-xs text-[#ccc] mb-2 max-h-32 overflow-y-auto">{slot.result.output_content}</p>
                    )}
                    <div className="flex items-center justify-between text-xs text-[#666] mb-2">
                      <span>{slot.result.latency_ms}ms</span>
                      <span>{slot.result.credits_used} credits</span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => rate(slot.result!.request_id, 5)}
                        className={`flex-1 py-1 text-xs rounded border transition-colors ${ratings[slot.result.request_id] === 5 ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : "border-[#2a2a2a] text-[#888] hover:border-emerald-500/40 hover:text-emerald-400"}`}
                      >
                        👍 Good
                      </button>
                      <button
                        onClick={() => rate(slot.result!.request_id, 1)}
                        className={`flex-1 py-1 text-xs rounded border transition-colors ${ratings[slot.result.request_id] === 1 ? "bg-red-500/20 text-red-400 border-red-500/30" : "border-[#2a2a2a] text-[#888] hover:border-red-500/40 hover:text-red-400"}`}
                      >
                        👎 Bad
                      </button>
                    </div>
                  </>
                )}
                {!slot.loading && !slot.result && !slot.error && (
                  <p className="text-xs text-[#444] text-center py-8">Run to see output</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </SidebarLayout>
  );
}
