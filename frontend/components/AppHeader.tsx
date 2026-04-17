"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clearApiKey } from "@/lib/auth";

interface Props {
  balance?: number | null;
}

export default function AppHeader({ balance }: Props) {
  const pathname = usePathname();
  const router = useRouter();

  function logout() {
    clearApiKey();
    router.replace("/login");
  }

  const navLinks = [
    { href: "/generate", label: "Generate" },
    { href: "/models", label: "Models" },
    { href: "/account", label: "Account" },
  ];

  return (
    <header className="border-b border-gray-200 bg-white px-4 py-3 flex items-center justify-between sticky top-0 z-10">
      <div className="flex items-center gap-6">
        <span className="font-semibold text-sm">SyphaKie</span>
        <nav className="flex items-center gap-4">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`text-sm transition-colors ${
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
      <div className="flex items-center gap-4 text-sm text-gray-500">
        {balance != null && (
          <span>
            <span className="font-medium text-gray-900">{balance}</span> credits
          </span>
        )}
        <button
          onClick={logout}
          className="text-gray-400 hover:text-gray-700 transition-colors"
        >
          Logout
        </button>
      </div>
    </header>
  );
}
