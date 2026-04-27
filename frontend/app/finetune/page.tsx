"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getApiKey } from "@/lib/auth";
import SidebarLayout from "@/components/SidebarLayout";
import { apiFetch } from "@/lib/api";

interface FinetuneJob {
  id: string;
  provider: string;
  base_model_id: string;
  display_name: string | null;
  external_job_id: string | null;
  status: string;
  training_file_url: string | null;
  result_model_id: string | null;
  params: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

const STATUS_COLOR: Record<string, string> = {
  queued:    "bg-[#222] text-[#888]",
  running:   "bg-blue-500/15 text-blue-400",
  succeeded: "bg-emerald-500/15 text-emerald-400",
  failed:    "bg-red-500/15 text-red-400",
  cancelled: "bg-yellow-500/15 text-yellow-400",
};

export default function FinetunePage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<FinetuneJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState<string | null>(null);

  // Create form
  const [provider, setProvider] = useState("openai");
  const [baseModel, setBaseModel] = useState("gpt-3.5-turbo");
  const [name, setName] = useState("");
  const [fileUrl, setFileUrl] = useState("");
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState("");

  useEffect(() => {
    if (!getApiKey()) { router.replace("/login"); return; }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    setLoading(true);
    try {
      const d = await apiFetch<{ jobs: FinetuneJob[] }>("/api/v1/finetune");
      setJobs(d.jobs);
    } catch {}
    setLoading(false);
  }

  async function create() {
    if (!baseModel.trim() || !fileUrl.trim()) return;
    setCreating(true);
    setCreateErr("");
    try {
      await apiFetch("/api/v1/finetune", {
        method: "POST",
        body: JSON.stringify({ provider, base_model_id: baseModel, display_name: name || undefined, training_file_url: fileUrl }),
      });
      setBaseModel("gpt-3.5-turbo"); setName(""); setFileUrl("");
      await load();
    } catch (e: unknown) {
      setCreateErr(e instanceof Error ? e.message : "Failed");
    }
    setCreating(false);
  }

  async function poll(jobId: string) {
    setPolling(jobId);
    try {
      await apiFetch(`/api/v1/finetune/${jobId}/poll`, { method: "POST" });
      await load();
    } catch {}
    setPolling(null);
  }

  async function cancel(jobId: string) {
    try {
      await apiFetch(`/api/v1/finetune/${jobId}`, { method: "DELETE" });
      await load();
    } catch {}
  }

  const inputCls = "w-full border border-[#2a2a2a] rounded-lg px-2.5 py-1.5 text-sm bg-[#1a1a1a] text-white placeholder-[#555] focus:outline-none focus:border-violet-500";

  return (
    <SidebarLayout>
      <div className="px-6 py-8 max-w-4xl mx-auto w-full">
        <h1 className="text-xl font-semibold text-white mb-1">Fine-Tuning Jobs</h1>
        <p className="text-xs text-[#666] mb-6">Submit, track, and compare fine-tuned models across providers.</p>

        {/* Create form */}
        <div className="border border-[#1f1f1f] rounded-xl bg-[#141414] p-5 mb-6">
          <h2 className="text-sm font-medium text-white mb-3">New Fine-Tune Job</h2>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-xs text-[#666] mb-1 block">Provider</label>
              <select value={provider} onChange={(e) => setProvider(e.target.value)} className={inputCls}>
                <option value="openai">OpenAI</option>
                <option value="replicate">Replicate</option>
                <option value="fal">fal.ai</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-[#666] mb-1 block">Base Model</label>
              <input value={baseModel} onChange={(e) => setBaseModel(e.target.value)} placeholder="gpt-3.5-turbo" className={inputCls} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-xs text-[#666] mb-1 block">Display Name (optional)</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="My fine-tuned model" className={inputCls} />
            </div>
            <div>
              <label className="text-xs text-[#666] mb-1 block">Training File URL</label>
              <input value={fileUrl} onChange={(e) => setFileUrl(e.target.value)} placeholder="https://…/training.jsonl" className={inputCls} />
            </div>
          </div>
          {createErr && <p className="text-xs text-red-400 mb-2">{createErr}</p>}
          <button onClick={create} disabled={creating || !baseModel.trim() || !fileUrl.trim()} className="px-4 py-1.5 bg-violet-600 text-white text-sm rounded-lg disabled:opacity-40 hover:bg-violet-500 transition-colors">
            {creating ? "Submitting…" : "Submit Job"}
          </button>
        </div>

        {/* Jobs list */}
        {loading ? (
          <p className="text-sm text-[#666]">Loading…</p>
        ) : jobs.length === 0 ? (
          <p className="text-sm text-[#666]">No fine-tune jobs yet.</p>
        ) : (
          <div className="border border-[#1f1f1f] rounded-xl bg-[#141414] overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#1f1f1f] text-[#555]">
                  <th className="px-4 py-2.5 text-left font-medium">Job</th>
                  <th className="px-4 py-2.5 text-left font-medium">Provider</th>
                  <th className="px-4 py-2.5 text-left font-medium">Base Model</th>
                  <th className="px-4 py-2.5 text-left font-medium">Status</th>
                  <th className="px-4 py-2.5 text-left font-medium">Result</th>
                  <th className="px-4 py-2.5 text-left font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1a1a1a]">
                {jobs.map((j) => (
                  <tr key={j.id} className="hover:bg-[#181818] transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-white">{j.display_name || j.base_model_id}</p>
                      {j.external_job_id && <p className="text-[#555]">{j.external_job_id}</p>}
                    </td>
                    <td className="px-4 py-3 text-[#888] capitalize">{j.provider}</td>
                    <td className="px-4 py-3 text-[#888]">{j.base_model_id}</td>
                    <td className="px-4 py-3">
                      <span className={`px-1.5 py-0.5 rounded font-medium ${STATUS_COLOR[j.status] ?? "bg-[#222] text-[#888]"}`}>{j.status}</span>
                    </td>
                    <td className="px-4 py-3 text-[#888]">{j.result_model_id || "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        {(j.status === "running" || j.status === "queued") && (
                          <>
                            <button onClick={() => poll(j.id)} disabled={polling === j.id} className="text-blue-400 hover:text-blue-300 transition-colors">
                              {polling === j.id ? "Polling…" : "Refresh"}
                            </button>
                            <button onClick={() => cancel(j.id)} className="text-[#555] hover:text-red-400 transition-colors">Cancel</button>
                          </>
                        )}
                        {j.result_model_id && (
                          <span className="text-emerald-400">Ready</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </SidebarLayout>
  );
}
