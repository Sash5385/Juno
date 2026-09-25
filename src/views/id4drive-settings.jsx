import { useState, useContext, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { get, update, onValue, off } from "firebase/database";
import { uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { iRef, iStorageRef, iGalleryStorageRef, auth } from "../firebase";
import { LangContext } from "../App";
import { ThemeContext } from "../theme.js";
import { UICss, useFX } from "../ui";
import { createT } from "../lang";
import { useLicense } from "../hooks/useLicense";
import { useMosaicSwitch, MosaicOverlay } from "../mosaic";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const DAY_NAMES = ["Пн","Вт","Ср","Чт","Пт","Сб","Нд"];

// ─── SECTION RAIL ICONS — той самий "3D pillow" стиль іконок, що й у
// BottomNav (App.jsx: makeTabIcons/I3): кольоровий градієнт при активній
// вкладці, темний неактивний фон, глянцевий блік зверху-справа. ───
const SEC_INACTIVE_GR = { dark:"linear-gradient(135deg,#2e3034,#26282c)", kava:"linear-gradient(135deg,#6b3a22,#4a2210)" };
const SEC_ICON_SVG = {
  schedule:   <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></>,
  snap:       <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
  restr:      <><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></>,
  queue:      <><circle cx="12" cy="12" r="9"/><path d="M7.5 12.5l3 3 6-6.5"/></>,
  sticky:     <><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.3"/></>,
  auto:       <><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></>,
  surcharges: <><circle cx="12" cy="12" r="9"/><path d="M12 7.5v9M15 9.7c0-1.1-1.2-2-3-2s-3 .9-3 1.9 1.3 1.5 3 1.8c1.7.3 3 .8 3 1.9s-1.2 1.9-3 1.9-3-.9-3-2"/></>,
  push:       <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></>,
  reviews:    <><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></>,
  profile:    <><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/></>,
};
function SecIcon({ id, color, active, isKava, size=34 }) {
  const gr = active ? color : (isKava ? SEC_INACTIVE_GR.kava : SEC_INACTIVE_GR.dark);
  return (
    <div style={{
      width:size, height:size, borderRadius:size*0.3, background:gr,
      display:"inline-flex", alignItems:"center", justifyContent:"center",
      position:"relative", overflow:"hidden", flexShrink:0,
      boxShadow:"-2px 3px 8px rgba(0,0,0,0.4),inset 1px 1px 0 rgba(255,255,255,0.2),inset -1px -1px 0 rgba(0,0,0,0.25)",
    }}>
      <div style={{position:"absolute",top:0,right:0,width:"60%",height:"50%",background:"radial-gradient(ellipse at top right,rgba(255,255,255,0.35) 0%,transparent 70%)",pointerEvents:"none"}}/>
      <svg width={size*0.55} height={size*0.55} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{position:"relative",zIndex:1}}>
        {SEC_ICON_SVG[id]}
      </svg>
    </div>
  );
}

// ─── MODULE-LEVEL ATOMS (stable references → no remount on settings change) ───

function Toggle({ on, onChange, color }) {
  const { ACC_HI, ACCENT, SURF_LO, BG_DEEP, SI } = useContext(ThemeContext);
  const { shade } = useFX();
  const c = color || ACCENT;
  return (
    <div onClick={()=>onChange(!on)} style={{
      width:44,height:24,borderRadius:12,cursor:"pointer",position:"relative",
      background:on?`linear-gradient(145deg,color-mix(in srgb,${c} 85%,#fff),${c})`:`linear-gradient(145deg,${SURF_LO},${BG_DEEP})`,
      boxShadow:on?`0 0 8px ${c}44`:SI,transition:"background .2s",flexShrink:0,
    }}>
      <div style={{
        position:"absolute",top:3,left:on?21:3,width:18,height:18,borderRadius:9,
        background:"linear-gradient(135deg,#fff,#ddd)",
        boxShadow:`0 1px 4px ${shade(0.4)}`,transition:"left .2s",
      }}/>
    </div>
  );
}

function SmallToggle({ on, onChange, color }) {
  const { ACC_HI, ACCENT, SURF_LO, BG_DEEP, SI } = useContext(ThemeContext);
  const { shade } = useFX();
  const c = color || ACCENT;
  return (
    <div onClick={()=>onChange(!on)} style={{
      width:32,height:18,borderRadius:9,cursor:"pointer",position:"relative",
      background:on?`linear-gradient(145deg,color-mix(in srgb,${c} 85%,#fff),${c})`:`linear-gradient(145deg,${SURF_LO},${BG_DEEP})`,
      boxShadow:on?`0 0 6px ${c}44`:SI,transition:"background .2s",flexShrink:0,
    }}>
      <div style={{
        position:"absolute",top:2,left:on?16:2,width:14,height:14,borderRadius:7,
        background:"linear-gradient(135deg,#fff,#ddd)",
        boxShadow:`0 1px 3px ${shade(0.4)}`,transition:"left .2s",
      }}/>
    </div>
  );
}

function NumInput({ value, onChange, min=0, max=999, suffix="", step=1, compact }) {
  const { BG_DEEP, SURF_HI, SURFACE, TEXT, SO, SI } = useContext(ThemeContext);
  const bs = compact ? 22 : 26;
  return (
    <div style={{display:"flex",alignItems:"center",gap:4,background:BG_DEEP,borderRadius:9,boxShadow:SI,padding: compact ? "3px 5px" : "4px 6px"}}>
      <button onClick={()=>onChange(Math.max(min,value-step))} style={{
        width:bs,height:bs,borderRadius:7,border:"none",cursor:"pointer",
        background:`linear-gradient(145deg,${SURF_HI},${SURFACE})`,color:TEXT,fontSize:compact?12:14,
        display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,boxShadow:SO,
      }}>−</button>
      <span style={{fontSize:compact?11:13,fontWeight:700,color:TEXT,minWidth:compact?26:32,textAlign:"center"}}>
        {value}{suffix}
      </span>
      <button onClick={()=>onChange(Math.min(max,value+step))} style={{
        width:bs,height:bs,borderRadius:7,border:"none",cursor:"pointer",
        background:`linear-gradient(145deg,${SURF_HI},${SURFACE})`,color:TEXT,fontSize:compact?12:14,
        display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,boxShadow:SO,
      }}>+</button>
    </div>
  );
}

function Radio({ on, onChange }) {
  const { ACCENT, FAINT } = useContext(ThemeContext);
  return (
    <div onClick={onChange} style={{
      width:20,height:20,borderRadius:10,cursor:"pointer",flexShrink:0,
      border:`2px solid ${on?ACCENT:FAINT}`,
      background:on?ACCENT:"transparent",
      boxShadow:on?`0 0 8px ${ACCENT}55`:"none",
      transition:"all .15s",
    }}/>
  );
}

function Row({ label, hint, children, last, color, compact }) {
  const { BG_DEEP, ACCENT } = useContext(ThemeContext);
  const c = color || ACCENT;
  return (
    <div style={{
      display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,
      padding: compact ? "6px 10px" : "9px 12px",
      borderRadius:11,
      background:`linear-gradient(135deg,color-mix(in srgb,${c} 42%,${BG_DEEP}) 0%,${BG_DEEP} 100%)`,
      border:`1px solid color-mix(in srgb,${c} 35%,transparent)`,
      marginBottom: last ? 0 : (compact ? 4 : 6),
    }}>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:compact?12:13,fontWeight:700,color:"#fff"}}>{label}</div>
        {hint && <div style={{fontSize:compact?9:10,color:"rgba(255,255,255,0.6)",marginTop:compact?1:2,lineHeight:1.35}}>{hint}</div>}
      </div>
      <div style={{flexShrink:0}}>{children}</div>
    </div>
  );
}

function Chip({ label, active, onClick }) {
  const { ACC_HI, ACCENT, SURF_HI, SURFACE, DIM, SO } = useContext(ThemeContext);
  return (
    <button onClick={onClick} style={{
      padding:"6px 12px",borderRadius:9,border:"none",cursor:"pointer",fontSize:11,fontWeight:700,
      background:active?`linear-gradient(145deg,${ACC_HI},${ACCENT})`:`linear-gradient(145deg,${SURF_HI},${SURFACE})`,
      color:active?"#fff":DIM,boxShadow:active?"none":SO,
    }}>{label}</button>
  );
}

function Info({ title, text, color }) {
  const { BLUE, DIM } = useContext(ThemeContext);
  const c = color || BLUE;
  return (
    <div style={{
      background:`linear-gradient(145deg,${c}0d,${c}05)`,
      border:`1px solid ${c}30`,
      borderRadius:10,padding:"10px 12px",marginTop:2,marginBottom:10,
    }}>
      <div style={{fontSize:11,fontWeight:700,color:c,marginBottom:4}}>💡 {title}</div>
      <div style={{fontSize:11,color:DIM,lineHeight:1.6}}>{text}</div>
    </div>
  );
}

