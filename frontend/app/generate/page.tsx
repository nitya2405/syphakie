"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getApiKey, clearApiKey } from "@/lib/auth";
import {
  fetchModels,
  generate,
  fetchBalance,
  GenerateResponse,
  ModelOption,
  ApiError,
} from "@/lib/api";

type Modality = "text" | "image";
type Mode = "manual" | "auto";

export default function GeneratePage() {
  const router = useRouter();

  const [modality, setModality] = useState<Modality>("text");
  const [mode, setMode] = useState<Mode>("auto");
  const [prompt, setPrompt] = useState("");
  const [selectedModel, setSelectedModel] = useState("");

  const [models, setModels] = useState<ModelOption[]>([]);
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GenerateResponse | null>(null);
  const [error, setError] = useState("");

  // Redirect if no key
  useEffect(() => {
    if (!getApiKey()) router.replace("/login");
  }, [router]);

  // Load balance
  const loadBalance = useCallback(async () => {
    try {
      const b = await fetchBalance();
      setBalance(b);
    } catch {
      // balance display is non-critical
    }
  }, []);

  useEffect(() => {
    loadBalance();
  }, [loadBalance]);

  // Load models when modality changes (only needed for manual mode)
  useEffect(() => {
    if (mode !== "manual") return;
    fetchModels(modality)
      .then((list) => {
        setModels(list);
        setSelectedModel(list[0]?.model_id ?? "");
      })
      .catch(() => setModels([]));
  }, [modality, mode]);

  function handleModeChange(m: Mode) {
    setMode(m);
    setSelectedModel("");
  }

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await generate({
        modality,
        mode,
        prompt: prompt.trim(),
        ...(mode === "manual" && selectedModel
          ? { model: selectedModel }
          : {}),
      });
      setResult(res);
      setBalance(res.meta.credits_remaining);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          clearApiKey();
          router.replace("/login");
          return;
        }
        setError(err.message);
      } else {
        setError("Something went wrong. Check that the backend is running.");
      }
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    clearApiKey();
    router.replace("/login");
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white px-4 py-3 flex items-center justify-between">
        <span className="font-semibold text-sm">SyphaKie</span>
        <div className="flex items-center gap-4 text-sm text-gray-500">
          {balance !== null && (
            <span>
              <span className="font-medium text-gray-900">{balance}</span>{" "}
              credits
            </span>
          )}
          <button
            onClick={handleLogout}
            className="text-gray-400 hover:text-gray-700 transition-colors"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 flex flex-col items-center px-4 py-10">
        <div className="w-full max-w-2xl space-y-8">
          <h1 className="text-xl font-semibold">Generate</h1>

          {/* Form */}
          <form onSubmit={handleGenerate} className="space-y-4">
            {/* Modality + Mode row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Modality
                </label>
                <select
                  value={modality}
                  onChange={(e) => setModality(e.target.value as Modality)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black bg-white"
                >
                  <option value="text">Text</option>
                  <option value="image">Image</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Mode
                </label>
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

            {/* Model selector — manual only */}
            {mode === "manual" && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Model
                </label>
                {models.length === 0 ? (
                  <p className="text-sm text-gray-400">Loading models…</p>
                ) : (
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black bg-white"
                  >
                    {models.map((m) => (
                      <option key={m.model_id} value={m.model_id}>
                        {m.display_name} — {m.provider}{" "}
                        {m.requires_user_key ? "(your key)" : ""}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {/* Prompt */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Prompt
              </label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={
                  modality === "text"
                    ? "Write a haiku about clouds."
                    : "A photo of a red panda in snow."
                }
                rows={4}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black resize-none"
              />
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || !prompt.trim()}
              className="w-full bg-black text-white rounded-md py-2.5 text-sm font-medium disabled:opacity-40 hover:bg-gray-800 transition-colors"
            >
              {loading ? "Generating…" : "Generate"}
            </button>
          </form>

          {/* Error */}
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Result */}
          {result && (
            <div className="space-y-4">
              <div className="border border-gray-200 rounded-md overflow-hidden">
                {/* Output content */}
                <div className="p-4 bg-white">
                  {result.modality === "text" && result.output.content && (
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">
                      {result.output.content}
                    </p>
                  )}
                  {result.modality === "image" && result.output.url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={result.output.url}
                      alt="Generated image"
                      className="max-w-full rounded"
                    />
                  )}
                </div>

                {/* Meta bar */}
                <div className="border-t border-gray-100 bg-gray-50 px-4 py-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-500">
                  <span>
                    <span className="font-medium text-gray-700">
                      {result.meta.credits_used}
                    </span>{" "}
                    credits used
                  </span>
                  <span>
                    <span className="font-medium text-gray-700">
                      {result.meta.latency_ms}ms
                    </span>{" "}
                    latency
                  </span>
                  <span>
                    {result.provider} / {result.model}
                  </span>
                  <span className="capitalize">{result.meta.routing_mode}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
