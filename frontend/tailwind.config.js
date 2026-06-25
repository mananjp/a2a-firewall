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
        },
      },
    },
  },
  plugins: [],
};