/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        firewall: {
          allow: "#10b981",
          block: "#ef4444",
          review: "#f59e0b",
          surface: "#0f172a",
          panel: "#1e293b",
          ink: "#020617",
          edge: "#334155",
          mute: "#94a3b8",
        },
      },
      fontFamily: {
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Monaco",
          "Consolas",
          "monospace",
        ],
      },
      backgroundImage: {
        "hero-radial":
          "radial-gradient(ellipse at top, rgba(59,130,246,0.18), transparent 60%), radial-gradient(ellipse at bottom right, rgba(16,185,129,0.12), transparent 55%)",
        "grid-faint":
          "linear-gradient(rgba(148,163,184,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.06) 1px, transparent 1px)",
      },
      backgroundSize: {
        "grid-32": "32px 32px",
      },
      keyframes: {
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        floaty: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-4px)" },
        },
        pulseRing: {
          "0%": { boxShadow: "0 0 0 0 rgba(59,130,246,0.45)" },
          "70%": { boxShadow: "0 0 0 12px rgba(59,130,246,0)" },
          "100%": { boxShadow: "0 0 0 0 rgba(59,130,246,0)" },
        },
      },
      animation: {
        shimmer: "shimmer 3s linear infinite",
        floaty: "floaty 4s ease-in-out infinite",
        pulseRing: "pulseRing 2.2s cubic-bezier(0.4,0,0.6,1) infinite",
      },
    },
  },
  plugins: [],
};
