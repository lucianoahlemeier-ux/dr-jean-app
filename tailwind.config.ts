import type { Config } from "tailwindcss";

// Palette + mood per docs/05: soft warm cream background, friendly rounded,
// one friendly accent. The persona's accent colour lives in lib/persona.ts and
// is applied via CSS variables (see app/globals.css) so the human can rebrand
// without touching Tailwind.
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cream: {
          DEFAULT: "#FFF8F2",
          deep: "#F3E7D8",
        },
        ink: {
          DEFAULT: "#2B2622",
          soft: "#6B6259",
        },
        accent: {
          DEFAULT: "var(--accent)",
          fg: "var(--accent-fg)",
        },
      },
      fontFamily: {
        serif: ["Georgia", "Cambria", "Times New Roman", "serif"],
        sans: [
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
      },
      borderRadius: {
        xl: "1rem",
        "2xl": "1.5rem",
        "3xl": "2rem",
      },
      boxShadow: {
        soft: "0 10px 40px -12px rgba(43, 38, 34, 0.18)",
        card: "0 4px 24px -8px rgba(43, 38, 34, 0.14)",
      },
      maxWidth: {
        measure: "65ch",
      },
    },
  },
  plugins: [],
};

export default config;
