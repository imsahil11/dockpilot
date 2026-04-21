import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        dp: {
          bg: "#0a0a0f",
          surface: "#0f0f1a",
          card: "#161625",
          elevated: "#1e1e35",
          border: "#2a2a4a",
          borderHover: "#3a3a5a",
          text: "#f0f0ff",
          secondary: "#a0a0c0",
          muted: "#606080",
          brand: "#6366f1",
          brandLight: "#818cf8",
          brandDark: "#4f46e5",
          running: "#10b981",
          warning: "#f59e0b",
          error: "#ef4444",
          info: "#3b82f6",
          accent: "#8b5cf6",
          cyan: "#06b6d4"
        }
      },
      fontFamily: {
        sans: ["Inter", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"]
      },
      boxShadow: {
        soft: "0 20px 50px rgba(8, 8, 16, 0.5)"
      }
    }
  },
  plugins: []
};

export default config;
