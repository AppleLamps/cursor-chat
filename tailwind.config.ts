import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "sans-serif"],
        display: ["var(--font-display)", "sans-serif"]
      },
      boxShadow: {
        soft: "0 18px 70px rgba(32, 38, 55, 0.10)",
        float: "0 18px 44px rgba(29, 48, 80, 0.14)"
      },
      colors: {
        ink: "#16181d",
        paper: "#fbfaf7",
        warm: "#f4efe6",
        line: "#e6dfd3",
        brand: "#2458d3",
        "brand-ink": "#163a91"
      }
    }
  },
  plugins: []
};

export default config;
