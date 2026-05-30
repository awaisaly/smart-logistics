import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: { DEFAULT: "var(--bg)", warm: "var(--bg-warm)" },
        surface: { DEFAULT: "var(--surface)", 2: "var(--surface-2)" },
        ink: { DEFAULT: "var(--ink)", 2: "var(--ink-2)" },
        mute: { DEFAULT: "var(--mute)", 2: "var(--mute-2)" },
        line: { DEFAULT: "var(--line)", strong: "var(--line-strong)" },
        sidebar: {
          DEFAULT: "var(--sidebar)",
          ink: "var(--sidebar-ink)",
          mute: "var(--sidebar-mute)",
          hover: "var(--sidebar-hover)",
          active: "var(--sidebar-active)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          soft: "var(--accent-soft)",
          ink: "var(--accent-ink)",
        },
        ok: { DEFAULT: "var(--ok)", soft: "var(--ok-soft)" },
        warn: { DEFAULT: "var(--warn)", soft: "var(--warn-soft)" },
        err: { DEFAULT: "var(--err)", soft: "var(--err-soft)" },
        info: { DEFAULT: "var(--info)", soft: "var(--info-soft)" },
        neutral: { DEFAULT: "var(--neutral)", soft: "var(--neutral-soft)" },
      },
      borderRadius: {
        sm: "var(--r-sm)",
        md: "var(--r-md)",
        lg: "var(--r-lg)",
      },
      boxShadow: {
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
      },
      fontFamily: {
        sans: ["var(--sans)"],
        mono: ["var(--mono)"],
        serif: ["var(--serif)"],
      },
    },
  },
  plugins: [],
};

export default config;
