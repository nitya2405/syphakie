"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getApiKey } from "@/lib/auth";
import SidebarLayout from "@/components/SidebarLayout";
import { apiFetch, fetchModels, ModelOption, deletePipeline as apiDeletePipeline } from "@/lib/api";

interface PipelineStep {
  step: number;
  modality: string;
  model_id: string;
  provider: string;
  prompt_template: string;
  params: Record<string, unknown>;
}

interface Pipeline {
  id: string;
  name: string;
  description: string | null;
  steps: PipelineStep[];
  is_public: boolean;
  created_at: string;
}

interface Run {
  id: string;
  pipeline_id: string;
  status: string;
  input_prompt: string;
  step_outputs: Record<string, { content: string | null; url: string | null; modality: string; credits: number }>;
  total_credits: number | null;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
}

type StepState = {
  prompt: string;
  status: "idle" | "running" | "done" | "error";
  output: { content: string | null; url: string | null; modality: string; credits: number } | null;
  error: string | null;
};

function emptyStepState(template: string): StepState {
  return { prompt: template, status: "idle", output: null, error: null };
}

export default function PipelinesPage() {
  const router = useRouter();
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [selected, setSelected] = useState<Pipeline | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);

  // Create form
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [steps, setSteps] = useState<PipelineStep[]>([
    { step: 1, modality: "text", model_id: "", provider: "", prompt_template: "{{input}}", params: {} },
  ]);
  const [creating, setCreating] = useState(false);

  // Models cache keyed by modality
  const [modelsByModality, setModelsByModality] = useState<Record<string, ModelOption[]>>({});

  // Interactive run state — one entry per step of the selected pipeline
  const [stepStates, setStepStates] = useState<StepState[]>([]);
  const [activeStepIdx, setActiveStepIdx] = useState(0);  // which step is next to run
  const [runFinished, setRunFinished] = useState(false);

  useEffect(() => {
    if (!getApiKey()) { router.replace("/login"); return; }
    load();
    loadModelsForModality("text");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadModelsForModality(modality: string) {
    if (modelsByModality[modality]) return;
    try {
      const list = await fetchModels(modality);
      setModelsByModality((prev) => ({ ...prev, [modality]: list }));
    } catch {}
  }

  async function load() {
    setLoading(true);
    try {
      const d = await apiFetch<{ pipelines: Pipeline[] }>("/api/v1/pipelines");
      setPipelines(d.pipelines);
    } catch {}
    setLoading(false);
  }

  function selectPipeline(pl: Pipeline) {
    setSelected(pl);
    resetRun(pl);
    apiFetch<{ runs: Run[] }>(`/api/v1/pipelines/${pl.id}/runs`)
      .then((d) => setRuns(d.runs))
      .catch(() => {});
  }

  function resetRun(pl: Pipeline) {
    setStepStates(pl.steps.map((s) => emptyStepState(s.prompt_template)));
    setActiveStepIdx(0);
    setRunFinished(false);
  }

  async function runStep(pl: Pipeline, stepIdx: number) {
    const stepDef = pl.steps[stepIdx];
    const prompt = stepStates[stepIdx].prompt;
    if (!prompt.trim() || !stepDef.model_id) return;

    setStepStates((prev) => prev.map((s, i) => i === stepIdx ? { ...s, status: "running", error: null } : s));

    try {
      const res = await apiFetch<{
        output: { content: string | null; url: string | null };
        meta: { credits_used: number };
      }>("/api/v1/generate", {
        method: "POST",
        body: JSON.stringify({
          modality: stepDef.modality,
          mode: "manual",
          prompt,
          model: stepDef.model_id,
          provider: stepDef.provider,
          params: stepDef.params,
        }),
      });

      const out = {
        content: res.output.content ?? null,
        url: res.output.url ?? null,
        modality: stepDef.modality,
        credits: res.meta.credits_used,
      };

      setStepStates((prev) => {
        const next = prev.map((s, i) => i === stepIdx ? { ...s, status: "done" as const, output: out } : s);
        // Auto-fill next step's prompt with this step's output
        const nextIdx = stepIdx + 1;
        if (nextIdx < next.length) {
          const nextOut = out.content || out.url || "";
          next[nextIdx] = { ...next[nextIdx], prompt: nextOut };
        }
        return next;
      });

      const nextIdx = stepIdx + 1;
      if (nextIdx < pl.steps.length) {
        setActiveStepIdx(nextIdx);
      } else {
        setRunFinished(true);
        // Save as a run record via backend
        const stepPrompts: Record<string, string> = {};
        stepStates.forEach((ss, i) => { stepPrompts[String(i + 1)] = ss.prompt; });
        stepPrompts[String(stepIdx + 1)] = prompt;
        apiFetch(`/api/v1/pipelines/${pl.id}/run`, {
          method: "POST",
          body: JSON.stringify({
            input_prompt: stepStates[0]?.prompt ?? prompt,
            step_prompts: stepPrompts,
          }),
        }).then(() => apiFetch<{ runs: Run[] }>(`/api/v1/pipelines/${pl.id}/runs`).then((d) => setRuns(d.runs))).catch(() => {});
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Step failed";
      setStepStates((prev) => prev.map((s, i) => i === stepIdx ? { ...s, status: "error", error: msg } : s));
    }
  }

  async function create() {
    if (!name.trim()) return;
    setCreating(true);
    try {
      await apiFetch("/api/v1/pipelines", { method: "POST", body: JSON.stringify({ name, description: desc, steps }) });
      setName(""); setDesc("");
      setSteps([{ step: 1, modality: "text", model_id: "", provider: "", prompt_template: "{{input}}", params: {} }]);
      await load();
    } catch {}
    setCreating(false);
  }

  async function deletePipeline(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this pipeline?")) return;
    try {
      await apiDeletePipeline(id);
      if (selected?.id === id) setSelected(null);
      await load();
    } catch {}
  }

  function updateStep(i: number, field: keyof PipelineStep, val: string | number) {
    setSteps((prev) => prev.map((s, idx) => {
      if (idx !== i) return s;
      if (field === "modality") {
        loadModelsForModality(val as string);
        return { ...s, modality: val as string, model_id: "", provider: "" };
      }
      return { ...s, [field]: val };
    }));
  }

  function selectStepModel(i: number, modelId: string) {
    const modality = steps[i].modality;
    const model = (modelsByModality[modality] ?? []).find((m) => m.model_id === modelId);
    setSteps((prev) => prev.map((s, idx) => idx !== i ? s : {
      ...s, model_id: modelId, provider: model?.provider ?? "",
    }));
  }

  return (
    <SidebarLayout>
      <div className="px-6 py-8 max-w-6xl mx-auto w-full">
        <h1 className="text-xl font-semibold text-primary mb-1">Pipeline Builder</h1>
        <p className="text-xs text-faint mb-6">Chain models across modalities. Text → Image → Video in one request.</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Pipelines list */}
          <div className="md:col-span-1 space-y-2">
            <h2 className="text-xs font-medium text-faint uppercase tracking-wide mb-2">Saved Pipelines</h2>
            {loading && <p className="text-xs text-faint">Loading…</p>}
            {pipelines.map((pl) => (
              <div key={pl.id} className="group relative">
                <button
                  onClick={() => selectPipeline(pl)}
                  className={`w-full text-left border rounded-lg px-3 py-2.5 transition-colors ${selected?.id === pl.id ? "border-violet-500 bg-violet-500/10" : "border-border bg-surface-2 hover:bg-surface-2/40"}`}
                >
                  <p className="text-sm font-medium text-primary">{pl.name}</p>
                  <p className="text-xs text-faint">{pl.steps.length} steps</p>
                  {pl.description && <p className="text-xs text-faint truncate">{pl.description}</p>}
                </button>
                <button
                  onClick={(e) => deletePipeline(pl.id, e)}
                  className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 p-1.5 text-[#444] hover:text-red-500 transition-all"
                  title="Delete pipeline"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            ))}
            {!loading && pipelines.length === 0 && <p className="text-xs text-faint">No pipelines yet.</p>}
          </div>

          {/* Right panel */}
          <div className="md:col-span-2 space-y-4">
            {selected ? (
              <>
                {/* Interactive step runner */}
                <div className="border border-border rounded-xl bg-surface-2 p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-medium text-primary">{selected.name}</h2>
                    <button onClick={() => resetRun(selected)} className="text-xs text-faint hover:text-primary">
                      Reset
                    </button>
                  </div>

                  <div className="space-y-3">
                    {selected.steps.map((stepDef, i) => {
                      const ss = stepStates[i];
                      if (!ss) return null;
                      const isActive = i === activeStepIdx && !runFinished;
                      const isDone = ss.status === "done";
                      const isPending = i > activeStepIdx && !runFinished;

                      return (
                        <div
                          key={i}
                          className={`border rounded-lg p-3 transition-colors ${
                            isDone ? "border-emerald-500/40 bg-emerald-500/5" :
                            isActive ? "border-violet-500/40 bg-violet-500/5" :
                            ss.status === "error" ? "border-red-500/40 bg-red-500/5" :
                            "border-border bg-surface opacity-60"
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <span className={`w-5 h-5 rounded-full text-xs font-bold flex items-center justify-center shrink-0 ${
                              isDone ? "bg-emerald-500 text-primary" :
                              isActive ? "bg-violet-500 text-primary" :
                              ss.status === "error" ? "bg-red-500 text-primary" :
                              "bg-[#333] text-faint"
                            }`}>
                              {isDone ? "✓" : i + 1}
                            </span>
                            <span className="text-xs font-medium text-primary">{stepDef.model_id || "—"}</span>
                            <span className="text-xs text-faint">{stepDef.modality}</span>
                            {ss.output?.credits != null && (
                              <span className="ml-auto text-xs text-faint">{ss.output.credits} cr</span>
                            )}
                          </div>

                          {!isPending && (
                            <textarea
                              value={ss.prompt}
                              onChange={(e) => setStepStates((prev) => prev.map((s, idx) => idx === i ? { ...s, prompt: e.target.value } : s))}
                              disabled={ss.status === "running"}
                              rows={3}
                              placeholder={i === 0 ? "Enter your prompt…" : "Prompt (auto-filled from previous step, edit freely)"}
                              className="w-full bg-surface-2/40 border border-[#2a2a2a] text-primary text-xs rounded-lg px-2.5 py-1.5 resize-y focus:outline-none focus:border-violet-500 placeholder-[#444] disabled:opacity-50"
                            />
                          )}

                          {ss.output && (
                            <div className="mt-2">
                              {ss.output.url && ss.output.modality === "image" && (
                                <img src={ss.output.url} alt="" className="max-h-40 rounded border border-[#2a2a2a]" />
                              )}
                              {ss.output.url && ss.output.modality === "video" && (
                                <video src={ss.output.url} controls className="max-h-40 w-full rounded" />
                              )}
                              {ss.output.url && ss.output.modality === "audio" && (
                                <audio src={ss.output.url} controls className="w-full" />
                              )}
                              {ss.output.content && (
                                <p className="text-xs text-[#ccc] bg-surface-2/40 rounded-lg p-2 border border-[#2a2a2a] whitespace-pre-wrap max-h-32 overflow-y-auto">
                                  {ss.output.content}
                                </p>
                              )}
                            </div>
                          )}

                          {ss.error && <p className="mt-1 text-xs text-red-400">{ss.error}</p>}

                          {isActive && (
                            <button
                              onClick={() => runStep(selected, i)}
                              disabled={ss.status === "running" || !ss.prompt.trim() || !stepDef.model_id}
                              className="mt-2 w-full py-1.5 bg-violet-600 hover:bg-violet-500 text-primary text-xs rounded-lg disabled:opacity-40 transition-colors"
                            >
                              {ss.status === "running" ? "Running…" :
                               !stepDef.model_id ? "No model configured" :
                               i === 0 ? "Run Step 1" : `Run Step ${i + 1}`}
                            </button>
                          )}

                          {isDone && i < activeStepIdx && (
                            <button
                              onClick={() => { setActiveStepIdx(i); setRunFinished(false); setStepStates((prev) => prev.map((s, idx) => idx === i ? { ...s, status: "idle" } : idx > i ? { ...s, status: "idle", output: null, error: null } : s)); }}
                              className="mt-2 text-xs text-faint hover:text-primary"
                            >
                              ↩ Re-run from here
                            </button>
                          )}
                        </div>
                      );
                    })}

                    {runFinished && (
                      <div className="text-center py-2">
                        <p className="text-xs text-emerald-400 font-medium mb-1">Pipeline complete</p>
                        <button onClick={() => resetRun(selected)} className="text-xs text-faint hover:text-primary">
                          Run again
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {runs.length > 0 && (
                  <div className="border border-border rounded-xl bg-surface-2 overflow-hidden">
                    <p className="px-4 py-2 text-xs font-medium text-faint border-b border-border">Recent Runs</p>
                    {runs.slice(0, 5).map((r) => (
                      <div key={r.id} className="px-4 py-2 border-b border-[#1a1a1a] flex items-center gap-3">
                        <span className={`text-xs px-1.5 py-0.5 rounded ${r.status === "completed" ? "bg-emerald-500/20 text-emerald-400" : r.status === "failed" ? "bg-red-500/20 text-red-400" : "bg-blue-500/20 text-blue-400"}`}>{r.status}</span>
                        <span className="text-xs text-[#aaa] flex-1 truncate">{r.input_prompt}</span>
                        <span className="text-xs text-faint">{r.total_credits != null ? `${r.total_credits} cr` : "—"}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="border border-border rounded-xl bg-surface-2 p-5">
                <h2 className="text-sm font-medium text-primary mb-4">Create Pipeline</h2>
                <div className="space-y-3">
                  <input placeholder="Pipeline name" value={name} onChange={(e) => setName(e.target.value)} className="w-full bg-surface-2/40 border border-[#2a2a2a] text-primary text-sm rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-violet-500 placeholder-[#444]" />
                  <input placeholder="Description (optional)" value={desc} onChange={(e) => setDesc(e.target.value)} className="w-full bg-surface-2/40 border border-[#2a2a2a] text-primary text-sm rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-violet-500 placeholder-[#444]" />

                  <div className="space-y-2">
                    <p className="text-xs font-medium text-faint">Steps</p>
                    {steps.map((s, i) => (
                      <div key={i} className="border border-[#2a2a2a] rounded-lg p-3 space-y-2 bg-surface">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-faint w-10">Step {i + 1}</span>
                          <select value={s.modality} onChange={(e) => updateStep(i, "modality", e.target.value)} className="bg-surface-2/40 border border-[#2a2a2a] text-primary rounded-lg px-2 py-1 text-xs focus:outline-none">
                            {["text", "image", "video", "audio"].map((m) => <option key={m}>{m}</option>)}
                          </select>
                          {steps.length > 1 && (
                            <button
                              onClick={() => setSteps((prev) => prev.filter((_, idx) => idx !== i).map((s, idx) => ({ ...s, step: idx + 1 })))}
                              className="ml-auto text-faint hover:text-red-400 text-xs"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                        <div className="space-y-1">
                          <select
                            value={s.model_id}
                            onChange={(e) => selectStepModel(i, e.target.value)}
                            className="w-full bg-surface-2/40 border border-[#2a2a2a] text-primary rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-violet-500"
                          >
                            <option value="">— select model —</option>
                            {(modelsByModality[s.modality] ?? []).map((m) => (
                              <option key={m.model_id} value={m.model_id}>
                                {m.display_name} — {m.provider}
                              </option>
                            ))}
                          </select>
                          {s.provider && <p className="text-xs text-faint pl-0.5">Provider: {s.provider}</p>}
                        </div>
                        <div className="space-y-1">
                          <input
                            placeholder={i === 0 ? "Default prompt template (e.g. {{input}})" : `Template — use {{input}} or {{step:${i}}} for step ${i} output`}
                            value={s.prompt_template}
                            onChange={(e) => updateStep(i, "prompt_template", e.target.value)}
                            className="w-full bg-surface-2/40 border border-[#2a2a2a] text-primary rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-violet-500 placeholder-[#444]"
                          />
                          <p className="text-xs text-faint pl-0.5">
                            Hint: <code className="bg-[#222] px-1 rounded">{"{{input}}"}</code> = initial prompt,{" "}
                            {i > 0 && <><code className="bg-[#222] px-1 rounded">{`{{step:${i}}}`}</code> = step {i} output</>}
                          </p>
                        </div>
                      </div>
                    ))}
                    <button
                      onClick={() => { loadModelsForModality("image"); setSteps((prev) => [...prev, { step: prev.length + 1, modality: "image", model_id: "", provider: "", prompt_template: `{{step:${prev.length}}}`, params: {} }]); }}
                      className="text-xs text-violet-400 hover:text-violet-300"
                    >
                      + Add step
                    </button>
                  </div>

                  <button
                    onClick={create}
                    disabled={creating || !name.trim()}
                    className="w-full py-2 bg-violet-600 hover:bg-violet-500 text-primary text-sm rounded-lg disabled:opacity-40 transition-colors"
                  >
                    {creating ? "Creating…" : "Create Pipeline"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </SidebarLayout>
  );
}
