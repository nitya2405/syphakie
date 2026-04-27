"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getApiKey } from "@/lib/auth";
import SidebarLayout from "@/components/SidebarLayout";
import { fetchModels, generate, ModelOption, ApiError } from "@/lib/api";

interface Slot {
  model: string;
  provider: string;
  result: string | null;
  url: string | null;
  latency: number | null;
  credits: number | null;
  error: string | null;
  loading: boolean;
}

export default function ComparePage() {
  const router = useRouter();
  const [models, setModels] = useState<ModelOption[]>([]);
  const [prompt, setPrompt] = useState("");
  const [modality, setModality] = useState<"text" | "image">("text");
  const [slots, setSlots] = useState<Slot[]>([
    { model: "", provider: "", result: null, url: null, latency: null, credits: null, error: null, loading: false },
    { model: "", provider: "", result: null, url: null, latency: null, credits: null, error: null, loading: false },
  ]);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!getApiKey()) { router.replace("/login"); return; }
    fetchModels(modality).then(setModels);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modality]);

  function setSlotModel(idx: number, modelId: string) {
    const m = models.find((m) => m.model_id === modelId);
    setSlots((prev) => prev.map((s, i) => i === idx ? { ...s, model: modelId, provider: m?.provider ?? "" } : s));
  }

  function addSlot() {
    setSlots((prev) => [...prev, { model: "", provider: "", result: null, url: null, latency: null, credits: null, error: null, loading: false }]);
  }

  function removeSlot(idx: number) {
    setSlots((prev) => prev.filter((_, i) => i !== idx));
  }

  async function runCompare() {
    if (!prompt.trim()) return;
    setRunning(true);
    const updatedSlots = slots.map((s) => ({ ...s, result: null, url: null, error: null, loading: !!s.model }));
    setSlots(updatedSlots);

    await Promise.all(
      updatedSlots.map(async (slot, idx) => {
        if (!slot.model) return;
        const t0 = Date.now();
        try {
          const res = await generate({ modality, mode: "manual", prompt, model: slot.model });
          setSlots((prev) => prev.map((s, i) => i !== idx ? s : {
            ...s, loading: false,
            result: res.output.content ?? null,
            url: res.output.url ?? null,
            latency: Date.now() - t0,
            credits: res.meta.credits_used,
            error: null,
          }));
        } catch (err) {
          const msg = err instanceof ApiError ? err.message : "Generation failed";
          setSlots((prev) => prev.map((s, i) => i !== idx ? s : { ...s, loading: false, error: msg }));
        }
      })
    );
    setRunning(false);
  }

  const canRun = !!prompt.trim() && slots.some((s) => s.model) && !running;

  return (
    <SidebarLayout>
      <div className="px-6 py-8 max-w-7xl mx-auto w-full">
        <h1 className="text-xl font-semibold text-white mb-5">Compare Models</h1>

        {/* Config bar */}
        <div className="flex gap-2 mb-4 flex-wrap">
          <select
            value={modality}
            onChange={(e) => setModality(e.target.value as "text" | "image")}
            className="border border-[#2a2a2a] rounded px-2.5 py-1.5 text-sm bg-[#1a1a1a] text-white focus:outline-none focus:border-violet-500"
          >
            <option value="text">Text / Chat</option>
            <option value="image">Image</option>
          </select>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Enter your prompt…"
            rows={2}
            className="flex-1 min-w-64 border border-[#2a2a2a] rounded px-2.5 py-1.5 text-sm bg-[#1a1a1a] text-white placeholder-[#555] resize-none focus:outline-none focus:border-violet-500"
          />
          <button
            onClick={runCompare}
            disabled={!canRun}
            className="px-4 py-1.5 bg-violet-600 text-white text-sm rounded disabled:opacity-40 hover:bg-violet-500 whitespace-nowrap self-start transition-colors"
          >
            {running ? "Running…" : "Run"}
          </button>
        </div>

        {/* Slots */}
        <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${slots.length}, minmax(0, 1fr))` }}>
          {slots.map((slot, idx) => (
            <div key={idx} className="border border-[#1f1f1f] rounded-xl bg-[#141414] overflow-hidden flex flex-col">
              {/* Slot header */}
              <div className="flex items-center gap-2 px-3 py-2 border-b border-[#1f1f1f] bg-[#111]">
                <select
                  value={slot.model}
                  onChange={(e) => setSlotModel(idx, e.target.value)}
                  className="flex-1 text-xs border border-[#2a2a2a] rounded px-2 py-1 bg-[#1a1a1a] text-white focus:outline-none focus:border-violet-500"
                >
                  <option value="">— choose model —</option>
                  {models.map((m) => (
                    <option key={m.model_id} value={m.model_id}>{m.display_name} ({m.provider})</option>
                  ))}
                </select>
                {slots.length > 1 && (
                  <button onClick={() => removeSlot(idx)} className="text-[#444] hover:text-red-500 text-xs transition-colors">✕</button>
                )}
              </div>

              {/* Result area */}
              <div className="flex-1 p-3 min-h-48">
                {slot.loading && (
                  <div className="flex items-center gap-2 text-xs text-[#666]">
                    <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Generating…
                  </div>
                )}
                {slot.error && (
                  <p className="text-xs text-red-400">{slot.error}</p>
                )}
                {slot.result && !slot.loading && (
                  <p className="text-sm text-[#ccc] whitespace-pre-wrap">{slot.result}</p>
                )}
                {slot.url && !slot.loading && (
                  modality === "image"
                    ? <img src={slot.url} alt="" className="max-w-full rounded" />
                    : <video src={slot.url} controls className="max-w-full rounded" />
                )}
                {!slot.model && !slot.loading && !slot.result && !slot.error && (
                  <p className="text-xs text-[#444] text-center pt-10">Select a model above</p>
                )}
              </div>

              {/* Stats */}
              {(slot.latency != null || slot.credits != null) && (
                <div className="px-3 py-2 border-t border-[#1f1f1f] flex gap-4 text-xs text-[#666]">
                  {slot.latency != null && <span>⏱ {slot.latency >= 1000 ? `${(slot.latency / 1000).toFixed(1)}s` : `${slot.latency}ms`}</span>}
                  {slot.credits != null && <span>💳 {slot.credits} credits</span>}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Add slot */}
        {slots.length < 4 && (
          <button
            onClick={addSlot}
            className="mt-3 text-xs px-3 py-1.5 border border-dashed border-[#2a2a2a] rounded text-[#555] hover:border-[#444] hover:text-[#888] transition-colors"
          >
            + Add model
          </button>
        )}
      </div>
    </SidebarLayout>
  );
}
