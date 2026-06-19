import type { Config } from "tailwindcss";

/**
 * Tailwind CSS configuration (per Constitution v2.3.0 — Technical Stack
 * Constraints, "Styling" line). All visual presentation MUST be expressed
 * via Tailwind utility classes in JSX `className`; component code references
 * the project tokens declared here, not raw hex values.
 *
 * @see specs/001-teachers/tasks.md T012a
 */
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Project palette — referenced from utility classes (bg-primary,
        // text-primary, border-primary, etc.). antd's primary token is set
        // to the same value via <ConfigProvider> in app/layout.tsx.
        primary: {
          DEFAULT: "#1d4ed8",
          50: "#eff6ff",
          100: "#dbeafe",
          200: "#bfdbfe",
          300: "#93c5fd",
          400: "#60a5fa",
          500: "#3b82f6",
          600: "#1d4ed8",
          700: "#1e40af",
          800: "#1e3a8a",
          900: "#1e3a8a",
        },
        danger: {
          DEFAULT: "#b00020",
          50: "#fef2f2",
          500: "#ef4444",
          600: "#dc2626",
          700: "#b00020",
        },
        surface: {
          DEFAULT: "#ffffff",
          muted: "#f3f4f6",
          border: "#e5e7eb",
        },
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "Oxygen",
          "Ubuntu",
          "Cantarell",
          "Open Sans",
          "Helvetica Neue",
          "sans-serif",
        ],
      },
      maxWidth: {
        container: "1100px",
      },
      borderRadius: {
        card: "8px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(0, 0, 0, 0.04)",
      },
    },
  },
  plugins: [],
};

export default config;
