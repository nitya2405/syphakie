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
  FAL_BACKED_PROVIDERS,
  keyProviderFor,
} from "@/lib/api";

// ── Constants ─────────────────────────────────────────────────────────────────

const PROVIDER_LABELS: Record<string, string> = {
  openai:        "OpenAI",
  anthropic:     "Anthropic",
  google:        "Google",
  xai:           "Grok / xAI",
  qwen:          "Qwen (Alibaba)",
  elevenlabs:    "ElevenLabs",
  stability:     "Stability AI",
  fal:           "Fal.ai",
  kling:         "Kling",
  luma:          "Luma",
  hailuo:        "Hailuo",
  wan:           "Wan",
  bytedance:     "ByteDance",
  runway:        "Runway",
  midjourney:    "Midjourney",
  suno:          "Suno",
  veed:          "Veed",
  topaz:         "Topaz",
  kie:           "Kie",
};

const TASK_CATEGORIES = [
  {
    label: "Video Generation",
    tasks: [
      { id: "text_to_video",  label: "Text to Video" },
      { id: "image_to_video", label: "Image to Video" },
      { id: "video_to_video", label: "Video to Video" },
      { id: "video_editing",  label: "Video Editing" },
      { id: "speech_to_video",label: "Speech to Video" },
      { id: "lip_sync",       label: "Lip Sync" },
    ],
  },
  {
    label: "Image Generation",
    tasks: [
      { id: "text_to_image",  label: "Text to Image" },
      { id: "image_to_image", label: "Image to Image" },
      { id: "image_editing",  label: "Image Editing" },
    ],
  },
  {
    label: "Audio / Music",
    tasks: [
      { id: "text_to_speech", label: "Text to Speech" },
      { id: "speech_to_text", label: "Speech to Text" },
      { id: "text_to_music",  label: "Text to Music" },
      { id: "audio_to_audio", label: "Audio to Audio" },
    ],
  },
  {
    label: "Chat",
    tasks: [
      { id: "chat", label: "Chat" },
    ],
  },
];

// Task type → color
const TASK_COLORS: Record<string, string> = {
  chat:           "bg-blue-100 text-blue-700",
  text_to_image:  "bg-purple-100 text-purple-700",
  image_to_image: "bg-purple-100 text-purple-700",
  image_editing:  "bg-purple-100 text-purple-700",
  text_to_video:  "bg-rose-100 text-rose-700",
  image_to_video: "bg-rose-100 text-rose-700",
  video_to_video: "bg-rose-100 text-rose-700",
  video_editing:  "bg-rose-100 text-rose-700",
  speech_to_video:"bg-rose-100 text-rose-700",
  lip_sync:       "bg-rose-100 text-rose-700",
  text_to_speech: "bg-amber-100 text-amber-700",
  speech_to_text: "bg-amber-100 text-amber-700",
  text_to_music:  "bg-amber-100 text-amber-700",
  audio_to_audio: "bg-amber-100 text-amber-700",
};

