/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./App.tsx", "./index.tsx", "./components/**/*.{ts,tsx}", "./utils/**/*.{ts,tsx}"],
  theme: {
    extend: {
      keyframes: {
        shine: {
          "0%": { transform: "translateX(-100%) skewX(-12deg)" },
          "100%": { transform: "translateX(250%) skewX(-12deg)" },
        },
        "bounce-in": {
          "0%": { transform: "scale(0.9)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
      },
      animation: {
        shine: "shine 1.1s ease-in-out",
        "bounce-in": "bounce-in 180ms ease-out",
      },
    },
  },
  plugins: [],
};

