"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getApiKey } from "@/lib/auth";
import SidebarLayout from "@/components/SidebarLayout";
import { apiFetch } from "@/lib/api";

interface Webhook { id: string; url: string; events: string[]; is_active: boolean; created_at: string }
interface Delivery { id: string; event: string; status: string; attempts: number; last_response_code: number | null; last_error: string | null; delivered_at: string | null; created_at: string }

const ALL_EVENTS = ["generation.complete", "generation.failed", "credits.low", "pipeline.complete", "finetune.complete"];

export default function WebhooksPage() {
  const router = useRouter();
  const [hooks, setHooks] = useState<Webhook[]>([]);
  const [selected, setSelected] = useState<Webhook | null>(null);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);

  // Create form
  const [url, setUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [events, setEvents] = useState<string[]>(["generation.complete"]);
  const [creating, setCreating] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (!getApiKey()) { router.replace("/login"); return; }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    setLoading(true);
    try {
      const d = await apiFetch<{ webhooks: Webhook[] }>("/api/v1/webhooks");
      setHooks(d.webhooks);
    } catch {}
    setLoading(false);
  }

  async function selectHook(h: Webhook) {
    setSelected(h);
    try {
      const d = await apiFetch<{ deliveries: Delivery[] }>(`/api/v1/webhooks/${h.id}/deliveries`);
      setDeliveries(d.deliveries);
    } catch {}
  }

  async function create() {
    if (!url.trim() || events.length === 0) return;
    setCreating(true);
    try {
      await apiFetch("/api/v1/webhooks", { method: "POST", body: JSON.stringify({ url, secret: secret || undefined, events }) });
      setUrl(""); setSecret(""); setEvents(["generation.complete"]);
      await load();
    } catch {}
    setCreating(false);
  }

  async function toggle(h: Webhook) {
    await apiFetch(`/api/v1/webhooks/${h.id}`, { method: "PATCH", body: JSON.stringify({ is_active: !h.is_active }) });
    await load();
    if (selected?.id === h.id) setSelected({ ...h, is_active: !h.is_active });
  }

  async function deleteHook(id: string) {
    await apiFetch(`/api/v1/webhooks/${id}`, { method: "DELETE" });
    setSelected(null);
    await load();
  }

  async function test(id: string) {
    setTesting(true);
    try {
      await apiFetch(`/api/v1/webhooks/${id}/test`, { method: "POST" });
      if (selected?.id === id) {
        const d = await apiFetch<{ deliveries: Delivery[] }>(`/api/v1/webhooks/${id}/deliveries`);
        setDeliveries(d.deliveries);
      }
    } catch {}
    setTesting(false);
  }

  function toggleEvent(e: string) {
    setEvents((prev) => prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e]);
  }

  return (
    <SidebarLayout>
      <div className="px-6 py-8 max-w-5xl mx-auto w-full">
        <h1 className="text-xl font-semibold text-primary mb-1">Webhooks</h1>
        <p className="text-xs text-faint mb-6">Receive real-time events when generations complete, fail, or pipelines finish.</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Left: list + create */}
          <div className="md:col-span-1 space-y-3">
            {hooks.map((h) => (
              <div
                key={h.id}
                onClick={() => selectHook(h)}
                className={`border rounded-lg p-3 cursor-pointer transition-colors ${selected?.id === h.id ? "border-violet-500 bg-violet-500/10" : "border-border bg-surface-2 hover:bg-[#1a1a1a]"}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <div className={`w-2 h-2 rounded-full ${h.is_active ? "bg-emerald-500" : "bg-[#333]"}`} />
                  <p className="text-xs font-medium text-primary truncate">{h.url}</p>
                </div>
                <p className="text-xs text-faint">{h.events.length} events</p>
              </div>
            ))}
            {!loading && hooks.length === 0 && <p className="text-xs text-faint">No webhooks yet.</p>}

            <div className="border border-dashed border-[#2a2a2a] rounded-lg p-3">
              <p className="text-xs font-medium text-[#aaa] mb-2">Add Webhook</p>
              <input placeholder="https://your-server.com/webhook" value={url} onChange={(e) => setUrl(e.target.value)} className="w-full bg-[#1a1a1a] border border-[#2a2a2a] text-primary text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-violet-500 placeholder-[#444] mb-2" />
              <input placeholder="Secret (optional)" value={secret} onChange={(e) => setSecret(e.target.value)} className="w-full bg-[#1a1a1a] border border-[#2a2a2a] text-primary text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-violet-500 placeholder-[#444] mb-2" type="password" />
              <div className="space-y-1 mb-2">
                {ALL_EVENTS.map((e) => (
                  <label key={e} className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={events.includes(e)} onChange={() => toggleEvent(e)} className="w-3 h-3 accent-violet-500" />
                    <span className="text-xs text-faint">{e}</span>
                  </label>
                ))}
              </div>
              <button onClick={create} disabled={creating || !url.trim() || events.length === 0} className="w-full py-1.5 bg-violet-600 hover:bg-violet-500 text-primary text-xs rounded-lg disabled:opacity-40 transition-colors">
                {creating ? "Adding…" : "Add"}
              </button>
            </div>
          </div>

          {/* Right: details */}
          {selected ? (
            <div className="md:col-span-2 space-y-4">
              <div className="border border-border rounded-xl bg-surface-2 p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-medium text-primary truncate">{selected.url}</p>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => test(selected.id)} disabled={testing} className="text-xs text-violet-400 hover:text-violet-300">
                      {testing ? "Sending…" : "Test"}
                    </button>
                    <button onClick={() => toggle(selected)} className="text-xs text-faint hover:text-primary">
                      {selected.is_active ? "Disable" : "Enable"}
                    </button>
                    <button onClick={() => deleteHook(selected.id)} className="text-xs text-faint hover:text-red-400">Delete</button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {selected.events.map((e) => (
                    <span key={e} className="text-xs px-2 py-0.5 bg-violet-500/15 text-violet-300 rounded">{e}</span>
                  ))}
                </div>
              </div>

              <div className="border border-border rounded-xl bg-surface-2 overflow-hidden">
                <p className="px-4 py-2 text-xs font-medium text-faint border-b border-border">Delivery Log</p>
                {deliveries.length === 0 ? (
                  <p className="px-4 py-6 text-xs text-faint text-center">No deliveries yet. Click Test to send a test event.</p>
                ) : (
                  <div className="divide-y divide-[#1a1a1a]">
                    {deliveries.map((d) => (
                      <div key={d.id} className="px-4 py-2.5 flex items-center gap-3">
                        <span className={`text-xs px-1.5 py-0.5 rounded ${d.status === "delivered" ? "bg-emerald-500/20 text-emerald-400" : d.status === "failed" ? "bg-red-500/20 text-red-400" : "bg-[#222] text-faint"}`}>{d.status}</span>
                        <span className="text-xs text-[#aaa]">{d.event}</span>
                        <span className="text-xs text-faint">{d.last_response_code ? `HTTP ${d.last_response_code}` : ""}</span>
                        {d.last_error && <span className="text-xs text-red-400 truncate max-w-32">{d.last_error}</span>}
                        <span className="text-xs text-[#444] ml-auto">{d.attempts} attempt{d.attempts !== 1 ? "s" : ""}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="md:col-span-2 flex items-center justify-center text-xs text-faint border border-dashed border-[#2a2a2a] rounded-xl min-h-[200px]">
              Select a webhook to view delivery logs
            </div>
          )}
        </div>
      </div>
    </SidebarLayout>
  );
}
