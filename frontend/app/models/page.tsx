"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getApiKey } from "@/lib/auth";
import AppHeader from "@/components/AppHeader";
import {
  fetchAllModels,
  fetchProviderKeys,
  saveProviderKey,
  ModelFull,
  ApiError,
} from "@/lib/api";

type ModalityFilter = "all" | "text" | "image";

const PROVIDER_LABELS: Record<string, string> = {
  fal:        "Fal.ai",
  anthropic:  "Anthropic",
  openai:     "OpenAI",
  stability:  "Stability AI",
};

function label(provider: string) {
  return PROVIDER_LABELS[provider] ?? provider;
}

function fmt(n: number | null | undefined, dec = 4): string {
  if (n == null) return "—";
  return n.toFixed(dec);
}

// ── Provider Keys Panel ──────────────────────────────────────────────────────

interface ProviderKeyRowProps {
  provider: string;
  hasKey: boolean;
  onSaved: () => void;
}

function ProviderKeyRow({ provider, hasKey, onSaved }: ProviderKeyRowProps) {
  const [editing, setEditing] = useState(!hasKey);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    if (!value.trim()) return;
    setSaving(true);
    setError("");
    try {
      await saveProviderKey(provider, value.trim());
      setValue("");
      setEditing(false);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center gap-3 py-2">
      <span className="w-28 text-sm font-medium text-gray-700 shrink-0">
        {label(provider)}
      </span>

      {!editing ? (
        <>
          <span className="flex items-center gap-1.5 text-xs text-green-600 font-medium">
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 00-1.414 0L8 12.586 4.707 9.293a1 1 0 00-1.414 1.414l4 4a1 1 0 001.414 0l8-8a1 1 0 000-1.414z" clipRule="evenodd" />
            </svg>
            Key stored
          </span>
          <button
            onClick={() => setEditing(true)}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors ml-1"
          >
            Update
          </button>
        </>
      ) : (
        <div className="flex items-center gap-2 flex-1">
          <input
            type="password"
            placeholder={`${label(provider)} API key`}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
            className="flex-1 border border-gray-300 rounded px-2.5 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-black"
            autoFocus={!hasKey}
          />
          <button
            onClick={handleSave}
            disabled={saving || !value.trim()}
            className="text-xs px-3 py-1.5 bg-black text-white rounded disabled:opacity-40 hover:bg-gray-800 transition-colors whitespace-nowrap"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          {hasKey && (
            <button
              onClick={() => { setEditing(false); setValue(""); }}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              Cancel
            </button>
          )}
          {error && <span className="text-xs text-red-600">{error}</span>}
        </div>
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ModelsPage() {
  const router = useRouter();

  const [models, setModels] = useState<ModelFull[]>([]);
  const [storedKeys, setStoredKeys] = useState<string[]>([]);
  const [filter, setFilter] = useState<ModalityFilter>("all");
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");

  async function loadData() {
    try {
      const [modelList, keys] = await Promise.all([
        fetchAllModels(),
        fetchProviderKeys(),
      ]);
      setModels(modelList);
      setStoredKeys(keys);
      setLoading(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.replace("/login");
      } else {
        setPageError("Could not load models.");
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    if (!getApiKey()) { router.replace("/login"); return; }
    loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Providers that need user keys (derived from model list)
  const userKeyProviders = [
    ...new Set(models.filter((m) => m.requires_user_key).map((m) => m.provider)),
  ].sort();

  const visible =
    filter === "all" ? models : models.filter((m) => m.modality === filter);

  function useModel(m: ModelFull) {
    router.push(
      `/generate?model=${encodeURIComponent(m.model_id)}&modality=${m.modality}&mode=manual`,
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader />

      <main className="flex-1 flex flex-col items-center px-4 py-10">
        <div className="w-full max-w-5xl space-y-6">

          {/* ── Provider Keys ─────────────────────────────────────── */}
          {!loading && userKeyProviders.length > 0 && (
            <div className="border border-gray-200 rounded-md overflow-hidden">
              <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-200">
                <h2 className="text-sm font-medium text-gray-700">Provider Keys</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Required for models marked <span className="font-medium">your key</span>. Keys are stored securely on the server.
                </p>
              </div>
              <div className="divide-y divide-gray-100 px-4">
                {userKeyProviders.map((provider) => (
                  <ProviderKeyRow
                    key={provider}
                    provider={provider}
                    hasKey={storedKeys.includes(provider)}
                    onSaved={() => fetchProviderKeys().then(setStoredKeys)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* ── Table header ──────────────────────────────────────── */}
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-semibold">Models</h1>
            <div className="flex items-center gap-1 bg-gray-100 rounded-md p-1">
              {(["all", "text", "image"] as ModalityFilter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1 text-sm rounded transition-colors capitalize ${
                    filter === f
                      ? "bg-white shadow-sm text-gray-900 font-medium"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {loading && (
            <div className="flex items-center gap-2 text-sm text-gray-400 py-8">
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Loading…
            </div>
          )}

          {pageError && (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {pageError}
            </div>
          )}

          {/* ── Model table ───────────────────────────────────────── */}
          {!loading && !pageError && (
            <div className="border border-gray-200 rounded-md overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                    <th className="text-left px-4 py-3 font-medium">Model</th>
                    <th className="text-left px-4 py-3 font-medium">Provider</th>
                    <th className="text-left px-4 py-3 font-medium">Type</th>
                    <th className="text-right px-4 py-3 font-medium">Cost</th>
                    <th className="text-right px-4 py-3 font-medium">Latency</th>
                    <th className="text-right px-4 py-3 font-medium">Quality</th>
                    <th className="text-center px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {visible.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                        No models found.
                      </td>
                    </tr>
                  )}
                  {visible.map((m) => {
                    const needsKey = m.requires_user_key;
                    const keySet = storedKeys.includes(m.provider);
                    const canUse = m.is_active && (!needsKey || keySet);

                    return (
                      <tr key={m.model_id} className="bg-white hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900">{m.display_name}</div>
                          <div className="text-xs text-gray-400 font-mono mt-0.5">{m.model_id}</div>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{label(m.provider)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                              m.modality === "image"
                                ? "bg-purple-100 text-purple-700"
                                : "bg-blue-100 text-blue-700"
                            }`}>
                              {m.modality}
                            </span>
                            {needsKey && (
                              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                                keySet
                                  ? "bg-green-100 text-green-700"
                                  : "bg-amber-100 text-amber-700"
                              }`}>
                                {keySet ? "key ✓" : "your key"}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-xs text-gray-600">
                          {fmt(m.cost_per_unit)}{" "}
                          <span className="text-gray-400">/{m.unit_type}</span>
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600">
                          {m.avg_latency_ms != null ? `${m.avg_latency_ms}ms` : "—"}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600">
                          {m.quality_score != null
                            ? `${(m.quality_score * 100).toFixed(0)}%`
                            : "—"}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${
                            m.is_active
                              ? "bg-green-100 text-green-700"
                              : "bg-gray-100 text-gray-500"
                          }`}>
                            {m.is_active ? "active" : "inactive"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {m.is_active && (
                            <button
                              onClick={() => useModel(m)}
                              title={
                                !canUse
                                  ? `Add your ${label(m.provider)} API key above to use this model`
                                  : undefined
                              }
                              className={`text-xs px-3 py-1.5 rounded transition-colors whitespace-nowrap ${
                                canUse
                                  ? "bg-black text-white hover:bg-gray-800"
                                  : "bg-gray-100 text-gray-400 cursor-not-allowed"
                              }`}
                            >
                              {canUse ? "Use model" : "Add key"}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <p className="text-xs text-gray-400">
            {visible.length} model{visible.length !== 1 ? "s" : ""}
            {filter !== "all" ? ` · ${filter}` : ""}
            {" · "}
            <span className="text-amber-600">your key</span> = bring your own API key
            {" · "}
            others use SyphaKie system keys
          </p>
        </div>
      </main>
    </div>
  );
}
