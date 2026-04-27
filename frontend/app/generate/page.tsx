"use client";
import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getApiKey, clearApiKey } from "@/lib/auth";
import SidebarLayout from "@/components/SidebarLayout";
import {
  fetchModels,
  generateAsync,
  fetchJobStatus,
  fetchJob,
  fetchBalance,
  fetchHistory,
  fetchOutput,
  uploadFile,
  GenerateResponse,
  JobResult,
  HistoryRecord,
  OutputData,
  ModelOption,
  ApiError,
} from "@/lib/api";

type Modality = "text" | "image" | "video" | "audio";
type Mode = "manual" | "auto";
type CreditSource = "personal" | "org";

const TASK_TYPES: Record<Modality, { value: string; label: string }[]> = {
  text:  [{ value: "", label: "Any task" }, { value: "chat", label: "Chat" }, { value: "summarization", label: "Summarize" }, { value: "translation", label: "Translate" }],
  image: [{ value: "", label: "Any task" }, { value: "text_to_image", label: "Text → Image" }, { value: "image_to_image", label: "Image → Image" }, { value: "image_editing", label: "Edit Image" }],
  video: [{ value: "", label: "Any task" }, { value: "text_to_video", label: "Text → Video" }, { value: "image_to_video", label: "Image → Video" }, { value: "video_to_video", label: "Video → Video" }, { value: "video_editing", label: "Video Editing" }, { value: "speech_to_video", label: "Speech → Video" }, { value: "lip_sync", label: "Lip Sync" }],
  audio: [{ value: "", label: "Any task" }, { value: "text_to_speech", label: "Text to Speech" }, { value: "speech_to_text", label: "Speech to Text" }, { value: "text_to_music", label: "Text to Music" }, { value: "audio_to_audio", label: "Audio → Audio" }],
};

const ASCII_LOGO = `⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣠⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⣀⣤⣶⣿⣿⣿⣿⣿⣶⣤⣀⠀⠀⠀⠀⠀
⠀⣠⣴⣶⣿⣿⣿⠟⣫⣽⡆⣯⣝⡻⢿⣿⣿⣶⣦⣀⠀
⢰⣭⣛⡿⢿⣿⣿⣦⣝⣻⠣⣿⣿⣷⣾⣝⣻⠿⣟⣭⡆
⠸⢿⣿⣿⣷⣭⣟⡻⢿⣿⣿⣶⡭⠟⠻⣿⣿⣿⣿⡿⠇
⠀⠀⠀⠙⠻⠿⣿⣿⣿⣾⢩⣵⣾⡇⠀⠀⠈⠉⠀⠀⠀
⠀⠀⠀⣀⠀⠀⠀⠉⠛⠿⠸⠿⠛⠁⠀⠀⢀⣀⠀⠀⠀
⢀⣲⢿⣿⣿⣷⣦⣄⣀⠀⠀⠀⣀⣤⣴⣿⣿⣿⠿⣓⡄
⢸⣿⣷⣾⣭⣛⠿⣿⣿⣿⣶⣿⣿⡿⠿⣛⣽⣶⣾⣿⡇
⠈⠛⠻⢿⣿⣿⣶⣯⣛⡿⠿⢿⣫⣵⣶⣿⣿⡿⠟⠋⠁
⠀⠀⠀⠀⠈⠙⠻⢿⣿⣿⢸⣿⣿⡿⠛⠋⠁⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠉⠘⠉⠀⠀⠀⠀⠀⠀`;

const MODALITY_PILL: Record<string, string> = {
  image: "bg-pink-500/15 text-pink-400",
  video: "bg-orange-500/15 text-orange-400",
  audio: "bg-emerald-500/15 text-emerald-400",
  text:  "bg-blue-500/15 text-blue-400",
};

const PROMPT_PLACEHOLDER: Record<Modality, string> = {
  text:  "Write a haiku about clouds at dawn…",
  image: "A red panda sitting in snow, studio lighting…",
  video: "Time-lapse of a sunset over the ocean…",
  audio: "A calm, cinematic piano melody in C major…",
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={`animate-spin text-white ${className}`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  );
}

