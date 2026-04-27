"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clearApiKey, getApiKey } from "@/lib/auth";
import { apiFetch } from "@/lib/api";

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

interface Props {
  balance?: number | null;
}

export default function AppHeader({ balance }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [dark, setDark] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const notifRef = useRef<HTMLDivElement>(null);

  // Dark mode
  useEffect(() => {
    const saved = localStorage.getItem("syphakie_dark") === "1";
    setDark(saved);
    document.documentElement.classList.toggle("dark", saved);
  }, []);

  function toggleDark() {
    const next = !dark;
    setDark(next);
    localStorage.setItem("syphakie_dark", next ? "1" : "0");
    document.documentElement.classList.toggle("dark", next);
  }

  // Notifications
  useEffect(() => {
    if (!getApiKey()) return;
    apiFetch<{ unread_count: number; notifications: Notification[] }>("/api/v1/notifications?limit=10")
      .then((d) => { setNotifs(d.notifications); setUnread(d.unread_count); })
      .catch(() => {});
  }, [pathname]);

  function openNotifs() {
    setNotifOpen((v) => !v);
  }

  async function markAllRead() {
    try {
      await apiFetch("/api/v1/notifications/read-all", { method: "POST" });
      setUnread(0);
      setNotifs((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch {}
  }

  // Close notif dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function logout() {
    clearApiKey();
    router.replace("/login");
  }

  const navLinks = [
    { href: "/generate",  label: "Generate" },
    { href: "/models",    label: "Models" },
    { href: "/pipelines", label: "Pipelines" },
    { href: "/activity",  label: "Activity" },
    { href: "/webhooks",  label: "Webhooks" },
    { href: "/account",   label: "Account" },
  ];

  return (
    <header className="border-b border-gray-200 bg-white px-4 py-3 flex items-center justify-between sticky top-0 z-10">
      <div className="flex items-center gap-5">
        <Link href="/generate" className="font-bold text-sm tracking-tight">SyphaKie</Link>
        <nav className="flex items-center gap-3 overflow-x-auto">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`text-sm whitespace-nowrap transition-colors ${
                pathname === link.href
                  ? "text-gray-900 font-medium"
                  : "text-gray-400 hover:text-gray-700"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="flex items-center gap-3 text-sm text-gray-500 shrink-0">
        {balance != null && (
          <span className="text-xs">
            <span className="font-semibold text-gray-900">{balance.toLocaleString()}</span> credits
          </span>
        )}

        {/* Dark mode toggle */}
        <button
          onClick={toggleDark}
          title={dark ? "Light mode" : "Dark mode"}
          className="text-gray-400 hover:text-gray-700 transition-colors"
        >
          {dark ? (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"/>
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>
            </svg>
          )}
        </button>

        {/* Notification bell */}
        <div className="relative" ref={notifRef}>
          <button onClick={openNotifs} className="relative text-gray-400 hover:text-gray-700 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            {unread > 0 && (
              <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-500 rounded-full text-white text-xs flex items-center justify-center leading-none">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </button>

          {notifOpen && (
            <div className="absolute right-0 mt-2 w-80 bg-white border border-gray-200 rounded-lg shadow-lg z-20 overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
                <p className="text-xs font-semibold text-gray-700">Notifications</p>
                {unread > 0 && (
                  <button onClick={markAllRead} className="text-xs text-blue-500 hover:text-blue-700">
                    Mark all read
                  </button>
                )}
              </div>
              <div className="max-h-80 overflow-y-auto divide-y divide-gray-50">
                {notifs.length === 0 && (
                  <p className="px-3 py-6 text-xs text-gray-400 text-center">No notifications</p>
                )}
                {notifs.map((n) => (
                  <div
                    key={n.id}
                    className={`px-3 py-2.5 ${n.is_read ? "" : "bg-blue-50"}`}
                    onClick={() => { if (n.link) router.push(n.link); setNotifOpen(false); }}
                  >
                    <p className={`text-xs font-medium ${n.is_read ? "text-gray-700" : "text-gray-900"}`}>{n.title}</p>
                    {n.body && <p className="text-xs text-gray-400 mt-0.5">{n.body}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <button onClick={logout} className="text-gray-400 hover:text-gray-700 transition-colors text-xs">
          Logout
        </button>
      </div>
    </header>
  );
}
