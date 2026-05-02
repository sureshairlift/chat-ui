/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{html,ts}"],
  // The senders/conversations data store Tailwind classes inline (e.g.
  // "bg-emerald-500", "bg-gradient-to-br from-amber-400 to-rose-500").
  // Tailwind's JIT only sees classes that appear *literally* in source
  // files, so we safelist the patterns used by the data layer.
  safelist: [
    // Solid background colors used by avatars / section accents
    {
      pattern: /^bg-(emerald|orange|red|amber|rose|sky|blue|violet|indigo|teal|cyan|pink|fuchsia|purple|green|gray|slate|stone|neutral|zinc|yellow|lime)-(50|100|200|300|400|500|600|700|800|900)$/,
    },
    // Text color variants (used in tinted-pill avatars like "bg-amber-100 text-amber-700")
    {
      pattern: /^text-(emerald|orange|red|amber|rose|sky|blue|violet|indigo|teal|cyan|pink|fuchsia|purple|green|gray|slate|stone|neutral|zinc|yellow|lime)-(50|100|200|300|400|500|600|700|800|900)$/,
    },
    // Gradient utilities + stops
    "bg-gradient-to-br",
    "bg-gradient-to-r",
    "bg-gradient-to-l",
    "bg-gradient-to-t",
    "bg-gradient-to-b",
    {
      pattern: /^(from|via|to)-(emerald|orange|red|amber|rose|sky|blue|violet|indigo|teal|cyan|pink|fuchsia|purple|green|gray|slate|stone|neutral|zinc|yellow|lime)-(50|100|200|300|400|500|600|700|800|900)$/,
    },
    // Ring + border colors used dynamically
    {
      pattern: /^(ring|border)-(emerald|orange|red|amber|rose|blue|gray|green)-(100|200|300|400|500)$/,
    },
  ],
  theme: {
    extend: {
      animation: {
        "side-panel-in": "sidePanelIn 200ms cubic-bezier(0.16, 1, 0.3, 1) both",
      },
      keyframes: {
        sidePanelIn: {
          "0%": { transform: "translateY(8px)", opacity: 0 },
          "100%": { transform: "translateY(0)", opacity: 1 },
        },
      },
    },
  },
  plugins: [],
};
