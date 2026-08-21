import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#111827",
        moss: "#365314",
        sand: "#f8f5ec",
        clay: "#b45309",
        earth: "#7c5535",
        leaf: "#5d8c4a",
        cream: "#fffaf1"
      },
      fontFamily: {
        sans: ["Avenir Next", "Trebuchet MS", "Segoe UI", "sans-serif"]
      }
    }
  },
  plugins: []
};

export default config;
