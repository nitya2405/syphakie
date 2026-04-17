"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { setApiKey } from "@/lib/auth";
import { signup, loginWithPassword, ApiError } from "@/lib/api";

type Tab = "login" | "signup";

export default function LoginPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("login");

  // shared fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // signup-only
  const [fullName, setFullName] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function switchTab(t: Tab) {
    setTab(t);
    setError("");
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await loginWithPassword({ email, password });
      setApiKey(res.api_key);
      router.push("/generate");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Login failed. Check your credentials.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await signup({
        email,
        password,
        full_name: fullName || undefined,
      });
      setApiKey(res.api_key);
      router.push("/generate");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Signup failed. Try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold mb-1">SyphaKie</h1>
        <p className="text-gray-500 text-sm mb-6">
          AI model aggregator — bring your own keys.
        </p>

        {/* Tabs */}
        <div className="flex border border-gray-200 rounded-md overflow-hidden mb-6">
          {(["login", "signup"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => switchTab(t)}
              className={`flex-1 py-2 text-sm font-medium capitalize transition-colors ${
                tab === t
                  ? "bg-black text-white"
                  : "bg-white text-gray-500 hover:text-gray-800"
              }`}
            >
              {t === "login" ? "Log in" : "Sign up"}
            </button>
          ))}
        </div>

        {/* Login form */}
        {tab === "login" && (
          <form onSubmit={handleLogin} className="space-y-3">
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
              autoFocus
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
            />
            {error && <p className="text-red-600 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-black text-white rounded-md py-2 text-sm font-medium disabled:opacity-40 hover:bg-gray-800 transition-colors"
            >
              {loading ? "Logging in…" : "Log in"}
            </button>
          </form>
        )}

        {/* Signup form */}
        {tab === "signup" && (
          <form onSubmit={handleSignup} className="space-y-3">
            <input
              type="text"
              placeholder="Full name (optional)"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
              autoFocus
            />
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
            />
            <input
              type="password"
              placeholder="Password (min 8 chars)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
            />
            <input
              type="password"
              placeholder="Confirm password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
            />
            {error && <p className="text-red-600 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-black text-white rounded-md py-2 text-sm font-medium disabled:opacity-40 hover:bg-gray-800 transition-colors"
            >
              {loading ? "Creating account…" : "Create account"}
            </button>
            <p className="text-xs text-gray-400 text-center pt-1">
              Your API token is generated automatically and accessible from your account page.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
