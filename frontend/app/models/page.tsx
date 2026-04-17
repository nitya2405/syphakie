"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getApiKey } from "@/lib/auth";
import AppHeader from "@/components/AppHeader";
import { fetchAllModels, ModelFull, ApiError } from "@/lib/api";

type ModalityFilter = "all" | "text" | "image";

function fmt(n: number | null | undefined, decimals = 4): string {
  if (n == null) return "—";
  return n.toFixed(decimals);
}

export default function ModelsPage() {
  const router = useRouter();
  const [models, setModels] = useState<ModelFull[]>([]);
  const [filter, setFilter] = useState<ModalityFilter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!getApiKey()) { router.replace("/login"); return; }
    fetchAllModels()
      .then((list) => { setModels(list); setLoading(false); })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          router.replace("/login");
        } else {
          setError("Could not load models.");
          setLoading(false);
        }
      });
  }, [router]);

  const visible = filter === "all" ? models : models.filter((m) => m.modality === filter);

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
              Loading models…
            </div>
          )}

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {!loading && !error && (
            <div className="border border-gray-200 rounded-md overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                    <th className="text-left px-4 py-3 font-medium">Model</th>
                    <th className="text-left px-4 py-3 font-medium">Provider</th>
                    <th className="text-left px-4 py-3 font-medium">Modality</th>
                    <th className="text-right px-4 py-3 font-medium">Cost / unit</th>
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
                  {visible.map((m) => (
                    <tr key={m.model_id} className="bg-white hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{m.display_name}</div>
                        <div className="text-xs text-gray-400 font-mono mt-0.5">{m.model_id}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{m.provider}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                          m.modality === "image"
                            ? "bg-purple-100 text-purple-700"
                            : "bg-blue-100 text-blue-700"
                        }`}>
                          {m.modality}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600 font-mono text-xs">
                        {fmt(m.cost_per_unit)}{" "}
                        <span className="text-gray-400">/{m.unit_type}</span>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600">
                        {m.avg_latency_ms != null ? `${m.avg_latency_ms}ms` : "—"}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600">
                        {m.quality_score != null ? (m.quality_score * 100).toFixed(0) + "%" : "—"}
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
                            className="text-xs px-3 py-1.5 bg-black text-white rounded hover:bg-gray-800 transition-colors whitespace-nowrap"
                          >
                            Use model
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="text-xs text-gray-400">
            {visible.length} model{visible.length !== 1 ? "s" : ""}
            {filter !== "all" ? ` · ${filter}` : ""}
            {" "}· Cost per unit depends on model pricing. Quality scores are 0–100%.
          </p>
        </div>
      </main>
    </div>
  );
}
