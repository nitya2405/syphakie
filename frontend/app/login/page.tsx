"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { setApiKey } from "@/lib/auth";
import { signup, loginWithPassword, ApiError } from "@/lib/api";

type Tab = "login" | "signup";

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  ) : (
    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
    </svg>
  );
}

function PasswordInput({ placeholder, value, onChange, required, autoFocus }: {
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  autoFocus?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        type={show ? "text" : "password"}
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        required={required}
        autoFocus={autoFocus}
        className="w-full border border-gray-300 rounded-md px-3 py-2 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-black"
      />
      <button
        type="button"
        onClick={() => setShow(s => !s)}
        className="absolute right-2.5 top-1/2 -translate-y-1/2"
        tabIndex={-1}
      >
        <EyeIcon open={show} />
      </button>
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("login");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
      setError(err instanceof ApiError ? err.message : "Login failed. Check your credentials.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirmPassword) { setError("Passwords do not match."); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    setLoading(true);
    setError("");
    try {
      const res = await signup({ email, password, full_name: fullName || undefined });
      setApiKey(res.api_key);
      router.push("/generate");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Signup failed. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold mb-1">SyphaKie</h1>
        <p className="text-gray-500 text-sm mb-6">AI model aggregator — bring your own keys.</p>

        <div className="flex border border-gray-200 rounded-md overflow-hidden mb-6">
          {(["login", "signup"] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => switchTab(t)}
              className={`flex-1 py-2 text-sm font-medium capitalize transition-colors ${
                tab === t ? "bg-black text-white" : "bg-white text-gray-500 hover:text-gray-800"
              }`}
            >
              {t === "login" ? "Log in" : "Sign up"}
            </button>
          ))}
        </div>

        {tab === "login" && (
          <form onSubmit={handleLogin} className="space-y-3">
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoFocus
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
            />
            <PasswordInput
              placeholder="Password"
              value={password}
              onChange={setPassword}
              required
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

        {tab === "signup" && (
          <form onSubmit={handleSignup} className="space-y-3">
            <input
              type="text"
              placeholder="Full name (optional)"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              autoFocus
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
            />
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
            />
            <PasswordInput
              placeholder="Password (min 8 chars)"
              value={password}
              onChange={setPassword}
              required
            />
            <PasswordInput
              placeholder="Confirm password"
              value={confirmPassword}
              onChange={setConfirmPassword}
              required
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
