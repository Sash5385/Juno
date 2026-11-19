// «Метал + глянець» — єдина іконка застосунку (спільний стиль адмінки й клієнта).
// <MetalIcon name="bell" size={28}/>  · square — квадратна плитка (аватари, кнопки) · color — свій колір гліфа
// Гліф займає 72% діаметра. Менше 22px — без плитки (простий гліф). Нову іконку — додати в GLYPHS: [колір, SVG-фрагмент 24×24].
const GLYPHS = {
  calendar: ["#2563eb", <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/></>],
  clock:    ["#2563eb", <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>],
  timer:    ["#0891b2", <><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/></>],
  hourglass:["#7c3aed", <><path d="M6 3h12M6 21h12"/><path d="M7 3c0 5 10 5 10 9s-10 4-10 9M17 3c0 5-10 5-10 9s10 4 10 9"/></>],
  check:    ["#16a34a", <polyline points="5 12 10 17 19 8"/>],
  checkCircle:["#16a34a", <><circle cx="12" cy="12" r="9"/><path d="M7.5 12.5l3 3 6-6.5"/></>],
  cross:    ["#dc2626", <><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></>],
  ban:      ["#dc2626", <><circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/></>],
  warn:     ["#b45309", <><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12" y2="17.01"/></>],
  info:     ["#2563eb", <><circle cx="12" cy="12" r="9"/><line x1="12" y1="11" x2="12" y2="16"/><line x1="12" y1="7.5" x2="12" y2="7.6"/></>],
  bell:     ["#b7860b", <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></>],
  mega:     ["#7c3aed", <><path d="M3 11v2a1 1 0 0 0 1 1h3l6 4V6L7 10H4a1 1 0 0 0-1 1z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/><path d="M19 6a8.5 8.5 0 0 1 0 12"/></>],
  chat:     ["#16a34a", <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>],
  mail:     ["#2563eb", <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></>],
  phone:    ["#16a34a", <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>],
  user:     ["#2563eb", <><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-7 8-7s8 3 8 7"/></>],
  users:    ["#7c3aed", <><circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-3.5 3-6 7-6s7 2.5 7 6"/><circle cx="17" cy="9" r="2.5"/><path d="M17 14c3 0 5 2 5 5"/></>],
  userPlus: ["#2563eb", <><circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-7 7-7s7 3 7 7M19 8v6M16 11h6"/></>],
  crown:    ["#b7860b", <path d="M3 8l4 4 5-7 5 7 4-4-2 11H5z"/>],
  star:     ["#b7860b", <polygon points="12 2 15.1 8.3 22 9.3 17 14.1 18.2 21 12 17.8 5.8 21 7 14.1 2 9.3 8.9 8.3 12 2"/>],
  heart:    ["#db2777", <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21.2l8.8-8.8a5.5 5.5 0 0 0 0-7.8z"/>],
  smile:    ["#0d9488", <><circle cx="12" cy="12" r="9"/><path d="M8.5 14.5a4.5 4.5 0 0 0 7 0"/><line x1="9" y1="9.5" x2="9" y2="9.6"/><line x1="15" y1="9.5" x2="15" y2="9.6"/></>],
  sparkle:  ["#7c3aed", <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/>],
  plus:     ["#16a34a", <path d="M12 5v14M5 12h14"/>],
  plusCircle:["#16a34a", <><circle cx="12" cy="12" r="9"/><path d="M8 12h8M12 8v8"/></>],
  minus:    ["#dc2626", <path d="M5 12h14"/>],
  edit:     ["#2563eb", <><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></>],
  trash:    ["#dc2626", <><path d="M3 6h18M8 6V4h8v2M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14"/><path d="M10 11v6M14 11v6"/></>],
  copy:     ["#475569", <><rect x="8" y="8" width="13" height="13" rx="2"/><path d="M5 16H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h11a1 1 0 0 1 1 1v1"/></>],
  share:    ["#2563eb", <><path d="M12 3v13M7 8l5-5 5 5"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></>],
  download: ["#2563eb", <><path d="M12 3v13M7 11l5 5 5-5"/><path d="M5 21h14"/></>],
  link:     ["#2563eb", <><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></>],
  external: ["#2563eb", <><path d="M14 3h7v7M21 3l-9 9"/><path d="M19 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5"/></>],
  gift:     ["#db2777", <><rect x="3" y="8" width="18" height="13" rx="1.5"/><path d="M12 8v13M3 12h18M12 8H8a2.5 2.5 0 1 1 0-5c2 0 4 5 4 5zm0 0h4a2.5 2.5 0 1 0 0-5c-2 0-4 5-4 5z"/></>],
  tag:      ["#db2777", <><path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/></>],
  ticket:   ["#7c3aed", <path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4z"/>],
  ticketDash:["#7c3aed", <><path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4z"/><path d="M13 6v12" strokeDasharray="2 2"/></>],
  pointer:  ["#2563eb", <path d="M4 3l7 17 2.2-7.2L20.5 10.5z"/>],
  note:     ["#b7860b", <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/></>],
  clipboard:["#7c3aed", <><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h4"/></>],
  list:     ["#0d9488", <><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></>],
  grid:     ["#16a34a", <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>],
  chart:    ["#7c3aed", <><line x1="4" y1="20" x2="4" y2="10"/><line x1="10" y1="20" x2="10" y2="4"/><line x1="16" y1="20" x2="16" y2="13"/><line x1="21" y1="20" x2="3" y2="20"/></>],
  card:     ["#16a34a", <><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/></>],
  coin:     ["#b7860b", <><circle cx="12" cy="12" r="9"/><path d="M15 9.5c0-1.1-1.3-2-3-2s-3 .9-3 2 1.3 1.6 3 1.9 3 .9 3 2-1.3 2-3 2-3-.9-3-2M12 6v1.5M12 16.5V18"/></>],
  cash:     ["#16a34a", <><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 10v4M18 10v4"/></>],
  pin:      ["#dc2626", <><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.3"/></>],
  pushpin:  ["#dc2626", <><path d="M9 3h6l-1 6 4 4H6l4-4z"/><path d="M12 13v8"/></>],
  home:     ["#2563eb", <><path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z"/><polyline points="9 21 9 12 15 12 15 21"/></>],
  building: ["#2563eb", <><rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M9 7h1M14 7h1M9 11h1M14 11h1M9 15h1M14 15h1M10 21v-3h4v3"/></>],
  car:      ["#7c3aed", <><path d="M5 17h14M3 17V9l3-5h12l3 5v8M3 9h18"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/></>],
  school:   ["#16a34a", <><path d="M3 10l9-5 9 5-9 5-9-5z"/><path d="M7 12v5a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-5"/></>],
  globe:    ["#0891b2", <><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/></>],
  paint:    ["#7c3aed", <><circle cx="12" cy="12" r="9"/><circle cx="8" cy="10" r="1.2"/><circle cx="12" cy="7.5" r="1.2"/><circle cx="16" cy="10" r="1.2"/><path d="M12 21a3 3 0 0 1 0-6h2"/></>],
  zoom:     ["#475569", <><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4M11 8v6M8 11h6"/></>],
  search:   ["#475569", <><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></>],
  camera:   ["#475569", <><path d="M3 8a2 2 0 0 1 2-2h2l2-3h6l2 3h2a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><circle cx="12" cy="13" r="4"/></>],
  image:    ["#0d9488", <><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></>],
  lock:     ["#dc2626", <><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></>],
  key:      ["#b7860b", <><circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M15 8l2 2"/></>],
  shield:   ["#16a34a", <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>],
  eye:      ["#475569", <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></>],
  eyeOff:   ["#475569", <><path d="M17.9 17.9A10 10 0 0 1 12 19c-6.5 0-10-7-10-7a18 18 0 0 1 5.1-5.9M9.9 5.2A9 9 0 0 1 12 5c6.5 0 10 7 10 7a18 18 0 0 1-2.2 3.2M3 3l18 18"/><path d="M14.1 14.1a3 3 0 1 1-4.2-4.2"/></>],
  gear:     ["#475569", <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></>],
  refresh:  ["#0891b2", <><path d="M21 4v6h-6"/><path d="M20.5 15a9 9 0 1 1-2.1-9.4L21 10"/></>],
  swap:     ["#b7860b", <><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></>],
  bolt:     ["#b7860b", <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>],
  fire:     ["#ea580c", <path d="M12 22c4 0 7-3 7-7 0-4-3-6-4-10-2 2-3 4-3 6-1-1-2-2-2-4-2 2-5 5-5 8 0 4 3 7 7 7z"/>],
  cup:      ["#b45309", <><path d="M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M17 11h1.5a2.5 2.5 0 0 1 0 5H17"/><path d="M8 3v3M12 3v3"/></>],
  rocket:   ["#7c3aed", <><path d="M5 15c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.7-.8.7-2.1-.1-2.9a2.2 2.2 0 0 0-2.9-.1z"/><path d="M12 15l-3-3a22 22 0 0 1 2-4A13 13 0 0 1 22 2c0 2.7-.8 7.5-6 11a22 22 0 0 1-4 2z"/></>],
  medal:    ["#b7860b", <><circle cx="12" cy="15" r="6"/><path d="M8.5 10L6 2h4l2 5 2-5h4l-2.5 8"/></>],
  moon:     ["#475569", <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/>],
  sun:      ["#b7860b", <><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/></>],
  logout:   ["#dc2626", <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></>],
  apple:    ["#475569", <path d="M16.5 3c0 1.5-1.2 3-2.7 3-.2-1.5 1.2-3 2.7-3zM19 16.5c-.8 1.9-1.9 3.8-3.4 3.8-1.4 0-1.8-.8-3.4-.8s-2.1.8-3.4.8C7.3 20.3 4.5 16.8 4.5 13c0-3.2 2.1-4.9 4.1-4.9 1.3 0 2.4.9 3.3.9.8 0 2.1-1 3.6-.9 1.3.1 2.5.6 3.3 1.8-3 1.8-2.4 5.6.2 6.6z"/>],
};

export function MetalIcon({ name, size = 28, square = false, color, children, style }) {
  const g = GLYPHS[name] || GLYPHS.info;
  const c = color || g[0];
  // Правило стилю: металева плитка — від 22px. Менші (у тексті, бейджах, чипах) — простий кольоровий гліф.
  if (size < 22 && !children) {
    return (
      <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2.4}
        strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, verticalAlign: "middle", ...style }}>{g[1]}</svg>
    );
  }
  return (
    <span aria-hidden="true" style={{
      width: size, height: size, flexShrink: 0, borderRadius: square ? Math.round(size * 0.3) : "50%",
      position: "relative", overflow: "hidden", display: "inline-flex", alignItems: "center", justifyContent: "center", verticalAlign: "middle",
      background: "linear-gradient(145deg,#fbfcfe,#a3abba 45%,#eef1f6 55%,#7a8394)",
      boxShadow: "0 2px 5px rgba(0,0,0,0.4),inset 0 1px 0 #fff,inset 0 -2px 3px rgba(0,0,0,0.2)", color: c, ...style,
    }}>
      <span style={{ position: "absolute", left: "6%", right: "6%", top: "4%", height: "46%", borderRadius: "40% 40% 60% 60%/60% 60% 40% 40%", background: "linear-gradient(180deg,rgba(255,255,255,0.85),rgba(255,255,255,0.05))", pointerEvents: "none" }}/>
      {children
        ? <span style={{ position: "relative", fontWeight: 800, fontSize: Math.round(size * 0.36), color: `color-mix(in srgb, ${c} 62%, #0b1020)` }}>{children}</span>
        : <svg width={Math.round(size * 0.72)} height={Math.round(size * 0.72)} viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth={size < 22 ? 2.6 : 2.3} strokeLinecap="round" strokeLinejoin="round"
            style={{ position: "relative", filter: "drop-shadow(0 1px 0 rgba(255,255,255,0.9))" }}>{g[1]}</svg>}
    </span>
  );
}
export const METAL_GLYPHS = GLYPHS;