function TimeInput({ value, onChange, min=0, max=24, compact=false }) {
  const { BG_DEEP, TEXT, FAINT, SI } = useContext(ThemeContext);
  const v = Number(value) || 0;
  const h = Math.floor(v);
  const m = (v % 1 >= 0.5) ? 30 : 0;
  const disp = `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
  const dec = () => { const n = Math.round((v - 0.5) * 2) / 2; onChange(Math.max(min, n)); };
  const inc = () => { const n = Math.round((v + 0.5) * 2) / 2; onChange(Math.min(max, n)); };
  const bW = compact ? 14 : 20;
  const bH = compact ? 20 : 26;
  const fS = compact ? 11 : 14;
  const dW = compact ? 28 : 36;
  const dS = compact ? 9 : 11;
  return (
    <div style={{display:"flex",alignItems:"center",background:BG_DEEP,borderRadius:7,boxShadow:SI,overflow:"hidden"}}>
      <button onClick={dec} style={{width:bW,height:bH,border:"none",cursor:"pointer",background:"transparent",color:FAINT,fontSize:fS,padding:0,lineHeight:1}}>‹</button>
      <span style={{fontSize:dS,fontWeight:700,color:TEXT,minWidth:dW,textAlign:"center"}}>{disp}</span>
      <button onClick={inc} style={{width:bW,height:bH,border:"none",cursor:"pointer",background:"transparent",color:FAINT,fontSize:fS,padding:0,lineHeight:1}}>›</button>
    </div>
  );
}

// Стискаємо фото до maxSize по довшій стороні перед завантаженням у Storage —
// прямий телефонний JPG може важити 5-10 МБ, а на публічному лендингу таке
// вантажити марно.
function resizeImage(file, maxSize = 800) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read failed"));
    reader.onload = (e) => { img.src = e.target.result; };
    img.onerror = () => reject(new Error("decode failed"));
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("toBlob failed")), "image/jpeg", 0.85);
    };
    reader.readAsDataURL(file);
  });
}

// Leaflet — імперативно, без react-leaflet: карта створюється один раз у
// useEffect на порожньому div, маркер перетягується/ставиться кліком.
function LocationMap({ lat, lng, onPick, flyTo }) {
  const { ACCENT } = useContext(ThemeContext);
  const mapEl = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);

  useEffect(() => {
    if (!mapEl.current || mapRef.current) return;
    const start = [lat || 50.4501, lng || 30.5234];
    const map = L.map(mapEl.current, { attributionControl: false }).setView(start, (lat && lng) ? 15 : 11);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(map);
    const icon = L.divIcon({
      className: "",
      html: `<div style="width:26px;height:26px;border-radius:50% 50% 50% 0;background:${ACCENT};transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.5)"></div>`,
      iconSize: [26, 26], iconAnchor: [13, 26],
    });
    const marker = L.marker(start, { draggable: true, icon }).addTo(map);
    marker.on("dragend", () => { const p = marker.getLatLng(); onPick(p.lat, p.lng); });
    map.on("click", (e) => { marker.setLatLng(e.latlng); onPick(e.latlng.lat, e.latlng.lng); });
    mapRef.current = map; markerRef.current = marker;
    return () => { map.remove(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- карта створюється один раз; зміни lat/lng ззовні (після drag/click) ігноруємо навмисно
  }, []);

  // Пошук адреси (окремий блок нижче) не чіпає lat/lng-пропси напряму (вони
  // навмисно ігноруються вище) — тому переліт мапи на знайдену точку йде
  // через окремий тригер flyTo {lat,lng,ts}, щоб спрацьовувало навіть коли
  // координати знайденої адреси збігаються з попередніми (ts завжди новий).
  useEffect(() => {
    if (!flyTo || !mapRef.current || !markerRef.current) return;
    const ll = [flyTo.lat, flyTo.lng];
    markerRef.current.setLatLng(ll);
    mapRef.current.setView(ll, 15);
  }, [flyTo]);

  return <div ref={mapEl} style={{ width: "100%", height: 220, borderRadius: 14, overflow: "hidden" }} />;
}

// Повноекранний перегляд фото (портал) — пінч-зум двома пальцями, подвійний
// тап для швидкого зуму, свайп вліво/вправо для гортання між усіма фото
// (коли не наближено). Без сторонніх бібліотек, чисті touch-події.
function PhotoViewer({ photos, index, onClose }) {
  const [i, setI] = useState(index);
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const g = useRef({ mode: null, startDist: 0, startScale: 1, startX: 0, startY: 0, startTx: 0, startTy: 0, lastTap: 0 });

  useEffect(() => { setScale(1); setTx(0); setTy(0); }, [i]);

  const dist = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);

  const onTouchStart = (e) => {
    if (e.touches.length === 2) {
      g.current.mode = "pinch";
      g.current.startDist = dist(e.touches[0], e.touches[1]);
      g.current.startScale = scale;
    } else if (e.touches.length === 1) {
      const now = Date.now();
      if (now - g.current.lastTap < 280) {
        setScale(s => s > 1 ? 1 : 2.5); setTx(0); setTy(0);
        g.current.mode = null; g.current.lastTap = 0;
        return;
      }
      g.current.lastTap = now;
      g.current.mode = scale > 1 ? "pan" : "swipe";
      g.current.startX = e.touches[0].clientX;
      g.current.startY = e.touches[0].clientY;
      g.current.startTx = tx; g.current.startTy = ty;
    }
  };
  const onTouchMove = (e) => {
    if (g.current.mode === "pinch" && e.touches.length === 2) {
      const d = dist(e.touches[0], e.touches[1]);
      setScale(Math.min(4, Math.max(1, g.current.startScale * (d / g.current.startDist))));
    } else if (g.current.mode === "pan" && e.touches.length === 1) {
      setTx(g.current.startTx + (e.touches[0].clientX - g.current.startX));
      setTy(g.current.startTy + (e.touches[0].clientY - g.current.startY));
    } else if (g.current.mode === "swipe" && e.touches.length === 1) {
      setTx(e.touches[0].clientX - g.current.startX);
    }
  };
  const onTouchEnd = () => {
    if (g.current.mode === "swipe") {
      if (tx > 60 && i > 0) setI(v => v - 1);
      else if (tx < -60 && i < photos.length - 1) setI(v => v + 1);
      setTx(0);
    } else if (scale < 1.05) { setScale(1); setTx(0); setTy(0); }
    g.current.mode = null;
  };

  return createPortal(
    <div
      style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.94)", touchAction: "none" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <button onClick={onClose} aria-label="Закрити" style={{
        position: "absolute", top: "calc(14px + env(safe-area-inset-top,0px))", right: 14, zIndex: 1,
        width: 36, height: 36, borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.14)",
        color: "#fff", fontSize: 18, cursor: "pointer",
      }}>×</button>
      {photos.length > 1 && (
        <div style={{
          position: "absolute", top: "calc(18px + env(safe-area-inset-top,0px))", left: 0, right: 0,
          textAlign: "center", color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: 700,
        }}>{i + 1} / {photos.length}</div>
      )}
      <div
        style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
      >
        <img src={photos[i]} alt="" draggable={false} style={{
          maxWidth: "92%", maxHeight: "85vh", objectFit: "contain", userSelect: "none",
          transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
          transition: g.current.mode ? "none" : "transform .2s",
        }} />
      </div>
    </div>,
    document.body
  );
}

// ─── MAIN ────────────────────────────────────────────────────────
export default function SettingsView({ settings, setSettings }) {
  const { BG_DEEP, SURF_HI, SURFACE, SURF_LO, BORDER, TEXT, DIM, FAINT, ACCENT, ACC_HI, GREEN, BLUE, PURPLE, GOLD, RED, TEAL, SO, SI } = useContext(ThemeContext);
  const lang = useContext(LangContext);
  const t = createT(lang);
  const isKava = settings?.theme === "light";

  // Реальна висота нижнього навбару (BottomNav у App.jsx, id="app-bottomnav"),
  // щоб друга пігулка (SECTION RAIL) сідала точно над ним через fixed+portal —
  // "мертво", без залежності від position:sticky в скрол-контейнері вкладки.
  const [navH, setNavH] = useState(64);
  useEffect(() => {
    const el = document.getElementById('app-bottomnav');
    if (!el) return;
    const measure = () => setNavH(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const css = `
input[type=range]{-webkit-appearance:none;appearance:none;width:100%;height:4px;border-radius:2px;background:${BG_DEEP};outline:none;box-shadow:${SI}}
input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:18px;height:18px;border-radius:9px;background:linear-gradient(145deg,${ACC_HI},${ACCENT});cursor:pointer;box-shadow:0 2px 6px rgba(255,90,60,0.5)}
select{color-scheme:${isKava?"light":"dark"}}
`;
  const upd = (k, v) => setSettings(s=>({...s,[k]:v}));

  // ── weekSchedule helpers ──────────────────────────────────────
  const weekSchedule = settings.weekSchedule || DAY_NAMES.map((_,i) => ({
    enabled: i < 6, start: i===5?10:9, end: i===5?15:18,
    lunchEnabled: i<5, lunchStart:12, lunchEnd:13,
  }));
  const updDay = (i, patch) => upd("weekSchedule", weekSchedule.map((d,idx) => idx===i ? {...d,...patch} : d));

  const queueMode = settings.queueAutoFifo ? "fifo" : settings.queueBroadcast ? "broadcast" : "manual";
  const setQueueMode = m => setSettings(s=>({
    ...s,
    queueAutoFifo:    m==="fifo",
    queueBroadcast:   m==="broadcast",
    queueManual:      m==="manual",
  }));

  const reminders = settings.autoReminders || [
    {enabled:true, hoursBefore:24},
    {enabled:false,hoursBefore:2},
    {enabled:false,hoursBefore:1},
  ];
  const updReminder = (idx, patch) => upd("autoReminders", reminders.map((r,i)=>i===idx?{...r,...patch}:r));

  const [active, setActive] = useState("schedule");
  const [showHint, setShowHint] = useState(false);
  const switchSection = (id) => { setActive(id); setShowHint(false); };
  const license = useLicense(auth.currentUser?.uid);
  const [payingWith, setPayingWith] = useState(null); // "liqpay" | "monobank" | null

  // slug для посилання-запису учнів (задається один раз при онбордингу,
  // AdminAuth.jsx → InstructorSetupScreen) — тут лише читаємо для показу
  const [bookingSlug, setBookingSlug] = useState(null);
  const [slugCopied,  setSlugCopied]  = useState(false);
  useEffect(() => {
    get(iRef("admin_settings/profile/slug")).then(snap => setBookingSlug(snap.val() || "")).catch(() => {});
  }, []);
  const bookingLink = bookingSlug ? `https://drivepad-client.web.app/i/${bookingSlug}` : "";
  const copyBookingLink = () => {
    if (!bookingLink) return;
    navigator.clipboard?.writeText(bookingLink).catch(() => {});
    setSlugCopied(true);
    setTimeout(() => setSlugCopied(false), 1500);
  };

  const payWithLiqPay = async () => {
    setPayingWith("liqpay");
    try {
      const idToken = await auth.currentUser.getIdToken();
      const resp = await fetch("/api/liqpay-order", {
        method: "POST",
        headers: { "Authorization": `Bearer ${idToken}` },
      });
      if (!resp.ok) throw new Error("server error");
      const { data, signature, action } = await resp.json();
      const form = document.createElement("form");
      form.method = "POST";
      form.action = action;
      form.target = "_blank";
      [["data", data], ["signature", signature]].forEach(([n, v]) => {
        const inp = document.createElement("input");
        inp.type = "hidden"; inp.name = n; inp.value = v;
        form.appendChild(inp);
      });
      document.body.appendChild(form);
      form.submit();
      document.body.removeChild(form);
    } catch {
      alert("Не вдалося відкрити оплату LiqPay. Спробуйте пізніше.");
    } finally {
      setPayingWith(null);
    }
  };

  const payWithMonobank = async () => {
    setPayingWith("monobank");
    try {
      const idToken = await auth.currentUser.getIdToken();
      const resp = await fetch("/api/monobank-invoice", {
        method: "POST",
        headers: { "Authorization": `Bearer ${idToken}` },
      });
      if (!resp.ok) throw new Error("server error");
      const { pageUrl } = await resp.json();
      window.open(pageUrl, "_blank");
    } catch {
      alert("Не вдалося відкрити оплату Monobank. Спробуйте пізніше.");
    } finally {
      setPayingWith(null);
    }
  };

  // ── відгуки учнів ────────────────────────────────────────────
  const [reviews, setReviews] = useState([]);
  useEffect(() => {
    const r = iRef( "reviews");
    const handler = onValue(r, snap => {
      const data = snap.val() || {};
      const list = [];
      Object.entries(data).forEach(([uid, userReviews]) => {
        Object.entries(userReviews || {}).forEach(([id, v]) => list.push({ id, uid, ...v }));
      });
      list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setReviews(list);
    });
    return () => off(r, "value", handler);
  }, []);
  const toggleReviewHidden = (review) => {
    update(iRef( `reviews/${review.uid}/${review.id}`), { status: review.status === "hidden" ? "approved" : "hidden" }).catch(() => {});
  };

  // ── профіль інструктора (фото, умови, telegram, точка зустрічі) ──
  // На відміну від `settings` (автозберігається дебаунсом вище), тут окрема
  // локальна копія admin_settings/profile — вантажимо раз, зберігаємо кнопкою.
  const [profile, setProfile] = useState(null);
  useEffect(() => {
    get(iRef("admin_settings/profile")).then(snap => setProfile(snap.val() || {})).catch(() => setProfile({}));
  }, []);
  const updProfile = (k, v) => setProfile(p => ({ ...(p || {}), [k]: v }));
  const allProfilePhotos = [profile?.photoUrl, ...((profile?.galleryPhotos||[]).map(p=>p.url))].filter(Boolean);

  // ── пошук адреси для мітки на карті (Nominatim/OSM — той самий провайдер,
  // що й тайли карти вище, ключ не потрібен) ─────────────────────────────
  const [addressQuery, setAddressQuery] = useState("");
  const [addressSearching, setAddressSearching] = useState(false);
  const [addressError, setAddressError] = useState(null);
  const [mapFlyTo, setMapFlyTo] = useState(null);
  const [addressSuggestions, setAddressSuggestions] = useState([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const addressDebounceRef = useRef(null);
  const profileLoadedRef = useRef(false);
  useEffect(() => {
    if (profile && !profileLoadedRef.current) {
      profileLoadedRef.current = true;
      if (profile.address) setAddressQuery(profile.address);
    }
  }, [profile]);
  useEffect(() => () => clearTimeout(addressDebounceRef.current), []);

  const pickAddressSuggestion = (r) => {
    const lat = parseFloat(r.lat), lng = parseFloat(r.lon);
    updProfile("meetLat", lat);
    updProfile("meetLng", lng);
    updProfile("address", r.display_name);
    setAddressQuery(r.display_name);
    setAddressSuggestions([]);
    setSuggestionsOpen(false);
    setMapFlyTo({ lat, lng, ts: Date.now() });
  };

  // Підказки з'являються поки набирають текст (дебаунс 450мс, від 3 символів) —
  // клік по варіанту одразу ставить мітку. Enter/кнопка "Знайти" лишились як
  // запасний варіант, якщо підказки ще не встигли підвантажитись.
  const fetchAddressSuggestions = async (q) => {
    setAddressSearching(true);
    try {
      const resp = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=5&accept-language=uk&q=${encodeURIComponent(q)}`);
      const results = await resp.json();
      setAddressSuggestions(results || []);
      setSuggestionsOpen((results || []).length > 0);
    } catch {
      // мовчки — підказки не критичні, лишається ручний пошук
    } finally {
      setAddressSearching(false);
    }
  };

  const onAddressInputChange = (val) => {
    setAddressQuery(val);
    setAddressError(null);
    clearTimeout(addressDebounceRef.current);
    const q = val.trim();
    if (q.length < 3) { setAddressSuggestions([]); setSuggestionsOpen(false); return; }
    addressDebounceRef.current = setTimeout(() => fetchAddressSuggestions(q), 450);
  };

  const searchAddress = async () => {
    const q = addressQuery.trim();
    if (!q || addressSearching) return;
    if (addressSuggestions.length > 0) { pickAddressSuggestion(addressSuggestions[0]); return; }
    setAddressSearching(true); setAddressError(null);
    try {
      const resp = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=uk&q=${encodeURIComponent(q)}`);
      const results = await resp.json();
      if (!results?.length) { setAddressError("Адресу не знайдено. Спробуйте уточнити запит."); return; }
      pickAddressSuggestion(results[0]);
    } catch {
      setAddressError("Не вдалося виконати пошук. Перевірте з'єднання.");
    } finally {
      setAddressSearching(false);
    }
  };

  // Зворотне геокодування — коли мітку ставлять/тягнуть прямо на карті,
  // адреса під картою на лендингу (Landing.jsx: instructorAddress) теж
  // повинна оновитись, а не лишатись від попереднього пошуку чи порожньою.
  const reverseGeocodeAddress = async (lat, lng) => {
    try {
      const resp = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&accept-language=uk&lat=${lat}&lon=${lng}`);
      const data = await resp.json();
      if (data?.display_name) { updProfile("address", data.display_name); setAddressQuery(data.display_name); }
    } catch {}
  };

  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const saveProfile = async () => {
    if (profileSaving) return;
    setProfileSaving(true);
    await update(iRef("admin_settings/profile"), profile || {}).catch(() => {});
    setProfileSaving(false); setProfileSaved(true);
    setTimeout(() => setProfileSaved(false), 1500);
  };

  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState(null);
  const photoInputRef = useRef(null);
  const handlePhotoChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPhotoUploading(true); setPhotoError(null);
    try {
      const resized = await resizeImage(file, 800);
      await uploadBytes(iStorageRef(), resized, { contentType: "image/jpeg" });
      const url = await getDownloadURL(iStorageRef());
      const withBuster = `${url}${url.includes("?") ? "&" : "?"}v=${Date.now()}`;
      updProfile("photoUrl", withBuster);
      await update(iRef("admin_settings/profile"), { photoUrl: withBuster }).catch(() => {});
    } catch {
      setPhotoError("Не вдалося завантажити фото. Перевірте з'єднання і спробуйте ще раз.");
    } finally {
      setPhotoUploading(false);
    }
  };

  // Фотоколаж лендингу (до 10 фото) — profile.galleryPhotos: масив URL,
  // кожне фото свій файл у Storage (instructors/{iid}/gallery/{id}.jpg),
  // тому додавання/видалення одного не чіпає решту.
  // Перегляд фото профілю (аватар + фотоколаж) на весь екран з пінч-зумом
  // і свайпом між усіма фото — відкривається тапом по будь-якій мініатюрі.
  const [viewerOpen, setViewerOpen] = useState(null); // { photos, index } | null
  const openViewer = (photos, index) => setViewerOpen({ photos, index });

  const GALLERY_MAX = 10;
  const [galleryUploading, setGalleryUploading] = useState(false);
  const [galleryError, setGalleryError] = useState(null);
  const galleryInputRef = useRef(null);
  const handleGalleryAdd = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const current = profile?.galleryPhotos || [];
    if (current.length >= GALLERY_MAX) return;
    setGalleryUploading(true); setGalleryError(null);
    try {
      const resized = await resizeImage(file, 1000);
      const name = `${Date.now()}.jpg`;
      await uploadBytes(iGalleryStorageRef(name), resized, { contentType: "image/jpeg" });
      const url = await getDownloadURL(iGalleryStorageRef(name));
      const next = [...current, { url, name }];
      updProfile("galleryPhotos", next);
      await update(iRef("admin_settings/profile"), { galleryPhotos: next }).catch(() => {});
    } catch {
      setGalleryError("Не вдалося завантажити фото. Перевірте з'єднання і спробуйте ще раз.");
    } finally {
      setGalleryUploading(false);
    }
  };
  const handleGalleryDelete = async (name) => {
    const next = (profile?.galleryPhotos || []).filter(p => p.name !== name);
    updProfile("galleryPhotos", next);
    await update(iRef("admin_settings/profile"), { galleryPhotos: next }).catch(() => {});
    try { await deleteObject(iGalleryStorageRef(name)); } catch {}
  };

  const [installPrompt, setInstallPrompt] = useState(null);
  const [installed, setInstalled] = useState(false);
  useEffect(() => {
    setInstalled(window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true);
    const handleBeforeInstall = (e) => { e.preventDefault(); setInstallPrompt(e); };
    const handleInstalled = () => { setInstallPrompt(null); setInstalled(true); };
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);
  const handleInstallClick = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };

  // Реальна висота самої пігулки SECTION RAIL — спейсер у потоці має бути
  // точно такий, інакше фіксована пігулка перекриває низ контенту секції
  // (накладка при скролі до кінця довгих секцій).
  const railRef = useRef(null);
  const [railH, setRailH] = useState(90);
  useEffect(() => {
    const el = railRef.current;
    if (!el) return;
    const measure = () => setRailH(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [active]);

  const uk = lang !== "en";
  const SECTIONS = [
    { id:"schedule",   icon:"🕐", color:BLUE,   title:t('set.schedule.title'), label:uk?"Графік":"Sched." },
    { id:"snap",       icon:"⏱",  color:TEAL,   title:t('set.snap.title'),     label:uk?"Сітка":"Grid"   },
    { id:"restr",      icon:"🔒", color:RED,    title:t('set.restr.title'),    label:uk?"Ліміти":"Limits" },
    { id:"queue",      icon:"✅", color:GREEN,  title:t('set.queue.title'),    label:uk?"Черга":"Queue"  },
    { id:"sticky",     icon:"📌", color:PURPLE, title:t('set.sticky.title'),   label:uk?"Слоти":"Slots"  },
    { id:"surcharges", icon:"💰", color:GOLD,   title:"Надбавки",              label:uk?"Збори":"Fees"   },
    { id:"push",       icon:"🔔", color:GREEN,  title:"Сповіщення",            label:"Сповіщення"        },
    { id:"reviews",    icon:"⭐", color:GOLD,   title:"Відгуки учнів",         label:"Відгуки"           },
    { id:"profile",    icon:"👤", color:BLUE,   title:"Профіль інструктора",   label:"Профіль"           },
  ];

  function renderSection(id) {
    const secColor = SECTIONS.find(s=>s.id===id)?.color || ACCENT;
    const svColor = (on) => on ? GREEN : RED;
    switch(id) {

      case "schedule": return (
        <div>
          {showHint && <Info color={BLUE} title={t('set.schedule.info_t')} text={t('set.schedule.info')}/>}
          <Row label={t('set.schedule.start')} hint={t('set.schedule.hint_s')}>
            <TimeInput value={settings.workStart} onChange={v=>{
              const clamped = Math.min(v, settings.workEnd - 0.5);
              const updated = weekSchedule.map(d => ({...d, start: d.start === settings.workStart ? clamped : d.start}));
              upd("workStart", clamped);
              upd("weekSchedule", updated);
            }} min={0} max={23.5}/>
          </Row>
          <Row label={t('set.schedule.end')} hint={t('set.schedule.hint_e')}>
            <TimeInput value={settings.workEnd} onChange={v=>{
              const clamped = Math.max(v, settings.workStart + 0.5);
              const updated = weekSchedule.map(d => ({...d, end: d.end === settings.workEnd ? clamped : d.end}));
              upd("workEnd", clamped);
              upd("weekSchedule", updated);
            }} min={0.5} max={24}/>
          </Row>
          <Row label={t('set.schedule.days')}>
            <NumInput value={settings.daysShown} onChange={v=>upd("daysShown",v)} min={1} max={30} suffix={` ${t('days')}`}/>
          </Row>
          <Row compact last color={svColor(settings.lockPastBookings)} label="Блокувати минулі записи" hint="Заборонити редагувати, переносити й скасовувати записи, що вже минули — вони підсвічуються тьмяніше">
            <Toggle color={svColor(settings.lockPastBookings)} on={!!settings.lockPastBookings} onChange={v=>upd("lockPastBookings",v)}/>
          </Row>
          <div style={{paddingTop:8}}>
            <div style={{fontSize:9,color:"#fff",letterSpacing:1,textTransform:"uppercase",marginBottom:6,textAlign:"center"}}>Тижневий шаблон</div>
            <div style={{display:"flex",flexDirection:"column",gap:3}}>
              {DAY_NAMES.map((dayName, i) => {
                const day = weekSchedule[i];
                return (
                  <div key={i} style={{
                    borderRadius:8,padding:"5px 8px",
                    background:day.enabled?`linear-gradient(135deg,color-mix(in srgb,${GREEN} 38%,${BG_DEEP}) 0%,${BG_DEEP} 100%)`:`linear-gradient(135deg,color-mix(in srgb,${RED} 22%,${BG_DEEP}) 0%,${BG_DEEP} 100%)`,
                    border:day.enabled?`1px solid color-mix(in srgb,${GREEN} 32%,transparent)`:`1px solid color-mix(in srgb,${RED} 25%,transparent)`,
                  }}>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <span style={{width:20,fontSize:11,fontWeight:800,color:day.enabled?"#fff":FAINT,flexShrink:0}}>{dayName}</span>
                      <SmallToggle color={svColor(day.enabled)} on={day.enabled} onChange={v=>updDay(i,{enabled:v})}/>
                      {day.enabled ? (<>
                        <span style={{flex:1}}/>
                        <TimeInput compact value={day.start} onChange={v=>updDay(i,{start:Math.min(v,day.end-0.5)})} min={0} max={23}/>
                        <span style={{fontSize:9,color:FAINT,margin:"0 2px"}}>—</span>
                        <TimeInput compact value={day.end} onChange={v=>updDay(i,{end:Math.max(v,day.start+0.5)})} min={0.5} max={24}/>
                        <span style={{fontSize:12,flexShrink:0,marginLeft:4}}>🍽</span>
                        <SmallToggle color={svColor(!!day.lunchEnabled)} on={!!day.lunchEnabled} onChange={v=>updDay(i,{lunchEnabled:v})}/>
                      </>) : (
                        <span style={{fontSize:10,color:FAINT,marginLeft:4}}>Вихідний</span>
                      )}
                    </div>
                    {day.enabled && day.lunchEnabled && (
                      <div style={{display:"flex",alignItems:"center",gap:6,marginTop:4,paddingLeft:26}}>
                        <span style={{fontSize:10,color:FAINT,flex:1}}>перерва</span>
                        <TimeInput compact value={day.lunchStart??12} onChange={v=>updDay(i,{lunchStart:Math.min(v,(day.lunchEnd??13)-0.5)})} min={0} max={23}/>
                        <span style={{fontSize:9,color:FAINT,margin:"0 2px"}}>—</span>
                        <TimeInput compact value={day.lunchEnd??13} onChange={v=>updDay(i,{lunchEnd:Math.max(v,(day.lunchStart??12)+0.5)})} min={0.5} max={24}/>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      );

      case "snap": return (
        <div>
          {showHint && <Info color={TEAL} title={t('set.snap.info_t')} text={t('set.snap.info')}/>}
          <div style={{borderRadius:10,padding:"10px",marginBottom:5,background:`linear-gradient(145deg,${SURF_HI},${SURFACE})`,boxShadow:SO}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
              <span style={{fontSize:12,color:DIM}}>{t('set.snap.label')}</span>
              <span style={{fontSize:13,fontWeight:800,color:ACCENT}}>{settings.snapMin} {t('min')}</span>
            </div>
            <input type="range" min={1} max={60} value={settings.snapMin} onChange={e=>upd("snapMin",+e.target.value)}/>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:10}}>
              {[1,5,10,15,30,60].map(v=>(
                <Chip key={v} label={`${v} ${t('min')}`} active={settings.snapMin===v} onClick={()=>upd("snapMin",v)}/>
              ))}
            </div>
          </div>
          <div style={{borderRadius:10,padding:"10px",background:`linear-gradient(145deg,${SURF_HI},${SURFACE})`,boxShadow:SO}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
              <span style={{fontSize:12,color:DIM}}>Крок слота (довгий тап)</span>
              <span style={{fontSize:13,fontWeight:800,color:TEAL}}>{settings.slotCreateStep ?? 30} хв</span>
            </div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {[5,10,15,30,60].map(v=>(
                <Chip key={v} label={`${v} хв`} active={(settings.slotCreateStep??30)===v} onClick={()=>upd("slotCreateStep",v)}/>
              ))}
            </div>
          </div>
        </div>
      );

      case "restr": return (
        <div>
          {showHint && <Info color={RED} title={t('set.restr.info_t')} text={t('set.restr.info')}/>}
          <Row compact color={svColor(settings.studentCanReschedule)} label={t('set.restr.reschedule')}>
            <Toggle color={svColor(settings.studentCanReschedule)} on={settings.studentCanReschedule} onChange={v=>upd("studentCanReschedule",v)}/>
          </Row>
          <Row compact color={svColor(settings.studentCanCancel)} label={t('set.restr.cancel')}>
            <Toggle color={svColor(settings.studentCanCancel)} on={settings.studentCanCancel} onChange={v=>upd("studentCanCancel",v)}/>
          </Row>
          <Row compact label={t('set.restr.cutoff')} hint={t('set.restr.cutoff_h')}>
            <NumInput compact value={settings.bookCutoffHours} onChange={v=>upd("bookCutoffHours",v)} min={0} max={48} suffix={` ${t('hr')}`}/>
          </Row>
          <Row compact label={t('set.restr.slotGen')} hint={
            <>
              {t('set.restr.slotGen_h')}{" "}
              <span style={{
                display:"inline-flex",alignItems:"center",justifyContent:"center",
                width:20,height:14,borderRadius:5,verticalAlign:"middle",
                background:`linear-gradient(135deg,color-mix(in srgb,${GREEN} 42%,${BG_DEEP}) 0%,${BG_DEEP} 100%)`,
                border:`1px solid color-mix(in srgb,${GREEN} 35%,transparent)`,
              }}>
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7" rx="1.2"/><rect x="14" y="3" width="7" height="7" rx="1.2"/><rect x="3" y="14" width="7" height="7" rx="1.2"/><rect x="14" y="14" width="7" height="7" rx="1.2"/>
                </svg>
              </span>
            </>
          }>
            <NumInput compact value={settings.slotGenDays ?? 30} onChange={v=>upd("slotGenDays",v)} min={1} max={365} suffix={` ${t('days')}`}/>
          </Row>
          <Row compact label={t('set.restr.calendar')} hint={t('set.restr.calendar_h')}>
            <NumInput compact value={settings.calendarOpenDays} onChange={v=>upd("calendarOpenDays",v)} min={1} max={365} suffix={` ${t('days')}`}/>
          </Row>
          <Row compact label={t('set.restr.schoolCalendar')} hint={t('set.restr.schoolCalendar_h')}>
            <NumInput compact value={settings.schoolCalendarOpenDays ?? 14} onChange={v=>upd("schoolCalendarOpenDays",v)} min={1} max={365} suffix={` ${t('days')}`}/>
          </Row>
          <Row compact label={lang==="en"?"Min interval between bookings":"Мінімальний інтервал між записами"} hint={lang==="en"?"Minimum days between any two bookings for one student. 0 — disabled.":"Мінімум днів між будь-якими двома записами учня. 0 — без обмеження."} last>
            <NumInput compact value={settings.minBookingIntervalDays ?? 0} onChange={v=>upd("minBookingIntervalDays",v)} min={0} max={30} suffix={` ${t('days')}`}/>
          </Row>
        </div>
      );

      case "queue": return (
        <div>
          {showHint && <Info color={GREEN} title={t('set.queue.info_t')} text={t('set.queue.info')}/>}
          <div style={{paddingTop:2}}>
            <div style={{fontSize:9,color:"#fff",letterSpacing:1,textTransform:"uppercase",marginBottom:8,textAlign:"center"}}>{t('set.queue.mode')}</div>
            {[
              {k:"fifo",      label:t('set.queue.fifo'),   hint:t('set.queue.fifo_h')   },
              {k:"broadcast", label:t('set.queue.bc'),     hint:t('set.queue.bc_h')     },
              {k:"manual",    label:t('set.queue.manual'), hint:t('set.queue.manual_h') },
            ].map((o,i,arr)=>(
              <Row color={svColor(queueMode===o.k)} key={o.k} label={o.label} hint={o.hint} last={i===arr.length-1}>
                <Radio on={queueMode===o.k} onChange={()=>setQueueMode(o.k)}/>
              </Row>
            ))}
          </div>
        </div>
      );

      case "sticky": return (
        <div>
          {showHint && <Info color={BLUE} title={t('set.sticky.info_t')} text={t('set.sticky.info')}/>}
          <Row color={svColor(settings.stickyTimeEnabled !== false)} label={lang==="en"?"Enable feature":"Увімкнути"} hint={lang==="en"?"When off — all adjacent free slots are shown":"Вимкнено — всі вільні слоти видно завжди"}>
            <Toggle color={svColor(settings.stickyTimeEnabled !== false)} on={settings.stickyTimeEnabled !== false} onChange={v=>upd("stickyTimeEnabled",v)}/>
          </Row>
          {settings.stickyTimeEnabled !== false && (
            <div>
              {[
                {v:"before", l:t('set.sticky.before')},
                {v:"after",  l:t('set.sticky.after') },
                {v:"both",   l:t('set.sticky.both')  },
              ].map((o,i,arr)=>(
                <Row color={svColor(settings.stickyTime===o.v)} key={o.v} label={o.l} last={i===arr.length-1}>
                  <Radio on={settings.stickyTime===o.v} onChange={()=>upd("stickyTime",o.v)}/>
                </Row>
              ))}
            </div>
          )}
        </div>
      );

      case "surcharges": return (
        <div>
          {showHint && <Info color={GOLD}
            title={lang==="en"?"Surcharges":"Надбавки"}
            text={lang==="en"
              ? "Configure extra paid add-ons the instructor can attach to a booking right from the schedule slot menu (e.g. \"driving range\", \"harder route\", etc.) — the student then sees the total price including the surcharge. Each \"Surcharge\" below is a fixed amount in UAH that can be quickly added to a lesson's price — add as many as you need, or remove one with the \"×\" button. The payment card for students is set in the Profile section."
              : "Тут налаштовуються додаткові платні опції, які інструктор може додати до запису прямо в меню слота розкладу (наприклад, «виїзд на автодром», «складніший маршрут» тощо) — учень одразу бачить підсумкову суму з надбавкою. Кожна «Надбавка» нижче — це фіксована сума в гривнях, яку можна швидко додати до вартості уроку; додай стільки варіантів, скільки потрібно, або видали кнопкою «×». Картка для оплати учнів налаштовується в розділі «Профіль»."}
          />}
          <div style={{fontSize:12,color:FAINT,marginBottom:12}}>
            Суми відображаються в меню слота при виборі надбавки.
          </div>
          {(settings.surcharges || []).map((amt, i) => (
            <div key={i} style={{
              display:"flex",alignItems:"center",gap:10,marginBottom:5,
              padding:"10px 12px",borderRadius:10,
              background:`linear-gradient(145deg,${SURF_HI},${SURFACE})`,boxShadow:SO,
            }}>
              <span style={{fontSize:13,color:GOLD,fontWeight:700,flex:1}}>Надбавка {i+1}</span>
              <NumInput
                value={amt}
                onChange={v=>upd("surcharges", (settings.surcharges||[]).map((x,j)=>j===i?v:x))}
                min={50} max={99999} suffix="₴" step={50}
              />
              <button onClick={()=>upd("surcharges", (settings.surcharges||[]).filter((_,j)=>j!==i))} style={{
                background:"none",border:"none",cursor:"pointer",
                color:"rgba(248,113,113,0.8)",fontSize:20,lineHeight:1,padding:"0 4px",
              }}>×</button>
            </div>
          ))}
          <button onClick={()=>upd("surcharges", [...(settings.surcharges||[]), 100])} style={{
            width:"100%",padding:"11px",borderRadius:12,border:`1px dashed ${GREEN}88`,cursor:"pointer",
            background:"transparent",color:GREEN,fontSize:13,fontWeight:700,marginTop:2,
          }}>+ Додати надбавку</button>
        </div>
      );

      case "push": return (
        <div>
          {showHint && <Info color={GREEN}
            title={lang==="en"?"Student notifications":"Сповіщення учням"}
            text={lang==="en"
              ? "Automatic reminders before a lesson, a message on cancellation, an offer from the queue when a slot frees up, and the broadcast to every student when a slot within the next 10 days becomes free."
              : "Автоматичні нагадування перед уроком, повідомлення при скасуванні, пропозиція з черги при звільненні слоту, і розсилка всім учням, коли в найближчі 10 днів звільняється слот."}
          />}
          <div style={{paddingTop:10,display:"flex",flexDirection:"column",gap:5}}>
            <div style={{fontSize:9,color:"#fff",letterSpacing:1,textTransform:"uppercase",marginBottom:2,textAlign:"center"}}>{t('set.auto.reminder')}</div>
            {reminders.map((r,i)=>(
              <div key={i} style={{
                display:"flex",alignItems:"center",gap:8,
                background:`linear-gradient(135deg,color-mix(in srgb,${svColor(r.enabled)} ${r.enabled?38:22}%,${BG_DEEP}) 0%,${BG_DEEP} 100%)`,
                border:`1px solid color-mix(in srgb,${svColor(r.enabled)} ${r.enabled?35:25}%,transparent)`,
                borderRadius:10,padding:"7px 10px",
              }}>
                <SmallToggle color={svColor(r.enabled)} on={r.enabled} onChange={v=>updReminder(i,{enabled:v})}/>
                <span style={{fontSize:12,color:DIM,flex:1}}>
                  {lang==="en"?"Reminder":"Нагадування"} #{i+1}
                </span>
                <NumInput value={r.hoursBefore} onChange={v=>updReminder(i,{hoursBefore:v})} min={1} max={168} suffix={` ${t('hr')}`}/>
                <span style={{fontSize:11,color:FAINT}}>{t('set.auto.rem_h')}</span>
              </div>
            ))}
          </div>
          <Row color={svColor(!!settings.autoCancel?.enabled)} label={t('set.auto.cancel')}>
            <Toggle color={svColor(!!settings.autoCancel?.enabled)} on={!!settings.autoCancel?.enabled} onChange={v=>setSettings(s=>({...s,autoCancel:{...(s.autoCancel||{}),enabled:v}}))}/>
          </Row>
          <Row color={svColor(!!settings.autoQueueOffer?.enabled)} label={t('set.auto.queue')}>
            <Toggle color={svColor(!!settings.autoQueueOffer?.enabled)} on={!!settings.autoQueueOffer?.enabled} onChange={v=>setSettings(s=>({...s,autoQueueOffer:{...(s.autoQueueOffer||{}),enabled:v}}))}/>
          </Row>
          <Row color={svColor(settings.slotFreedPushEnabled !== false)} label={lang==="en"?"Notify on freed slot":"Сповіщення при звільненні слоту"} hint={lang==="en"?"Notify all students when a slot within the next 10 days becomes free":"Сповіщення усім учням, коли в найближчі 10 днів звільняється слот"} last>
            <Toggle color={svColor(settings.slotFreedPushEnabled !== false)} on={settings.slotFreedPushEnabled !== false} onChange={v=>upd("slotFreedPushEnabled",v)}/>
          </Row>
        </div>
      );

      case "reviews": return (
        <div>
          {showHint && <Info color={GOLD} title="Відгуки учнів" text="Учні лишають відгук автоматично після завершеного уроку. Відгук одразу зʼявляється на сайті — сховати можна кнопкою нижче, видалити не можна."/>}
          {reviews.length === 0 ? (
            <div style={{textAlign:"center",padding:"24px 12px",color:DIM,fontSize:12}}>Поки що немає відгуків</div>
          ) : reviews.map(rv => (
            <div key={`${rv.uid}_${rv.id}`} style={{
              padding:"10px 12px",borderRadius:11,marginBottom:6,
              background:SURF_LO,boxShadow:SI,opacity:rv.status==="hidden"?0.5:1,
            }}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                <div style={{fontSize:13,fontWeight:800,color:TEXT}}>{rv.studentName || "Учень"}</div>
                <div style={{color:GOLD,fontSize:12,letterSpacing:1}}>{"★".repeat(rv.rating||0)}{"☆".repeat(5-(rv.rating||0))}</div>
              </div>
              {rv.text && <div style={{fontSize:12,color:DIM,lineHeight:1.5,marginBottom:6}}>{rv.text}</div>}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div style={{fontSize:10,color:FAINT}}>{rv.createdAt ? new Date(rv.createdAt).toLocaleDateString("uk-UA") : ""}</div>
                <button onClick={()=>toggleReviewHidden(rv)} style={{
                  padding:"4px 10px",borderRadius:8,border:"none",cursor:"pointer",fontSize:11,fontWeight:700,
                  background:rv.status==="hidden"?`linear-gradient(145deg,${GREEN},${GREEN})`:`linear-gradient(145deg,${SURF_HI},${SURFACE})`,
                  color:rv.status==="hidden"?"#fff":DIM,boxShadow:rv.status==="hidden"?"none":SO,
                }}>{rv.status==="hidden"?"Показати":"Сховати"}</button>
              </div>
            </div>
          ))}
        </div>
      );

      case "profile": return (
        <div>
          {showHint && <Info color={BLUE} title="Профіль інструктора" text="Фото, телефон, картка для оплати, умови відвідування, Telegram і точка зустрічі на карті — все це бачать учні на сторінці запису."/>}

          {/* PHOTO */}
          <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:18}}>
            <div
              onClick={()=>profile?.photoUrl && openViewer(allProfilePhotos, 0)}
              style={{width:64,height:64,borderRadius:"50%",overflow:"hidden",background:SURF_HI,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:SO,cursor:profile?.photoUrl?"pointer":"default"}}
            >
              {profile?.photoUrl
                ? <img src={profile.photoUrl} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                : <span style={{fontSize:26}}>🧑‍🏫</span>}
            </div>
            <div style={{flex:1,minWidth:0}}>
              <button onClick={()=>photoInputRef.current?.click()} disabled={photoUploading} style={{
                padding:"9px 14px",borderRadius:10,border:"none",cursor:photoUploading?"default":"pointer",fontSize:12,fontWeight:700,
                background:`linear-gradient(145deg,${ACC_HI},${ACCENT})`,color:"#fff",boxShadow:SO,opacity:photoUploading?0.6:1,
              }}>{photoUploading?"Завантаження…":"Завантажити фото"}</button>
              <input ref={photoInputRef} type="file" accept="image/*" onChange={handlePhotoChange} style={{display:"none"}}/>
              <div style={{fontSize:10,color:FAINT,marginTop:6}}>JPG/PNG, до 5 МБ — покажеться учням на сторінці запису</div>
              {photoError && <div style={{fontSize:11,color:RED,marginTop:4}}>{photoError}</div>}
            </div>
          </div>

          {/* GALLERY — фотоколаж на лендингу (Landing.jsx), до 10 фото */}
          <div style={{fontSize:11,fontWeight:800,color:DIM,letterSpacing:0.5,marginBottom:6}}>ФОТОКОЛАЖ НА ЛЕНДИНГУ ({(profile?.galleryPhotos||[]).length}/{GALLERY_MAX})</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:6}}>
            {(profile?.galleryPhotos||[]).map((p, idx) => (
              <div key={p.name} onClick={()=>openViewer(allProfilePhotos, (profile?.photoUrl?1:0)+idx)} style={{position:"relative",width:72,height:72,borderRadius:10,overflow:"hidden",flexShrink:0,boxShadow:SO,cursor:"pointer"}}>
                <img src={p.url} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                <button onClick={(e)=>{e.stopPropagation();handleGalleryDelete(p.name);}} style={{
                  position:"absolute",top:3,right:3,width:20,height:20,borderRadius:"50%",border:"none",cursor:"pointer",
                  background:"rgba(0,0,0,0.6)",color:"#fff",fontSize:12,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1,
                }}>×</button>
              </div>
            ))}
            {(profile?.galleryPhotos||[]).length < GALLERY_MAX && (
              <button onClick={()=>galleryInputRef.current?.click()} disabled={galleryUploading} style={{
                width:72,height:72,borderRadius:10,border:`1px dashed ${BORDER}`,cursor:galleryUploading?"default":"pointer",
                background:"transparent",color:DIM,fontSize:11,fontWeight:700,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:2,
              }}>
                <span style={{fontSize:20,lineHeight:1}}>{galleryUploading?"…":"+"}</span>
                {!galleryUploading && "Додати"}
              </button>
            )}
            <input ref={galleryInputRef} type="file" accept="image/*" onChange={handleGalleryAdd} style={{display:"none"}}/>
          </div>
          <div style={{fontSize:10,color:FAINT,marginBottom:18}}>Фото учнів за кермом, з іспиту, з авто — на лендингу вони показуються анімованим колажем, як у ID4Drive.</div>
          {galleryError && <div style={{fontSize:11,color:RED,marginBottom:12,marginTop:-10}}>{galleryError}</div>}

          {/* PHONE — джерело для кнопок дзвінка/Viber/WhatsApp і фолбека
              Telegram на лендингу (Landing.jsx: instructorPhone/iPhoneDigits) */}
          <div style={{fontSize:11,fontWeight:800,color:DIM,letterSpacing:0.5,marginBottom:6}}>ТЕЛЕФОН</div>
          <input
            value={profile?.phone ?? ""}
            onChange={e=>updProfile("phone", e.target.value)}
            placeholder="+380XXXXXXXXX"
            type="tel"
            style={{width:"100%",boxSizing:"border-box",background:BG_DEEP,border:"none",outline:"none",color:TEXT,fontSize:13,padding:"10px 12px",borderRadius:10,boxShadow:SI,fontFamily:"inherit",marginBottom:6}}
          />
          <div style={{fontSize:10,color:FAINT,marginBottom:18}}>Дзвінок, Viber, WhatsApp і Telegram (якщо не задано нік нижче) на сторінці запису працюють через цей номер.</div>

          {/* PAYMENT CARD */}
          <div style={{fontSize:11,fontWeight:800,color:DIM,letterSpacing:0.5,marginBottom:6}}>КАРТКА ДЛЯ ОПЛАТИ</div>
          <input
            value={settings.paymentCard || ""}
            onChange={e=>upd("paymentCard", e.target.value)}
            placeholder="0000 0000 0000 0000"
            style={{width:"100%",boxSizing:"border-box",background:BG_DEEP,border:"none",outline:"none",color:TEXT,fontSize:13,padding:"10px 12px",borderRadius:10,boxShadow:SI,fontFamily:"inherit",marginBottom:6}}
          />
          <div style={{fontSize:10,color:FAINT,marginBottom:18}}>Показується учням у «Моїх записах» з кнопкою копіювання.</div>

          {/* TERMS */}
          <div style={{fontSize:11,fontWeight:800,color:DIM,letterSpacing:0.5,marginBottom:6}}>УМОВИ ВІДВІДУВАННЯ УРОКІВ</div>
          <textarea
            value={profile?.terms ?? ""}
            onChange={e=>updProfile("terms", e.target.value)}
            rows={8}
            placeholder="Наприклад: скасування пізніше ніж за 24 год оплачується повністю; запізнення не продовжує заняття; при собі мати документ, що посвідчує особу…"
            style={{width:"100%",boxSizing:"border-box",background:BG_DEEP,border:"none",outline:"none",color:TEXT,fontSize:12,padding:"10px 12px",borderRadius:10,boxShadow:SI,resize:"vertical",fontFamily:"inherit",lineHeight:1.5,marginBottom:6}}
          />
          <div style={{fontSize:10,color:FAINT,marginBottom:18}}>Порожнє поле — блок «Умови відвідування» просто не покажеться на сайті.</div>

          {/* TELEGRAM */}
          <div style={{fontSize:11,fontWeight:800,color:DIM,letterSpacing:0.5,marginBottom:6}}>TELEGRAM (НІК, БЕЗ @)</div>
          <input
            value={profile?.telegramUsername ?? ""}
            onChange={e=>updProfile("telegramUsername", e.target.value.replace(/^@/,"").trim())}
            placeholder="ivan_marchenko"
            style={{width:"100%",boxSizing:"border-box",background:BG_DEEP,border:"none",outline:"none",color:TEXT,fontSize:13,padding:"10px 12px",borderRadius:10,boxShadow:SI,fontFamily:"inherit",marginBottom:6}}
          />
          <div style={{fontSize:10,color:FAINT,marginBottom:18}}>Без ніка кнопка Telegram на сайті працюватиме через номер телефону.</div>

          {/* MEETING POINT MAP */}
          <div style={{fontSize:11,fontWeight:800,color:DIM,letterSpacing:0.5,marginBottom:6}}>МІСЦЕ ЗУСТРІЧІ НА КАРТІ</div>
          <div style={{position:"relative",marginBottom:8}}>
            <div style={{display:"flex",gap:8}}>
              <input
                value={addressQuery}
                onChange={e=>onAddressInputChange(e.target.value)}
                onFocus={()=>{ if(addressSuggestions.length) setSuggestionsOpen(true); }}
                onBlur={()=>setTimeout(()=>setSuggestionsOpen(false),150)}
                onKeyDown={e=>{ if(e.key==="Enter"){ e.preventDefault(); searchAddress(); } }}
                placeholder="Пошук адреси…"
                style={{flex:1,minWidth:0,boxSizing:"border-box",background:BG_DEEP,border:"none",outline:"none",color:TEXT,fontSize:13,padding:"10px 12px",borderRadius:10,boxShadow:SI,fontFamily:"inherit"}}
              />
              <button onClick={searchAddress} disabled={addressSearching} style={{
                padding:"0 16px",borderRadius:10,border:"none",cursor:addressSearching?"default":"pointer",fontSize:13,fontWeight:800,flexShrink:0,
                background:`linear-gradient(145deg,${ACC_HI},${ACCENT})`,color:"#fff",
              }}>{addressSearching?"…":"Знайти"}</button>
            </div>
            {suggestionsOpen && addressSuggestions.length > 0 && (
              <div style={{position:"absolute",top:"calc(100% + 4px)",left:0,right:0,zIndex:20,background:SURFACE,borderRadius:10,boxShadow:SO,overflow:"hidden",maxHeight:240,overflowY:"auto"}}>
                {addressSuggestions.map((r,idx)=>(
                  <div
                    key={r.place_id ?? idx}
                    onMouseDown={e=>{ e.preventDefault(); pickAddressSuggestion(r); }}
                    style={{padding:"12px",fontSize:15,color:"#fff",cursor:"pointer",borderBottom:idx<addressSuggestions.length-1?`1px solid ${BORDER}`:"none"}}
                  >{r.display_name}</div>
                ))}
              </div>
            )}
          </div>
          {addressError && <div style={{fontSize:10,color:RED,marginBottom:8}}>{addressError}</div>}
          <LocationMap
            lat={profile?.meetLat}
            lng={profile?.meetLng}
            flyTo={mapFlyTo}
            onPick={(lat,lng)=>{ updProfile("meetLat", lat); updProfile("meetLng", lng); reverseGeocodeAddress(lat, lng); }}
          />
          <div style={{fontSize:10,color:FAINT,margin:"6px 0 18px"}}>Знайдіть адресу вище, клікніть на карту або перетягніть мітку — учні побачать саме цю точку і адресу на сторінці запису.</div>

          <button onClick={saveProfile} disabled={profileSaving} style={{
            width:"100%",padding:"12px",borderRadius:12,border:"none",cursor:profileSaving?"default":"pointer",fontSize:14,fontWeight:800,
            background:profileSaved?`linear-gradient(145deg,${GREEN},${GREEN})`:`linear-gradient(145deg,${ACC_HI},${ACCENT})`,color:"#fff",boxShadow:SO,
          }}>{profileSaved?"✓ Збережено":profileSaving?"Зберігаємо…":"Зберегти профіль"}</button>

          {viewerOpen && (
            <PhotoViewer photos={viewerOpen.photos} index={viewerOpen.index} onClose={()=>setViewerOpen(null)}/>
          )}
        </div>
      );

      default: return null;
    }
  }

  const [displayedSection, mosaicPhase] = useMosaicSwitch(active);
  const activeSec = SECTIONS.find(s => s.id === displayedSection);

  return (
    <>
      <UICss/>
      <style>{css}</style>
      <div style={{
        display:"flex", flexDirection:"column", gap:10,
        fontFamily:"ui-sans-serif,-apple-system,system-ui,sans-serif", color:TEXT,
      }}>

        {/* PANEL — section content */}
        <div style={{padding:"4px 4px 0", minWidth:0}}>
          <div style={{
            position:"relative",
            borderRadius:16,
            boxShadow:`0 0 0 1.5px ${isKava?"rgba(0,0,0,0.14)":"rgba(255,255,255,0.18)"}, 0 8px 28px rgba(0,0,0,0.28)`,
            background:`linear-gradient(145deg,${SURF_HI},${SURFACE})`,
            padding:"12px 14px 14px",
            overflow:"hidden",
          }}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
              {activeSec && (
                <div style={{fontSize:14,fontWeight:800,color:activeSec.color,display:"flex",alignItems:"center",gap:8}}>
                  <span>{activeSec.icon}</span>
                  <span>{activeSec.title}</span>
                </div>
              )}
              <button onClick={()=>setShowHint(v=>!v)} style={{
                width:28,height:28,borderRadius:8,border:"none",cursor:"pointer",flexShrink:0,
                background:showHint?`${GOLD}33`:`linear-gradient(145deg,${SURF_HI},${SURFACE})`,
                fontSize:15,display:"flex",alignItems:"center",justifyContent:"center",
                boxShadow:SO,transition:"all .15s",
              }}>💡</button>
            </div>
            {renderSection(displayedSection)}
            <MosaicOverlay phase={mosaicPhase} tileColor={SURFACE}/>
          </div>
        </div>

        {/* SECTION RAIL — друга пігулка, візуально ідентична нижньому навбару
            (BottomNav у App.jsx: "скляні чипи" — той самий напівпрозорий фон,
            радіус, бордер, тінь; активна секція підсвічена зеленою заливкою
            чипу, без окремої рискою — так само як таби внизу).
            Рендериться через portal у document.body з position:fixed і
            bottom:navH (реальна виміряна висота #app-bottomnav) — тому
            дійсно "мертво" прибита над навбаром і не рухається під час
            скролу вмісту секції (на відміну від sticky, який пінився лише
            всередині скрол-контейнера вкладки). Спейсер після версії
            (не тут!) звільняє місце в потоці — якщо покласти його одразу
            після PANEL, версія й 40px-спейсер підуть услід за ним і
            опиняться рівно під фіксованою пігулкою, невидимі. */}
      </div>

      {createPortal(
        <div ref={railRef} style={{
          position:"fixed", left:0, right:0, bottom:navH, zIndex:50,
          padding:"6px 3px 0", pointerEvents:"none",
        }}>
          <div style={{
            background: isKava ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.04)",
            backdropFilter:"blur(20px)", WebkitBackdropFilter:"blur(20px)",
            borderRadius:16,
            border:`1px solid ${BORDER}`,
            boxShadow: isKava
              ? "0 8px 24px rgba(92,42,26,0.14)"
              : "0 8px 24px rgba(0,0,0,0.45)",
            display:"flex", gap:2, padding:3,
            pointerEvents:"auto",
          }}>
            {SECTIONS.map(sec => {
              const isActive = active === sec.id;
              return (
                <button key={sec.id} onClick={()=>switchSection(sec.id)} title={sec.title} style={{
                  flex:"1 1 0", minWidth:0, padding:"8px 2px 7px",
                  background: isActive ? `color-mix(in srgb, ${GREEN} 18%, transparent)` : "transparent",
                  border:"none", cursor:"pointer", borderRadius:11,
                  display:"flex", flexDirection:"column", alignItems:"center", gap:4,
                  position:"relative", fontFamily:"inherit",
                }}>
                  <SecIcon id={sec.id} color={sec.color} active={isActive} isKava={isKava}/>
                  <span style={{
                    fontSize:9, fontWeight:700,
                    color: isActive ? GREEN : (isKava ? DIM : FAINT),
                    whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", maxWidth:"100%",
                  }}>{sec.label}</span>
                </button>
              );
            })}
          </div>
        </div>,
        document.body
      )}

      {installPrompt && !installed && (
        <button onClick={handleInstallClick} style={{
          display:"block", margin:"12px auto 0", background:"rgba(255,255,255,0.05)",
          border:`1px solid ${BORDER}`, color:TEXT, cursor:"pointer",
          padding:"10px 24px", borderRadius:14, fontSize:13, fontWeight:700,
        }}>📲 Встановити додаток</button>
      )}
      {active === "profile" && license && (() => {
        // eslint-disable-next-line react-hooks/purity -- лише для відображення "днів залишилось", не впливає на логіку
        const now = Date.now();
        const untilTs = license.status === "trial" ? license.trialEndsAt : license.expiresAt;
        const daysLeft = untilTs ? Math.ceil((untilTs - now) / 86400000) : null;
        const blocked = license.status === "suspended" || (daysLeft != null && daysLeft < 0);
        const statusColor = blocked ? RED : (daysLeft != null && daysLeft <= 3 ? GOLD : GREEN);
        const statusLabel = blocked ? "Призупинено" : license.status === "trial" ? "Пробний період" : "Активна";
        return (
          <div style={{
            margin:"12px 14px 0", padding:"12px 14px", borderRadius:14,
            background:SURF_HI, border:`1px solid ${BORDER}`, boxShadow:SI,
          }}>
            <div style={{fontSize:11, fontWeight:800, color:DIM, textTransform:"uppercase", letterSpacing:0.5, marginBottom:4}}>Підписка</div>
            <div style={{fontSize:14, fontWeight:700, color:statusColor}}>{statusLabel}</div>
            {daysLeft != null && !blocked && (
              <div style={{fontSize:12, color:DIM, marginTop:2}}>Залишилось днів: {daysLeft}</div>
            )}
            {blocked && (
              <div style={{fontSize:12, color:DIM, marginTop:2}}>Оплатіть підписку нижче, щоб відновити доступ.</div>
            )}
          </div>
        );
      })()}
      {active === "profile" && bookingSlug && (
        <div style={{
          margin:"12px 14px 0", padding:"12px 14px", borderRadius:14,
          background:SURF_HI, border:`1px solid ${BORDER}`, boxShadow:SI,
        }}>
          <div style={{fontSize:11, fontWeight:800, color:DIM, textTransform:"uppercase", letterSpacing:0.5, marginBottom:8}}>Посилання для запису учнів</div>
          <div style={{background:BG_DEEP, border:`1px solid ${BORDER}`, borderRadius:10, padding:"9px 12px", fontSize:12, color:TEXT, wordBreak:"break-all"}}>{bookingLink}</div>
          <button onClick={copyBookingLink} style={{
            marginTop:8, width:"100%", padding:"10px", borderRadius:10, border:"none", cursor:"pointer",
            background: slugCopied ? "linear-gradient(135deg,#4ade80,#34d399)" : `linear-gradient(135deg,${ACC_HI},${ACCENT})`,
            color: slugCopied ? "#0a2e1a" : "#fff", fontSize:13, fontWeight:800,
          }}>{slugCopied ? "✓ Скопійовано" : "Копіювати"}</button>
        </div>
      )}
      {active === "profile" && (
      <div style={{
        margin:"10px 14px 0", padding:"12px 14px", borderRadius:14,
        background:SURF_HI, border:`1px solid ${BORDER}`, boxShadow:SI,
      }}>
        <div style={{fontSize:11, fontWeight:800, color:DIM, textTransform:"uppercase", letterSpacing:0.5, marginBottom:8}}>Оплата підписки · 299₴/міс</div>
        <div style={{display:"flex", gap:8}}>
          <button onClick={payWithLiqPay} disabled={!!payingWith} style={{
            flex:1, padding:"11px", borderRadius:12, border:"none", cursor: payingWith ? "default" : "pointer",
            background: payingWith === "liqpay" ? "rgba(52,211,153,0.3)" : "linear-gradient(135deg,#4ade80,#34d399)",
            color:"#0a2e1a", fontSize:13, fontWeight:800,
          }}>
            {payingWith === "liqpay" ? "..." : "LiqPay"}
          </button>
          <button onClick={payWithMonobank} disabled={!!payingWith} style={{
            flex:1, padding:"11px", borderRadius:12, border:"none", cursor: payingWith ? "default" : "pointer",
            background: payingWith === "monobank" ? "rgba(0,0,0,0.2)" : "linear-gradient(135deg,#3a3a3a,#1a1a1a)",
            color:"#fff", fontSize:13, fontWeight:800,
          }}>
            {payingWith === "monobank" ? "..." : "Monobank"}
          </button>
        </div>
        <div style={{fontSize:11, color:FAINT, marginTop:8, lineHeight:1.4}}>Обидва варіанти підтримують Apple Pay / Google Pay / картку.</div>
      </div>
      )}
      <div style={{height:railH + 16}}/>
    </>
  );
}

