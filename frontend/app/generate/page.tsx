"use client";
import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getApiKey, clearApiKey } from "@/lib/auth";
import AppHeader from "@/components/AppHeader";
import {
  fetchModels,
  generate,
  fetchBalance,
  fetchHistory,
  fetchOutput,
  GenerateResponse,
  HistoryRecord,
  OutputData,
  ModelOption,
  ApiError,
} from "@/lib/api";

type Modality = "text" | "image" | "video" | "audio";
type Mode = "manual" | "auto";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function Spinner({ className = "h-4 w-4 text-white" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  );
}

function GenerateContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Read URL params set by "Use Model" on /models page
  const urlModel    = searchParams.get("model");
  const urlModality = searchParams.get("modality") as Modality | null;
  const urlMode     = searchParams.get("mode") as Mode | null;

  const [modality, setModality] = useState<Modality>(
    (["text","image","video","audio"] as Modality[]).includes(urlModality as Modality)
      ? (urlModality as Modality)
      : "text",
  );
  const [mode, setMode] = useState<Mode>(
    urlMode === "manual" ? "manual" : "auto",
  );
  const [prompt, setPrompt] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const [models, setModels] = useState<ModelOption[]>([]);

  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GenerateResponse | null>(null);
  const [error, setError] = useState("");
  const [errorIsMissingKey, setErrorIsMissingKey] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedOutputs, setExpandedOutputs] = useState<
    Record<string, OutputData | "loading" | "error">
  >({});

  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!getApiKey()) router.replace("/login");
  }, [router]);

  const loadBalance = useCallback(async () => {
    try { setBalance(await fetchBalance()); } catch { /* non-critical */ }
  }, []);

  const loadHistory = useCallback(async () => {
    try { setHistory(await fetchHistory(10)); } catch { /* non-critical */ }
  }, []);

  useEffect(() => {
    loadBalance();
    loadHistory();
  }, [loadBalance, loadHistory]);

  // Load models for manual mode; honour URL-preselected model
  useEffect(() => {
    if (mode !== "manual") return;
    fetchModels(modality)
      .then((list) => {
        setModels(list);
        const preselect = urlModel && list.find((m) => m.model_id === urlModel);
        setSelectedModel(preselect ? preselect.model_id : list[0]?.model_id ?? "");
      })
      .catch(() => setModels([]));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modality, mode]);

  function handleModeChange(m: Mode) {
    setMode(m);
    setSelectedModel("");
    setModels([]);
  }

  async function runGenerate() {
    if (!prompt.trim() || loading) return;
    setLoading(true);
    setError("");
    setErrorIsMissingKey(false);
    setResult(null);
    try {
      const res = await generate({
        modality,
        mode,
        prompt: prompt.trim(),
        ...(mode === "manual" && selectedModel ? { model: selectedModel } : {}),
      });
      setResult(res);
      setBalance(res.meta.credits_remaining);
      loadHistory();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) { clearApiKey(); router.replace("/login"); return; }
        if (err.code === "MISSING_PROVIDER_KEY") {
          setErrorIsMissingKey(true);
          setError(err.message);
        } else {
          setError(err.message);
        }
      } else {
        setError("Generation failed. Is the backend running?");
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopySuccess(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopySuccess(false), 2000);
    } catch { /* blocked */ }
  }

  function handleDownload(url: string) {
    fetch(url)
      .then((r) => r.blob())
      .then((blob) => {
        const href = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = href;
        a.download = "syphakie-image.png";
        a.click();
        URL.revokeObjectURL(href);
      });
  }

  async function toggleHistory(id: string) {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    if (expandedOutputs[id]) return;
    setExpandedOutputs((prev) => ({ ...prev, [id]: "loading" }));
    try {
      const out = await fetchOutput(id);
      setExpandedOutputs((prev) => ({ ...prev, [id]: out }));
    } catch {
      setExpandedOutputs((prev) => ({ ...prev, [id]: "error" }));
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader balance={balance} />

      <main className="flex-1 flex flex-col items-center px-4 py-10">
        <div className="w-full max-w-2xl space-y-8">
          <h1 className="text-xl font-semibold">Generate</h1>

          {/* ── Form ─────────────────────────────────────────────── */}
          <form onSubmit={(e) => { e.preventDefault(); runGenerate(); }} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Modality</label>
                <select
                  value={modality}
                  onChange={(e) => setModality(e.target.value as Modality)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black bg-white"
                >
                  <option value="text">Text / Chat</option>
                  <option value="image">Image</option>
                  <option value="video">Video</option>
                  <option value="audio">Audio / Speech</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Mode</label>
                <select
                  value={mode}
                  onChange={(e) => handleModeChange(e.target.value as Mode)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black bg-white"
                >
                  <option value="auto">Auto</option>
                  <option value="manual">Manual</option>
                </select>
              </div>
            </div>

            {mode === "manual" && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Model</label>
                {models.length === 0 ? (
                  <p className="text-sm text-gray-400 py-2">Loading models…</p>
                ) : (
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black bg-white"
                  >
                    {models.map((m) => (
                      <option key={m.model_id} value={m.model_id}>
                        {m.display_name} — {m.provider}
                        {m.requires_user_key ? " (your key)" : ""}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Prompt</label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={
                  modality === "text"  ? "Write a haiku about clouds." :
                  modality === "image" ? "A photo of a red panda in snow." :
                  modality === "video" ? "A time-lapse of a sunset over the ocean." :
                                        "A calm, cinematic piano melody."
                }
                rows={4}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black resize-none"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !prompt.trim()}
              className="w-full bg-black text-white rounded-md py-2.5 text-sm font-medium disabled:opacity-40 hover:bg-gray-800 transition-colors flex items-center justify-center gap-2"
            >
              {loading && <Spinner />}
              {loading ? "Generating…" : "Generate"}
            </button>
          </form>

          {/* ── Error ────────────────────────────────────────────── */}
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
              {errorIsMissingKey && (
                <span>
                  {" "}→{" "}
                  <a href="/models" className="underline font-medium hover:opacity-80">
                    Add your key on the Models page
                  </a>
                </span>
              )}
            </div>
          )}

          {/* ── Result ───────────────────────────────────────────── */}
          {result && (
            <div className="border border-gray-200 rounded-md overflow-hidden">
              <div className="p-4 bg-white">
                {result.modality === "text" && result.output.content && (
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">
                    {result.output.content}
                  </p>
                )}
                {result.modality === "image" && result.output.url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={result.output.url} alt="Generated image" className="max-w-full rounded" />
                )}
                {result.modality === "video" && result.output.url && (
                  <video
                    src={result.output.url}
                    controls
                    className="max-w-full rounded w-full"
                  />
                )}
                {result.modality === "audio" && result.output.url && (
                  <audio src={result.output.url} controls className="w-full" />
                )}
              </div>

              <div className="border-t border-gray-100 px-4 py-2 flex items-center gap-2">
                {result.modality === "text" && result.output.content && (
                  <button
                    onClick={() => handleCopy(result.output.content!)}
                    className="text-xs px-3 py-1.5 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
                  >
                    {copySuccess ? "Copied!" : "Copy"}
                  </button>
                )}
                {(result.modality === "image" || result.modality === "video" || result.modality === "audio") && result.output.url && (
                  <button
                    onClick={() => handleDownload(result.output.url!)}
                    className="text-xs px-3 py-1.5 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
                  >
                    Download
                  </button>
                )}
                <button
                  onClick={runGenerate}
                  disabled={loading}
                  className="text-xs px-3 py-1.5 border border-gray-300 rounded hover:bg-gray-50 transition-colors disabled:opacity-40"
                >
                  Regenerate
                </button>
              </div>

              <div className="border-t border-gray-100 bg-gray-50 px-4 py-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-500">
                <span><span className="font-medium text-gray-700">{result.meta.credits_used}</span> credits</span>
                <span><span className="font-medium text-gray-700">{result.meta.latency_ms}ms</span></span>
                <span>{result.provider} / {result.model}</span>
                <span className="capitalize">{result.meta.routing_mode}</span>
              </div>
            </div>
          )}

          {/* ── Recent History ────────────────────────────────────── */}
          {history.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-medium text-gray-700">Recent</h2>
              <div className="border border-gray-200 rounded-md divide-y divide-gray-100 overflow-hidden">
                {history.map((item) => (
                  <div key={item.request_id}>
                    <button
                      onClick={() => item.status === "success" ? toggleHistory(item.request_id) : undefined}
                      className={`w-full text-left px-4 py-3 flex items-center gap-3 text-sm hover:bg-gray-50 transition-colors ${item.status !== "success" ? "cursor-default opacity-60" : ""}`}
                    >
                      <span className={`shrink-0 text-xs font-medium px-1.5 py-0.5 rounded ${
                        item.modality === "image" ? "bg-purple-100 text-purple-700" :
                        item.modality === "video" ? "bg-rose-100 text-rose-700" :
                        item.modality === "audio" ? "bg-amber-100 text-amber-700" :
                        "bg-blue-100 text-blue-700"
                      }`}>
                        {item.modality}
                      </span>
                      <span className="flex-1 text-gray-700 truncate min-w-0">
                        {item.prompt ?? "(no prompt)"}
                      </span>
                      <span className="shrink-0 text-gray-400 text-xs hidden sm:block">{item.model ?? "—"}</span>
                      <span className="shrink-0 text-gray-400 text-xs">{item.credits_deducted}cr</span>
                      <span className="shrink-0 text-gray-400 text-xs">{timeAgo(item.created_at)}</span>
                      {item.status === "success" && (
                        <svg
                          className={`shrink-0 w-3.5 h-3.5 text-gray-400 transition-transform ${expandedId === item.request_id ? "rotate-180" : ""}`}
                          fill="none" stroke="currentColor" viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      )}
                      {item.status === "failed" && (
                        <span className="shrink-0 text-xs text-red-500">failed</span>
                      )}
                    </button>

                    {expandedId === item.request_id && (
                      <div className="border-t border-gray-100 bg-gray-50 px-4 py-3">
                        {(() => {
                          const out = expandedOutputs[item.request_id];
                          if (!out || out === "loading") {
                            return (
                              <div className="flex items-center gap-2 text-sm text-gray-400">
                                <Spinner className="h-3.5 w-3.5 text-gray-400" />
                                Loading…
                              </div>
                            );
                          }
                          if (out === "error") {
                            return <p className="text-sm text-gray-400">Output no longer available.</p>;
                          }
                          return (
                            <div>
                              {out.modality === "text" && out.output.content && (
                                <p className="text-sm leading-relaxed whitespace-pre-wrap text-gray-700">
                                  {out.output.content}
                                </p>
                              )}
                              {out.modality === "image" && out.output.url && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={out.output.url} alt="Generated image" className="max-w-full rounded" />
                              )}
                              {out.modality === "video" && out.output.url && (
                                <video src={out.output.url} controls className="max-w-full rounded w-full" />
                              )}
                              {out.modality === "audio" && out.output.url && (
                                <audio src={out.output.url} controls className="w-full" />
                              )}
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
      </main>
    </div>
  );
}

export default function GeneratePage() {
  return (
    <Suspense fallback={null}>
      <GenerateContent />
    </Suspense>
  );
}
