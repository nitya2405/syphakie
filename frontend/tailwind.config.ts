import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg:      "var(--bg)",
        surface: "var(--surface)",
        "surface-2": "var(--surface-2)",
        "surface-3": "var(--surface-3)",
        "surface-dim": "var(--surface-dim)",
        border:  "var(--border)",
        "border-2": "var(--border-2)",
        primary:   "var(--text-primary)",
        secondary: "var(--text-secondary)",
        muted:     "var(--text-muted)",
        faint:     "var(--text-faint)",
        sidebar:   "var(--sidebar)",
        hover:     "var(--hover)",
        brand:     "var(--primary)",
        "brand-con": "var(--primary-con)",
        "on-brand": "var(--on-primary)",
      },
      fontFamily: {
        inter: ["Inter", "sans-serif"],
        mono: ["Space Grotesk", "monospace"],
      },
      borderRadius: {
        sm: "0.125rem",
        DEFAULT: "0.25rem",
        md: "0.375rem",
        lg: "0.5rem",
        xl: "0.75rem",
        full: "9999px",
      },
    },
  },
  plugins: [],
};

export default config;
