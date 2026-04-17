"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getApiKey } from "@/lib/auth";
import AppHeader from "@/components/AppHeader";
import { fetchMe, updateProfile, UserProfile, ApiError } from "@/lib/api";

export default function AccountPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Edit state
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  // API key reveal
  const [keyVisible, setKeyVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!getApiKey()) { router.replace("/login"); return; }
    fetchMe()
      .then((p) => {
        setProfile(p);
        setName(p.name ?? "");
        setPhone(p.phone_number ?? "");
        setLoading(false);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) router.replace("/login");
        setLoading(false);
      });
  }, [router]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveMsg("");
    try {
      const updated = await updateProfile({
        name: name || undefined,
        phone_number: phone || undefined,
      });
      setProfile(updated);
      setSaveMsg("Saved.");
      setTimeout(() => setSaveMsg(""), 2500);
    } catch {
      setSaveMsg("Failed to save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleCopyKey() {
    if (!profile?.api_key) return;
    try {
      await navigator.clipboard.writeText(profile.api_key);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* blocked */ }
  }

  function maskedKey(key: string) {
    return key.slice(0, 8) + "•".repeat(Math.max(0, key.length - 12)) + key.slice(-4);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col">
        <AppHeader />
        <div className="flex-1 flex items-center justify-center text-sm text-gray-400">Loading…</div>
      </div>
    );
  }

  if (!profile) return null;

  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader />

      <main className="flex-1 flex flex-col items-center px-4 py-10">
        <div className="w-full max-w-lg space-y-8">
          <h1 className="text-xl font-semibold">Account</h1>

          {/* ── Profile form ─────────────────────────────────────── */}
          <section className="border border-gray-200 rounded-md overflow-hidden">
            <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-100">
              <h2 className="text-sm font-medium text-gray-700">Profile</h2>
            </div>
            <form onSubmit={handleSave} className="px-4 py-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Full name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={profile.email}
                  disabled
                  className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm bg-gray-50 text-gray-500 cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Phone number
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+1 555 000 0000"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                />
              </div>

              <div className="flex items-center gap-3 pt-1">
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-black text-white text-sm rounded-md disabled:opacity-40 hover:bg-gray-800 transition-colors"
                >
                  {saving ? "Saving…" : "Save changes"}
                </button>
                {saveMsg && (
                  <span className={`text-sm ${saveMsg === "Saved." ? "text-green-600" : "text-red-600"}`}>
                    {saveMsg}
                  </span>
                )}
              </div>
            </form>
          </section>

          {/* ── API Token ──────────────────────────────────────────── */}
          <section className="border border-gray-200 rounded-md overflow-hidden">
            <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-100">
              <h2 className="text-sm font-medium text-gray-700">API Token</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Use this token as the <code className="font-mono bg-gray-100 px-1 rounded">X-API-Key</code> header in API requests.
              </p>
            </div>
            <div className="px-4 py-4 space-y-3">
              {profile.api_key ? (
                <>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 font-mono text-sm bg-gray-50 border border-gray-200 rounded px-3 py-2 text-gray-700 overflow-x-auto">
                      {keyVisible ? profile.api_key : maskedKey(profile.api_key)}
                    </code>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setKeyVisible((v) => !v)}
                      className="text-xs px-3 py-1.5 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
                    >
                      {keyVisible ? "Hide" : "Reveal"}
                    </button>
                    <button
                      onClick={handleCopyKey}
                      className="text-xs px-3 py-1.5 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
                    >
                      {copied ? "Copied!" : "Copy"}
                    </button>
                  </div>
                </>
              ) : (
                <p className="text-sm text-gray-400">
                  No API key found. This account was created before key storage was enabled.
                </p>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