function jobToResult(job: JobResult): GenerateResponse {
  return {
    success: true,
    request_id: job.request_id ?? job.id,
    modality: job.modality ?? "text",
    provider: job.provider ?? "",
    model: job.model_id ?? "",
    output: { type: job.modality ?? "text", content: job.output_content, url: job.output_url, mime_type: null },
    meta: {
      latency_ms: job.completed_at && job.started_at
        ? new Date(job.completed_at).getTime() - new Date(job.started_at).getTime()
        : 0,
      credits_used: job.credits_used ?? 0,
      credits_remaining: 0, units_used: 0, unit_type: "", routing_mode: "",
    },
  };
}

function estimateCredits(model: ModelOption, prompt: string): number {
  const { unit_type, cost_per_unit } = model;
  if (unit_type === "token")      return Math.max(1, Math.ceil(1200 * cost_per_unit));
  if (unit_type === "image")      return Math.max(1, Math.ceil(cost_per_unit));
  if (unit_type === "generation") return Math.max(1, Math.ceil(cost_per_unit));
  if (unit_type === "character")  return Math.max(1, Math.ceil(((prompt.length || 500) / 1000) * cost_per_unit));
  if (unit_type === "minute")     return Math.max(1, Math.ceil(cost_per_unit));
  if (unit_type === "second")     return Math.max(1, Math.ceil(5 * cost_per_unit));
  return Math.max(1, Math.ceil(cost_per_unit));
}

// ── Shared style tokens ───────────────────────────────────────────────────────

const ctrl = "bg-surface border border-border text-muted text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-violet-500/60 transition-colors";
const actionBtn = "text-xs px-3 py-1.5 bg-surface-2 border border-border-2 text-muted rounded-lg hover:border-violet-500/40 hover:text-primary transition-colors";
const card = "bg-surface border border-border rounded-2xl overflow-hidden";

// ── Main component ────────────────────────────────────────────────────────────

function GenerateContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const urlModel    = searchParams.get("model");
  const urlModality = searchParams.get("modality") as Modality | null;
  const urlMode     = searchParams.get("mode") as Mode | null;

  const [modality, setModality]       = useState<Modality>(
    (["text","image","video","audio"] as Modality[]).includes(urlModality as Modality)
      ? (urlModality as Modality) : "text",
  );
  const [mode, setMode]               = useState<Mode>(urlMode === "manual" ? "manual" : "auto");
  const [taskType, setTaskType]       = useState("");
  const [prompt, setPrompt]           = useState("");
  const [imageUrl, setImageUrl]       = useState("");
  const [fileUrl, setFileUrl]         = useState("");
  const [uploading, setUploading]     = useState(false);
  const [selectedModel, setSelectedModel] = useState("");
  const [models, setModels]           = useState<ModelOption[]>([]);
  const [creditSource, setCreditSource] = useState<CreditSource>("personal");
  const [inOrg, setInOrg]             = useState(false);

  const [balance, setBalance]         = useState<number | null>(null);
  const [loading, setLoading]         = useState(false);
  const [pollStatus, setPollStatus]   = useState("");
  const [result, setResult]           = useState<GenerateResponse | null>(null);
  const [error, setError]             = useState("");
  const [copySuccess, setCopySuccess] = useState(false);
  const [useStream, setUseStream]     = useState(false);
  const [streamOutput, setStreamOutput] = useState("");
  const [history, setHistory]         = useState<HistoryRecord[]>([]);
  const [expandedId, setExpandedId]   = useState<string | null>(null);
  const [expandedOutputs, setExpandedOutputs] = useState<Record<string, OutputData | "loading" | "error">>({});

  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { if (!getApiKey()) router.replace("/login"); }, [router]);

  const loadBalance = useCallback(async () => {
    try { setBalance(await fetchBalance()); } catch {}
  }, []);

  const loadHistory = useCallback(async () => {
    try { setHistory(await fetchHistory(5)); } catch {}
  }, []);

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/v1/orgs/me`, {
      headers: { "X-API-Key": getApiKey() ?? "", "Content-Type": "application/json" },
    }).then(r => r.json()).then(d => setInOrg(!!d.org)).catch(() => {});
  }, []);

  useEffect(() => { loadBalance(); loadHistory(); }, [loadBalance, loadHistory]);

  useEffect(() => {
    if (mode !== "manual") return;
    fetchModels(modality)
      .then((list) => {
        const filtered = list.filter(m => !taskType || !m.task_types?.length || m.task_types.includes(taskType));
        setModels(filtered);
        const pre = urlModel && filtered.find(m => m.model_id === urlModel);
        setSelectedModel(pre ? pre.model_id : filtered[0]?.model_id ?? "");
      })
      .catch(() => setModels([]));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modality, mode, taskType]);

  function handleModeChange(m: Mode)         { setMode(m); setSelectedModel(""); setModels([]); }
  function handleModalityChange(m: Modality) { setModality(m); setTaskType(""); setSelectedModel(""); setModels([]); }

  const startPolling = useCallback((jobId: string) => {
    setPollStatus("queued");
    const poll = async () => {
      try {
        const s = await fetchJobStatus(jobId);
        setPollStatus(s.status);
        if (s.status === "success") {
          setResult(jobToResult(await fetchJob(jobId)));
          setLoading(false);
          loadBalance();
          loadHistory();
        } else if (s.status === "failed") {
          setError(s.error_message ?? "Generation failed.");
          setLoading(false);
        } else {
          pollTimer.current = setTimeout(poll, 1500);
        }
      } catch {
        setError("Failed to check job status.");
        setLoading(false);
      }
    };
    pollTimer.current = setTimeout(poll, 1500);
  }, [loadBalance, loadHistory]);

  useEffect(() => () => { if (pollTimer.current) clearTimeout(pollTimer.current); }, []);

  async function runStream() {
    if (!prompt.trim() || loading || !selectedModel) return;
    const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
    setLoading(true); setError(""); setResult(null); setStreamOutput("");
    try {
      const resp = await fetch(`${BASE}/api/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Key": getApiKey() || "" },
        body: JSON.stringify({ model: selectedModel, messages: [{ role: "user", content: prompt.trim() }], stream: true }),
      });
      if (!resp.ok) { const b = await resp.json().catch(() => ({})); throw new Error(b?.detail?.message ?? "Stream failed"); }
      const reader = resp.body!.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n"); buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const d = line.slice(6);
          if (d === "[DONE]") break;
          try { const c = JSON.parse(d); const t = c.choices?.[0]?.delta?.content ?? ""; if (t) setStreamOutput(p => p + t); } catch {}
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Stream failed";
      setError(msg === "Failed to fetch" || msg.toLowerCase().includes("network")
        ? "Cannot reach the backend. Make sure the server is running on http://localhost:8000."
        : msg);
    } finally { setLoading(false); loadHistory(); }
  }

  async function runGenerate() {
    if (!prompt.trim() && !imageUrl && !fileUrl) return;
    if (loading) return;
    if (modality === "text" && useStream && mode === "manual" && selectedModel && prompt.trim()) return runStream();
    setLoading(true); setError(""); setResult(null); setStreamOutput("");
    try {
      const job = await generateAsync({
        modality, mode,
        prompt: prompt.trim(),
        image_url: imageUrl || undefined,
        file_url: fileUrl || undefined,
        ...(mode === "manual" && selectedModel ? { model: selectedModel } : {}),
        ...(taskType ? { task_type: taskType } : {}),
        use_org_credits: inOrg && creditSource === "org",
      });
      startPolling(job.job_id);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) { clearApiKey(); router.replace("/login"); return; }
        setError(err.message);
      } else {
        setError("Generation failed. Is the backend running?");
      }
      setLoading(false);
    }
  }

  async function handleCopy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopySuccess(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopySuccess(false), 2000);
    } catch {}
  }

  function handleDownload(url: string) {
    const a = document.createElement("a");
    a.href = url; a.download = "syphakie-output"; a.target = "_blank"; a.rel = "noopener noreferrer";
    a.click();
  }

  async function toggleHistory(id: string) {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    if (expandedOutputs[id]) return;
    setExpandedOutputs(p => ({ ...p, [id]: "loading" }));
    try {
      const out = await fetchOutput(id);
      setExpandedOutputs(p => ({ ...p, [id]: out }));
    } catch {
      setExpandedOutputs(p => ({ ...p, [id]: "error" }));
    }
  }

  const pollLabel: Record<string, string> = { queued: "Queued…", running: "Generating…" };

  const selectedModelObj = models.find(m => m.model_id === selectedModel);
  const estCredits = mode === "manual" && selectedModelObj ? estimateCredits(selectedModelObj, prompt) : null;

  const autoLabel = result?.model
    ? (result.meta.routing_mode === "fallback"
        ? { text: `Using: ${result.model}`, badge: "Fallback from Auto", badgeCls: "text-amber-400" }
        : { text: `Using: ${result.model}`, badge: "Auto selected", badgeCls: "text-faint" })
    : null;

  return (
    <SidebarLayout balance={balance}>
      <div className="min-h-screen flex flex-col items-center px-6">

        {/* ── Hero: logo + prompt ───────────────────────────────── */}
        <div className="w-full max-w-2xl flex flex-col items-center pt-[12vh] pb-10 gap-8">

          {/* Brand mark */}
          <div className="flex flex-col items-center gap-3 select-none">
            <pre className="text-[13px] leading-[1.15] text-violet-400 font-mono">{ASCII_LOGO}</pre>
            <span className="text-4xl font-bold tracking-[0.2em] text-primary uppercase">KIE</span>
          </div>

          {/* Prompt — primary input area */}
          <div className="w-full relative group">
            <div className="relative bg-surface border border-border rounded-2xl focus-within:ring-2 focus-within:ring-violet-500/25 focus-within:border-violet-500/60 transition-all">

              {/* Attachment Pills */}
              {(imageUrl || fileUrl) && (
                <div className="flex flex-wrap gap-2 px-4 pt-4">
                  {imageUrl && (
                    <div className="relative w-16 h-16 rounded-xl overflow-hidden border border-border group/img">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={imageUrl} alt="Upload" className="w-full h-full object-cover" />
                      <button 
                        onClick={() => setImageUrl("")}
                        className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity"
                      >
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  )}
                  {fileUrl && (
                    <div className="h-10 px-3 bg-surface-2 border border-border-2 rounded-xl flex items-center gap-2 max-w-[200px]">
                      <svg className="w-3.5 h-3.5 text-violet-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <span className="text-[11px] text-muted truncate">{fileUrl.split('/').pop()}</span>
                      <button onClick={() => setFileUrl("")} className="hover:text-red-400 transition-colors">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              )}

              <textarea
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); runGenerate(); } }}
                placeholder={PROMPT_PLACEHOLDER[modality]}
                rows={3}
                className="w-full bg-transparent text-primary text-base px-5 py-4 resize-none focus:outline-none placeholder-faint leading-relaxed"
              />

              {/* Action Bar inside Textarea */}
              <div className="flex items-center justify-between px-4 pb-3">
                <div className="flex items-center gap-1">
                  <label className="p-2 text-faint hover:text-muted hover:bg-white/5 rounded-lg cursor-pointer transition-all active:scale-95" title="Attach media or document">
                    <input 
                      type="file" 
                      accept={
                        modality === "image" ? "image/*" :
                        modality === "video" ? "video/*" :
                        modality === "audio" ? "audio/*" :
                        ".pdf,.doc,.docx,.txt"
                      }
                      className="hidden" 
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setUploading(true);
                        try {
                          const res = await uploadFile(file);
                          if (file.type.startsWith('image/')) {
                            setImageUrl(res.url);
                          } else {
                            setFileUrl(res.url);
                          }
                        } catch (err: any) {
                          setError(err.message || "Upload failed");
                        } finally {
                          setUploading(false);
                        }
                      }}
                    />
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                  </label>
                  <span className="text-[10px] text-faint font-medium uppercase tracking-tight">Add context</span>
                </div>
                <p className="text-[10px] text-faint font-mono">⌘↵</p>
              </div>
            </div>
          </div>
          {/* Controls — secondary, below prompt */}
          <div className="w-full space-y-3">
            <div className="flex flex-wrap gap-2">
              <select
                value={modality}
                onChange={e => handleModalityChange(e.target.value as Modality)}
                className={ctrl}
              >
                <option value="text">Text / Chat</option>
                <option value="image">Image</option>
                <option value="video">Video</option>
                <option value="audio">Audio</option>
              </select>

              <select
                value={taskType}
                onChange={e => { setTaskType(e.target.value); setSelectedModel(""); }}
                className={ctrl}
              >
                {TASK_TYPES[modality].map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>

              <select
                value={mode}
                onChange={e => handleModeChange(e.target.value as Mode)}
                className={ctrl}
              >
                <option value="auto">Auto mode</option>
                <option value="manual">Manual mode</option>
              </select>

              {mode === "manual" && models.length > 0 && (
                <select
                  value={selectedModel}
                  onChange={e => setSelectedModel(e.target.value)}
                  className={`${ctrl} flex-1 min-w-[200px]`}
                >
                  {models.map(m => (
                    <option key={m.model_id} value={m.model_id}>{m.display_name} — {m.provider}</option>
                  ))}
                </select>
              )}
              {mode === "manual" && models.length === 0 && (
                <span className="text-xs text-faint py-2 px-1">Loading models…</span>
              )}
            </div>

            {/* Tertiary options */}
            <div className="flex items-center gap-5 flex-wrap">
              {modality === "text" && mode === "manual" && (
                <label className="flex items-center gap-2 text-xs text-faint cursor-pointer hover:text-muted transition-colors">
                  <input type="checkbox" checked={useStream} onChange={e => setUseStream(e.target.checked)} className="w-3 h-3 accent-violet-500" />
                  Stream output
                </label>
              )}
              {inOrg && (
                <div className="flex items-center gap-3">
                  {(["personal", "org"] as CreditSource[]).map(src => (
                    <label key={src} className="flex items-center gap-1.5 text-xs text-faint cursor-pointer hover:text-muted transition-colors">
                      <input type="radio" name="creditSource" value={src} checked={creditSource === src} onChange={() => setCreditSource(src)} className="w-3 h-3 accent-violet-500" />
                      {src === "personal" ? "Personal credits" : "Org credits"}
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Generate button */}
          <button
            onClick={runGenerate}
            disabled={loading || uploading || (!prompt.trim() && !imageUrl && !fileUrl)}
            className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white rounded-xl py-3.5 text-sm font-semibold transition-colors flex items-center justify-center gap-2.5 shadow-lg shadow-violet-500/20"
          >
            {loading || uploading ? <Spinner className="h-4 w-4" /> : null}
            <span>{uploading ? "Uploading…" : loading ? (pollLabel[pollStatus] ?? "Generating…") : "Generate"}</span>
            {estCredits && !loading && (
              <span className="text-violet-300/70 font-normal text-xs">~{estCredits} cr</span>
            )}
          </button>
        </div>

        {/* ── Output area ───────────────────────────────────────── */}
        <div className="w-full max-w-2xl space-y-4 pb-10">

          {error && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          {/* Streaming output */}
          {(streamOutput || (loading && useStream && modality === "text")) && (
            <div className={card}>
              <div className="p-5">
                <p className="text-sm leading-relaxed whitespace-pre-wrap text-white">
                  {streamOutput}
                  {loading && <span className="inline-block w-2 h-4 bg-violet-400 animate-pulse ml-0.5 align-text-bottom" />}
                </p>
              </div>
              {streamOutput && !loading && (
                <div className="border-t border-border px-5 py-2.5">
                  <button onClick={() => handleCopy(streamOutput)} className={actionBtn}>
                    {copySuccess ? "Copied!" : "Copy"}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Result card */}
          {result && (
            <div className={card}>
              {/* Auto-mode attribution */}
              {mode === "auto" && autoLabel && (
                <div className="px-5 py-2.5 border-b border-border flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-violet-500 shrink-0" />
                  <p className="text-xs text-muted">
                    {autoLabel.text}
                    <span className={`ml-1.5 ${autoLabel.badgeCls}`}>({autoLabel.badge})</span>
                  </p>
                </div>
              )}

              <div className="p-5">
                {result.modality === "text" && result.output.content && (
                  <p className="text-sm leading-relaxed whitespace-pre-wrap text-white">{result.output.content}</p>
                )}
                {result.modality === "image" && result.output.url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={result.output.url} alt="Generated" className="max-w-full rounded-xl" />
                )}
                {result.modality === "video" && result.output.url && (
                  <video src={result.output.url} controls className="w-full rounded-xl" />
                )}
                {result.modality === "audio" && result.output.url && (
                  <audio src={result.output.url} controls className="w-full" />
                )}
              </div>

              {/* Action row */}
              <div className="border-t border-border px-5 py-2.5 flex items-center gap-2">
                {result.modality === "text" && result.output.content && (
                  <button onClick={() => handleCopy(result.output.content!)} className={actionBtn}>
                    {copySuccess ? "Copied!" : "Copy"}
                  </button>
                )}
                {result.output.url && result.modality !== "text" && (
                  <button onClick={() => handleDownload(result.output.url!)} className={actionBtn}>Download</button>
                )}
                <button onClick={runGenerate} disabled={loading} className={`${actionBtn} disabled:opacity-40`}>
                  Regenerate
                </button>
              </div>

              {/* Meta row */}
              <div className="border-t border-border bg-surface-2/40 px-5 py-2 flex flex-wrap gap-x-5 gap-y-1 text-xs">
                <span className="text-faint">
                  <span className="text-white font-medium">{result.meta.credits_used}</span> cr used
                </span>
                {result.meta.latency_ms > 0 && (
                  <span className="text-faint">
                    <span className="text-white font-medium">
                      {result.meta.latency_ms >= 1000 ? `${(result.meta.latency_ms / 1000).toFixed(1)}s` : `${result.meta.latency_ms}ms`}
                    </span>
                  </span>
                )}
                {result.provider && mode === "manual" && (
                  <span className="text-faint">{result.provider} / {result.model}</span>
                )}
              </div>
            </div>
          )}

          {/* ── Recent ──────────────────────────────────────────── */}
          {history.length > 0 && (
            <div className="pt-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-semibold text-faint uppercase tracking-wider">Recent</span>
                <a href="/activity?tab=history" className="text-xs text-violet-400 hover:text-violet-300 transition-colors">
                  See all → Activity
                </a>
              </div>
              <div className={`${card} divide-y divide-[#1E1F28]`}>
                {history.map(item => (
                  <div key={item.request_id}>
                    <button
                      onClick={() => item.status === "success" ? toggleHistory(item.request_id) : undefined}
                      className={`w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-hover transition-colors ${item.status !== "success" ? "cursor-default opacity-50" : ""}`}
                    >
                      <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${MODALITY_PILL[item.modality] ?? MODALITY_PILL.text}`}>
                        {item.modality}
                      </span>
                      <span className="flex-1 text-sm text-secondary truncate min-w-0">{item.prompt ?? "(no prompt)"}</span>
                      <span className="shrink-0 text-faint text-xs hidden sm:block truncate max-w-[120px]">{item.model ?? "—"}</span>
                      <span className="shrink-0 text-xs text-faint">
                        <span className="text-muted font-medium">{item.credits_deducted}</span>cr
                      </span>
                      <span className="shrink-0 text-faint text-xs">{timeAgo(item.created_at)}</span>
                      {item.status === "success" && (
                        <svg className={`shrink-0 w-3.5 h-3.5 text-faint transition-transform ${expandedId === item.request_id ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      )}
                      {item.status === "failed" && <span className="shrink-0 text-xs text-red-400">failed</span>}
                    </button>

                    {expandedId === item.request_id && (
                      <div className="border-t border-border bg-surface-2/40 px-4 py-4">
                        {(() => {
                          const out = expandedOutputs[item.request_id];
                          if (!out || out === "loading") return (
                            <div className="flex items-center gap-2 text-sm text-faint">
                              <Spinner className="h-3.5 w-3.5" /> Loading…
                            </div>
                          );
                          if (out === "error") return <p className="text-sm text-faint">Output no longer available.</p>;
                          return (
                            <div>
                              {out.modality === "text" && out.output.content && <p className="text-sm leading-relaxed whitespace-pre-wrap text-secondary">{out.output.content}</p>}
                              {out.modality === "image" && out.output.url && <img src={out.output.url} alt="" className="max-w-full rounded-xl" />}
                              {out.modality === "video" && out.output.url && <video src={out.output.url} controls className="w-full rounded-xl" />}
                              {out.modality === "audio" && out.output.url && <audio src={out.output.url} controls className="w-full" />}
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </SidebarLayout>
  );
}

export default function GeneratePage() {
  return (
    <Suspense fallback={null}>
      <GenerateContent />
    </Suspense>
  );
}
