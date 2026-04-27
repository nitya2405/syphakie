"use client";
import { useState, useEffect, useRef, ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clearApiKey, getApiKey } from "@/lib/auth";
import { apiFetch, fetchBalance } from "@/lib/api";

interface Notification {
  id: string; type: string; title: string; body: string | null; link: string | null; is_read: boolean; created_at: string;
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function IconBolt()    { return <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>; }
function IconGrid()    { return <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/></svg>; }
function IconFlow()    { return <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 6h16M4 12h8m-8 6h16"/></svg>; }
function IconChart()   { return <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>; }
function IconWebhook() { return <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/></svg>; }
function IconUser()    { return <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>; }
function IconBell()    { return <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg>; }
function IconLogout()  { return <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>; }
function IconSun()     { return <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"/></svg>; }
function IconMoon()    { return <svg className="w-[18px] h-[18px]" fill="currentColor" viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>; }
function IconCoins()   { return <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>; }

const NAV = [
  { href: "/generate",  label: "Generate",  icon: <IconBolt />   },
  { href: "/models",    label: "Models",    icon: <IconGrid />   },
  { href: "/pipelines", label: "Pipelines", icon: <IconFlow />   },
  { href: "/activity",  label: "Activity",  icon: <IconChart />  },
  { href: "/webhooks",  label: "Webhooks",  icon: <IconWebhook />},
  { href: "/account",   label: "Account",   icon: <IconUser />   },
];

export default function SidebarLayout({ children, balance: balanceProp }: { children: ReactNode; balance?: number | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const [dark, setDark] = useState(true);
  const [balance, setBalance] = useState<number | null>(balanceProp ?? null);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem("syphakie_dark");
    const isDark = saved === null ? true : saved === "1";
    setDark(isDark);
    document.documentElement.classList.toggle("dark", isDark);
    document.documentElement.classList.toggle("light", !isDark);
  }, []);

  useEffect(() => {
    if (balanceProp != null) { setBalance(balanceProp); return; }
    if (!getApiKey()) return;
    fetchBalance().then(setBalance).catch(() => {});
  }, [balanceProp]);

  useEffect(() => {
    if (!getApiKey()) return;
    apiFetch<{ unread_count: number; notifications: Notification[] }>("/api/v1/notifications?limit=10")
      .then((d) => { setNotifs(d.notifications); setUnread(d.unread_count); })
      .catch(() => {});
  }, [pathname]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function toggleDark() {
    const next = !dark;
    setDark(next);
    localStorage.setItem("syphakie_dark", next ? "1" : "0");
    document.documentElement.classList.toggle("dark", next);
    document.documentElement.classList.toggle("light", !next);
  }

  async function markAllRead() {
    try {
      await apiFetch("/api/v1/notifications/read-all", { method: "POST" });
      setUnread(0);
      setNotifs((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch {}
  }

  function logout() { clearApiKey(); router.replace("/login"); }

  return (
    <div className="flex min-h-screen bg-bg text-primary">
      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <aside className="w-[220px] shrink-0 fixed top-0 left-0 h-screen bg-surface border-r border-border flex flex-col z-20">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-border">
          <Link href="/models" className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center shrink-0">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z"/>
              </svg>
            </div>
            <span className="font-bold text-[15px] text-primary tracking-tight">SyphaKie</span>
          </Link>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {NAV.map((item) => {
            const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? "bg-surface-2 text-primary"
                    : "text-muted hover:text-primary hover:bg-hover"
                }`}
              >
                <span className={active ? "text-violet-400" : ""}>{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Bottom section */}
        <div className="border-t border-border px-3 py-3 space-y-0.5">
          {/* Credits */}
          {balance != null && (
            <div className="flex items-center gap-3 px-3 py-2 rounded-lg text-muted">
              <IconCoins />
              <span className="text-sm">
                <span className="font-semibold text-primary">{balance.toLocaleString()}</span>
                <span className="text-faint ml-1">credits</span>
              </span>
            </div>
          )}

          {/* Notifications */}
          <div className="relative" ref={notifRef}>
            <button
              onClick={() => setNotifOpen((v) => !v)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted hover:text-primary hover:bg-hover transition-colors"
            >
              <span className="relative">
                <IconBell />
                {unread > 0 && (
                  <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-violet-500 rounded-full text-white text-[9px] flex items-center justify-center leading-none">
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </span>
              Notifications
            </button>

            {notifOpen && (
              <div className="absolute bottom-full left-0 mb-1 w-72 bg-surface border border-border-2 rounded-xl shadow-2xl z-30 overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
                  <p className="text-xs font-semibold text-primary">Notifications</p>
                  {unread > 0 && (
                    <button onClick={markAllRead} className="text-xs text-violet-400 hover:text-violet-300 transition-colors">
                      Mark all read
                    </button>
                  )}
                </div>
                <div className="max-h-72 overflow-y-auto divide-y divide-border">
                  {notifs.length === 0 && (
                    <p className="px-3 py-6 text-xs text-faint text-center">No notifications</p>
                  )}
                  {notifs.map((n) => (
                    <div
                      key={n.id}
                      className={`px-3 py-2.5 cursor-pointer hover:bg-hover transition-colors ${n.is_read ? "" : "bg-violet-500/5"}`}
                      onClick={() => { if (n.link) router.push(n.link); setNotifOpen(false); }}
                    >
                      <p className={`text-xs font-medium ${n.is_read ? "text-muted" : "text-primary"}`}>{n.title}</p>
                      {n.body && <p className="text-xs text-faint mt-0.5">{n.body}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Dark mode toggle */}
          <button
            onClick={toggleDark}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted hover:text-primary hover:bg-hover transition-colors"
          >
            {dark ? <IconSun /> : <IconMoon />}
            {dark ? "Light mode" : "Dark mode"}
          </button>

          {/* Logout */}
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted hover:text-red-400 hover:bg-hover transition-colors"
          >
            <IconLogout />
            Logout
          </button>
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────────── */}
      <main className="flex-1 ml-[220px] min-h-screen">
        {children}
      </main>
    </div>
  );
}