function taskLabel(taskType: string | null): string {
  if (!taskType) return "—";
  return taskType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function providerLabel(provider: string): string {
  return PROVIDER_LABELS[provider] ?? provider;
}

function fmt(n: number | null | undefined, dec = 4): string {
  if (n == null) return "—";
  return n.toFixed(dec);
}

// ── Filter Sidebar ─────────────────────────────────────────────────────────────

type FilterTab = "tasks" | "providers";

interface FilterPanelProps {
  allProviders: string[];
  selectedTasks: Set<string>;
  selectedProviders: Set<string>;
  onToggleTask: (id: string) => void;
  onToggleProvider: (id: string) => void;
  onClearAll: () => void;
}

function FilterPanel({
  allProviders, selectedTasks, selectedProviders,
  onToggleTask, onToggleProvider, onClearAll,
}: FilterPanelProps) {
  const [tab, setTab] = useState<FilterTab>("tasks");
  const totalSelected = selectedTasks.size + selectedProviders.size;

  return (
    <div className="border border-gray-200 rounded-md overflow-hidden bg-white sticky top-[57px] self-start">
      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setTab("tasks")}
          className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
            tab === "tasks"
              ? "bg-blue-500 text-white"
              : "bg-white text-gray-500 hover:text-gray-800"
          }`}
        >
          Tasks ({TASK_CATEGORIES.reduce((s, c) => s + c.tasks.length, 0)})
        </button>
        <button
          onClick={() => setTab("providers")}
          className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
            tab === "providers"
              ? "bg-blue-500 text-white"
              : "bg-white text-gray-500 hover:text-gray-800"
          }`}
        >
          Providers ({allProviders.length})
        </button>
      </div>

      <div className="p-3 space-y-4 max-h-[calc(100vh-160px)] overflow-y-auto">
        {tab === "tasks" && TASK_CATEGORIES.map((cat) => (
          <div key={cat.label}>
            <p className="text-xs font-semibold text-gray-900 mb-1.5">{cat.label}</p>
            <div className="flex flex-wrap gap-1.5">
              {cat.tasks.map((t) => {
                const active = selectedTasks.has(t.id);
                return (
                  <button
                    key={t.id}
                    onClick={() => onToggleTask(t.id)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                      active
                        ? "bg-gray-800 text-white border-gray-800"
                        : "bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-400 hover:text-gray-800"
                    }`}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {tab === "providers" && (
          <div className="flex flex-wrap gap-1.5">
            {allProviders.map((p) => {
              const active = selectedProviders.has(p);
              return (
                <button
                  key={p}
                  onClick={() => onToggleProvider(p)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    active
                      ? "bg-gray-800 text-white border-gray-800"
                      : "bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-400 hover:text-gray-800"
                  }`}
                >
                  {providerLabel(p)}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {totalSelected > 0 && (
        <div className="border-t border-gray-100 px-3 py-2">
          <button
            onClick={onClearAll}
            className="text-xs text-blue-500 hover:text-blue-700 transition-colors"
          >
            Clear all ({totalSelected})
          </button>
        </div>
      )}
    </div>
  );
}

// ── Provider Key Row ───────────────────────────────────────────────────────────

interface ProviderKeyRowProps {
  keyProvider: string;
  displayLabel: string;
  hasKey: boolean;
  onSaved: () => void;
}

function ProviderKeyRow({ keyProvider, displayLabel, hasKey, onSaved }: ProviderKeyRowProps) {
  const [editing, setEditing] = useState(!hasKey);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    if (!value.trim()) return;
    setSaving(true);
    setError("");
    try {
      await saveProviderKey(keyProvider, value.trim());
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
      <span className="w-36 text-sm font-medium text-gray-700 shrink-0">{displayLabel}</span>
      {!editing ? (
        <>
          <span className="flex items-center gap-1.5 text-xs text-green-600 font-medium">
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 00-1.414 0L8 12.586 4.707 9.293a1 1 0 00-1.414 1.414l4 4a1 1 0 001.414 0l8-8a1 1 0 000-1.414z" clipRule="evenodd" />
            </svg>
            Key stored
          </span>
          <button onClick={() => setEditing(true)} className="text-xs text-gray-400 hover:text-gray-600 ml-1">
            Update
          </button>
        </>
      ) : (
        <div className="flex items-center gap-2 flex-1">
          <input
            type="password"
            placeholder={`${displayLabel} API key`}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
            className="flex-1 border border-gray-300 rounded px-2.5 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-black"
            autoFocus={!hasKey}
          />
          <button
            onClick={handleSave}
            disabled={saving || !value.trim()}
            className="text-xs px-3 py-1.5 bg-black text-white rounded disabled:opacity-40 hover:bg-gray-800 whitespace-nowrap"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          {hasKey && (
            <button onClick={() => { setEditing(false); setValue(""); }} className="text-xs text-gray-400 hover:text-gray-600">
              Cancel
            </button>
          )}
          {error && <span className="text-xs text-red-600">{error}</span>}
        </div>
      )}
    </div>
  );
}

// ── Provider Keys Dropdown ────────────────────────────────────────────────────

interface ProviderKeysDropdownProps {
  keyProvidersNeeded: string[];
  keyProviderLabel: Record<string, string>;
  storedKeys: string[];
  onSaved: () => void;
}

function ProviderKeysDropdown({
  keyProvidersNeeded, keyProviderLabel, storedKeys, onSaved,
}: ProviderKeysDropdownProps) {
  const [open, setOpen] = useState(false);
  const allSet = keyProvidersNeeded.every((kp) => storedKeys.includes(kp));
  const setCount = keyProvidersNeeded.filter((kp) => storedKeys.includes(kp)).length;

  return (
    <div className="border border-gray-200 rounded-md overflow-hidden">
      {/* Header — click to toggle */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
      >
        <div className="flex items-center gap-2.5">
          <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
          </svg>
          <span className="text-sm font-medium text-gray-700">Provider Keys</span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            allSet ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
          }`}>
            {setCount}/{keyProvidersNeeded.length} set
          </span>
        </div>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Rows — only shown when open */}
      {open && (
        <>
          <div className="px-4 pt-1 pb-0.5 border-t border-gray-100">
            <p className="text-xs text-gray-400 py-1.5">
              Stored securely on the server. Required for models marked{" "}
              <span className="font-medium text-amber-600">your key</span>.
            </p>
          </div>
          <div className="divide-y divide-gray-100 px-4 pb-1">
            {keyProvidersNeeded.map((kp) => (
              <ProviderKeyRow
                key={kp}
                keyProvider={kp}
                displayLabel={keyProviderLabel[kp]}
                hasKey={storedKeys.includes(kp)}
                onSaved={onSaved}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ModelsPage() {
  const router = useRouter();

  const [models, setModels] = useState<ModelFull[]>([]);
  const [storedKeys, setStoredKeys] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");

  const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set());
  const [selectedProviders, setSelectedProviders] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  async function loadData() {
    try {
      const [modelList, keys] = await Promise.all([fetchAllModels(), fetchProviderKeys()]);
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

  // Derive unique providers from model list (sorted by display label)
  const allProviders = [
    ...new Set(models.map((m) => m.provider)),
  ].sort((a, b) => providerLabel(a).localeCompare(providerLabel(b)));

  // Derive unique key providers needed (deduped: kling/luma/wan → fal)
  const keyProvidersNeeded = [
    ...new Set(
      models
        .filter((m) => m.requires_user_key)
        .map((m) => keyProviderFor(m.provider))
    ),
  ].sort();

  // Build labels for key providers (fal covers many brands)
  const keyProviderLabel: Record<string, string> = {};
  for (const kp of keyProvidersNeeded) {
    if (kp === "fal") {
      keyProviderLabel["fal"] = "Fal.ai (covers Kling, Luma, Wan, Hailuo, ByteDance, Runway)";
    } else {
      keyProviderLabel[kp] = providerLabel(kp);
    }
  }

  // Filtering
  const visible = models.filter((m) => {
    if (selectedTasks.size > 0 && !selectedTasks.has(m.task_type ?? "")) return false;
    if (selectedProviders.size > 0 && !selectedProviders.has(m.provider)) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      if (
        !m.display_name.toLowerCase().includes(q) &&
        !m.provider.toLowerCase().includes(q) &&
        !m.model_id.toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });

  function toggleTask(id: string) {
    setSelectedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleProvider(id: string) {
    setSelectedProviders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function clearAll() {
    setSelectedTasks(new Set());
    setSelectedProviders(new Set());
  }

  function useModel(m: ModelFull) {
    router.push(
      `/generate?model=${encodeURIComponent(m.model_id)}&modality=${m.modality}&mode=manual`,
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader />

      <main className="flex-1 px-4 py-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex gap-6">

            {/* ── Filter Sidebar ──────────────────────────────────── */}
            <div className="w-56 shrink-0">
              {!loading && (
                <FilterPanel
                  allProviders={allProviders}
                  selectedTasks={selectedTasks}
                  selectedProviders={selectedProviders}
                  onToggleTask={toggleTask}
                  onToggleProvider={toggleProvider}
                  onClearAll={clearAll}
                />
              )}
            </div>

            {/* ── Main Content ──────────────────────────────────────── */}
            <div className="flex-1 min-w-0 space-y-5">

              {/* Provider Keys — collapsible dropdown */}
              {!loading && keyProvidersNeeded.length > 0 && (
                <ProviderKeysDropdown
                  keyProvidersNeeded={keyProvidersNeeded}
                  keyProviderLabel={keyProviderLabel}
                  storedKeys={storedKeys}
                  onSaved={() => fetchProviderKeys().then(setStoredKeys)}
                />
              )}

              {/* Header + Search */}
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-semibold shrink-0">Models</h1>
                <input
                  type="text"
                  placeholder="Search models…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="flex-1 border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                />
                <span className="text-xs text-gray-400 shrink-0">{visible.length} results</span>
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

              {/* Model Table */}
              {!loading && !pageError && (
                <div className="border border-gray-200 rounded-md overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                        <th className="text-left px-4 py-3 font-medium">Model</th>
                        <th className="text-left px-4 py-3 font-medium">Provider</th>
                        <th className="text-left px-4 py-3 font-medium">Task</th>
                        <th className="text-right px-4 py-3 font-medium">Cost</th>
                        <th className="text-right px-4 py-3 font-medium">Latency</th>
                        <th className="text-right px-4 py-3 font-medium">Quality</th>
                        <th className="px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {visible.length === 0 && (
                        <tr>
                          <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                            No models match the current filters.
                          </td>
                        </tr>
                      )}
                      {visible.map((m) => {
                        const kp = keyProviderFor(m.provider);
                        const keySet = storedKeys.includes(kp);
                        const canUse = m.is_active && (!m.requires_user_key || keySet);

                        return (
                          <tr key={`${m.provider}-${m.model_id}`} className="bg-white hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3">
                              <div className="font-medium text-gray-900">{m.display_name}</div>
                              <div className="text-xs text-gray-400 font-mono mt-0.5 truncate max-w-xs">{m.model_id}</div>
                            </td>
                            <td className="px-4 py-3 text-gray-600 text-xs">{providerLabel(m.provider)}</td>
                            <td className="px-4 py-3">
                              <div className="flex flex-wrap items-center gap-1">
                                {m.task_type && (
                                  <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${TASK_COLORS[m.task_type] ?? "bg-gray-100 text-gray-600"}`}>
                                    {taskLabel(m.task_type)}
                                  </span>
                                )}
                                {m.requires_user_key && (
                                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${keySet ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                                    {keySet ? "key ✓" : "your key"}
                                  </span>
                                )}
                                {!m.is_active && (
                                  <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-400">inactive</span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-xs text-gray-600 whitespace-nowrap">
                              {fmt(m.cost_per_unit)}{" "}
                              <span className="text-gray-400">/{m.unit_type}</span>
                            </td>
                            <td className="px-4 py-3 text-right text-xs text-gray-600">
                              {m.avg_latency_ms != null
                                ? m.avg_latency_ms >= 1000
                                  ? `${(m.avg_latency_ms / 1000).toFixed(0)}s`
                                  : `${m.avg_latency_ms}ms`
                                : "—"}
                            </td>
                            <td className="px-4 py-3 text-right text-xs text-gray-600">
                              {m.quality_score != null ? `${(m.quality_score * 100).toFixed(0)}%` : "—"}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {m.is_active && (
                                <button
                                  onClick={() => useModel(m)}
                                  title={!canUse ? `Add your ${providerLabel(kp)} API key above` : undefined}
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
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
