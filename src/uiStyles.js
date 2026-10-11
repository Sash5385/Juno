import { DARK } from "./theme.js";

// Варіанти оформлення (пробна версія для вкладки «Послуги»). Кожен — набір токенів теми поверх DARK.
// GLASS — напівпрозорі картки; LBL — колір дрібних підписів у формах; SHEET — фон вікон; WRAP — фон вкладки; FONT — шрифт.
const light = {
  GLOW: "255,255,255", SHADE: "70,60,120", INK: "70,60,120",
  GREEN: "#1f9d6b", BLUE: "#3b7bd6", PURPLE: "#7c5cc4", GOLD: "#b7791f", RED: "#e0525e", TEAL: "#14a39a",
  SURFACE: "rgba(255,255,255,0.55)", SURF_HI: "rgba(255,255,255,0.85)", SURF_LO: "rgba(255,255,255,0.4)",
  BORDER: "rgba(255,255,255,0.9)", SO: "0 6px 20px rgba(80,70,120,0.12)", SI: "inset 1px 1px 4px rgba(80,70,120,0.14)",
  STRIPE_A: "#e2dcfb", STRIPE_B: "#d6cff5", GLASS: true, LIGHTUI: true,
};
const dark = {
  GLOW: "255,255,255", SHADE: "0,0,0", INK: "255,255,255",
  SURFACE: "rgba(255,255,255,0.07)", SURF_HI: "rgba(255,255,255,0.12)", SURF_LO: "rgba(255,255,255,0.04)",
  BORDER: "rgba(255,255,255,0.14)", SO: "0 6px 20px rgba(0,0,0,0.25)", GLASS: true,
};

export const UI_STYLES = [
  { id: "1",  name: "1 · Графіт", theme: { ...DARK }, wrap: "radial-gradient(circle at 8% 0%,rgba(239,68,68,.16),transparent 48%),radial-gradient(circle at 100% 40%,rgba(168,85,247,.12),transparent 46%)", font: null },
  { id: "21", name: "21 · Імла", font: "Manrope", wrap: "linear-gradient(160deg,#e9e4ff,#dbeafe 55%,#f5e8ff)",
    theme: { ...DARK, ...light, BG: "#e9e4ff", BG_DEEP: "#e2dcfb", TEXT: "#2f2a4a", DIM: "#7a739b", FAINT: "#a59fc4", ACCENT: "#8b7cf6", ACC_HI: "#b7a6ff", LBL: "rgba(47,42,74,0.6)", SHEET: "linear-gradient(180deg,#f3efff,#e4eaff)" } },
  { id: "26", name: "26 · Лагуна", font: "Inter", wrap: "linear-gradient(170deg,#e6f4ff,#d6ecff 60%,#e8f9ff)",
    theme: { ...DARK, ...light, BG: "#e6f4ff", BG_DEEP: "#d8ebfb", TEXT: "#17324d", DIM: "#6d8aa6", FAINT: "#9bb3c8", ACCENT: "#3b8ff0", ACC_HI: "#7cc0ff", LBL: "rgba(23,50,77,0.6)", SHEET: "linear-gradient(180deg,#f2f9ff,#dcefff)" } },
  { id: "29", name: "29 · Туман", font: "Inter", wrap: "radial-gradient(circle at 0% 0%,rgba(96,165,250,.35),transparent 48%),radial-gradient(circle at 100% 80%,rgba(129,140,248,.3),transparent 50%),#10141c",
    theme: { ...DARK, ...dark, BG: "#10141c", BG_DEEP: "#0b0f16", TEXT: "#e8edf6", DIM: "#8c98ae", FAINT: "#5f6b80", ACCENT: "#60a5fa", ACC_HI: "#93c5fd", SHEET: "linear-gradient(180deg,#1a2132,#10141c)" } },
  { id: "39", name: "39 · Захід", font: "Poppins", wrap: "radial-gradient(circle at 100% 0%,rgba(251,146,100,.4),transparent 50%),radial-gradient(circle at 0% 90%,rgba(236,72,153,.32),transparent 50%),#1c1020",
    theme: { ...DARK, ...dark, BG: "#1c1020", BG_DEEP: "#150a18", TEXT: "#fdeee8", DIM: "#b99aa6", FAINT: "#826574", ACCENT: "#fb8a6b", ACC_HI: "#fbbf6b", SHEET: "linear-gradient(180deg,#2c1a30,#1c1020)" } },
];

const FONT_URL = { Manrope: "Manrope:wght@500;700;800", Inter: "Inter:wght@500;700;800", Poppins: "Poppins:wght@500;600;700" };
export function loadFont(name) {
  if (!name || !FONT_URL[name] || typeof document === "undefined") return;
  const id = `uifont-${name}`;
  if (document.getElementById(id)) return;
  const l = document.createElement("link");
  l.id = id; l.rel = "stylesheet"; l.href = `https://fonts.googleapis.com/css2?family=${FONT_URL[name]}&display=swap`;
  document.head.appendChild(l);
}
