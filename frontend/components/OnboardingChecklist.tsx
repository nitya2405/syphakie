"use client";
import { useState, useEffect } from "react";
import Link from "next/link";

interface CheckItem {
  id: string;
  label: string;
  done: boolean;
  link?: string;
  linkLabel?: string;
}

export default function OnboardingChecklist() {
  const [items, setItems] = useState<CheckItem[]>([]);
  const [dismissed, setDismissed] = useState(false);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (localStorage.getItem("syphakie_onboard_done") === "1") {
      setDismissed(true);
      return;
    }
    const hasKey = !!localStorage.getItem("syphakie_provider_key_added");
    const hasGenerated = !!localStorage.getItem("syphakie_first_generation");
    const hasApiKey = !!localStorage.getItem("syphakie_api_key");

    const checklist: CheckItem[] = [
      { id: "signup", label: "Create your account", done: hasApiKey, link: "/login", linkLabel: "Sign up" },
      { id: "provider_key", label: "Add a provider API key", done: hasKey, link: "/models", linkLabel: "Add key" },
      { id: "first_gen", label: "Run your first generation", done: hasGenerated, link: "/generate", linkLabel: "Generate" },
      { id: "explore_models", label: "Explore the model library", done: false, link: "/models", linkLabel: "Browse" },
      { id: "compare", label: "Compare models side-by-side", done: false, link: "/compare", linkLabel: "Compare" },
    ];
    setItems(checklist);

    // Auto-dismiss if all done
    if (checklist.every((c) => c.done)) {
      localStorage.setItem("syphakie_onboard_done", "1");
      setDismissed(true);
    }
  }, []);

  if (dismissed || items.length === 0) return null;

  const doneCount = items.filter((i) => i.done).length;
  const allDone = doneCount === items.length;

  function dismiss() {
    localStorage.setItem("syphakie_onboard_done", "1");
    setDismissed(true);
  }

  return (
    <div className="border border-blue-200 rounded-md bg-blue-50 overflow-hidden mb-5">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-blue-100/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            {items.map((item) => (
              <div
                key={item.id}
                className={`w-2 h-2 rounded-full ${item.done ? "bg-blue-500" : "bg-blue-200"}`}
              />
            ))}
          </div>
          <span className="text-sm font-medium text-blue-800">
            Getting started — {doneCount}/{items.length} done
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); dismiss(); }}
            className="text-xs text-blue-400 hover:text-blue-600"
          >
            Dismiss
          </button>
          <svg
            className={`w-4 h-4 text-blue-400 transition-transform ${open ? "rotate-180" : ""}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {open && (
        <div className="px-4 pb-3 space-y-2">
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-3">
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                item.done ? "bg-blue-500 border-blue-500" : "border-blue-300"
              }`}>
                {item.done && (
                  <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 00-1.414 0L8 12.586 4.707 9.293a1 1 0 00-1.414 1.414l4 4a1 1 0 001.414 0l8-8a1 1 0 000-1.414z" clipRule="evenodd" />
                  </svg>
                )}
              </div>
              <span className={`text-sm flex-1 ${item.done ? "line-through text-blue-400" : "text-blue-800"}`}>
                {item.label}
              </span>
              {!item.done && item.link && (
                <Link href={item.link} className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                  {item.linkLabel} →
                </Link>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
