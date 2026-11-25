// Винесено з id4drive-admin-v5.jsx (без змін логіки).
import { useState, useRef, useEffect, useLayoutEffect, useMemo, useContext } from "react";
import { MetalIcon } from "../../MetalIcon";
import { createPortal } from "react-dom";
import { update, get, onValue, off, remove } from "firebase/database";
import { iRef, slotRoot, newBookingMasterFields } from "../../firebase";
import { bufferOf } from "../../addons";
import { ThemeContext, GOLD } from "../../theme.js";
import { useFX } from "../../ui";
import { useConfirm } from "../../ConfirmModal";
import { isSalon } from "../../workspace.js";
import { FOG_STYLE } from "../../uiStyles";
import { TAG_PRESETS } from "../../tags";
import { TagIcon } from "../../TagIcon";
import { MANUAL_DEFAULT_COLOR } from "../../studentColors";
import { cur as curSym, money } from "../../currency";
import { restoreSlotRange, blockSlotRange, resyncDurSlots, STUDENT_PALETTE, AUTO_TAG_BY_ORDER, knownTag, isMouseContext, makeGlobalCSS, EMPTY_LIST, getDayInfo, Card, fmtTime, fmtDur, computeBookingPrice } from "./shared.jsx";
import { BroadcastModal, MonthCalendarSheet, DayNotesModal } from "./ScheduleSheets.jsx";
import { computeDayUpdatesFor } from "./AutoSlots.jsx";
import { ScheduleHelp, highlightHelp } from "./ScheduleHelp.jsx";
import { CreateSlotSheet, PersonalEventModal } from "./SlotSheets.jsx";
import { BookingModalFog, NewBookingModalFog } from "./BookingModals.jsx";

// Віртуалізовані колонки розкладу. Діапазон (vRange) живе ТУТ, а не в ScheduleView:
// зміна діапазону під час скролу перерендерює лише цей компонент, а не весь розклад.
// Елементи колонок кешуються в межах одного renderCol (його ідентичність змінюється
// на кожному рендері ScheduleView, тож будь-яка зміна даних/стану скидає кеш) — при
// скролі створюються лише НОВІ колонки, а вже відрендерені React пропускає цілком.
function VirtualCols({ vRangeRef, subRef, colW, nDays, renderCol }) {
  const [range, setRange] = useState(() => vRangeRef.current);
  useLayoutEffect(() => {
    subRef.current = setRange;
    const cur = vRangeRef.current;
    if (cur.s !== range.s || cur.e !== range.e) setRange({ s: cur.s, e: cur.e });
    return () => { if (subRef.current === setRange) subRef.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const cacheRef = useRef(null);
  if (!cacheRef.current || cacheRef.current.fn !== renderCol) cacheRef.current = { fn: renderCol, map: new Map() };
  const map = cacheRef.current.map;
  const cols = [];
  for (let i = range.s; i <= range.e; i++) {
    let el = map.get(i);
    if (el === undefined) { el = renderCol(i); map.set(i, el); }
    cols.push(el);
  }
  if (map.size > cols.length + 8) {
    for (const k of Array.from(map.keys())) if (k < range.s || k > range.e) map.delete(k);
  }
  const stride = colW + 4;
  return (
    <>
      {range.s > 0 && <div style={{width:range.s*stride, flexShrink:0}}/>}
      {cols}
      {(nDays-1-range.e)>0 && <div style={{width:(nDays-1-range.e)*stride-4, flexShrink:0}}/>}
    </>
  );
}

// ── Віяла дій на картці запису (після довгого тапу) ───────────────────
// Нормалізація телефону до E.164 (лише цифри, без "+"); порожній рядок — якщо номера нема
const phoneDigits = (p) => {
  let d = String(p || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.length === 10 && d[0] === "0") d = "38" + d;       // 0671234567 → 380671234567
  else if (d.length === 9) d = "380" + d;                  // 671234567 → 380671234567
  return d;
};
const FAN_R = 112, FAN_BTN = 44;
// Фірмові значки месенджерів (SVG), щоб одразу було видно, що це Viber / Telegram
const ICON_VIBER = (
  <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#fff" d="M11.4 2C7 2.1 3.2 3.4 2.9 9.1c-.2 3.6.4 6.3 2.4 7.9v3.3c0 .5.6.7.9.4l2.4-2.6c4.5.4 9.2-.2 10.6-3.9 1-2.7 1-5.6.3-8.1C18.4 2.6 14.6 1.9 11.4 2zm.1 1.5c2.7 0 5.8.5 6.6 3.1.6 2.1.6 4.6-.2 6.9-1.1 3-5.2 3.3-8.9 3l-.4-.1-1.6 1.7v-2.3l-.3-.2c-1.7-1.2-2.2-3.4-2-6.5.2-4.6 3.2-5.5 6.8-5.6z"/>
    <path fill="#fff" d="M8.6 6.3c.3 0 .5.2.7.5l.8 1.3c.2.4.1.8-.2 1l-.5.4c-.2.2-.2.4-.1.7.6 1.4 1.6 2.4 3 3 .3.1.5.1.7-.1l.4-.5c.3-.3.7-.4 1-.2l1.3.8c.3.2.5.5.4.8-.1.9-.9 1.6-1.8 1.5-3-.3-6.3-3.5-6.6-6.6-.1-.9.6-1.7 1.4-1.8z"/>
  </svg>
);
const ICON_TG = (
  <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#fff" d="M4.3 11.4l13.9-5.4c.7-.2 1.2.2 1 1.2l-2.4 11.2c-.2.8-.7 1-1.3.6l-3.6-2.7-1.8 1.7c-.2.2-.4.4-.8.4l.3-3.7 6.7-6.1c.3-.3-.1-.4-.4-.2l-8.3 5.2-3.6-1.1c-.8-.2-.8-.8.2-1.1z"/>
  </svg>
);
// Віяло з круглих кнопок: портал у body (position:fixed) — не обрізається колонками/сусідніми картками
function ActionFan({ side, cx, cy, items, onClose }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const r = requestAnimationFrame(() => setShown(true));
    // тап поза віялом — закриває; скрол/ресайз — теж (координати fixed застаріють)
    const down = (e) => { if (!e.target.closest?.("[data-fan]")) onClose(); };
    const close = () => onClose();
    document.addEventListener("pointerdown", down, true);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      cancelAnimationFrame(r);
      document.removeEventListener("pointerdown", down, true);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [onClose]);
  const vw = window.innerWidth, vh = window.innerHeight;
  const sy = cy < FAN_R + 50 ? 1 : -1;                      // біля верху екрана — розкриваємо вниз
  let sx = side === "r" ? -1 : 1;                           // праве — вліво, ліве — вправо
  if (sx < 0 && cx - FAN_R < 24) sx = 1;
  if (sx > 0 && cx + FAN_R > vw - 24) sx = -1;
  const n = items.length;
  return createPortal(
    <div data-fan="1" style={{ position:"fixed", left:0, top:0, width:0, height:0, zIndex:10050 }}>
      {items.map((it, i) => {
        const t = (n === 1 ? 0.5 : i / (n - 1)) * (Math.PI / 2);
        const x = Math.max(4, Math.min(vw - FAN_BTN - 4, cx + sx * FAN_R * Math.cos(t) - FAN_BTN / 2));
        const y = Math.max(4, Math.min(vh - FAN_BTN - 4, cy + sy * FAN_R * Math.sin(t) - FAN_BTN / 2));
        return (
          <button key={it.k} data-fan="1" disabled={!it.on} title={it.label} aria-label={it.label}
            onPointerDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); e.preventDefault(); if (it.on) it.run(); }}
            style={{
              position:"fixed", left:x, top:y, width:FAN_BTN, height:FAN_BTN, borderRadius:"50%",
              border:"none", padding:0, fontSize:20, lineHeight:1, display:"flex", alignItems:"center", justifyContent:"center",
              background: it.on ? it.bg : "linear-gradient(145deg,#6b7280,#374151)",
              opacity: it.on ? 1 : 0.5, filter: it.on ? "none" : "grayscale(1)",
              boxShadow: "0 0 0 2px rgba(30,30,40,0.85), 0 4px 12px rgba(0,0,0,0.45)",
              cursor: it.on ? "pointer" : "default", touchAction:"manipulation",
              transform: shown ? "translate(0,0) scale(1)" : `translate(${cx - FAN_BTN/2 - x}px,${cy - FAN_BTN/2 - y}px) scale(0.2)`,
              transition: `transform .22s cubic-bezier(.2,.9,.3,1.2) ${i * 28}ms, opacity .15s`,
            }}>{it.icon}</button>
        );
      })}
    </div>, document.body);
}
// Міні-панель «Оцінка уроку»: 5 зірок + коментар. Нотатку можна зберегти й без зірок.
function LessonRatePanel({ b, cx, cy, title, onSave, onClose }) {
  const [stars, setStars] = useState(Number(b.lessonRating) || 0);
  const [note, setNote] = useState(b.lessonNote || "");
  const vw = window.innerWidth, vh = window.innerHeight;
  const w = Math.min(300, vw - 16);
  const left = Math.max(8, Math.min(vw - w - 8, cx - w / 2));
  const pos = cy > vh / 2 ? { bottom: Math.max(8, vh - cy + 20) } : { top: Math.min(vh - 260, cy + 20) };
  return createPortal(
    <div data-fan="1" onClick={e => { e.stopPropagation(); onClose(); }} onPointerDown={e => e.stopPropagation()}
      style={{ position:"fixed", inset:0, zIndex:10060 }}>
      <div onClick={e => e.stopPropagation()} style={{
        position:"absolute", left, width:w, boxSizing:"border-box", padding:12, borderRadius:16, ...pos,
        background:"rgba(28,28,40,0.97)", border:"1px solid rgba(255,255,255,0.14)", color:"#fff",
        boxShadow:"0 10px 30px rgba(0,0,0,0.55)",
      }}>
        <div style={{ fontSize:12, fontWeight:800, marginBottom:8, opacity:.85 }}>{title} · {b.name || b.studentName || ""}</div>
        <div style={{ display:"flex", gap:4, justifyContent:"center", marginBottom:8 }}>
          {[1,2,3,4,5].map(n => (
            <button key={n} onClick={() => setStars(s => s === n ? 0 : n)} aria-label={String(n)} style={{
              background:"none", border:"none", padding:2, fontSize:30, lineHeight:1, cursor:"pointer",
              color: n <= stars ? "#fbbf24" : "rgba(255,255,255,0.28)",
            }}>★</button>
          ))}
        </div>
        <textarea value={note} maxLength={500} rows={3} onChange={e => setNote(e.target.value)}
          placeholder={"Коментар до уроку"} style={{
            width:"100%", boxSizing:"border-box", resize:"none", borderRadius:10, padding:8, fontSize:16,
            background:"rgba(0,0,0,0.35)", color:"#fff", border:"1px solid rgba(255,255,255,0.14)", fontFamily:"inherit", outline:"none",
          }}/>
        <button onClick={() => onSave(stars || null, note.trim().slice(0, 500))} style={{
          marginTop:8, width:"100%", padding:"9px 0", borderRadius:10, border:"none", cursor:"pointer",
          background:"linear-gradient(145deg,#fbbf24,#d97706)", color:"#1f1300", fontWeight:800, fontSize:13, fontFamily:"inherit",
        }}>{"Зберегти"}</button>
      </div>
    </div>, document.body);
}

function ScheduleView({ settings, setSettings, onSlotClick, onEmptySlotClick, bookings, setBookings, activeDragIds, navTo, slotExistsRef, openSlotsRef, jumpTarget, setJumpTarget, onViewStudent }) {
  const { BG, BG_DEEP, SURFACE, SURF_HI, SURF_LO, BORDER, TEXT, DIM, FAINT, ACCENT, ACC_HI, BLUE, GREEN, RED, SO, SI, STRIPE_A, STRIPE_B, GLOW, SHADE, INK } = useContext(ThemeContext);
  const isLight = BG !== "#1c1d21";
  const neonCal = true; // «Неонове сяйво» завжди увімкнено
  const salonCard = isSalon(settings); // салон: на картці запису — назва послуги
  const { glow, shade, ink } = useFX();
  const GRID_H      = isLight ? "rgba(0,0,0,0.09)"        : "rgba(255,255,255,0.07)";
  const GRID_HH     = isLight ? "rgba(0,0,0,0.04)"        : "rgba(255,255,255,0.025)";
  const FREE_BG     = isLight ? "rgba(58,140,30,0.10)"    : "rgba(99,211,120,0.10)";
  const FREE_BD     = isLight ? "rgba(58,140,30,0.38)"    : "rgba(99,211,120,0.38)";
  const FREE_CLR    = isLight ? "rgba(58,140,30,0.85)"    : "rgba(99,211,120,0.78)";
  const STICKY_BG   = isLight ? "rgba(58,140,30,0.16)"    : "rgba(99,211,120,0.15)";
  const STICKY_BD   = isLight ? "rgba(58,140,30,0.65)"    : "rgba(99,211,120,0.45)";
  const STICKY_CLR  = isLight ? "rgba(58,140,30,0.92)"    : "rgba(99,211,120,0.9)";
  const SURFACE_HI = SURF_HI, SURFACE_LO = SURF_LO, TEXT_DIM = DIM, TEXT_FAINT = FAINT, ACCENT_HI = ACC_HI, SHADOW_OUT = SO, SHADOW_IN = SI;
  const [showMonthCal, setShowMonthCal] = useState(false);
  // Лічильник, а не просто boolean — при кожному тапі на кнопку календар
  // монтується заново (key змінюється), навіть якщо попередній стан
  // технічно ще "відкрито" (напр. клієнт прогорнув сторінку і календар
  // візуально загубився). Тап завжди гарантовано відкриває свіжу шторку.
  const [calOpenKey, setCalOpenKey] = useState(0);
  const openMonthCal = () => { setCalOpenKey(k => k + 1); setShowMonthCal(true); };
  const [keyPortalEl, setKeyPortalEl] = useState(null);
  useEffect(() => { setKeyPortalEl(document.getElementById('topbar-key-portal')); }, []);

  // Лінія поточного часу в сітці розкладу (тільки в колонці сьогодні) — оновлюємо раз на хвилину
  const [nowMin, setNowMin] = useState(() => { const n = new Date(); return n.getHours()*60 + n.getMinutes(); });
  useEffect(() => {
    const timer = setInterval(() => {
      const n = new Date();
      setNowMin(n.getHours()*60 + n.getMinutes());
    }, 60000);
    return () => clearInterval(timer);
  }, []);
  const [dragId, setDragId] = useState(null);
  const [holdId, setHoldId] = useState(null);
  const [quickCancelId, setQuickCancelId] = useState(null);
  // ── Копіювання запису: copySource — режим вставки; copyGhost — «привид» при перетягуванні значка 📋
  const [copySource, setCopySource] = useState(null);
  const copySourceRef = useRef(null);
  copySourceRef.current = copySource;
  const [copyGhost, setCopyGhost] = useState(null);
  const copyPressRef = useRef(null);
  const copyTapRef = useRef(null);
  const copyPastedAtRef = useRef(0);
  const copyRecentRef = useRef([]);
  const copyToastTimerRef = useRef(null);
  const [copyToast, setCopyToast] = useState(null);
  // ── Віяла дій (довгий тап → нижні кружки) ──
  const [fan, setFan] = useState(null);        // { side:"r"|"l", b, cx, cy, canReview }
  const [ratePanel, setRatePanel] = useState(null); // { b, cx, cy }
  const closeFan = useRef(() => setFan(null)).current;
  const quickCancelRef = useRef(null);
  const [cancellingSet, setCancellingSet] = useState(new Set());
  // Записи, що саме скасовуються: фонові ефекти синхронізації timeslots їх
  // ігнорують — інакше вони бачили б запис ще "живим", заново блокували щойно
  // звільнені слоти і створювали огризки-документи на місці видалених phantom.
  const cancellingRef = useRef(cancellingSet);
  cancellingRef.current = cancellingSet;
  // Зміни слота (приватний / закрити-відкрити) — лише по ДВОМУ тапу підряд по тому самому слоту
  // (до 350 мс), щоб випадковий дотик під час скролу нічого не міняв.
  const slotTapRef = useRef({ key: null, t: 0 });
  // Був рух пальця (свайп) після торкання слота — подальший "click" від браузера тапом не вважаємо
  const slotMovedRef = useRef(false);
  // Позиція і прокрутка розкладу на момент торкання слота: при різкому свайпі події руху на
  // слот можуть не прийти взагалі, тож рух визначаємо ще й по зміщенню пальця та скролу.
  const slotDownRef = useRef({ x: 0, y: 0, sl: 0, st: 0 });
  const slotGestureMoved = (e) => {
    if (slotMovedRef.current) return true;
    const d = slotDownRef.current;
    if (e && typeof e.clientX === "number" && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 8) return true;
    const g = gridRef.current;
    if (g && (Math.abs(g.scrollLeft - d.sl) > 3 || Math.abs(g.scrollTop - d.st) > 3)) return true;
    return false;
  };
  const isDoubleTapOnSlot = (key) => {
    const now = Date.now();
    const last = slotTapRef.current;
    const dbl = last.key === key && now - last.t < 350;
    slotTapRef.current = dbl ? { key: null, t: 0 } : { key, t: now };
    return dbl;
  };
  const rawSlotIdsRef = useRef({}); // { date: Set<slotId> } — усі реально існуючі документи
  const cancelTimers = useRef({});
  // Кумулятивні години клієнта на момент кожного запису (для кружечка № запису в слоті)
  const cumulativeHoursMap = useMemo(() => {
    const byUser = {};
    for (const b of bookings) {
      if (b.type === "block" || b.type === "vip-slot" || b.type === "personal") continue;
      if (!b.userId) continue;
      (byUser[b.userId] ||= []).push(b);
    }
    const map = {};
    Object.values(byUser).forEach(list => {
      list.sort((a, b2) => a.day - b2.day || a.startMin - b2.startMin);
      let sum = 0;
      for (const b of list) {
        sum += (b.durMin || 60) / 60;
        map[b.id] = Math.round(sum);
      }
    });
    return map;
  }, [bookings]);
  // Порядковий номер запису клієнта серед УСІХ його нескасованих записів (включно
  // з майбутніми) — основа для автоматичних міток (1-й запис / перевірка / іспит).
  const studentOrderMap = useMemo(() => {
    const byStudent = {};
    for (const b of bookings) {
      if (b.type === "block" || b.type === "vip-slot" || b.type === "personal") continue;
      if (b.status === "cancelled") continue;
      const key = b.userId || b.phone;
      if (!key) continue;
      (byStudent[key] ||= []).push(b);
    }
    const map = {};
    Object.values(byStudent).forEach(list => {
      list.sort((a, b2) => a.day - b2.day || a.startMin - b2.startMin);
      list.forEach((b, i) => { map[b.id] = i + 1; });
    });
    return map;
  }, [bookings]);
  // Індекси записів за днем (b.day) і датою (b.date). Раніше КОЖНА колонка розкладу
  // на КОЖЕН рендер проходила весь масив bookings (кілька filter × ~15 колонок ×
  // тисячі записів) — саме це "з'їдало" плавність скролу при великій кількості записів.
  const { bookingsByDay, bookingsByDate } = useMemo(() => {
    const byDay = new Map(), byDate = new Map();
    for (const b of bookings) {
      let l = byDay.get(b.day);
      if (!l) byDay.set(b.day, l = []);
      l.push(b);
      if (b.date) {
        let m = byDate.get(b.date);
        if (!m) byDate.set(b.date, m = []);
        m.push(b);
      }
    }
    byDay.forEach(l => l.sort((a, c) => a.startMin - c.startMin));
    return { bookingsByDay: byDay, bookingsByDate: byDate };
  }, [bookings]);
  // Автоматична мітка — лише поки майстер жодного разу не чіпав мітку цього
  // запису вручну (booking.tagManual); ручний вибір/зняття завжди має пріоритет.
  const getAutoTag = (b) => {
    if (b.debtAmount > 0) return "debt";
    return AUTO_TAG_BY_ORDER[studentOrderMap[b.id]] || null;
  };
  const effectiveTag = (b) => knownTag(b.tagManual ? (b.tag || null) : (b.tag || getAutoTag(b)));
  // Сусідні записи одного клієнта раніше об'єднувались в одну картку — вимкнено
  // на прямий запит: кожен запис тепер своя окрема картка (можна тягати й
  // ресайзити кожну годину окремо). Дані в Firebase й завжди були окремими
  // записами, тут міняється лише відображення.
  const mergeInfoMap = {};
  // Групові записи (один час, одна послуга) показуємо ОДНІЄЮ карткою «Група N/M»: перший учасник — представник, решта сховані
  const groupMap = useMemo(() => {
    const by = {};
    bookings.forEach(b => { if (b.groupKey && b.status !== "cancelled" && b.type !== "personal") (by[b.groupKey] ||= []).push(b); });
    const map = {};
    Object.values(by).forEach(list => {
      list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0) || String(a.id).localeCompare(String(b.id)));
      list.forEach((b, i) => { map[b.id] = i === 0 ? { rep: true, members: list } : { hidden: true }; });
    });
    return map;
  }, [bookings]);
  const [windowW, setWindowW] = useState(window.innerWidth);
  const [windowH, setWindowH] = useState(window.innerHeight);
  const PAST_DAYS = 365;
  const VBUF = 5;
  const [dayOffset, setDayOffset] = useState(-PAST_DAYS);
  const dragRef = useRef(null);
  const calcRef = useRef({});
  const setBookingsRef = useRef(null);
  const gridRef = useRef(null);
  const headerScrollRef = useRef(null);
  const headersInnerRef = useRef(null);
  const holdTimerRef = useRef(null);
  const pendingDragRef = useRef(null);
  const dragEndedRef = useRef(false);
  const resizeReadyRef = useRef(null);
  const swipeRef = useRef(null);
  const momentumRef = useRef(null);
  const pendingScrollRef = useRef(null);
  const handleActionRef = useRef(null);
  const gridWrapRef = useRef(null);

  // Один запис scrollLeft/scrollTop за кадр замість запису на кожен pointermove.
  // pointermove на деяких пристроях (120Hz+ тачскрини) спрацьовує частіше за
  // рендер екрана — прямий запис у DOM на кожну подію змушує браузер рахувати
  // layout частіше, ніж він фізично може намалювати, і рух виглядає менш
  // плавним за нативний скрол (той керується композитором, без цього завалу).
  // Ця петля просто застосовує ОСТАННЄ обчислене значення раз на кадр.
  useEffect(() => {
    let raf;
    const apply = () => {
      const p = pendingScrollRef.current;
      if (p && gridRef.current) {
        if (p.axis === "x") gridRef.current.scrollLeft = p.value;
        else gridRef.current.scrollTop = p.value;
        pendingScrollRef.current = null;
      }
      raf = requestAnimationFrame(apply);
    };
    raf = requestAnimationFrame(apply);
    return () => cancelAnimationFrame(raf);
  }, []);
  const vRangeRef   = useRef({ s: Math.max(0, PAST_DAYS - VBUF), e: PAST_DAYS + 30 });
  const vRangeSubRef = useRef(null); // підписка VirtualCols на зміну діапазону колонок
  // Реально видимий діапазон днів (без буфера VBUF) — для авто-висоти годин.
  const visDayRangeRef = useRef({ s: PAST_DAYS, e: PAST_DAYS + 30 });
  // Час першого запису, до якого треба проскролити після перерахунку
  // авто-висоти — щоб усі записи були видно одразу, без ручного скролу.
  const autoScrollToMinRef = useRef(null);
  const xVisibleRef = useRef(false);
  const xJustShownRef = useRef(false);
  const snapTimerRef = useRef(null);
  const timeColRef = useRef(null);
  const [pinch, setPinch] = useState(null);
  const [shineId, setShineId] = useState(null);
  const slotHoldTimerRef = useRef(null);
  const slotHoldFiredRef = useRef(false);
  const slotPressRef = useRef(null); // { dateStr, time, slot, startY, lastY } — до озброєння drag довгим тапом
  const slotClaimedRef = useRef(false); // дотик уже "заявлений" дочірнім вільним слотом — батьківський порожній фон не має відкривати своє меню "новий слот"
  const freeDragRef = useRef(null); // { dateStr, time, slot, startClientY, startMin, moved, newStart }
  const [freeDragPreview, setFreeDragPreview] = useState(null); // { dateStr, time, newStart }
  const resizeHoldTimerRef = useRef(null);
  const resizeHoldPosRef = useRef(null); // { startY, lastY } — до озброєння resize довгим тапом
  const freeResizeRef = useRef(null); // { dateStr, time, startClientY, startDur, maxDur, moved, newDur }
  const [freeResizePreview, setFreeResizePreview] = useState(null); // { dateStr, time, newDur }
  const [openSlots, setOpenSlots] = useState({}); // { "2025-06-01": ["07:00","08:00",...] }
  const [viewingSlots, setViewingSlots] = useState({});
  const pendingSlotSnapRef = useRef(null);
  const pendingSlotSnapTimerRef = useRef(null);
  const [genLoadingDays, setGenLoadingDays] = useState(new Set());
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [queueMap, setQueueMap] = useState({}); // { "YYYY-MM-DD_HH:MM": count }

  useEffect(() => {
    const r = iRef( "queue");
    const unsub = onValue(r, snap => {
      const val = snap.val() || {};
      const map = {};
      Object.entries(val).forEach(([slotKey, slotData]) => {
        if (!slotData?.entries) return;
        const count = Object.values(slotData.entries).filter(e => e.status === 'waiting').length;
        if (count > 0) map[slotKey] = count;
      });
      setQueueMap(map);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const r = iRef( "dayNotes");
    const unsub = onValue(r, snap => setDayNotes(snap.val() || {}));
    return () => unsub();
  }, []);

  useEffect(() => {
    const r = iRef(slotRoot());
    const unsub = onValue(r, snap => {
      const val = snap.val() || {};
      const slots = {};
      const viewing = {};
      const exists = {};
      const rawIds = {};
      Object.entries(val).forEach(([date, dateSlots]) => {
        rawIds[date] = new Set(Object.keys(dateSlots || {}));
        const slotMap = {};
        const viewTimes = [];
        const slotSet = new Set();
        Object.entries(dateSlots).forEach(([slotKey, slot]) => {
          // Derive time from key (slot1000 → '10:00') as fallback when time field is missing
          const m = slotKey.match(/^slot(\d{2})(\d{2})$/);
          const slotTime = slot.time || (m ? `${m[1]}:${m[2]}` : null);
          if (slotTime) {
            // phantom-вузли (створені лише під запис) не належать сітці дня
            if (!slot.phantom) slotSet.add(slotTime);
            // Огризок без available/time (напр. лише bookingStart) — не слот: не показуємо вільним
            const isRealSlot = slot.available !== undefined || !!slot.time;
            if (isRealSlot && (slot.available !== false || slot.adminBlocked || slot.vipOnly || slot.privateOnly || slot.surcharge || slot.fixedPrice)) {
              slotMap[slotTime] = { available: slot.available !== false, adminBlocked: !!slot.adminBlocked, vipOnly: !!slot.vipOnly, privateOnly: !!slot.privateOnly, surcharge: slot.surcharge || null, fixedPrice: slot.fixedPrice || null, durMin: slot.durMin || 60 };
            }
          }
          if (slot.viewing && Object.keys(slot.viewing).length > 0) viewTimes.push(slotTime);
        });
        if (Object.keys(slotMap).length) slots[date] = slotMap;
        if (viewTimes.length) viewing[date] = viewTimes;
        if (slotSet.size) exists[date] = slotSet;
      });
      if (slotExistsRef) slotExistsRef.current = exists;
      rawSlotIdsRef.current = rawIds;
      if (openSlotsRef) openSlotsRef.current = slots;
      if (activeDragIds?.current?.size > 0) {
        pendingSlotSnapRef.current = { slots, viewing };
        // Запобіжник: якщо activeDragIds "зависне" непорожнім (застарілий id, що
        // ніколи не видалився — напр. після швидкого дотику одразу до двох
        // записів), відкладене оновлення слотів інакше НІКОЛИ не застосується,
        // і новостворені/розблоковані слоти (ключик, тап на день) не з'являлись
        // би, доки не перезайти в застосунок. Форсуємо застосування через 1.5с,
        // навіть якщо drag формально ще "активний".
        clearTimeout(pendingSlotSnapTimerRef.current);
        pendingSlotSnapTimerRef.current = setTimeout(() => {
          if (!pendingSlotSnapRef.current) return;
          const { slots: s, viewing: v } = pendingSlotSnapRef.current;
          pendingSlotSnapRef.current = null;
          setOpenSlots(s);
          setViewingSlots(v);
        }, 1500);
      } else {
        clearTimeout(pendingSlotSnapTimerRef.current);
        setOpenSlots(slots);
        setViewingSlots(viewing);
      }
    });
    return () => unsub();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const absDayToDateStr = (absDay) => {
    const d = new Date(); d.setHours(0,0,0,0);
    d.setDate(d.getDate() + absDay);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  };

  // Сейф-нет: будь-який доступний слот, накритий активним записом (хоча б
  // частково), робимо недоступним у БД, щоб клієнт не зміг його забронювати.
  // Тільки блокує — звільнення слотів виконує App.jsx при зміні/скасуванні.
  useEffect(() => {
    if (activeDragIds?.current?.size > 0) return;
    // Дебаунс: bookings/openSlots можуть оновлюватись пачкою (стрім із Firebase,
    // перетягування). Чекаємо паузу, щоб зробити один запис, а не кілька підряд.
    const t = setTimeout(() => {
      if (activeDragIds?.current?.size > 0) return;
      const bkByDate = {};
      bookings.forEach(b => {
        if (b.status === "cancelled" || cancellingRef.current.has(b.id)) return;
        if (b.startMin == null || !b.durMin) return;
        const d = Number.isInteger(b.day) ? absDayToDateStr(b.day) : b.date;
        if (!d) return;
        (bkByDate[d] || (bkByDate[d] = [])).push(b);
      });
      const upd = {};
      Object.entries(openSlots).forEach(([date, slotMap]) => {
        const dayBk = bkByDate[date];
        if (!dayBk) return;
        Object.entries(slotMap).forEach(([time, slot]) => {
          if (!slot.available) return;
          const [h, m] = time.split(":").map(Number);
          const sMin = h * 60 + m;
          const coveringBk = dayBk.find(b => b.startMin < sMin + (settings.snapMin || 30) && b.startMin + b.durMin > sMin);
          if (coveringBk) {
            const hh = String(h).padStart(2, "0");
            const mm = String(m).padStart(2, "0");
            upd[`${slotRoot()}/${date}/slot${hh}${mm}/available`] = false;
          }
        });
      });
      // Дозаповнюємо прапорець bookingStart для КОЖНОГО завантаженого запису —
      // true на реальному старті, false на кожному проміжному 30-хв маркері
      // (не лише true на старті!) — інакше проміжні маркери старих бронювань
      // лишались зовсім без прапорця (undefined) і клієнт однаково показував
      // їх окремо. Так старі бронювання (зроблені до появи цього прапорця)
      // отримують його повністю заднім числом при кожному перегляді дня, без
      // окремої міграції.
      Object.entries(bkByDate).forEach(([date, dayBk]) => {
        dayBk.forEach(b => {
          for (let cur = b.startMin; cur < b.startMin + b.durMin; cur += 30) {
            const hh = String(Math.floor(cur / 60)).padStart(2, "0");
            const mm = String(cur % 60).padStart(2, "0");
            // Лише для існуючих документів — інакше запис у видалений phantom створював би огризок
            if (rawSlotIdsRef.current[date]?.has(`slot${hh}${mm}`)) upd[`${slotRoot()}/${date}/slot${hh}${mm}/bookingStart`] = cur === b.startMin;
          }
        });
      });
      if (Object.keys(upd).length) update(iRef(), upd).catch(() => {});
    }, 400);
    return () => clearTimeout(t);
  }, [bookings, openSlots]); // eslint-disable-line react-hooks/exhaustive-deps

  // Returns {free, blocked} counts, or null if day is skipped
  const computeDayUpdates = (dateStr, existing, force = false, overridesParam) => computeDayUpdatesFor(settings, bookings, dateStr, existing, force, overridesParam);

  const generateDaySlots = async (absDay) => {
    const dateStr = absDayToDateStr(absDay);
    setGenLoadingDays(s => new Set([...s, absDay]));
    try {
      await remove(iRef( `${slotRoot()}/${dateStr}`));
      const result = computeDayUpdates(dateStr, {}, true);
      if (result && Object.keys(result.updates).length) {
        await update(iRef(), result.updates);
      }
    } finally {
      setGenLoadingDays(s => { const ns = new Set(s); ns.delete(absDay); return ns; });
    }
  };

  const clearDaySlots = async (absDay) => {
    const dateStr = absDayToDateStr(absDay);
    setGenLoadingDays(s => new Set([...s, absDay]));
    try {
      // Прибираємо лише справді вільні (available:true) слоти — те, що
      // додав автозаповнення. Слоти, зайняті записом чи вручну заблоковані
      // адміном (available:false), не чіпаємо, щоб не "звільнити" зайнятий час.
      const snap = await get(iRef( `${slotRoot()}/${dateStr}`));
      const day = snap.val() || {};
      const upd = {};
      Object.entries(day).forEach(([slotId, slot]) => {
        if (slot?.available === true) upd[`${slotRoot()}/${dateStr}/${slotId}`] = null;
      });
      if (Object.keys(upd).length) await update(iRef(), upd);
    } finally {
      setGenLoadingDays(s => { const ns = new Set(s); ns.delete(absDay); return ns; });
    }
  };

  // Firebase RTDB відхиляє ОДИН update() з надто великою кількістю ключів
  // помилкою TOO_MANY_TRIGGERS, якщо на шляху висять Cloud Functions-тригери
  // (timeslots/{date}/{slotId} — onSlotFreed тощо): весь запис атомарно
  // відхиляється повністю, тому "Ключик" на великих slotGenDays міг генерувати
  // слоти, які одразу зникають (клієнт оптимістично показував їх, а сервер
  // відкидав весь запис). Розбиваємо на пачки — кожна пачка своя атомарна
  // транзакція, у межах ліміту тригерів.
  const CHUNK_SIZE = 400;
  const chunkedUpdate = async (updates) => {
    const entries = Object.entries(updates);
    for (let i = 0; i < entries.length; i += CHUNK_SIZE) {
      await update(iRef(), Object.fromEntries(entries.slice(i, i + CHUNK_SIZE)));
    }
  };
  // Видалення ЦІЛОГО дня (`${slotRoot()}/{date} = null`) прибирає одразу десятки
  // дочірніх слот-записів — на кожному з яких висить той самий Cloud Function
  // тригер. Один multi-path update() з N такими піддеревами зачіпає стільки ж
  // реальних записів, скільки й генерація, і так само може впертися у
  // TOO_MANY_TRIGGERS — рахувати треба кількість реальних записів під ключами,
  // а не кількість самих ключів. Тому видаляємо дні ПО ОДНОМУ послідовно.
  const clearDaysRange = async (limit) => {
    for (let d = 0; d <= limit; d++) {
      await remove(iRef( `${slotRoot()}/${absDayToDateStr(d)}`));
    }
  };

  const generateAllSlots = async () => {
    setIsGeneratingAll(true);
    try {
      const limit = settings.slotGenDays || 30;
      const allUpdates = {};
      // Clear timeslots for all active days first, then write fresh state
      await clearDaysRange(limit);
      // Now compute and write fresh slots (pass {} — no existing adminBlocked to preserve)
      // force НЕ передаємо: масова регенерація має поважати weekSchedule.enabled
      // (дні вихідного за тижневим шаблоном лишаються закритими). force=true —
      // тільки для generateDaySlots (явний клік по конкретному дню = ручний override).
      for (let d = 0; d <= limit; d++) {
        const dateStr = absDayToDateStr(d);
        const result = computeDayUpdates(dateStr, {});
        if (result) Object.assign(allUpdates, result.updates);
      }
      if (Object.keys(allUpdates).length) await chunkedUpdate(allUpdates);
    } finally {
      setIsGeneratingAll(false);
    }
  };

  // Чи є вже згенеровані слоти в межах діапазону автовиставлення (для тумблера ключика)
  const hasAnyGeneratedSlots = () => {
    const limit = settings.slotGenDays || 30;
    for (let d = 0; d <= limit; d++) {
      const dateStr = absDayToDateStr(d);
      if (openSlots[dateStr] && Object.keys(openSlots[dateStr]).length) return true;
    }
    return false;
  };

  // Другий тап ключика — зняти всі згенеровані слоти назад
  const clearAllSlots = async () => {
    setIsGeneratingAll(true);
    try {
      const limit = settings.slotGenDays || 30;
      await clearDaysRange(limit);
    } finally {
      setIsGeneratingAll(false);
    }
  };

  // Клік: вільний ↔ зайнятий (2 стани)
  // Цикл тапів по вільному слоту: вільний (зелений) → заблокований (червоний) → прибрати повністю.
  const toggleSlotFree = (dateStr, time, slot) => {
    const slotId = `slot${time.replace(":", "")}`;
    if (slot.adminBlocked) {
      update(iRef( `${slotRoot()}/${dateStr}/${slotId}`), { available: true, adminBlocked: false, time }).catch(() => {});
    } else {
      update(iRef( `${slotRoot()}/${dateStr}/${slotId}`), { available: false, adminBlocked: true, vipOnly: false, privateOnly: false, surcharge: null, time }).catch(() => {});
    }
  };

  // Повне видалення слота — прибирає запис із Firebase, комірка зникає з сітки
  const deleteSlot = (dateStr, time) => {
    const slotId = `slot${time.replace(":", "")}`;
    remove(iRef( `${slotRoot()}/${dateStr}/${slotId}`)).catch(() => {});
  };

  // Довгий тап: VIP, приватний, надбавка або скидання
  const applySlotOption = (dateStr, time, option) => {
    const slotId = `slot${time.replace(":", "")}`;
    const currentSlot = slotOptions?.slot || {};
    const isClosed = currentSlot.available === false;
    if (option === "vip") {
      if (isClosed) {
        // Закритий VIP — залишаємо закритим, додаємо VIP прапор
        update(iRef( `${slotRoot()}/${dateStr}/${slotId}`), { vipOnly: true }).catch(() => {});
      } else {
        update(iRef( `${slotRoot()}/${dateStr}/${slotId}`), { available: true, adminBlocked: false, vipOnly: true }).catch(() => {});
      }
    } else if (option === "private") {
      if (isClosed) {
        update(iRef( `${slotRoot()}/${dateStr}/${slotId}`), { privateOnly: true }).catch(() => {});
      } else {
        update(iRef( `${slotRoot()}/${dateStr}/${slotId}`), { available: true, adminBlocked: false, privateOnly: true }).catch(() => {});
      }
    } else if (option === "reset") {
      if (isClosed) {
        update(iRef( `${slotRoot()}/${dateStr}/${slotId}`), { vipOnly: false, privateOnly: false, surcharge: null, fixedPrice: null }).catch(() => {});
      } else {
        update(iRef( `${slotRoot()}/${dateStr}/${slotId}`), { available: true, adminBlocked: false, vipOnly: false, privateOnly: false, surcharge: null, fixedPrice: null }).catch(() => {});
      }
    } else if (option === "surcharge_remove") {
      update(iRef( `${slotRoot()}/${dateStr}/${slotId}`), { surcharge: null }).catch(() => {});
    } else if (option && typeof option === "object" && option.fixedPrice != null) {
      // Фіксована ціна повністю замінює тарифну — незалежна від VIP/Індивідуальний слот,
      // тому не чіпаємо ці прапорці, лише available/adminBlocked за тим самим
      // патерном, що й VIP/Індивідуальний слот.
      if (isClosed) {
        update(iRef( `${slotRoot()}/${dateStr}/${slotId}`), { fixedPrice: option.fixedPrice }).catch(() => {});
      } else {
        update(iRef( `${slotRoot()}/${dateStr}/${slotId}`), { available: true, adminBlocked: false, fixedPrice: option.fixedPrice }).catch(() => {});
      }
    } else if (option === "fixedPrice_remove") {
      update(iRef( `${slotRoot()}/${dateStr}/${slotId}`), { fixedPrice: null }).catch(() => {});
    } else {
      update(iRef( `${slotRoot()}/${dateStr}/${slotId}`), { surcharge: option }).catch(() => {});
    }
    setSlotOptions(null);
  };

  // Скидаємо transform після зміни dayOffset (контент оновився — повертаємо в 0)
  useLayoutEffect(() => {
    const el = gridWrapRef.current;
    if (!el) return;
    el.style.transition = "none";
    el.style.transform = "";
  }, [dayOffset]);

  const computeVRange = () => {
    const el = gridRef.current;
    if (!el) return;
    const { COL_W: cw, N_DAYS: nd } = calcRef.current;
    if (!cw || !nd) return;
    const stride = cw + 4;
    const sl = el.scrollLeft;
    const firstVis = Math.floor(sl / stride);
    const lastVis  = Math.ceil((sl + el.clientWidth) / stride);
    // Рендер-діапазон колонок міняємо лише коли запас з одного з боків скоротився
    // нижче VBUF, а не на кожній зміні лівого/правого краю окремо (раніше — двічі
    // за крок скролу).
    const cur = vRangeRef.current;
    const leftOk  = cur.s === 0 || firstVis - cur.s >= VBUF;
    const rightOk = cur.e >= nd - 1 || cur.e - lastVis >= VBUF;
    if (!leftOk || !rightOk) {
      const s = Math.max(0, firstVis - VBUF);
      const e = Math.min(nd - 1, lastVis + VBUF);
      if (s !== cur.s || e !== cur.e) {
        vRangeRef.current = { s, e };
        vRangeSubRef.current?.({ s, e });
      }
    }
    const vs = Math.max(0, firstVis);
    const ve = Math.min(nd - 1, lastVis);
    if (vs !== visDayRangeRef.current.s || ve !== visDayRangeRef.current.e) {
      visDayRangeRef.current = { s: vs, e: ve };
      // Видимий діапазон живить лише авто-висоту годин (без setState — див. runAutoHeightRef).
      if (calcRef.current.autoHourHeight) runAutoHeightRef.current?.();
    }
  };

  // Скролимо до сьогодні при зміні daysShown (включаючи завантаження settings з Firebase)
  useEffect(() => {
    if (!gridRef.current) return;
    const colW = calcRef.current.COL_W || 70;
    const left = PAST_DAYS * (colW + 4);
    gridRef.current.scrollLeft = left;
    if (headersInnerRef.current) headersInnerRef.current.style.transform = `translateX(-${left}px)`;
    computeVRange();
  }, [settings.daysShown]);

  useLayoutEffect(() => { computeVRange(); }, []);
  const [bubbleData, setBubbleData] = useState(null);
  const [addSlotPos, setAddSlotPos] = useState(null); // { dateStr, startMin, clientX, clientY }
  const [formData, setFormData] = useState(null);
  // Кнопка «+» у нижньому меню: відкрити форму запису на найближчий час (сьогодні або завтра зранку)
  useEffect(() => {
    const open = () => {
      window.__junoPendingNew = 0;
      const ws = Math.round((settings.workStart ?? 9) * 60), we = Math.round((settings.workEnd ?? 18) * 60);
      const n = new Date(); let m = Math.ceil((n.getHours() * 60 + n.getMinutes()) / 30) * 30, day = 0;
      if (m < ws) m = ws;
      if (m > we - 30) { day = 1; m = ws; }
      const studentId = window.__junoPendingStudent || undefined; window.__junoPendingStudent = null; // «Записати» з чату — клієнт уже обраний
      setFormData({ day, startMin: m, studentId });
    };
    if (window.__junoPendingNew && Date.now() - window.__junoPendingNew < 4000) open();
    window.addEventListener("juno:newBooking", open);
    return () => window.removeEventListener("juno:newBooking", open);
  }, [settings.workStart, settings.workEnd]);
  const [createSlotData, setCreateSlotData] = useState(null); // {day, startMin}
  const [localSelectedBooking, setLocalSelectedBooking] = useState(null);
  const [todayDir, setTodayDir] = useState(null);
  const [helpOpen, setHelpOpen] = useState(false); // довідник «?» по значках розкладу
  // Позиція кнопки «?»: можна перетягнути куди завгодно, запам'ятовується на цьому пристрої (px від лівого/верхнього краю)
  const [helpPos, setHelpPos] = useState(() => {
    try { const v = JSON.parse(localStorage.getItem("helpBtnPos") || "null"); if (v && Number.isFinite(v.x) && Number.isFinite(v.y)) return v; } catch { /* ignore */ }
    return null;
  });
  const helpDrag = useRef(null);
  const todayDirRef = useRef(null);
  const emptyHoldTimerRef = useRef(null);
  const emptyHoldPosRef   = useRef(null);
  const dayLongPressRef   = useRef(null);
  const dayLongFiredRef   = useRef(false);
  const dayClickTimerRef  = useRef(null);
  const dayLastClickRef   = useRef(null); // { absDay, time } — для розпізнавання подвійного тапу
  const [dayNotesModal, setDayNotesModal] = useState(null); // { dateStr, dayLabel, dayNum, dayMonth }
  const [dayNotes, setDayNotes] = useState({}); // { "YYYY-MM-DD": { hours:[9,10], text:"...", updatedAt } }
  const [scheduleLocked, setScheduleLocked] = useState(() => localStorage.getItem("scheduleLocked") === "1");
  const lockHoldTimerRef  = useRef(null);
  const lockHoldFiredRef  = useRef(false);

  const handleLockDown = (e) => {
    e.preventDefault();
    lockHoldFiredRef.current = false;
    lockHoldTimerRef.current = setTimeout(() => {
      lockHoldFiredRef.current = true;
      navigator.vibrate?.([30, 40, 60]);
      setScheduleLocked(v => { const next = !v; localStorage.setItem("scheduleLocked", next ? "1" : "0"); return next; });
    }, 700);
  };
  const handleLockUp = () => clearTimeout(lockHoldTimerRef.current);

  const toggleDayBlocked = (dateStr) => {
    const overrides = settings.dateOverrides || [];
    const existing  = overrides.find(o => o.date === dateStr);
    // Ефективний статус "закрито" має враховувати не лише явний override,
    // а й тижневий шаблон (weekSchedule.enabled / weekends) — інакше день,
    // вимкнений лише шаблоном (напр. неділя за замовчуванням), на перший
    // дубль-тап помилково йшов гілкою "закрити" (без override це no-op:
    // слотів і так немає), і реально відкривався лише з другого разу.
    const dow = (new Date(dateStr + "T12:00:00").getDay() + 6) % 7;
    const ws  = (settings.weekSchedule || [])[dow] || {};
    const templateClosed = ws.enabled === false || (!ws.start && (settings.weekends || []).includes(dow));
    const wasClosed = existing ? existing.type === 'closed' : templateClosed;
    const newOverrides = wasClosed
      ? (!existing && templateClosed
          // Відкриваємо шаблонно-закритий день без override — фіксуємо явний
          // "custom" override, інакше подальша масова регенерація (force=false)
          // знову закриє день за шаблоном.
          ? [...overrides.filter(o => o.date !== dateStr), { date: dateStr, type: 'custom' }]
          : overrides.filter(o => o.date !== dateStr))
      : [...overrides.filter(o => o.date !== dateStr), { date: dateStr, type: 'closed' }];
    setSettings(s => ({ ...s, dateOverrides: newOverrides }));
    if (wasClosed) {
      // Відкриваємо день — перегенеровуємо слоти за поточним розкладом.
      const result = computeDayUpdates(dateStr, {}, true, newOverrides);
      if (result && Object.keys(result.updates).length) update(iRef(), result.updates).catch(()=>{});
    } else {
      // Закриваємо день — прибираємо вже згенеровані слоти. Інакше стара
      // сітка (available:true) лишається в Firebase і день і далі показує
      // "відкриті" слоти та їх видно клієнту, попри позначку "закрито".
      remove(iRef( `${slotRoot()}/${dateStr}`)).catch(()=>{});
    }
  };

  // Shine glint animation — one booking at a time, random, every 3s
  const bookingsRef = useRef(bookings);
  useEffect(() => { bookingsRef.current = bookings; }, [bookings]);
  useEffect(() => { setBookingsRef.current = setBookings; }, [setBookings]);
  const settingsRef = useRef(settings);
  useEffect(() => { settingsRef.current = settings; }, [settings]);
  // quickCancelRef тепер оновлюється напряму в holdTimer/onMove (без затримки ре-рендеру)
  useEffect(() => {
    const timer = setInterval(() => {
      const bks = bookingsRef.current;
      if (!bks.length) return;
      const b = bks[Math.floor(Math.random() * bks.length)];
      setShineId(b.id);
      setTimeout(() => setShineId(id => id === b.id ? null : id), 950);
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  // Deep-link з push-сповіщення: прокрутити до дати/запису та підсвітити
  useEffect(() => {
    if (!jumpTarget?.date) return;
    const el = gridRef.current;
    const cw = calcRef.current.COL_W;
    if (!el || !cw) return;
    const today = new Date(); today.setHours(12, 0, 0, 0);
    const absDay = Math.round((new Date(jumpTarget.date + "T12:00:00") - today) / 86400000);
    el.scrollTo({ left: Math.max(0, (PAST_DAYS + absDay) * (cw + 4)), behavior: "smooth" });
    const match = bookingsRef.current.find(b =>
      b.day === absDay &&
      (!jumpTarget.time || b.time === jumpTarget.time) &&
      (!jumpTarget.bookingId || b.id === jumpTarget.bookingId)
    );
    if (match) {
      setShineId(match.id);
      setTimeout(() => setShineId(id => id === match.id ? null : id), 3000);
    }
  }, [jumpTarget]);

  const TIME_COL_W = 44;
  const HEADER_H = 42;
  const currentYear = new Date().getFullYear();
  const N_DAYS = PAST_DAYS + 365;
  const COL_W = Math.max(40, Math.floor((windowW - 16 - TIME_COL_W - (settings.daysShown - 1) * 4) / Math.max(1, settings.daysShown)));
  const allDaySchedules = (settings.weekSchedule || []).filter(d => d.start != null);
  const effectiveWorkStart = allDaySchedules.length
    ? Math.min(settings.workStart, ...allDaySchedules.map(d => d.start))
    : settings.workStart;
  const effectiveWorkEnd = allDaySchedules.length
    ? Math.max(settings.workEnd, ...allDaySchedules.map(d => d.end ?? settings.workEnd))
    : settings.workEnd;
  // Межі робочого дня в цілих хвилинах (початок/кінець можуть бути будь-якою хвилиною)
  const wsMinAbs = Math.round(effectiveWorkStart * 60), weMinAbs = Math.round(effectiveWorkEnd * 60);
  const totalMin = Math.max(60, weMinAbs - wsMinAbs);
  // Авто-підлаштування: вся висота розкладу = доступна висота viewport
  // hourHeightPx / 60 використовується як zoom-множник (pinch)
  const availGridH = Math.max(120, windowH - 156 - HEADER_H - 4);
  const autoPxPerMin = availGridH / totalMin;
  const PX_PER_MIN = autoPxPerMin * (settings.hourHeightPx / 60);
  const gridHeight = totalMin * PX_PER_MIN;

  // Keep calc values fresh for always-on window listeners (avoids stale closure)
  calcRef.current = { PX_PER_MIN, snapMin: settings.snapMin, workStart: effectiveWorkStart, workEnd: effectiveWorkEnd, workStartMin: wsMinAbs, workEndMin: weMinAbs, COL_W, dayOffset, daysShown: settings.daysShown, N_DAYS, autoHourHeight: !!settings.autoHourHeight };
  // Зміна ширини колонки (resize вікна, поворот планшета/телефона): тримаємо той самий перший видимий день,
  // інакше старий scrollLeft вказує на інші дні, а віртуалізовані колонки лишаються «порожніми».
  const prevColWRef = useRef(COL_W);
  useLayoutEffect(() => {
    const prev = prevColWRef.current;
    prevColWRef.current = COL_W;
    const el = gridRef.current;
    if (!el || !prev || prev === COL_W) return;
    // Перший видимий день беремо з останнього обчислення під час скролу: при звуженні вікна браузер
    // ще до цього ефекту обрізає scrollLeft до нової (меншої) ширини вмісту, і він уже «не той» день.
    const known = visDayRangeRef.current?.s;
    const day = Number.isFinite(known) && known >= 0 ? known : Math.round(el.scrollLeft / (prev + 4));
    const left = day * (COL_W + 4);
    el.scrollLeft = left;
    if (headersInnerRef.current) headersInnerRef.current.style.transform = `translateX(-${left}px)`;
    vRangeRef.current = { s: -1, e: -1 }; // примусово перерахувати діапазон рендеру
    computeVRange();
  }, [COL_W]);

  // Часовий діапазон записів/слотів у ВИДИМИХ днях — основа авто-висоти годин.
  // Рахуємо по індексу bookingsByDay (лише видимі дні), а не проходом по всіх записах.
  const calcAutoSpan = () => {
    const dayFrom = dayOffset + visDayRangeRef.current.s;
    const dayTo   = dayOffset + visDayRangeRef.current.e;
    let minStart = Infinity, maxEnd = -Infinity;
    for (let dd = dayFrom; dd <= dayTo; dd++) {
      const dayList = bookingsByDay.get(dd);
      if (!dayList) continue;
      for (const b of dayList) {
        if (b.status === "cancelled") continue;
        minStart = Math.min(minStart, b.startMin);
        maxEnd   = Math.max(maxEnd, b.startMin + b.durMin);
      }
    }
    // Порожні (вільні, ще не заброньовані) слоти теж входять у діапазон —
    // "Авто" має показувати не лише зайняті години, а й доступні для запису.
    for (let d = dayFrom; d <= dayTo; d++) {
      const daySlots = openSlots[absDayToDateStr(d)];
      if (!daySlots) continue;
      Object.entries(daySlots).forEach(([time, slot]) => {
        if (!slot.available) return;
        const [hh, mm] = time.split(':').map(Number);
        const sMin = hh * 60 + mm;
        minStart = Math.min(minStart, sMin);
        maxEnd   = Math.max(maxEnd, sMin + (slot.durMin || 60));
      });
    }
    return { minStart, maxEnd, key: minStart === Infinity ? null : `${minStart}-${maxEnd}` };
  };

  // Авто-висота годин ("Авто" замість фіксованих 6/8/9/10/12): підлаштовуємо
  // hourHeightPx під діапазон "перший запис — останній запис" видимих днів
  // (6..16 годин). Рахуємо при зміні видимого діапазону днів (скрол — викликає
  // computeVRange напряму, БЕЗ setState: інакше кожна колонка скролу = повний
  // рендер розкладу), при вмиканні "Авто" і коли змінюється сам часовий діапазон
  // записів (напр. додали пізній запис, прийшли слоти). Просте редагування
  // (ціна/статус), що span не міняє, висоту не перераховує — щоб вона не
  // "стрибала" під час звичайної роботи.
  const lastAutoKeyRef = useRef(null);
  const runAutoHeightRef = useRef(null);
  runAutoHeightRef.current = () => {
    if (!settings.autoHourHeight) return;
    const { minStart, maxEnd, key } = calcAutoSpan();
    lastAutoKeyRef.current = key;
    if (minStart === Infinity) return; // немає ні записів, ні слотів у видимому діапазоні — висоту не чіпаємо
    const spanHours = Math.ceil((maxEnd - minStart) / 60);
    const n = Math.max(6, Math.min(16, spanHours));
    const el = gridRef.current;
    if (!el) return;
    // availGridH (windowH - 156 - HEADER_H - 4) — лише ОЦІНКА видимої висоти
    // за розміром вікна; на реальному пристрої вона не завжди точно збігається
    // з фактичним контейнером (адресний рядок браузера, safe-area тощо), через
    // що записи то знизу, то зверху вилазили за межі екрана. Тому висоту рядка
    // рахуємо від РЕАЛЬНО виміряного el.clientHeight, а не від оцінки.
    // Реально виміряний offset до верху сітки годин (замість оцінкових
    // paddingTop+HEADER_H+marginBottom — на практиці лишався залишковий
    // здвиг у кілька px, накопичувався в помітну похибку).
    const timeCol = timeColRef.current;
    const headerOffsetReal = timeCol
      ? timeCol.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop
      : (2 + HEADER_H + 10);
    const BOTTOM_BUFFER = 56; // місце під плашку суми дня знизу + запас на неточність вимірювання
    const usableH = Math.max(200, el.clientHeight - headerOffsetReal - BOTTOM_BUFFER);
    const autoPxPerMinBase = availGridH / totalMin; // той самий множник, що й у реальному PX_PER_MIN
    const targetHpx = Math.max(30, Math.round(usableH / (n * autoPxPerMinBase))); // нижня межа 30 (а не 60) — довгий день теж вміщується
    // Мета "Авто" — бачити ВСІ записи одразу, без ручного скролу (не просто
    // підібрати висоту рядка). Тому разом зі зміною hourHeightPx запам'ятовуємо
    // час першого запису — окремий ефект нижче проскролить до нього, коли
    // DOM вже перерахує розмітку під нову висоту.
    setSettings(s => {
      if (Math.abs((s.hourHeightPx || 60) - targetHpx) < 1) return s;
      autoScrollToMinRef.current = minStart;
      return { ...s, hourHeightPx: targetHpx };
    });
  };
  useEffect(() => { runAutoHeightRef.current(); }, [settings.autoHourHeight]);
  // Span видимих днів змінився відносно останнього розрахунку (нові записи/слоти) — перерахувати.
  useEffect(() => {
    if (!settings.autoHourHeight) return;
    if (calcAutoSpan().key !== lastAutoKeyRef.current) runAutoHeightRef.current();
  });

  // Прокрутка до першого запису — спрацьовує тільки після авто-перерахунку
  // висоти (autoScrollToMinRef виставляється лише вище), не після ручного
  // pinch-zoom чи кнопок 8/9/10/12.
  useLayoutEffect(() => {
    const targetMin = autoScrollToMinRef.current;
    if (targetMin == null) return;
    autoScrollToMinRef.current = null;
    const el = gridRef.current;
    if (!el) return;
    // minToPx рахує позицію ВІДНОСНО "SLOT CONTENT" (сітки годин), а
    // scrollTop — відносно всього скрольованого контейнера. Раніше офсет
    // між ними рахувався константами (paddingTop колонок + HEADER_H +
    // marginBottom) — теоретично правильно, але на практиці лишався
    // залишковий здвиг у кілька-кільканадцять px (сабпіксельні заокруглення,
    // тіні/бордери шапки тощо). Тому міряємо offset НАПРЯМУ з DOM: timeColRef
    // — це якраз елемент з top:0 у точці, де minToPx()=0.
    const timeCol = timeColRef.current;
    const gridOffsetTop = timeCol
      ? timeCol.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop
      : (2 + HEADER_H + 10); // резервне значення, якщо ref ще не змонтований
    const y = gridOffsetTop + (targetMin - wsMinAbs) * PX_PER_MIN;
    // Шапка дати "плаває" (position:sticky) поверх контенту під час скролу —
    // верхні HEADER_H px видимої області завжди перекриті нею. Тому відступ
    // зверху має бути не просто "трохи" (8px), а щонайменше HEADER_H, інакше
    // перший запис ховається під шапкою.
    el.scrollTop = Math.max(0, y - HEADER_H - 8);
  }, [settings.hourHeightPx]); // eslint-disable-line react-hooks/exhaustive-deps

  const minToPx = (m) => (m - wsMinAbs) * PX_PER_MIN;

  const onPointerDown = (e, b, mode) => {
    if (e.button > 0) return; // права кнопка миші — лише контекстне меню (відкриває деталі), без перетягування
    if (scheduleLocked) {
      // Замочок закритий — редагування заборонене, але дотик на записі/блоці все одно
      // мусить дозволяти свайп-гортання розкладу (не лише порожні ділянки сітки).
      e.stopPropagation();
      pendingDragRef.current = { id:b.id, startClientY:e.clientY, startClientX:e.clientX, locked:true };
      return;
    }
    e.preventDefault(); e.stopPropagation();
    clearTimeout(holdTimerRef.current);
    holdTimerRef.current = null;
    const isBlock = b.type === "block";
    // Зберігаємо початкові позиції всіх сегментів — потрібно для відновлення слотів в onUp
    const dragIds = b._mergedIds ? [b.id, ...b._mergedIds] : [b.id];
    const origPositions = bookings
      .filter(x => dragIds.includes(x.id))
      .map(x => ({ id: x.id, startMin: x.startMin, durMin: x.durMin, day: x.day }));
    const dragData = { id:b.id, mergedIds:b._mergedIds||null, mode, isBlock, startClientY:e.clientY, startClientX:e.clientX, startMinutes:b.startMin, startDur:b.durMin, startDay:b.day, origPositions };
    activeDragIds?.current?.add(b.id);
    if (b._mergedIds) b._mergedIds.forEach(id => activeDragIds?.current?.add(id));

    if (mode === "top" || mode === "bottom") {
      navigator.vibrate?.(6);
      pendingDragRef.current = dragData;
      holdTimerRef.current = setTimeout(() => {
        if (!pendingDragRef.current || pendingDragRef.current.id !== b.id) return;
        resizeReadyRef.current = b.id;
        navigator.vibrate?.([15, 20, 35]);
      }, 500);
      return;
    }

    navigator.vibrate?.(6);
    pendingDragRef.current = dragData;
    if (!isBlock) {
      // Звичайні слоти: 700мс утримання → значок скасування + розблокування drag
      setHoldId(b.id);
      holdTimerRef.current = setTimeout(() => {
        if (!pendingDragRef.current) return;
        setHoldId(null);
        quickCancelRef.current = b.id;   // встановлюємо ref одразу (не чекаємо ре-рендер)
        setQuickCancelId(b.id);          // оновлюємо стан для відображення іконки
        xVisibleRef.current = true;
        xJustShownRef.current = true;
        setTimeout(() => { xJustShownRef.current = false; }, 400);
        navigator.vibrate?.([30, 40, 60]);
      }, 700);
    }
    // Блоки: жодного hold-таймера — drag активується одразу при русі >4px в onMove
  };

  // Нативне гортання по порожньому місці — пан по обох осях одразу, тому вертикальний свайп із
  // невеликим боковим зсувом тягнув розклад убік. Фіксуємо вісь за перші ~8px руху: поза віссю
  // повертаємо scrollLeft/scrollTop до значення на початку жесту (інерцію не чіпаємо).
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    let g = null, unlockT = 0;
    const onStart = (e) => {
      clearTimeout(unlockT);
      g = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY, sl: el.scrollLeft, st: el.scrollTop, axis: null } : null;
    };
    const onMoveT = (e) => {
      if (!g || e.touches.length !== 1) { g = null; return; }
      if (!g.axis) {
        const dx = Math.abs(e.touches[0].clientX - g.x), dy = Math.abs(e.touches[0].clientY - g.y);
        if (Math.hypot(dx, dy) > 8) g.axis = dx > dy * 1.15 ? "x" : "y";
      }
    };
    const onEnd = () => { clearTimeout(unlockT); unlockT = setTimeout(() => { g = null; }, 700); };
    const onScrollLock = () => {
      if (!g || !g.axis || swipeRef.current?.manualScroll) return;
      if (g.axis === "x") { if (el.scrollTop !== g.st) el.scrollTop = g.st; }
      else if (el.scrollLeft !== g.sl) el.scrollLeft = g.sl;
    };
    // ПК: затиснута ліва кнопка миші на порожньому місці сітки (фон колонки, data-pan) тягне розклад у будь-який бік.
    // Дотики (touch) не чіпаємо — там нативне панорамування з блокуванням осі.
    let mp = null;
    const mDown = (e) => {
      if (e.pointerType !== "mouse" || e.button !== 0 || !e.target?.hasAttribute?.("data-pan")) return;
      mp = { x: e.clientX, y: e.clientY, sl: el.scrollLeft, st: el.scrollTop, moved: false };
    };
    const mMove = (e) => {
      if (!mp) return;
      const dx = e.clientX - mp.x, dy = e.clientY - mp.y;
      if (!mp.moved) {
        if (Math.hypot(dx, dy) < 5) return;
        mp.moved = true;
        clearTimeout(emptyHoldTimerRef.current); emptyHoldPosRef.current = null; // це тягнення, а не довге натискання «новий слот»
        el.style.cursor = "grabbing";
      }
      el.scrollLeft = mp.sl - dx;
      el.scrollTop = mp.st - dy;
    };
    const mUp = () => { if (mp?.moved) el.style.cursor = ""; mp = null; };
    el.addEventListener("pointerdown", mDown);
    window.addEventListener("pointermove", mMove);
    window.addEventListener("pointerup", mUp);
    window.addEventListener("pointercancel", mUp);
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMoveT, { passive: true });
    el.addEventListener("touchend", onEnd, { passive: true });
    el.addEventListener("touchcancel", onEnd, { passive: true });
    el.addEventListener("scroll", onScrollLock, { passive: true });
    return () => {
      clearTimeout(unlockT);
      el.removeEventListener("pointerdown", mDown);
      window.removeEventListener("pointermove", mMove); window.removeEventListener("pointerup", mUp); window.removeEventListener("pointercancel", mUp);
      el.removeEventListener("touchstart", onStart); el.removeEventListener("touchmove", onMoveT);
      el.removeEventListener("touchend", onEnd); el.removeEventListener("touchcancel", onEnd);
      el.removeEventListener("scroll", onScrollLock);
    };
  }, []);

  // ── Копіювання запису ─────────────────────────────────────────────
  // Дії віял. Усі пишуть у bookings/{userId}/{key} тим самим способом, що й решта update у файлі
  const bookingFbKey = (b) => b._fbKey || b.id;
  const saveLesson = (b, rating, note) => {
    const patch = { lessonRating: rating || null, lessonNote: note || null, lessonRatedAt: Date.now() };
    if (b.userId) update(iRef(`bookings/${b.userId}/${bookingFbKey(b)}`), patch).catch(()=>{});
    setBookings(bs => bs.map(x => x.id === b.id ? { ...x, ...patch } : x));
    setRatePanel(null);
    showCopyToast("Збережено");
  };
  const requestReview = (b) => {
    const at = Date.now();
    update(iRef(`bookings/${b.userId}/${bookingFbKey(b)}`), { reviewRequestedAt: at }).catch(()=>{});
    setBookings(bs => bs.map(x => x.id === b.id ? { ...x, reviewRequestedAt: at } : x));
    showCopyToast("Запит на відгук надіслано");
  };
  const openFan = (e, side, b, canReview) => {
    const r = e.currentTarget.getBoundingClientRect();
    setFan({ side, b, cx: r.left + r.width / 2, cy: r.top + r.height / 2, canReview });
  };
  const fanItems = () => {
    if (!fan) return [];
    const { b, side, cx, cy, canReview } = fan;
    const done = () => { copyPastedAtRef.current = Date.now(); setFan(null); };
    const d = phoneDigits(b.phone);
    const go = (url) => () => { done(); window.location.href = url; };
    if (side === "r") return [
      { k:"call",  icon:<MetalIcon name="phone" size={30}/>, label:"Подзвонити",   on:!!d, bg:"linear-gradient(145deg,#4ade80,#15803d)", run:go(`tel:+${d}`) },
      { k:"chat",  icon:<MetalIcon name="chat" size={30}/>, label:"Чат у застосунку", on:!!b.userId, bg:"linear-gradient(145deg,#60a5fa,#1d4ed8)",
        run:() => { done(); window.__openChatUid = b.userId; navTo?.("chats"); } },
      { k:"viber", icon:ICON_VIBER, label:"Viber",     on:!!d, bg:"#7360F2", run:go(`viber://chat?number=%2B${d}`) },
      { k:"tg",    icon:ICON_TG, label:"Telegram",  on:!!d, bg:"#2AABEE", run:go(`https://t.me/+${d}`) },
    ];
    return [
      { k:"note", icon:<MetalIcon name="note" size={30}/>, label:"Нотатка до уроку", on:true, bg:"linear-gradient(145deg,#c084fc,#7e22ce)",
        run:() => { setFan(null); setRatePanel({ b, cx, cy }); } },
      { k:"rate",  icon:<MetalIcon name="star" size={30}/>, label:"Оцінка уроку", on:true, bg:"linear-gradient(145deg,#fbbf24,#d97706)",
        run:() => { setFan(null); setRatePanel({ b, cx, cy }); } },
      { k:"rev",   icon:<MetalIcon name="mega" size={30}/>, label:"Попросити відгук", on:canReview, bg:"linear-gradient(145deg,#fb923c,#c2410c)",
        run:() => { done(); requestReview(b); } },
    ];
  };
  const showCopyToast = (msg) => {
    setCopyToast(msg);
    clearTimeout(copyToastTimerRef.current);
    copyToastTimerRef.current = setTimeout(() => setCopyToast(null), 2200);
  };
  // Чи перетинається інтервал з активним записом того ж дня (скасовані та vip-слоти не рахуємо)
  const copyIsBusy = (dateStr, startMin, durMin) => {
    const now = Date.now();
    copyRecentRef.current = copyRecentRef.current.filter(r => now - r.t < 4000);
    const hit = (x) => startMin < x.startMin + x.durMin && startMin + durMin > x.startMin;
    if (copyRecentRef.current.some(r => r.dateStr === dateStr && hit(r))) return true;
    return (bookingsRef.current || []).some(x =>
      x.status !== "cancelled" && x.type !== "vip-slot" && x.startMin != null && x.durMin &&
      (x.date || absDayToDateStr(x.day)) === dateStr && hit(x));
  };
  // Створення копії: той самий шлях, що й новий запис адміна (bookings/{uid}/{id} + блокування слотів)
  const pasteCopy = (src, dateStr, startMin) => {
    if (!src || !src.userId || !dateStr || startMin == null || !src.durMin) return false;
    const { workStart, workEnd } = calcRef.current;
    const durMin = src.durMin;
    if (startMin < workStart * 60 || startMin + durMin > workEnd * 60) { showCopyToast("Поза робочим часом"); return false; }
    if (copyIsBusy(dateStr, startMin, durMin)) { navigator.vibrate?.([20, 30, 20]); showCopyToast("Час зайнятий"); return false; }
    const id = `b-${Date.now()}`;
    const fbData = {
      id, date: dateStr, time: fmtTime(startMin),
      startMin, durMin, durationHours: durMin / 60,
      studentName: src.name, name: src.name, phone: src.phone || "",
      ...(src.serviceId && { serviceId: src.serviceId }),
      serviceType: src.type, type: src.type,
      status: "confirmed", hours: 0,
      createdAt: Date.now(), createdBy: "admin",
    };
    update(iRef( `bookings/${src.userId}/${id}`), fbData).catch(()=>{});
    blockSlotRange(dateStr, startMin, durMin, { bookingStart: true }).catch(() => {});
    copyRecentRef.current.push({ dateStr, startMin, durMin, t: Date.now() });
    navigator.vibrate?.(40);
    copyPastedAtRef.current = Date.now();
    return true;
  };
  // Цільовий день/час за позицією пальця — та сама математика, що й у drag запису
  const computeCopyTarget = (clientX, clientY, press) => {
    const gridEl = gridRef.current;
    if (!gridEl) return null;
    const { PX_PER_MIN, snapMin, workStart, workEnd, COL_W, dayOffset, N_DAYS } = calcRef.current;
    const src = press.src;
    const rect = gridEl.getBoundingClientRect();
    const t = gridWrapRef.current?.style.transform;
    const m = t && t.match(/translateX\((-?[\d.]+)px\)/);
    const wrapTx = m ? parseFloat(m[1]) : 0;
    const xInContent = clientX - rect.left + gridEl.scrollLeft - wrapTx;
    let newDay = dayOffset + Math.floor(xInContent / (COL_W + 4));
    newDay = Math.max(0, Math.min(dayOffset + N_DAYS - 1, newDay));
    let s0 = Math.round((src.startMin + (clientY - press.y) / PX_PER_MIN) / snapMin) * snapMin;
    if (s0 < workStart * 60) s0 = workStart * 60;
    if (s0 + src.durMin > workEnd * 60) s0 = workEnd * 60 - src.durMin;
    const dateStr = absDayToDateStr(newDay);
    return { day: newDay, dateStr, startMin: s0, busy: copyIsBusy(dateStr, s0, src.durMin) };
  };
  const copyFnsRef = useRef({});
  copyFnsRef.current = { pasteCopy, computeCopyTarget };
  useEffect(() => {
    const hideIcon = () => setTimeout(() => {
      // Затримка: «привидний» click після відпускання значка не має відкрити картку
      xVisibleRef.current = false; quickCancelRef.current = null; setQuickCancelId(null);
    }, 400);
    const onMv = (e) => {
      const p = copyPressRef.current;
      if (!p) return;
      if (!p.dragging) {
        if (Math.hypot(e.clientX - p.x, e.clientY - p.y) <= 8) return;
        p.dragging = true;
        navigator.vibrate?.(18);
      }
      const g = copyFnsRef.current.computeCopyTarget(e.clientX, e.clientY, p);
      p.target = g;
      setCopyGhost(g ? { ...g, durMin: p.src.durMin } : null);
    };
    const onUpC = (e) => {
      const p = copyPressRef.current;
      if (!p) return;
      copyPressRef.current = null;
      setCopyGhost(null);
      if (p.dragging) {
        if (p.target) copyFnsRef.current.pasteCopy(p.src, p.target.dateStr, p.target.startMin);
      } else {
        setCopySource(p.src);
        navigator.vibrate?.(15);
      }
      hideIcon();
    };
    const onCancelC = () => { copyPressRef.current = null; setCopyGhost(null); };
    window.addEventListener("pointermove", onMv);
    window.addEventListener("pointerup", onUpC);
    window.addEventListener("pointercancel", onCancelC);
    return () => {
      window.removeEventListener("pointermove", onMv);
      window.removeEventListener("pointerup", onUpC);
      window.removeEventListener("pointercancel", onCancelC);
    };
  }, []);

  // Listeners always attached — dragRef gives instant access without useEffect re-fire
  useEffect(() => {
    const onMove = (e) => {
      if (swipeRef.current) {
        // Швидкість пальця (px/ms, згладжена) — щоб на pointerup "докрутити" сітку
        // за інерцією замість миттєвої зупинки. Порожнє місце скролиться нативно
        // (браузер сам додає інерцію); картки записів мають touch-action:none і
        // скролляться вручну через scrollLeft/scrollTop нижче — без цього трекінгу
        // ручний скрол зупинявся різко, на відміну від нативного.
        const _now = performance.now();
        if (swipeRef.current.lastT != null) {
          const _dt = _now - swipeRef.current.lastT;
          if (_dt > 0) {
            const rawVx = (e.clientX - swipeRef.current.lastX) / _dt;
            const rawVy = (e.clientY - swipeRef.current.lastY) / _dt;
            swipeRef.current.vx = (swipeRef.current.vx ?? 0) * 0.7 + rawVx * 0.3;
            swipeRef.current.vy = (swipeRef.current.vy ?? 0) * 0.7 + rawVy * 0.3;
          }
        }
        swipeRef.current.lastT = _now;
        swipeRef.current.lastX = e.clientX;
        swipeRef.current.lastY = e.clientY;
        swipeRef.current.endX = e.clientX;
        swipeRef.current.endY = e.clientY;
        if (!dragRef.current && !pendingDragRef.current && swipeRef.current.manualScroll && gridRef.current) {
          // Абсолютний розрахунок від "якоря" (позиція й scrollLeft/scrollTop
          // у момент, коли manualScroll щойно увімкнувся) — а не накопичення
          // через += по кожній крихітній dx/dy. При += будь-яка втрачена/
          // об'єднана подія pointermove назавжди "губить" частину відстані;
          // тут же кожна подія наново рахує ПОВНУ відстань від якоря, тож
          // рідкісні події не шкодять фінальному результату.
          if (swipeRef.current.scrollAnchorX == null) {
            swipeRef.current.scrollAnchorX = e.clientX;
            swipeRef.current.scrollAnchorY = e.clientY;
            swipeRef.current.scrollStartLeft = gridRef.current.scrollLeft;
            swipeRef.current.scrollStartTop = gridRef.current.scrollTop;
          }
          const totalDx = swipeRef.current.scrollAnchorX - e.clientX;
          const totalDy = swipeRef.current.scrollAnchorY - e.clientY;
          if (Math.abs(totalDx) >= Math.abs(totalDy)) {
            pendingScrollRef.current = { axis: "x", value: swipeRef.current.scrollStartLeft + totalDx };
          } else {
            pendingScrollRef.current = { axis: "y", value: swipeRef.current.scrollStartTop + totalDy };
          }
        }
      }
      if (pendingDragRef.current) {
        const pd = pendingDragRef.current;
        const dxTotal = e.clientX - pd.startClientX;
        const dyTotal = e.clientY - pd.startClientY;
        const moved = Math.hypot(dyTotal, dxTotal);
        // Замочок закритий — жодного drag/resize, дозволяємо лише гортання свайпом
        // (у будь-якому напрямку, бо конкуруючого "редагування" тут немає).
        if (pd.locked) {
          if (moved > 8) {
            pendingDragRef.current = null;
            if (swipeRef.current) swipeRef.current.manualScroll = true;
          }
          return;
        }
        // Явно горизонтальний свайп (гортання дня свайпом) — завжди перемикаємось на ручний
        // скрол сітки, незалежно від того, чи почався дотик на записі/блоці/ручці ресайзу.
        // Раніше блоки й ручки ресайзу взагалі не мали шляху до скролу — свайп по них
        // одразу активував drag/resize навіть при суто горизонтальному русі.
        if (moved > 10 && Math.abs(dxTotal) > Math.abs(dyTotal) * 1.7) {
          clearTimeout(holdTimerRef.current);
          holdTimerRef.current = null;
          pendingDragRef.current = null;
          resizeReadyRef.current = null;
          quickCancelRef.current = null;
          xVisibleRef.current = false;
          setQuickCancelId(null);
          setHoldId(null);
          if (swipeRef.current) swipeRef.current.manualScroll = true;
          return;
        }
        if (pd.mode === "top" || pd.mode === "bottom" || pd.isBlock) {
          if ((pd.mode === "top" || pd.mode === "bottom") && resizeReadyRef.current !== pd.id) {
            // Hold не спрацював — скасовуємо resize якщо палець рухається (scroll wins)
            if (moved > 8) {
              clearTimeout(holdTimerRef.current);
              pendingDragRef.current = null;
              if (swipeRef.current) swipeRef.current.manualScroll = true;
            }
            return;
          }
          // Блок або resize після hold: активуємо drag при русі >4px
          if (moved > 4) {
            clearTimeout(holdTimerRef.current);
            dragRef.current = {...pd};
            pendingDragRef.current = null;
            resizeReadyRef.current = null;
            setDragId(pd.id);
            navigator.vibrate?.(18);
          }
          return;
        }
        // Звичайний move: drag тільки якщо hold вже спрацював (quickCancelRef встановлено)
        if (moved > 8) {
          clearTimeout(holdTimerRef.current);
          holdTimerRef.current = null;
          if (quickCancelRef.current !== null) {
            // Утримання вже спрацювало — рішучий горизонтальний свайп (не вертикальний,
            // той лишається за drag/перенесенням) трактуємо як швидку дію замість
            // перетягування: вліво = скасувати, вправо = підтвердити. Спрацьовує лише
            // ПІСЛЯ hold, тому не конкурує з миттєвим свайпом-скролом по картці.
            if (Math.abs(dxTotal) > 30 && Math.abs(dxTotal) > Math.abs(dyTotal) * 1.5) {
              pendingDragRef.current = null;
              quickCancelRef.current = null;
              xVisibleRef.current = false;
              setQuickCancelId(null);
              setHoldId(null);
              const bk = (bookingsRef.current || []).find(x => x.id === pd.id);
              if (bk && !pd.isBlock) {
                navigator.vibrate?.(dxTotal < 0 ? [20, 30, 20] : 40);
                handleActionRef.current?.(dxTotal < 0 ? "cancel" : "confirm", bk);
              }
              return;
            }
            // Hold був — дозволяємо drag
            dragRef.current = {...pd};
            pendingDragRef.current = null;
            quickCancelRef.current = null;
            xVisibleRef.current = false;
            setQuickCancelId(null);
            setHoldId(null);
            setDragId(pd.id);
            navigator.vibrate?.(55);
          } else {
            // Hold не відбувся — ручний скрол grid
            pendingDragRef.current = null;
            setHoldId(null);
            if (swipeRef.current) swipeRef.current.manualScroll = true;
          }
        }
        return;
      }
      if (!dragRef.current) return;
      const drag = dragRef.current;
      const { PX_PER_MIN, snapMin, workStartMin, workEndMin, COL_W, dayOffset, N_DAYS } = calcRef.current;
      const snap = (m) => Math.round(m / snapMin) * snapMin;
      const dy = e.clientY - drag.startClientY;
      const dxRaw = e.clientX - drag.startClientX;
      const deltaMin = dy / PX_PER_MIN;
      const setBookingsFn = setBookingsRef.current || setBookings;
      const allDragIds = drag.mergedIds ? new Set(drag.mergedIds) : new Set([drag.id]);
      setBookingsFn(bs => {
        const baseBooking = bs.find(b => b.id === drag.id);
        if (!baseBooking) return bs;

        if (drag.mode === "move") {
          // Цільовий день — від абсолютної позиції вказівника над сіткою (стійко до скролу),
          // а не від зсуву dxRaw, який ламається при горизонтальному скролі сітки.
          let newDay;
          const gridEl = gridRef.current;
          if (gridEl) {
            const rect = gridEl.getBoundingClientRect();
            // Subtract any leftover swipe transform so column calc stays accurate
            const wrapTx = (() => {
              const t = gridWrapRef.current?.style.transform;
              const m = t && t.match(/translateX\((-?[\d.]+)px\)/);
              return m ? parseFloat(m[1]) : 0;
            })();
            const xInContent = e.clientX - rect.left + gridEl.scrollLeft - wrapTx;
            newDay = dayOffset + Math.floor(xInContent / (COL_W + 4));
          } else {
            newDay = drag.startDay + Math.round(dxRaw / (COL_W + 4));
          }
          // Clamp to today..future — dragging to past days not allowed
          newDay = Math.max(0, Math.min(dayOffset + N_DAYS - 1, newDay));

          // Уся об'єднана картка рухається як єдина жорстка група (зберігаючи зсуви сегментів)
          const segIds = drag.mergedIds && drag.mergedIds.length ? [drag.id, ...drag.mergedIds] : [drag.id];
          const segs = bs.filter(b => segIds.includes(b.id));
          if (!segs.length) return bs;
          const baseStart = snap(drag.startMinutes + deltaMin);
          const targets = segs.map(b => ({
            id: b.id, durMin: b.durMin,
            s: baseStart + (b.startMin - baseBooking.startMin),
          }));
          // Зсув групи в межі робочих годин (без стиснення відносних позицій)
          const minS = Math.min(...targets.map(t => t.s));
          const maxE = Math.max(...targets.map(t => t.s + t.durMin));
          let shift = 0;
          if (minS < workStartMin) shift = workStartMin - minS;
          if (maxE + shift > workEndMin) shift = Math.min(shift, workEndMin - maxE);
          targets.forEach(t => { t.s += shift; });
          // Атомарна перевірка накладання — якщо хоч один сегмент конфліктує, тримаємо всю групу
          const overlap = targets.some(t => bs.some(x =>
            !segIds.includes(x.id) && x.day === newDay &&
            t.s < x.startMin + x.durMin && t.s + t.durMin > x.startMin));
          if (overlap) return bs;
          const tMap = new Map(targets.map(t => [t.id, t.s]));
          return bs.map(b => tMap.has(b.id) ? { ...b, startMin: tMap.get(b.id), day: newDay } : b);
        }

        return bs.map(b => {
          if (b.id !== drag.id) return b; // resize торкається лише первинного сегмента
          if (drag.mode === "bottom") {
            let d = snap(drag.startDur + deltaMin);
            const nextStart = bs.filter(x=>!allDragIds.has(x.id)&&x.day===b.day&&x.startMin>b.startMin)
              .reduce((mn,x)=>Math.min(mn,x.startMin), workEndMin);
            d = Math.min(Math.max(30, d), nextStart - b.startMin); // мінімум 30 хв, але ніколи не наїжджаємо на наступний запис
            return {...b, durMin:d};
          } else if (drag.mode === "top") {
            let s = snap(drag.startMinutes + deltaMin);
            const maxS = drag.startMinutes + drag.startDur - 30;
            const floorStart = bs.filter(x=>!allDragIds.has(x.id)&&x.day===b.day&&x.startMin+x.durMin<=drag.startMinutes)
              .reduce((mx,x)=>Math.max(mx,x.startMin+x.durMin), workStartMin);
            s = Math.max(floorStart, Math.min(maxS, s));
            const diff = s - drag.startMinutes;
            return {...b, startMin:s, durMin: drag.startDur - diff};
          }
          return b;
        });
      });
    };
    const onUp = () => {
      const wasDragging = !!dragRef.current;
      const draggedMeta = dragRef.current;
      const endedId = draggedMeta?.id ?? pendingDragRef.current?.id;
      const endedMergedIds = draggedMeta?.mergedIds ?? pendingDragRef.current?.mergedIds ?? null;

      // Особиста подія: drag "move" лише пересуває картку локально (React
      // state) — Firebase досі показує СТАРИЙ час заблокованим, а НОВИЙ час
      // лишається вільним/бронювальним для студента. Синхронізуємо тут.
      // Розтягування (top/bottom) раніше міняло лише локальний стан — тривалість
      // не потрапляла в Firebase і після перезавантаження поверталась стара.
      if (wasDragging && (draggedMeta.mode === "top" || draggedMeta.mode === "bottom") && !draggedMeta.isBlock &&
          !(draggedMeta.mergedIds && draggedMeta.mergedIds.length)) {
        const fb = (bookingsRef.current || []).find(b => b.id === draggedMeta.id);
        if (fb && (fb.durMin !== draggedMeta.startDur || fb.startMin !== draggedMeta.startMinutes)) {
          const dStr = fb.date || absDayToDateStr(fb.day);
          const key = fb._fbKey || fb.id;
          const startChanged = fb.startMin !== draggedMeta.startMinutes;
          if (fb.type === "personal") {
            const oldUpd = {};
            for (let i = 0; i < draggedMeta.startDur; i += 30) {
              const m = draggedMeta.startMinutes + i;
              oldUpd[`timeslots/${dStr}/slot${String(Math.floor(m / 60)).padStart(2, "0")}${String(m % 60).padStart(2, "0")}`] = null;
            }
            Promise.resolve(Object.keys(oldUpd).length ? update(iRef("/"), oldUpd) : null)
              .then(() => blockPersonalSlots(dStr, fb.startMin, fb.durMin)).catch(() => {});
            update(iRef(`bookings/personal/${key}`), {
              time: fmtTime(fb.startMin), startMin: fb.startMin, durMin: fb.durMin,
              ...(startChanged && { reminderSent: false }),
            }).catch(() => {});
          } else if (fb.userId && fb.type !== "block" && fb.type !== "vip-slot") {
            // Початок змінився — це «перенесення», слоти перебудує бекенд; інакше — тут.
            update(iRef(`bookings/${fb.userId}/${key}`), {
              time: fmtTime(fb.startMin), startMin: fb.startMin, durMin: fb.durMin, durationHours: fb.durMin / 60,
            }).catch(() => {});
            if (!startChanged) {
              const keep = (bookingsRef.current || [])
                .filter(x => x.id !== fb.id && x.status !== "cancelled" && x.type !== "vip-slot" && (x.date || absDayToDateStr(x.day)) === dStr)
                .map(x => [x.startMin, x.startMin + x.durMin]);
              resyncDurSlots(dStr, fb.startMin, draggedMeta.startDur, fb.durMin, keep).catch(() => {});
            }
          }
        }
      }
      if (wasDragging && draggedMeta.mode === "move" && !draggedMeta.isBlock) {
        const finalB = (bookingsRef.current || []).find(b => b.id === draggedMeta.id);
        if (finalB && finalB.type === "personal" &&
            (finalB.day !== draggedMeta.startDay || finalB.startMin !== draggedMeta.startMinutes)) {
          const oldDateStr = absDayToDateStr(draggedMeta.startDay);
          const newDateStr = absDayToDateStr(finalB.day);
          // Старий час прибираємо повністю (а не звільняємо і не позначаємо
          // заблокованим) — жодної кольорової клітинки там лишатись не має,
          // ніби особистої події там ніколи й не було.
          const oldUpd = {};
          for (let i = 0; i < draggedMeta.startDur; i += 30) {
            const m = draggedMeta.startMinutes + i;
            const sh = String(Math.floor(m / 60)).padStart(2, "0");
            const sm = String(m % 60).padStart(2, "0");
            oldUpd[`${slotRoot()}/${oldDateStr}/slot${sh}${sm}`] = null;
          }
          if (Object.keys(oldUpd).length) update(iRef(), oldUpd).catch(() => {});
          blockPersonalSlots(newDateStr, finalB.startMin, finalB.durMin);
          const hh = String(Math.floor(finalB.startMin / 60)).padStart(2, "0");
          const mm = String(finalB.startMin % 60).padStart(2, "0");
          const key = finalB._fbKey || finalB.id;
          // Час змінився — старе "reminderSent" від попереднього часу більше
          // не діє, інакше нагадування-будильник на новий час взагалі не
          // прийде (sendPersonalEventReminders пропускає reminderSent:true).
          update(iRef( `bookings/personal/${key}`), { date: newDateStr, time: `${hh}:${mm}`, startMin: finalB.startMin, reminderSent: false }).catch(() => {});
        } else if (finalB && finalB.type !== "personal" &&
                   !(draggedMeta.mergedIds && draggedMeta.mergedIds.length)) {
          // Реальний одиночний запис клієнта (НЕ злитий merged-блок з кількох
          // записів — для тих поки лишаємо стару поведінку, див. нижче чому) —
          // перетягування раніше міняло лише локальний React-стан і НІЧОГО не
          // писало в Firebase, тому onBookingChanged на бекенді (пуш студенту
          // + блокування нового слоту) не спрацьовував. Синхронізацію
          // timeslots і сам пуш бере на себе бекенд — тут достатньо записати
          // нові date/time/startMin.
          //
          // Merged-блок (кілька окремих бронювань, злитих візуально в одну
          // картку — напр. клієнт бронював 3 окремі години поспіль) свідомо
          // НЕ зберігаємо тут: запис одразу в кілька bookingId одночасно
          // запускає onBookingChanged кілька разів паралельно, і в проді це
          // одного разу залишило по собі купу сирітських заблокованих
          // 30-хвилинних слотів на весь вечір. Поки не протестовано safely —
          // для merged drag міняється лише локальний стан, як було раніше.
          const seg = (bookingsRef.current || []).find(b => b.id === draggedMeta.id);
          if (seg && seg.userId &&
              (seg.day !== draggedMeta.startDay || seg.startMin !== draggedMeta.startMinutes)) {
            const newDateStr = absDayToDateStr(seg.day);
            const key = seg._fbKey || seg.id;
            update(iRef( `bookings/${seg.userId}/${key}`), {
              date: newDateStr, time: fmtTime(seg.startMin), startMin: seg.startMin,
            }).catch(() => {});
          }
        }
      }

      dragRef.current = null;
      setDragId(null);
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
      pendingDragRef.current = null;
      setHoldId(null);
      resizeReadyRef.current = null;
      if (!xVisibleRef.current) {
        quickCancelRef.current = null;
        setQuickCancelId(null);
      }
      if (wasDragging) {
        dragEndedRef.current = true;
        setTimeout(() => { dragEndedRef.current = false; }, 400);
      }
      // Remove from activeDragIds after save debounce window, then flush any deferred slot snap
      if (endedId) setTimeout(() => {
        activeDragIds?.current?.delete(endedId);
        endedMergedIds?.forEach(id => activeDragIds?.current?.delete(id));
        if (pendingSlotSnapRef.current && activeDragIds?.current?.size === 0) {
          const { slots, viewing } = pendingSlotSnapRef.current;
          setOpenSlots(slots);
          setViewingSlots(viewing);
          pendingSlotSnapRef.current = null;
        }
      }, 700);
      // Інерція для ручного (JS) скролу карток — без цього доскрол по записах
      // зупинявся миттєво на відміну від нативного скролу по порожньому місцю.
      if (swipeRef.current?.manualScroll && gridRef.current) {
        const sr = gridRef.current;
        const totalDx = swipeRef.current.scrollAnchorX != null ? swipeRef.current.scrollAnchorX - swipeRef.current.endX : 0;
        const totalDy = swipeRef.current.scrollAnchorY != null ? swipeRef.current.scrollAnchorY - swipeRef.current.endY : 0;
        const axis = Math.abs(totalDx) >= Math.abs(totalDy) ? "x" : "y";
        let v = axis === "x" ? (swipeRef.current.vx || 0) : (swipeRef.current.vy || 0);
        if (momentumRef.current) cancelAnimationFrame(momentumRef.current);
        v = Math.max(-2.5, Math.min(2.5, v)); // клемп викидів швидкості (рідкісні згруповані pointermove)
        if (Math.abs(v) > 0.02) {
          // Згасання прив'язане до РЕАЛЬНОГО часу (Math.pow(decay, dt)), а не до кадру
          // (v *= const щокадрово) — інакше на нерівному фреймрейті (просідання ФПС)
          // ефективна швидкість гальмування стрибає і рух відчувається ривками.
          const DECAY_PER_MS = 0.9965;
          let lastT = performance.now();
          const step = (t) => {
            const dt = t - lastT;
            lastT = t;
            if (axis === "x") sr.scrollLeft -= v * dt;
            else sr.scrollTop -= v * dt;
            v *= Math.pow(DECAY_PER_MS, dt);
            momentumRef.current = Math.abs(v) > 0.02 ? requestAnimationFrame(step) : null;
          };
          momentumRef.current = requestAnimationFrame(step);
        }
      }
      swipeRef.current = null;
      // Reset any leftover swipe transform so it doesn't skew drag column calculations
      if (gridWrapRef.current) {
        gridWrapRef.current.style.transition = "none";
        gridWrapRef.current.style.transform = "";
      }
    };
    const onResize = () => { setWindowW(window.innerWidth); setWindowH(window.innerHeight); };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("resize", onResize);
      clearTimeout(holdTimerRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const touchesRef = useRef([]);
  const onTouchStart = (e) => {
    if (e.touches.length === 2) {
      touchesRef.current = [e.touches[0].clientY, e.touches[1].clientY];
      setPinch({ startDist: Math.abs(e.touches[0].clientY - e.touches[1].clientY), startH: settings.hourHeightPx });
    }
  };
  const onTouchMove = (e) => {
    if (e.touches.length === 2 && pinch) {
      const dist = Math.abs(e.touches[0].clientY - e.touches[1].clientY);
      const ratio = dist / pinch.startDist;
      setSettings(s => ({...s, hourHeightPx: Math.max(30, Math.min(160, Math.round(pinch.startH * ratio)))}));
    }
  };
  const onTouchEnd = () => setPinch(null);

  const onWheel = (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      setSettings(s => ({...s, hourHeightPx: Math.max(30, Math.min(160, s.hourHeightPx - Math.sign(e.deltaY) * 6))}));
    }
  };

  // Обідня перерва того дня, в хвилинах — для перевірки при перетягуванні/
  // розтягуванні вільних слотів (settingsRef, бо effects нижче мають [] deps).
  const lunchForDate = (dateStr) => {
    const s = settingsRef.current;
    const dow = (new Date(dateStr + "T12:00:00").getDay() + 6) % 7;
    const ov = (s.dateOverrides || []).find(o => o.date === dateStr);
    const ws = (s.weekSchedule || [])[dow] || {};
    return {
      enabled: ov?.lunchEnabled ?? ws.lunchEnabled ?? s.lunchEnabled ?? true,
      start:   (ov?.lunchStart ?? ws.lunchStart ?? s.lunchStart ?? 12) * 60,
      end:     (ov?.lunchEnd   ?? ws.lunchEnd   ?? s.lunchEnd   ?? 13) * 60,
    };
  };

  // Перетягування вільних (зелених) слотів вгору/вниз по колонці дня — крок з Кроку часу (snapMin).
  // Заблоковані/VIP/з надбавкою слоти не рухаємо (freeDragRef активується лише для звичайних вільних).
  useEffect(() => {
    const onMove = (e) => {
      const fd = freeDragRef.current;
      if (!fd) return;
      const dy = e.clientY - fd.startClientY;
      const dx = e.clientX - (fd.startClientX ?? e.clientX);
      // Довгий тап відбувся, але після нього палець поїхав радше горизонтально,
      // ніж вертикально (звичайний свайп гортання днів, а не намір тягнути
      // слот) — відпускаємо жест повністю й передаємо керування ручному скролу.
      // РАНІШЕ горизонтальна гілка вимагала dx>1.7dy (асиметрично суворіше, ніж
      // вертикальна, якій було досить dy>10 незалежно від dx) — повільний свайп,
      // що встигав "озброїти" перетягування до 8px зсуву в pre-arm перевірці,
      // тут знову губився. Тепер обидві гілки симетричні: просто яка вісь більша.
      if (!fd.moved && Math.hypot(dx, dy) > 10) {
        if (Math.abs(dx) >= Math.abs(dy)) {
          freeDragRef.current = null;
          setFreeDragPreview(null);
          if (swipeRef.current) swipeRef.current.manualScroll = true;
          return;
        }
        fd.moved = true;
        clearTimeout(slotHoldTimerRef.current);
        navigator.vibrate?.(15);
      }
      if (!fd.moved) return;
      const { PX_PER_MIN, snapMin, workStartMin, workEndMin } = calcRef.current;
      const deltaMin = dy / PX_PER_MIN;
      let ns = Math.round((fd.startMin + deltaMin) / snapMin) * snapMin;
      ns = Math.max(workStartMin, Math.min(ns, workEndMin - 60));
      fd.newStart = ns;
      setFreeDragPreview({ dateStr: fd.dateStr, time: fd.time, newStart: ns });
    };
    const onUp = () => {
      const fd = freeDragRef.current;
      if (!fd) return;
      freeDragRef.current = null;
      setFreeDragPreview(null);
      if (!fd.moved) {
        // Довгий тап спрацював, але пальцем так і не поворухнули — це не
        // переміщення, а запит на модалку опцій слота (VIP/надбавка/скидання).
        setSlotOptions({ dateStr: fd.dateStr, time: fd.time, startTime: fd.time, slot: fd.slot });
        return;
      }
      slotHoldFiredRef.current = true; // не даємо onClick одразу перемкнути слот після drag
      setTimeout(() => { slotHoldFiredRef.current = false; }, 60);
      const h = String(Math.floor(fd.newStart / 60)).padStart(2, "0");
      const m = String(fd.newStart % 60).padStart(2, "0");
      const newTime = `${h}:${m}`;
      if (newTime === fd.time) return;
      const durMin = fd.durMin || 60;
      const newEnd = fd.newStart + durMin;
      const bks = bookingsRef.current || [];
      const occupiedByBooking = bks.some(b => b.date === fd.dateStr && b.startMin < newEnd && b.startMin + b.durMin > fd.newStart);
      if (occupiedByBooking) { navigator.vibrate?.([10,10,10]); return; }
      // Не даємо перетягнути вільний слот на/через обідню перерву того дня.
      const lunch = lunchForDate(fd.dateStr);
      if (lunch.enabled && fd.newStart < lunch.end && newEnd > lunch.start) { navigator.vibrate?.([10,10,10]); return; }
      // Перенесений слот (особливо розтягнутий на кілька годин) може накрити
      // собою інші вільні документи на новому місці — так само, як і
      // розтягування, поглинаємо їх (видаляємо окремі записи); якщо на шляху
      // VIP/блокування/надбавка — рух забороняємо. РАНІШЕ перевірявся лише
      // рівно новий час (newTime), тож "проковтнуті" по дорозі старі годинні
      // документи лишались у базі — і саме вони, а не сам перенесений слот,
      // обрізали видиму висоту до найближчого з них при рендері.
      const daySlots = (openSlotsRef?.current || {})[fd.dateStr] || {};
      const absorbedTimes = [];
      let blocked = false;
      Object.keys(daySlots).forEach(t => {
        if (t === fd.time) return;
        const [h2, m2] = t.split(":").map(Number);
        const tm = h2 * 60 + m2;
        if (tm >= fd.newStart && tm < newEnd) {
          const s2 = daySlots[t];
          const s2Free = s2 && s2.available && !s2.vipOnly && !s2.privateOnly && !s2.adminBlocked && !s2.surcharge && !s2.fixedPrice;
          if (s2Free) absorbedTimes.push(t); else blocked = true;
        }
      });
      if (blocked) { navigator.vibrate?.([10,10,10]); return; }
      const oldSlotId = `slot${fd.time.replace(":", "")}`;
      const newSlotId = `slot${h}${m}`;
      const updates = {};
      updates[`${slotRoot()}/${fd.dateStr}/${oldSlotId}`] = null;
      updates[`${slotRoot()}/${fd.dateStr}/${newSlotId}/available`] = true;
      updates[`${slotRoot()}/${fd.dateStr}/${newSlotId}/time`] = newTime;
      updates[`${slotRoot()}/${fd.dateStr}/${newSlotId}/durMin`] = durMin;
      absorbedTimes.forEach(t => { updates[`${slotRoot()}/${fd.dateStr}/slot${t.replace(":", "")}`] = null; });
      update(iRef(), updates).catch(() => {});
      navigator.vibrate?.(20);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  // Розтягування вільного слота (зміна тривалості) — ручка знизу, крок з Кроку часу (snapMin).
  useEffect(() => {
    const onMove = (e) => {
      const fr = freeResizeRef.current;
      if (!fr) return;
      const dy = e.clientY - fr.startClientY;
      const dx = e.clientX - (fr.startClientX ?? e.clientX);
      // Той самий поріг, що й для перетягування слота — захист від випадкового
      // розтягування через легке тремтіння пальця під час тапу. Якщо рух радше
      // горизонтальний — це свайп днів, що "просочився" через довгий тап на
      // маленькій ручці ресайзу коротких слотів: відпускаємо й передаємо скролу.
      if (!fr.moved && Math.hypot(dx, dy) > 10) {
        if (Math.abs(dx) >= Math.abs(dy)) {
          freeResizeRef.current = null;
          setFreeResizePreview(null);
          if (swipeRef.current) swipeRef.current.manualScroll = true;
          return;
        }
        fr.moved = true;
        navigator.vibrate?.(15);
      }
      if (!fr.moved) return;
      const { PX_PER_MIN, snapMin } = calcRef.current;
      const deltaMin = dy / PX_PER_MIN;
      let nd = Math.round((fr.startDur + deltaMin) / snapMin) * snapMin;
      nd = Math.max(snapMin, Math.min(nd, fr.maxDur));
      fr.newDur = nd;
      setFreeResizePreview({ dateStr: fr.dateStr, time: fr.time, newDur: nd });
    };
    const onUp = () => {
      const fr = freeResizeRef.current;
      if (!fr) return;
      freeResizeRef.current = null;
      setFreeResizePreview(null);
      if (!fr.moved) {
        // Довгий тап на ручці ресайзу спрацював, але пальцем так і не
        // поворухнули — так само, як і довгий тап по самому слоту, це запит
        // на модалку опцій, а не розтягування. РАНІШЕ тут просто нічого не
        // відбувалось — довгий тап у нижній частині короткого слота (де ця
        // ручка займає велику частку висоти) "губився" без відкриття модалки.
        setSlotOptions({ dateStr: fr.dateStr, time: fr.time, startTime: fr.time, slot: fr.slot });
        return;
      }
      if (fr.newDur === fr.startDur) return;
      const [hh, mm] = fr.time.split(":").map(Number);
      const startMin = hh * 60 + mm;
      const newEnd = startMin + fr.newDur;
      // Не даємо розтягнути вільний слот через обідню перерву того дня.
      const lunch = lunchForDate(fr.dateStr);
      if (lunch.enabled && startMin < lunch.end && newEnd > lunch.start) { navigator.vibrate?.([10,10,10]); return; }
      const slotId = `slot${fr.time.replace(":", "")}`;
      const updates = { [`${slotRoot()}/${fr.dateStr}/${slotId}/durMin`]: fr.newDur };
      // Ріст поглинає наступні вільні слоти, у які «в’їхав» новий розмір, —
      // прибираємо їхні окремі документи, щоб не лишалось «розрізаних» дублікатів.
      const daySlots = (openSlotsRef?.current || {})[fr.dateStr] || {};
      const absorbedTimes = [];
      Object.keys(daySlots).forEach(t => {
        if (t === fr.time) return;
        const [h2, m2] = t.split(":").map(Number);
        const tm = h2 * 60 + m2;
        if (tm > startMin && tm < newEnd) {
          updates[`${slotRoot()}/${fr.dateStr}/slot${t.replace(":", "")}`] = null;
          absorbedTimes.push(t);
        }
      });
      // Оптимістично оновлюємо локальний стан одразу — інакше слот на мить
      // «стрибає» назад до старої висоти, поки Firebase не підтвердить запис.
      setOpenSlots(prev => {
        const day = { ...(prev[fr.dateStr] || {}) };
        if (day[fr.time]) day[fr.time] = { ...day[fr.time], durMin: fr.newDur };
        absorbedTimes.forEach(t => delete day[t]);
        return { ...prev, [fr.dateStr]: day };
      });
      if (openSlotsRef) {
        const day = { ...(openSlotsRef.current[fr.dateStr] || {}) };
        if (day[fr.time]) day[fr.time] = { ...day[fr.time], durMin: fr.newDur };
        absorbedTimes.forEach(t => delete day[t]);
        openSlotsRef.current = { ...openSlotsRef.current, [fr.dateStr]: day };
      }
      setFreeResizePreview(null);
      update(iRef(), updates).catch(() => {});
      navigator.vibrate?.(20);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  const hours = [];
  for (let h = settings.workStart; h <= settings.workEnd; h++) hours.push(h);

  // Колір картки — стабільний за клієнтом, і РІЗНІ клієнти гарантовано отримують
  // РІЗНІ кольори (поки їх < 50): порядок призначення визначається часом
  // першого запису клієнта (createdAt), а не хешем — хеш у 10-кольоровій палітрі
  // неминуче колізив уже на кількох клієнтах.
  const studentColorMap = useMemo(() => {
    const firstSeen = new Map();
    for (const b of bookings) {
      if (b.type === "block" || b.type === "vip-slot" || b.type === "personal") continue;
      const key = b.userId || b.phone || b.name;
      if (!key) continue;
      const t = b.createdAt ?? 0;
      if (!firstSeen.has(key) || t < firstSeen.get(key)) firstSeen.set(key, t);
    }
    const keys = [...firstSeen.keys()].sort((a, c) => (firstSeen.get(a) - firstSeen.get(c)) || a.localeCompare(c));
    const map = {};
    keys.forEach((k, i) => { map[k] = STUDENT_PALETTE[i % STUDENT_PALETTE.length]; });
    return map;
  }, [bookings]);
  // Колір, обраний у картці клієнта (studentColors/{uid}), має пріоритет завжди — і при
  // автокольорах теж. Без обраного: автоколір, або нейтральний, якщо автокольори вимкнено.
  const [manualStudentColors, setManualStudentColors] = useState({});
  useEffect(() => {
    const r = iRef("studentColors");
    const h = onValue(r, snap => setManualStudentColors(snap.val() || {}));
    return () => off(r, "value", h);
  }, []);
  const studentColor = (b) => {
    if (b.userId && manualStudentColors[b.userId]) return manualStudentColors[b.userId];
    if (settings.autoStudentColors === false) return MANUAL_DEFAULT_COLOR;
    const key = b.userId || b.phone || b.name || b.id;
    return studentColorMap[key] || STUDENT_PALETTE[0];
  };
  const slotColor = (b) => studentColor(b);

  const handleColumnClick = (e, absDay) => {
    if (dragRef.current || dragEndedRef.current || pendingDragRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const yRel = e.clientY - rect.top;
    const { snapMin, workStartMin, PX_PER_MIN } = calcRef.current;
    const rawMin = workStartMin + yRel / PX_PER_MIN;
    const minute = Math.round(rawMin / snapMin) * snapMin;
    const bData = { day: absDay, startMin: minute, clientX: e.clientX, clientY: e.clientY, dateStr: absDayToDateStr(absDay) };
    setBubbleData(bData);
  };

  const [confirmDlg, confirmNode] = useConfirm();
  const handleAction = (action, b) => {
    if (action === "openMember") { setLocalSelectedBooking(b); return; }
    // Скасування запису (кнопка в картці і свайп) — лише після підтвердження, щоб випадковий тап не скасовував запис
    if (action === "cancel" && !b?._cancelOk) {
      const when = [typeof b.date === "string" ? b.date.split("-").reverse().join(".") : "", b.time || (b.startMin != null ? `${String(Math.floor(b.startMin/60)).padStart(2,"0")}:${String(b.startMin%60).padStart(2,"0")}` : "")].filter(Boolean).join(" ");
      confirmDlg({ title: "Скасувати запис?", text: [b.name, when].filter(Boolean).join(" · "), okLabel: "Скасувати запис", danger: true })
        .then(ok => { if (ok) handleActionRef.current?.("cancel", { ...b, _cancelOk: true }); });
      return;
    }
    if (action === "confirm") { setBookings(bs=>bs.map(x=>x.id===b.id?{...x,status:"confirmed"}:x)); return; }
    if (action === "cancel") {
      // Звільняємо timeslots одразу (миттєвий відгук і запис без акаунта, де
      // функція не спрацьовує). Cloud Function робить те саме тими ж правилами
      // (slotRules): phantom видаляється, справжні слоти повертаються, а вже
      // відсутні не створюються — тому подвійне звільнення нешкідливе.
      const cancelOne = async (mb) => {
        // Спершу статус cancelled (щоб фонові ефекти одразу перестали вважати запис
        // живим), і лише потім звільнення слотів.
        // Позначити cancelled у Firebase (обидва можливих ключі)
        if (mb.userId) {
          const ks = [...new Set([mb._fbKey, mb.id].filter(Boolean))];
          ks.forEach(k => update(iRef( `bookings/${mb.userId}/${k}`),
            { status:"cancelled", cancelledAt:Date.now(), cancelledBy:"admin" }).catch(()=>{}));
        }
        if (mb.startMin !== undefined && mb.durMin && !mb.groupKey) {
          try {
            await restoreSlotRange(mb.date || absDayToDateStr(mb.day), mb.startMin, mb.durMin + bufferOf(mb));
          } catch { /* ignore */ }
        }
      };
      const allToCancel = b._mergedIds
        ? bookings.filter(x => b._mergedIds.includes(x.id))
        : [b];
      allToCancel.forEach(cancelOne);
      // Затемнення 2с → видалення з локального стану
      setCancellingSet(s=>new Set([...s, b.id, ...(b._mergedIds || [])]));
      cancelTimers.current[b.id] = setTimeout(()=>{
        setCancellingSet(s=>{ const ns=new Set(s); ns.delete(b.id); return ns; });
        const idsC = b._mergedIds || [b.id];
        setBookings(bs=>bs.filter(x=>!idsC.includes(x.id)));
        delete cancelTimers.current[b.id];
      }, 2000);
      return;
    }
    if (action === "noshow")  { setBookings(bs=>bs.map(x=>x.id===b.id?{...x,status:"noshow"}:x)); return; }
    if (action === "attended") { setBookings(bs=>bs.map(x=>x.id===b.id?{...x,status:"confirmed"}:x)); return; }
    if (action === "delete")  setBookings(bs=>bs.filter(x=>x.id!==b.id));
    if (action === "repeat")  setBookings(bs=>[...bs,{...b, id:`b-${Date.now()}`, day:b.day+7, status:"confirmed"}]);
    if (action === "chat")     { navTo?.("chats"); return; }
    if (action === "call")     window.location.href=`tel:${b.phone}`;
    if (action === "sms")      window.location.href=`sms:${b.phone}`;
    if (action === "viber")    window.location.href=`viber://chat?number=%2B${b.phone.replace(/\D/g,"")}`;
    if (action === "telegram") window.location.href=`https://t.me/${b.phone.replace(/\D/g,"")}`;
    if (action === "setTag") {
      // Ручний вибір/зняття мітки — позначаємо tagManual, щоб автоматична
      // логіка (порядок запису/борг) більше НІКОЛИ не перезаписувала цей запис.
      // debtAmount передається лише коли майстер явно вписав/змінив суму
      // боргу вручну — інакше залишаємо попереднє значення в Firebase як є.
      const patch = { tag: b.tag || null, tagManual: true };
      if (b.debtAmount !== undefined) patch.debtAmount = b.debtAmount || null;
      setBookings(bs=>bs.map(x=>x.id===b.id?{...x,...patch}:x));
      setLocalSelectedBooking(prev=>prev?{...prev,...patch}:null);
      if (b.userId) {
        const key = b._fbKey || b.id;
        update(iRef( `bookings/${b.userId}/${key}`), patch).catch(()=>{});
      }
      return;
    }
    if (action === "toggleVip") {
      const next = !b.isVipOnly;
      setBookings(bs=>bs.map(x=>x.id===b.id?{...x,isVipOnly:next,categoryId:next?"cat-vip":null}:x));
      setLocalSelectedBooking(prev=>prev?{...prev,isVipOnly:next,categoryId:next?"cat-vip":null}:null);
      return;
    }
    if (action === "editBooking") {
      const patch = {};
      if (b.manualPrice !== undefined) patch.manualPrice = b.manualPrice;
      if (b.durMin !== undefined) { patch.durMin = b.durMin; patch.durationHours = b.durationHours; }
      setBookings(bs=>bs.map(x=>x.id===b.id?{...x,...patch}:x));
      setLocalSelectedBooking(prev=>prev?{...prev,...patch}:null);
      if (b.userId) {
        const key = b._fbKey || b.id;
        update(iRef( `bookings/${b.userId}/${key}`), patch).catch(()=>{});
      }
        const old = (bookingsRef.current || []).find(x => x.id === b.id);
        if (old && b.durMin !== undefined && old.durMin !== b.durMin && old.startMin != null) {
          const dStr = old.date || absDayToDateStr(old.day);
          const keep = (bookingsRef.current || [])
            .filter(x => x.id !== b.id && x.status !== "cancelled" && x.type !== "vip-slot" && (x.date || absDayToDateStr(x.day)) === dStr)
            .map(x => [x.startMin, x.startMin + x.durMin]);
          resyncDurSlots(dStr, old.startMin, old.durMin, b.durMin, keep).catch(() => {});
        }
      return;
    }
    setLocalSelectedBooking(null);
  };
  // handleAction переоголошується щорендеру — тримаємо свіже посилання в ref
  // для listeners, підписаних один раз (useEffect з deps:[]), щоб не звертатись
  // до застарілого closure зі свайп-жесту на картці.
  useEffect(() => { handleActionRef.current = handleAction; });
  const [blockModal, setBlockModal] = useState(null); // {id, day, startMin, durMin}
  const [blockModalClosing, setBlockModalClosing] = useState(false);
  const [broadcastInit, setBroadcastInit] = useState(null);

  const handleBlock = ({ day, startMin }) => {
    setBookings(bs=>[...bs,{
      id:`block-${Date.now()}`, day, startMin, durMin:60,
      name:"ЗАБЛОКОВАНО", phone:"", type:"block",
      hoursDone:0, status:"blocked", serviceId:""
    }]);
  };

  // Блокуємо/звільняємо timeslots під особистою подією — так само, як для
  // звичайного бронювання, щоб студент не міг записатись на цей час.
  const blockPersonalSlots = (dateStr, startMin, durMin) => {
    // personal:true — зайнятість від особистої події адміна, а не запису:
    // клієнтський календар (classifyDay) виключає такі слоти з підрахунку,
    // щоб особиста подія не "підсвічувала" день як зайнятий клієнтам.
    return blockSlotRange(dateStr, startMin, durMin, { bookingStart: true, extra: { personal: true } }).catch(() => {});
  };
  const unblockPersonalSlots = (dateStr, startMin, durMin) => {
    return restoreSlotRange(dateStr, startMin, durMin, { personal: null }).catch(() => {});
  };

  const savePersonalEventEdit = () => {
    const ev = personalEventView;
    if (!ev || !peEditTitle.trim()) return;
    const [nh, nm] = peEditTime.split(":").map(Number);
    const newStartMin = nh * 60 + nm;
    const oldDate = ev.date || absDayToDateStr(ev.day);
    const timeChanged = peEditDate !== oldDate || newStartMin !== ev.startMin || peEditDur !== ev.durMin;
    // Звільнення старого часу має завершитись ДО блокування нового: обидва
    // читають стан дня, і за перетину позицій друге бачило б ще не звільнені.
    const unblocked = timeChanged
      ? unblockPersonalSlots(oldDate, ev.startMin, ev.durMin)
      : Promise.resolve();
    // Завжди перезаписуємо (навіть без зміни часу) — так відкрити й зберегти
    // подію без правок теж проставляє personal:true на її таймслоти, якщо
    // вона була створена до появи цього прапорця.
    unblocked.then(() => blockPersonalSlots(peEditDate, newStartMin, peEditDur));
    const reminderChanged = timeChanged || peEditReminderHours !== (ev.reminderHours || null);
    const patch = {
      date: peEditDate, time: peEditTime, startMin: newStartMin, durMin: peEditDur,
      studentName: peEditTitle.trim(), name: peEditTitle.trim(), note: peEditNote.trim(),
      reminderHours: peEditReminderHours || null,
      ...(reminderChanged ? { reminderSent: false } : {}),
    };
    const key = ev._fbKey || ev.id;
    update(iRef( `bookings/personal/${key}`), patch).catch(() => {});
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const d = new Date(peEditDate); d.setHours(0, 0, 0, 0);
    const newDay = Math.round((d - today) / 86400000);
    setBookings(bs => bs.map(x => x.id === ev.id ? { ...x, ...patch, day: newDay } : x));
    setPersonalEventView(null);
  };

  const deletePersonalEvent = () => {
    const ev = personalEventView;
    if (!ev) return;
    unblockPersonalSlots(ev.date || absDayToDateStr(ev.day), ev.startMin, ev.durMin);
    const key = ev._fbKey || ev.id;
    remove(iRef( `bookings/personal/${key}`)).catch(() => {});
    setBookings(bs => bs.filter(x => x.id !== ev.id));
    setPersonalEventView(null);
  };

  const handleVipSlot = ({ day, startMin }) => {
    const dateStr = absDayToDateStr(day);
    const hh = String(Math.floor(startMin / 60)).padStart(2, "0");
    const mm = String(startMin % 60).padStart(2, "0");
    update(iRef( `${slotRoot()}/${dateStr}/slot${hh}${mm}`), {
      time: `${hh}:${mm}`, available: true, vipOnly: true,
    }).catch(() => {});
  };

  const [vipSlotModal, setVipSlotModal] = useState(null);
  const [vipSlotModalClosing, setVipSlotModalClosing] = useState(false);
  const [slotOptions, setSlotOptions] = useState(null); // { dateStr, time, startTime, slot }
  const [slotClosing, setSlotClosing] = useState(false);
  const [fixedPriceEditing, setFixedPriceEditing] = useState(false);
  const [fixedPriceInput, setFixedPriceInput] = useState("");
  const [surchargeEditing, setSurchargeEditing] = useState(false);
  const [personalEventData, setPersonalEventData] = useState(null); // { dateStr, time }
  const [longTapMenu, setLongTapMenu] = useState(null); // { dateStr, startMin, clientX, clientY }
  const [ltmClosing, setLtmClosing] = useState(false);
  // iOS: клік після відпускання пальця (довгий тап) не має закривати щойно відкриту модалку
  const overlayOpenedAtRef = useRef(0);
  useEffect(() => { if (longTapMenu || slotOptions) overlayOpenedAtRef.current = Date.now(); }, [!!longTapMenu, !!slotOptions]);
  const [ltmScatter, setLtmScatter] = useState(false);
  const [personalEventView, setPersonalEventView] = useState(null); // booking object for viewing
  // Поля форми редагування особистої події (заповнюються при відкритті personalEventView)
  const [peEditTitle,         setPeEditTitle]         = useState("");
  const [peEditDur,           setPeEditDur]           = useState(60);
  const [peEditNote,          setPeEditNote]          = useState("");
  const [peEditDate,          setPeEditDate]          = useState("");
  const [peEditReminderHours, setPeEditReminderHours] = useState(null);
  const [peEditTime,  setPeEditTime]  = useState("");

  const isStickySlot = (dateStr, time) => {
    if (!settings.stickyTimeEnabled) return true;
    const [h, m] = time.split(":").map(Number);
    const slotMin = h * 60 + m;
    const today = new Date(); today.setHours(0,0,0,0);
    const absDay = Math.floor((new Date(dateStr + "T12:00:00") - today) / 86400000);
    const dayBkgs = (bookingsByDay.get(absDay) || EMPTY_LIST).filter(b => b.type !== "block" && b.type !== "vip-slot" && b.type !== "personal");
    const adjBefore = dayBkgs.some(b => b.startMin === slotMin + 60);
    const adjAfter  = dayBkgs.some(b => b.startMin + b.durMin === slotMin);
    if (settings.stickyTime === "before") return adjBefore;
    if (settings.stickyTime === "after")  return adjAfter;
    return adjBefore || adjAfter;
  };

  return (
    <>
    <style>{makeGlobalCSS(SURF_LO, ACCENT, GLOW, SHADE, INK)}</style>
    <Card style={{
      padding:"6px 3px 0", overflow:"hidden", flex:1, minHeight:0, display:"flex", flexDirection:"column",
      // Той самий скляний фон, що й у нижньому навбарі — замість суцільного SURFACE.
      background: isLight ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.04)",
      boxShadow: isLight ? "0 6px 18px rgba(92,42,26,0.12)" : "0 4px 14px rgba(0,0,0,0.22)", // м'якша тінь: різкий темний «пояс» під карткою розкладу заважав плавному переходу до панелі вкладок
    }}>
      <div style={{display:"flex", flex:1, minHeight:0, overflow:"hidden", position:"relative"}}>
        {copySource && (
          <div style={{
            position:"absolute", top:6, left:"50%", transform:"translateX(-50%)", zIndex:40,
            display:"flex", alignItems:"center", gap:8, maxWidth:"calc(100% - 16px)",
            padding:"7px 12px", borderRadius:14, whiteSpace:"nowrap",
            background:"linear-gradient(145deg,#60a5fa,#1d4ed8)", color:"#fff",
            fontSize:12, fontWeight:800, boxShadow:"0 4px 14px rgba(29,78,216,0.55)",
          }}>
            <span style={{overflow:"hidden", textOverflow:"ellipsis"}}><span style={{display:"inline-flex",alignItems:"center",gap:7}}><MetalIcon name="clipboard" size={18}/>{"Оберіть місце для копії"}</span></span>
            <span style={{opacity:0.7}}>·</span>
            <button onClick={()=>{ setCopySource(null); copyTapRef.current = null; }} style={{
              border:"none", background:"rgba(255,255,255,0.22)", color:"#fff", cursor:"pointer",
              fontSize:12, fontWeight:800, padding:"3px 9px", borderRadius:8, fontFamily:"inherit",
            }}>{"Скасувати"}</button>
          </div>
        )}
        {copyToast && (
          <div style={{
            position:"absolute", bottom:16, left:"50%", transform:"translateX(-50%)", zIndex:40,
            padding:"8px 14px", borderRadius:14, whiteSpace:"nowrap", pointerEvents:"none",
            background:"linear-gradient(145deg,#f87171,#b91c1c)", color:"#fff",
            fontSize:12, fontWeight:800, boxShadow:"0 4px 14px rgba(185,28,28,0.55)",
          }}>{copyToast}</div>
        )}
        {fan && <ActionFan side={fan.side} cx={fan.cx} cy={fan.cy} items={fanItems()} onClose={closeFan}/>}
        {ratePanel && <LessonRatePanel b={ratePanel.b} cx={ratePanel.cx} cy={ratePanel.cy} title={"Оцінка уроку"}
          onSave={(r, n) => saveLesson(ratePanel.b, r, n)} onClose={() => setRatePanel(null)}/>}

        {/* TIME COLUMN — fixed left, never scrolls */}
        <div
          onPointerDown={e=>{
            // Стовпчик часу — не нащадок gridRef, тому onPointerDownCapture на
            // gridRef сюди не долітає — ініціалізуємо swipeRef вручну.
            swipeRef.current = {
              startX:e.clientX, startY:e.clientY, endX:e.clientX, endY:e.clientY, startTime:Date.now(),
              scrollAnchorX: e.clientX, scrollStartLeft: gridRef.current?.scrollLeft ?? 0,
            };
          }}
          onPointerMove={e=>{
            const sr = swipeRef.current;
            if (!sr) return;
            sr.endX = e.clientX;
            sr.endY = e.clientY;
            // Стовпчик часу керує ЛИШЕ горизонтальним гортанням днів — вертикальний
            // скрол годин і так синхронізується автоматично з основної сітки
            // (onScroll ставить transform на timeColRef). Абсолютний розрахунок
            // від якоря (а не += по кожній крихітній dx) — стійкий до рідкісних/
            // згрупованих подій pointermove, які інакше "губили" би частину
            // відстані й свайп днями виглядав як "не працює".
            if (gridRef.current) pendingScrollRef.current = { axis: "x", value: sr.scrollStartLeft + (sr.scrollAnchorX - e.clientX) };
          }}
          style={{
          width:TIME_COL_W, flexShrink:0, zIndex:10,
          display:"flex", flexDirection:"column",
          borderRight:`1px solid ${ink(0.07)}`,
        }}>
          {/* Кнопка «Ключик» — генерувати/зняти всі слоти (перенесено з шапки, календар — тепер у шапці).
              Стиль — та сама плашка, що й замочок знизу (11px-квадрат, градієнт, рамка), піктограма — сітка 2×2. */}
          <div style={{height:HEADER_H + 4, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center"}}>
            {(() => {
              const slotsOn = hasAnyGeneratedSlots();
              const c = slotsOn ? RED : GREEN;
              return (
                <button data-help="key"
                  onClick={isGeneratingAll ? undefined : (slotsOn ? clearAllSlots : generateAllSlots)}
                  title={slotsOn
                    ? `Зняти всі слоти (${settings.slotGenDays||30} днів)`
                    : `Згенерувати слоти на ${settings.slotGenDays||30} днів за графіком`}
                  style={{
                    width:48, height:32, border:"none", cursor: isGeneratingAll?"default":"pointer",
                    background:"transparent", display:"flex", alignItems:"center", justifyContent:"center",
                    flexShrink:0,
                  }}>
                  {isGeneratingAll
                    ? <div style={{width:32, height:32, borderRadius:11, display:"flex", alignItems:"center", justifyContent:"center"}}>
                        <div style={{width:14,height:14,borderRadius:"50%",border:`2px solid color-mix(in srgb,${c} 30%,transparent)`,borderTopColor:c,animation:"spin .7s linear infinite"}}/>
                      </div>
                    : <MetalIcon name="grid" size={32} square color={c}/>}
                </button>
              );
            })()}
          </div>
          <div style={{overflow:"hidden", flex:1, position:"relative"}}>
            <div ref={timeColRef} style={{position:"absolute", top:0, left:0, right:0, height:gridHeight}}>
              {Array.from({length:Math.max(0, Math.floor(weMinAbs/30) - Math.ceil(wsMinAbs/30) + 1)},(_,i)=>{
                // Мітки стоять на справжніх :00 і :30 (початок дня може бути будь-якою хвилиною, напр. 09:07)
                const absMin = (Math.ceil(wsMinAbs/30) + i) * 30;
                const totalMins = absMin - wsMinAbs;
                const h = Math.floor(absMin/60);
                const m = absMin % 60;
                return m === 0 ? (
                  <div key={i} style={{
                    position:"absolute", top:Math.max(2, totalMins*PX_PER_MIN - 5),
                    left:0, right:0, textAlign:"center",
                    fontSize:10, fontWeight:700, lineHeight:1, color:TEXT_DIM,
                  }}>{h}:00</div>
                ) : (
                  <div key={i} style={{
                    position:"absolute", top:totalMins*PX_PER_MIN - 3,
                    left:0, right:0, textAlign:"center",
                    fontSize:7, fontWeight:600, lineHeight:1,
                    color:"rgba(139,141,147,0.5)",
                  }}>{h}:30</div>
                );
              })}
              {nowMin >= wsMinAbs && nowMin <= weMinAbs && (
                <div data-help="nowline" style={{
                  position:"absolute", left:2, right:2, top:minToPx(nowMin),
                  transform:"translateY(-50%)",
                  background:"#ef4444", color:"#fff",
                  fontSize:10, fontWeight:900, lineHeight:1,
                  borderRadius:6, padding:"3px 0", textAlign:"center",
                  boxShadow:"0 2px 8px rgba(239,68,68,0.5)",
                }}>{String(Math.floor(nowMin/60)).padStart(2,"0")}:{String(nowMin%60).padStart(2,"0")}</div>
              )}
            </div>
          </div>
          {/* Замок — в нижній частині стовпця часу, вирівняний із сум-рядком */}
          <div data-help="lock"
            onPointerDown={handleLockDown}
            onPointerUp={handleLockUp}
            onPointerCancel={handleLockUp}
            onContextMenu={e=>e.preventDefault()}
            style={{
              height:36, flexShrink:0, marginBottom:10,
              display:"flex", alignItems:"center", justifyContent:"center",
              WebkitUserSelect:"none", userSelect:"none", touchAction:"none", cursor:"pointer",
            }}
          >
            <MetalIcon name="lock" size={32} square color={scheduleLocked ? RED : GREEN}/>
          </div>
        </div>

        {/* SCROLLABLE GRID — horizontal + vertical */}
        <div
          ref={gridRef}
          onPointerDownCapture={e=>{
            if (momentumRef.current) { cancelAnimationFrame(momentumRef.current); momentumRef.current = null; }
            swipeRef.current={startX:e.clientX,startY:e.clientY,endX:e.clientX,endY:e.clientY,startTime:Date.now()};
          }}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onWheel={onWheel}
          onScroll={e=>{
            if (timeColRef.current)
              timeColRef.current.style.transform = `translateY(-${e.currentTarget.scrollTop}px)`;
            computeVRange();
            const el = e.currentTarget;
            const cw = calcRef.current.COL_W;
            if (cw) {
              const todayX = PAST_DAYS * (cw + 4);
              const sl = el.scrollLeft;
              const nextDir = sl > todayX + cw ? "left" : (sl + el.clientWidth < todayX ? "right" : null);
              // Лише при ЗМІНІ — інакше кожна подія скролу змушувала React виконувати
              // весь рендер розкладу вдруге.
              if (todayDirRef.current !== nextDir) { todayDirRef.current = nextDir; setTodayDir(nextDir); }
            }
          }}
          onContextMenu={e=>e.preventDefault()}
          className="schedule-scroll cal-neon"
          style={{flex:1, overflowX:"auto", overflowY:"auto", touchAction:"pan-x pan-y", WebkitOverflowScrolling:"touch", userSelect:"none", WebkitUserSelect:"none", scrollbarWidth:"none", willChange:"scroll-position"}}
        >
          <div ref={gridWrapRef} style={{display:"flex", paddingTop:2}}>
          <VirtualCols vRangeRef={vRangeRef} subRef={vRangeSubRef} colW={COL_W} nDays={N_DAYS} renderCol={(colIdx)=>{
            const day = getDayInfo(dayOffset + colIdx);
            const absDay = dayOffset + colIdx;
            const dateStrCol = absDayToDateStr(absDay);
            // Записи цього дня — для приховування вільних слотів, які запис накрив
            // (навіть наполовину): такий слот не показуємо й не пропонуємо клієнту.
            // Порівнюємо за абсолютною датою (b.date), а не відносним b.day — той
            // рахується один раз від "сьогодні" в момент обробки снепшоту з Firebase
            // і застаріває, якщо застосунок лишається відкритим через опівніч без
            // нових bookings-подій: вільний слот тоді хибно лишався "накритим"
            // записом, що вже фактично посунувся на інший відносний день.
            const colBookings = (bookingsByDate.get(dateStrCol) || EMPTY_LIST).filter(b => b.status !== "cancelled");
            const slotCovered = (mn) => colBookings.some(b => b.startMin < mn + 60 && b.startMin + b.durMin > mn);
            const isOpenCol = Object.entries(openSlots[dateStrCol] || {}).some(([t, s]) => {
              if (!s.available) return false;
              const [hh, mm] = t.split(":").map(Number);
              return !slotCovered(hh * 60 + mm);
            });
            const _dow = (new Date(dateStrCol + "T12:00:00").getDay() + 6) % 7;
            const _ov  = (settings.dateOverrides || []).find(o => o.date === dateStrCol);
            const _ws  = (settings.weekSchedule  || [])[_dow] || {};
            const colLunch = {
              enabled: _ov?.lunchEnabled ?? _ws.lunchEnabled ?? settings.lunchEnabled ?? true,
              start:   _ov?.lunchStart   ?? _ws.lunchStart   ?? settings.lunchStart   ?? 12,
              end:     _ov?.lunchEnd     ?? _ws.lunchEnd     ?? settings.lunchEnd     ?? 13,
            };
            const isToday = absDay === 0;
            const isPastDay = absDay < 0;
            const isLoadingCol = genLoadingDays.has(absDay);
            const hasAnySlotsCol = !!(openSlots[dateStrCol] && Object.keys(openSlots[dateStrCol]).length);
            // Ефективний статус дня: явний dateOverride головніший за тижневий
            // шаблон (той самий критерій, що й у computeDayUpdates/toggleDayBlocked).
            // Раніше isClosedDay дивився лише на override, тому шаблонно-закритий
            // день без override (напр. неділя) вважався "не закритим" для кліків,
            // контекстного меню та кольору заголовка, а override, що відкриває
            // такий день, і далі показувався б червоним.
            const isWorkDay = _ov ? _ov.type !== 'closed' : (_ws.enabled !== false && !(!_ws.start && (settings.weekends || []).includes(_dow)));
            const isClosedDay = !isWorkDay;
            return (
            <div key={absDay} style={{
              display:"flex", flexDirection:"column", flexShrink:0,
              width:COL_W, marginRight:colIdx<N_DAYS-1?4:0,
            }}>
              {/* DATE HEADER — sticky top, moves with column horizontally */}
              <div data-help="daycolor"
                onClick={e=>{
                  e.stopPropagation();
                  if(scheduleLocked) return;
                  if(dayLongFiredRef.current){dayLongFiredRef.current=false;return;}
                  if(isPastDay || isLoadingCol) return;
                  const now = Date.now();
                  if (dayLastClickRef.current && dayLastClickRef.current.absDay === absDay && now - dayLastClickRef.current.time < 350) {
                    // Подвійний тап — закрити/відкрити день
                    clearTimeout(dayClickTimerRef.current);
                    dayLastClickRef.current = null;
                    navigator.vibrate?.([20,20,20]);
                    toggleDayBlocked(dateStrCol);
                    return;
                  }
                  dayLastClickRef.current = { absDay, time: now };
                  clearTimeout(dayClickTimerRef.current);
                  dayClickTimerRef.current = setTimeout(()=>{
                    dayLastClickRef.current = null;
                    if (isClosedDay) return;
                    hasAnySlotsCol ? clearDaySlots(absDay) : generateDaySlots(absDay);
                  }, 300);
                }}
                onPointerDown={e=>{ if(scheduleLocked) return; clearTimeout(dayLongPressRef.current); dayLongFiredRef.current=false; dayLongPressRef.current=setTimeout(()=>{ dayLongFiredRef.current=true; navigator.vibrate?.(30); setDayNotesModal({ dateStr: dateStrCol, dayLabel: day.fullLabel, dayNum: day.num, dayMonth: day.monthFull }); }, 600); }}
                onPointerUp={()=>clearTimeout(dayLongPressRef.current)}
                onPointerLeave={()=>clearTimeout(dayLongPressRef.current)}
                style={{
                  position:"sticky", top:0, zIndex:12,
                  height:HEADER_H, flexShrink:0, marginBottom:10,
                  display:"flex", flexDirection:"column", gap:1,
                  alignItems:"center", justifyContent:"center",
                  padding:"2px 4px", borderRadius:10, cursor: isPastDay ? "default" : "pointer",
                  opacity: isPastDay ? 0.35 : 1, overflow:"visible",
                  // Робочі дні за розкладом — зелені, неробочі — червоні (isWorkDay,
                  // не просто субота/неділя по календарю).
                  // Заблокований день — та сама діагональна штриховка, що й у заблокованих
                  // слотах сітки (STRIPE_A/STRIPE_B) — узгоджена мова "заблоковано" в межах UI.
                  background: isClosedDay ? `repeating-linear-gradient(45deg,${STRIPE_A},${STRIPE_A} 5px,${STRIPE_B} 5px,${STRIPE_B} 10px)` : `linear-gradient(155deg, color-mix(in srgb, color-mix(in srgb, ${isWorkDay ? GREEN : RED} 22%, ${BG_DEEP}) 78%, transparent) 0%, color-mix(in srgb, ${BG_DEEP} 78%, transparent) 100%)`,
                  backdropFilter:"blur(10px)", WebkitBackdropFilter:"blur(10px)",
                  boxShadow: `3px 3px 7px rgba(${SHADE},0.4), -2px -2px 6px rgba(${GLOW},0.06)${isToday ? `, inset 0 0 0 1.5px ${GOLD}99` : isClosedDay ? `, inset 0 0 0 1.5px rgba(220,60,60,0.8)` : ""}`,
                }}>
                <div style={{fontSize:10, fontWeight:700, lineHeight:1.2,
                  color: isWorkDay ? GREEN : RED,
                  letterSpacing:0.3, overflow:"hidden", whiteSpace:"nowrap",
                  maxWidth:"100%", textOverflow:"ellipsis",
                }}>{COL_W >= 76 ? day.fullLabel : day.label}</div>
                <div style={{fontSize:10.5, fontWeight:800, lineHeight:1.2, color:TEXT,
                  overflow:"hidden", whiteSpace:"nowrap", maxWidth:"100%", textOverflow:"ellipsis",
                }}>
                  {day.num} {COL_W >= 76 ? day.monthFull : day.month}{day.year !== currentYear ? ` ${day.year}` : ""}
                </div>
                {!isPastDay && !isClosedDay && !isLoadingCol && (
                  <div data-help="daycorner" style={{
                    position:"absolute", top:2, right:2, width:14, height:14, borderRadius:"50%",
                    background: isOpenCol ? `linear-gradient(155deg,#a6e888,${GREEN})` : `linear-gradient(145deg,${SURF_HI},${SURFACE})`,
                    boxShadow:"0 1px 3px rgba(0,0,0,0.5)",
                    display:"flex", alignItems:"center", justifyContent:"center",
                  }}>
                    {isOpenCol ? (
                      <svg width="8.5" height="8.5" viewBox="0 0 24 24" fill="none" stroke="#0f2e08" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="5 13 10 18 19 7"/></svg>
                    ) : (
                      <svg width="8.5" height="8.5" viewBox="0 0 24 24" fill="none" stroke={FAINT} strokeWidth="3.5" strokeLinecap="round"><line x1="12" y1="6" x2="12" y2="18"/><line x1="6" y1="12" x2="18" y2="12"/></svg>
                    )}
                  </div>
                )}
                {!isPastDay && isLoadingCol && (
                  <div style={{position:"absolute", top:3, right:4, fontSize:10, lineHeight:1, color:FAINT}}>…</div>
                )}
                {dayNotes[dateStrCol] && (
                  <div data-help="daynote" className="note-icon-glow" style={{
                    position:"absolute", top:2, left:2, width:14, height:14, borderRadius:"50%",
                    background:`linear-gradient(155deg,#ffe28a,${GOLD})`,
                    boxShadow:"0 1px 3px rgba(0,0,0,0.5)",
                    display:"flex", alignItems:"center", justifyContent:"center",
                  }}>
                    <svg width="8.5" height="8.5" viewBox="0 0 24 24" fill="none" stroke="#3a2800" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 3v5h5"/><path d="M6 3h8l5 5v13H6z"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/>
                    </svg>
                  </div>
                )}
              </div>

              {/* SLOT CONTENT */}
              <div
                onClick={e=>{
                  // Фолбек для touch: якщо pointerdown/up не дійшли (жест браузера), вставляємо копію по click
                  if (copySourceRef.current) {
                    if (Date.now() - copyPastedAtRef.current < 600 || isPastDay) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const rawMin = calcRef.current.workStart * 60 + (e.clientY - rect.top) / calcRef.current.PX_PER_MIN;
                    copyTapRef.current = null;
                    copyPastedAtRef.current = Date.now();
                    pasteCopy(copySourceRef.current, dateStrCol, Math.floor(rawMin / 30) * 30);
                    return;
                  }
                  if(xJustShownRef.current){ xJustShownRef.current=false; return; } if(quickCancelId){ xVisibleRef.current=false; setQuickCancelId(null); } }}
                onPointerDown={e=>{
                  // Режим копіювання: тап на порожнє місце/вільний слот вставляє копію (див. onPointerUp)
                  if (copySourceRef.current) {
                    slotClaimedRef.current = false;
                    copyTapRef.current = { x: e.clientX, y: e.clientY };
                    return;
                  }
                  // Дотик уже "заявлений" дочірнім вільним слотом (без stopPropagation,
                  // щоб не заважати нативному touch-action панорамуванню) — не відкриваємо
                  // меню "новий слот" поверх уже існуючого.
                  if (slotClaimedRef.current) { slotClaimedRef.current = false; return; }
                  if (scheduleLocked || isPastDay) return;
                  if (e.button > 0) return;
                  if (dragRef.current || pendingDragRef.current) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const rawMin = calcRef.current.workStartMin + (e.clientY - rect.top) / calcRef.current.PX_PER_MIN;
                  // Округлення вниз (а не до найближчого) — тап у будь-якому місці
                  // 30-хвилинного рядка має відповідати ЙОГО початку, а не сусідньому,
                  // інакше дотик у нижній половині рядка показував час на 30хв пізніше.
                  const minute = Math.floor(rawMin / 30) * 30;
                  // Обідня перерва — не пропонувати створення нового слота/запису,
                  // навіть якщо адмін довго тисне саме в цей проміжок часу. Раніше
                  // затемнення обіду було суто візуальним (pointerEvents:"none"),
                  // тож довгий тап під ним усе одно відкривав меню створення.
                  if (colLunch.enabled && minute >= colLunch.start * 60 && minute < colLunch.end * 60) return;
                  emptyHoldPosRef.current = { startY: e.clientY, day: absDay, startMin: minute, dateStr: dateStrCol };
                  emptyHoldTimerRef.current = setTimeout(() => {
                    if (!emptyHoldPosRef.current) return;
                    navigator.vibrate?.(30);
                    setLtmClosing(false); setLtmScatter(false);
                    setLongTapMenu({ dateStr: dateStrCol, startMin: minute, selectedMin: minute, clientX: e.clientX, clientY: e.clientY, isClosedDay });
                    emptyHoldPosRef.current = null;
                  }, 480);
                }}
                onPointerMove={e=>{
                  if (!emptyHoldPosRef.current) return;
                  if (Math.abs(e.clientY - emptyHoldPosRef.current.startY) > 8) {
                    clearTimeout(emptyHoldTimerRef.current);
                    emptyHoldPosRef.current = null;
                  }
                }}
                onPointerUp={e=>{
                  if (copySourceRef.current && copyTapRef.current) {
                    const tp = copyTapRef.current;
                    copyTapRef.current = null;
                    if (!isPastDay && Math.hypot(e.clientX - tp.x, e.clientY - tp.y) <= 8) {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const rawMin = calcRef.current.workStart * 60 + (e.clientY - rect.top) / calcRef.current.PX_PER_MIN;
                      copyPastedAtRef.current = Date.now();
                      pasteCopy(copySourceRef.current, dateStrCol, Math.floor(rawMin / 30) * 30);
                    }
                  }
                  // Короткий клік по порожній клітинці нічого не створює —

                  // випадковий дотик (скрол/промах) не повинен спавнити слот.
                  // Відкрити слот можна лише через довгий тап (меню з підтвердженням).
                  clearTimeout(emptyHoldTimerRef.current);
                  emptyHoldPosRef.current = null;
                }}
                onPointerCancel={()=>{ clearTimeout(emptyHoldTimerRef.current); emptyHoldPosRef.current = null; }}
                onPointerLeave={()=>{ clearTimeout(emptyHoldTimerRef.current); emptyHoldPosRef.current = null; }}
                data-pan="1"
                onContextMenu={e=>{
                  e.preventDefault();
                  // Права кнопка миші на порожньому місці = довге натискання: меню «новий слот / запис»
                  if (!isMouseContext(e)) return;
                  if (e.target !== e.currentTarget || scheduleLocked || isPastDay) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const minute = Math.floor((calcRef.current.workStartMin + (e.clientY - rect.top) / calcRef.current.PX_PER_MIN) / 30) * 30;
                  if (colLunch.enabled && minute >= colLunch.start * 60 && minute < colLunch.end * 60) return;
                  clearTimeout(emptyHoldTimerRef.current); emptyHoldPosRef.current = null;
                  setLtmClosing(false); setLtmScatter(false);
                  setLongTapMenu({ dateStr: dateStrCol, startMin: minute, selectedMin: minute, clientX: e.clientX, clientY: e.clientY, isClosedDay });
                }}
                style={{
                  width:COL_W, height:gridHeight,
                  position:"relative", padding:"0 4px",
                  background: isLight ? `linear-gradient(135deg,${SURF_LO},${BG_DEEP})` : `linear-gradient(135deg,color-mix(in srgb,${BG_DEEP} 50%,transparent),rgba(0,0,0,0.275))`,
                  borderRadius:14, boxShadow:SHADOW_IN, cursor: isPastDay ? "default" : "cell",
                  userSelect:"none", WebkitUserSelect:"none", WebkitTouchCallout:"none",
                  opacity: isPastDay ? 0.38 : 1,
                }}>

              {/* Лінія поточного часу — тільки в колонці сьогодні */}
              {isToday && nowMin >= wsMinAbs && nowMin <= weMinAbs && (
                <div data-help="nowline" style={{
                  position:"absolute", left:0, right:0, top:minToPx(nowMin),
                  height:3, zIndex:1, pointerEvents:"none", // під картками записів (z 2), щоб не закривати текст
                  background:"#ef4444", boxShadow:"0 2px 6px rgba(239,68,68,0.6)",
                }}/>
              )}

              {/* Open/blocked/surcharge/VIP slot indicators — рендеримо і на
                  закритому дні: якщо там є реальні слоти (адмін вручну відкрив
                  один слот через довгий тап → "Вільний слот"), вони мають бути
                  видні й керовані, а не "невидимі" в адмінці попри те, що клієнт
                  їх все одно бачить (timeslots/{date} читається без фільтра по
                  статусу дня). На звичайному закритому дні тут просто пусто. */}
              {(()=>{
                const daySlots = openSlots[dateStrCol] || {};
                const sortedMins = Object.keys(daySlots)
                  .map(t => { const [hh, mm] = t.split(':').map(Number); return hh*60+mm; })
                  .sort((a, b) => a - b);
                return Object.entries(daySlots).map(([time, slot]) => {
                const [h, m] = time.split(":").map(Number);
                const startMin = h * 60 + m;
                if (startMin < wsMinAbs || startMin >= weMinAbs) return null;
                // Вільний/доступний слот, накритий записом (хоча б частково), не показуємо.
                if (slot.available && slotCovered(startMin)) return null;
                // Якщо після цього слота більше немає документів (наприклад, усі поглинуті
                // розтягуванням) — межею є кінець робочого дня, а не штучні +60 хв.
                const nextMin = sortedMins.find(t => t > startMin) ?? (weMinAbs);
                const slotDurMin = slot.durMin || 60;
                let slotHeightMin = Math.min(slotDurMin, nextMin - startMin, weMinAbs - startMin);
                // Слот, верх якого накритий кінцем запису (запис о 11:30 на 1 год і слот 12:00), починаємо з кінця запису —
                // без накладання. Вимикається в Налаштуваннях (calClip).
                let clipShift = 0;
                if (settings.calClip !== false) {
                  const endSlot = startMin + slotHeightMin;
                  const covEnd = colBookings.reduce((mx, b) => (b.startMin < startMin && b.startMin + b.durMin > startMin ? Math.max(mx, b.startMin + b.durMin) : mx), 0);
                  if (covEnd > startMin) {
                    if (endSlot - covEnd < 10) return null;
                    clipShift = covEnd - startMin;
                    slotHeightMin = endSlot - covEnd;
                  }
                }
                const isVip = slot.vipOnly;
                const isBlocked = slot.adminBlocked;
                const hasSurcharge = !!slot.surcharge;
                const hasFixedPrice = !!slot.fixedPrice;
                const isPrivateOnly = !!slot.privateOnly;
                const hasViewer = (viewingSlots[dateStrCol] || []).includes(time);
                const isSticky = (isVip || isBlocked || hasSurcharge || isPrivateOnly || hasFixedPrice) ? true : isStickySlot(dateStrCol, time);
                const bg = isVip ? "rgba(168,85,247,0.15)" : isBlocked ? "rgba(239,68,68,0.15)" : isPrivateOnly ? "rgba(234,179,8,0.15)" : hasSurcharge ? "rgba(247,201,72,0.15)" : hasFixedPrice ? "rgba(74,222,128,0.15)" : isSticky ? STICKY_BG : FREE_BG;
                const borderColor = isVip ? "rgba(168,85,247,0.55)" : isBlocked ? "rgba(239,68,68,0.5)" : isPrivateOnly ? (isLight ? "rgba(140,110,0,0.65)" : "rgba(234,179,8,0.6)") : hasSurcharge ? (isLight ? "rgba(140,110,0,0.65)" : "rgba(247,201,72,0.6)") : hasFixedPrice ? "rgba(74,222,128,0.6)" : isSticky ? STICKY_BD : FREE_BD;
                const color = isVip ? "rgba(168,85,247,0.9)" : isBlocked ? "rgba(239,68,68,0.85)" : isPrivateOnly ? (isLight ? "rgba(100,75,0,0.9)" : "rgba(234,179,8,0.95)") : hasSurcharge ? (isLight ? "rgba(100,75,0,0.9)" : "rgba(247,201,72,0.95)") : hasFixedPrice ? "rgba(74,222,128,0.95)" : isSticky ? STICKY_CLR : FREE_CLR;
                const emptyShadow = isLight
                  ? "inset 2px 2px 5px rgba(0,0,0,0.16), inset -2px -2px 5px rgba(255,255,255,0.55)"
                  : "inset 2px 2px 5px rgba(0,0,0,0.45), inset -2px -2px 5px rgba(255,255,255,0.10)";
                const isPlainFree = slot.available && !isVip && !isBlocked && !hasSurcharge && !isPrivateOnly && !hasFixedPrice;
                const isBeingDragged = freeDragPreview && freeDragPreview.dateStr===dateStrCol && freeDragPreview.time===time;
                const displayStartMin = isBeingDragged ? freeDragPreview.newStart : startMin + clipShift;
                // Розтягування вниз може поглинати наступні вільні слоти підряд (без запису,
                // блокування, VIP чи надбавки) — межа росту не обмежена одним нижнім слотом,
                // а йде до першого «непоглинаючого» слота/запису або кінця робочого дня.
                let resizeLimitMin = weMinAbs;
                if (isPlainFree) {
                  for (const t of sortedMins) {
                    if (t <= startMin) continue;
                    const hh2 = String(Math.floor(t / 60)).padStart(2, "0");
                    const mm2 = String(t % 60).padStart(2, "0");
                    const s2 = daySlots[`${hh2}:${mm2}`];
                    const s2Free = s2 && s2.available && !s2.vipOnly && !s2.privateOnly && !s2.adminBlocked && !s2.surcharge && !s2.fixedPrice;
                    if (!s2Free || slotCovered(t)) { resizeLimitMin = t; break; }
                  }
                }
                const maxDurMin = Math.max(settings.snapMin || 30, Math.min(resizeLimitMin - startMin, weMinAbs - startMin));
                const isBeingResized = freeResizePreview && freeResizePreview.dateStr===dateStrCol && freeResizePreview.time===time;
                const displayHeightMin = isBeingResized ? freeResizePreview.newDur : slotHeightMin;
                return (
                  <div key={`os-${time}`}
                    onContextMenu={e=>{
                      e.preventDefault();
                      if (!isMouseContext(e) || isPastDay || scheduleLocked) return;
                      clearTimeout(slotHoldTimerRef.current); slotPressRef.current = null;
                      setSlotOptions({ dateStr: dateStrCol, time, startTime: time, slot });
                    }}
                    onPointerDown={e=>{
                      if (e.button > 0) return; // права кнопка відкриває меню через onContextMenu, а не запускає перетягування
                      if (copySourceRef.current) return; // режим копіювання: тап обробляє батьківський фон (вставка)
                      // isClosedDay НЕ блокує тут: слот, який реально існує на
                      // закритому дні (адмін відкрив вручну через довгий тап →
                      // "Вільний слот"), має лишатись керованим — інакше його
                      // неможливо було б ні скасувати, ні відредагувати без
                      // повного відкриття всього дня.
                      if (isPastDay) return;
                      slotMovedRef.current = false;
                      slotDownRef.current = { x: e.clientX, y: e.clientY, sl: gridRef.current?.scrollLeft || 0, st: gridRef.current?.scrollTop || 0 };
                      // Заявляємо дотик БЕЗ stopPropagation — він, судячи з усього,
                      // заважає нативному touch-action панорамуванню на реальних
                      // мобільних браузерах (так само, як і в кейсі з заблокованим
                      // розкладом раніше). Батьківський порожній фон перевіряє
                      // slotClaimedRef і сам не відкриває своє меню "новий слот".
                      slotClaimedRef.current = true;
                      // preventDefault (без stopPropagation) — сигналізує браузеру, що
                      // цей дотик веде JS, а не нативне panning; touch-action:none нижче
                      // вже цього вимагає, тут лише явно про всяк випадок.
                      e.preventDefault();
                      if (scheduleLocked) {
                        // Замочок закритий — жодного drag/resize/модалки, лише дозволяємо
                        // будь-якому руху одразу передати керування ручному скролу. РАНІШЕ
                        // тут був голий return без цієї гілки — і саме тому свайп по
                        // вільному слоту знову не працював взагалі, поки розклад заблокований
                        // (touch-action:none блокує нативне панорамування, а керувати ручним
                        // скролом було нічому).
                        slotPressRef.current = { dateStr: dateStrCol, time, slot, startX: e.clientX, startY: e.clientY, lastY: e.clientY, locked: true };
                        return;
                      }
                      slotHoldFiredRef.current = false;
                      slotPressRef.current = { dateStr: dateStrCol, time, slot, startX: e.clientX, startY: e.clientY, lastY: e.clientY };
                      slotHoldTimerRef.current = setTimeout(()=>{
                        const sp = slotPressRef.current;
                        if (!sp) return;
                        slotHoldFiredRef.current = true;
                        navigator.vibrate?.(40);
                        if (isPlainFree) {
                          // Довгий тап "озброює" перетягування — з цього моменту рух пальця
                          // рухає слот; просте відпускання без руху відкриє модалку опцій
                          // (window onUp нижче, коли freeDragRef.moved лишився false).
                          freeDragRef.current = { dateStr: dateStrCol, time, slot, startClientY: sp.lastY, startClientX: sp.lastX ?? sp.startX, startMin, durMin: slotDurMin, moved: false, newStart: startMin };
                        } else {
                          setSlotOptions({ dateStr: dateStrCol, time, startTime: time, slot });
                        }
                      }, 600);
                    }}
                    onPointerMove={e=>{
                      const sp = slotPressRef.current;
                      if (!sp || slotHoldFiredRef.current) return; // після озброєння рухом керує freeDragRef
                      sp.lastY = e.clientY;
                      sp.lastX = e.clientX;
                      const dx = e.clientX - sp.startX;
                      const dy = e.clientY - sp.startY;
                      if (sp.locked) {
                        // Замочок закритий: жодного перетягування слота — будь-який рух
                        // (в будь-якому напрямку) одразу віддає жест ручному скролу.
                        if (Math.hypot(dx, dy) > 8) {
                          slotMovedRef.current = true;
                          slotPressRef.current = null;
                          if (swipeRef.current) swipeRef.current.manualScroll = true;
                        }
                        return;
                      }
                      // Довгий тап ще не спрацював — будь-який достатній рух означає, що
                      // це НЕ утримання слота, тож завжди звільняємо жест і передаємо
                      // керування ручному скролу (сам скрол розбереться з віссю: dx>=dy —
                      // горизонтально, інакше вертикально), так само, як і в записів/locked.
                      // РАНІШЕ тут вимагалась ЯВНА горизонтальна перевага (dx>1.7dy), і рух
                      // із помітною вертикальною складовою просто "губився" без будь-якої
                      // передачі керування — свайп виглядав неробочим для звичайних, не
                      // ідеально горизонтальних дотиків.
                      if (Math.hypot(dx, dy) > 8) {
                          slotMovedRef.current = true;
                        clearTimeout(slotHoldTimerRef.current);
                        slotPressRef.current = null;
                        if (swipeRef.current) swipeRef.current.manualScroll = true;
                      }
                    }}
                    onPointerUp={(e)=>{
                      const sp = slotPressRef.current;
                      // Короткий тап по звичайному вільному слоту — одразу позначає
                      // його приватним (жовтий) — лише по двох тапах підряд, без проміжної модалки: відкриття
                      // модалки саме тут провокувало "привида-клік" на щойно
                      // змонтований оверлей (React встигав вставити його в DOM ще до
                      // приходу відкладеного click від того ж дотику), який миттєво
                      // її закривав.
                      const wasQuickTap = sp && !sp.locked && !slotHoldFiredRef.current && !slotGestureMoved(e);
                      clearTimeout(slotHoldTimerRef.current);
                      slotPressRef.current = null;
                      if (wasQuickTap && isPlainFree) {
                        if (isDoubleTapOnSlot(`${dateStrCol}_${time}`)) {
                          navigator.vibrate?.(15);
                          applySlotOption(dateStrCol, time, "private");
                        } else {
                          navigator.vibrate?.(5);
                        }
                      }
                    }}
                    onPointerCancel={()=>{ clearTimeout(slotHoldTimerRef.current); slotPressRef.current = null; }}
                    onClick={e=>{
                      e.stopPropagation();
                      if (isPastDay || slotHoldFiredRef.current || isPlainFree) return;
                      // Свайп, що почався на слоті, теж породжує click — це не тап
                      if (slotGestureMoved(e)) { slotMovedRef.current = false; return; }
                      if (!isDoubleTapOnSlot(`${dateStrCol}_${time}`)) return;
                      toggleSlotFree(dateStrCol, time, slot);
                    }}
                    style={{
                      position:"absolute", left:0, right:0,
                      top: minToPx(displayStartMin) + 1,
                      height: displayHeightMin * PX_PER_MIN - 2,
                      opacity: isBeingDragged || isBeingResized ? 0.95 : isSticky ? 0.90 : 0.82,
                      background: bg,
                      border: `1.5px solid ${borderColor}`,
                      boxShadow: isBeingDragged || isBeingResized ? `0 4px 14px rgba(0,0,0,0.35)` : emptyShadow,
                      borderRadius:8, cursor: isPlainFree ? "grab" : "pointer", zIndex: isBeingDragged || isBeingResized ? 6 : 1,
                      display:"flex", flexDirection:"column",
                      alignItems:"center", justifyContent:"center",
                      padding:0,
                      transition: isBeingDragged || isBeingResized ? "none" : undefined,
                      // touch-action:none — нативне panning тут показало себе ненадійним
                      // (несистемно то скролило, то ні на тій самій білдці). "Смиканий"
                      // без інерції ручний JS-скрол, зате завжди детерміновано працює.
                      // На минулих днях onPointerDown одразу виходить (isPastDay) —
                      // drag/resize там не вмикаються, тож touch-action:none лишав би
                      // дотик по порожньому слоту "мертвим": ні нативне panning, ні
                      // ручний скрол. Тому там дозволяємо нативне panning як завжди.
                      // Закритий день (isClosedDay) тут НЕ виключаємо — слот, вручну
                      // відкритий на закритому дні, має лишатись повністю керованим.
                      touchAction: (isPlainFree && !isPastDay) ? "none" : "manipulation",
                      WebkitTouchCallout:"none", WebkitUserDrag:"none",
                      WebkitUserSelect:"none", userSelect:"none",
                    }}>
                    {hasFixedPrice ? (
                      <div style={{position:"absolute", top:0, left:0, width:34, height:34, overflow:"hidden", pointerEvents:"none"}}>
                        <div style={{
                          position:"absolute", top:6, left:-11, width:56, textAlign:"center",
                          transform:"rotate(-45deg)",
                          background:"rgba(74,222,128,0.95)", color:"#062910",
                          fontSize:10, fontWeight:800, lineHeight:1.5,
                          boxShadow:"0 1px 3px rgba(0,0,0,0.3)",
                        }}>{money(slot.fixedPrice)}</div>
                      </div>
                    ) : hasSurcharge && <span style={{position:"absolute", top:3, left:4, fontSize:9, fontWeight:800, color:"rgba(247,201,72,0.95)", lineHeight:1}}>+{money(slot.surcharge)}</span>}
                    {(isVip || slot.vipOnly) && <span data-help="freeicons" style={{position:"absolute", top:3, right:4, fontSize:10, lineHeight:1}}><MetalIcon name="crown" size={14}/></span>}
                    {isPrivateOnly && <span data-help="freeicons" style={{position:"absolute", top:3, right:4, fontSize:10, lineHeight:1}}><MetalIcon name="user" size={14}/></span>}

                    {settings.showSlotTimes !== false && (slot.available || isVip || isBlocked || isPrivateOnly) && (() => {
                      // Час початку/кінця вільного слота — великий, білий і напівпрозорий
                      // фон-підпис (не заважає іншим елементам: pointerEvents:none, під ними).
                      const hhmm = (mm) => `${String(Math.floor(mm/60)).padStart(2,"0")}:${String(mm%60).padStart(2,"0")}`;
                      const fs = Math.min(COL_W * 0.3, 22, (displayHeightMin * PX_PER_MIN) * 0.36);
                      if (fs < 8) return null;
                      return (
                        <div style={{
                          position:"absolute", inset:0, display:"flex", flexDirection:"column",
                          alignItems:"center", justifyContent:"center", pointerEvents:"none",
                          color:"#fff", opacity:0.1, fontSize:fs, fontWeight:800, lineHeight:1.05,
                          letterSpacing:-0.3, fontVariantNumeric:"tabular-nums",
                        }}>
                          <span>{hhmm(displayStartMin)}</span>
                          <span>{hhmm(displayStartMin + displayHeightMin)}</span>
                        </div>
                      );
                    })()}
                    {hasViewer && <span data-help="eye" style={{position:"absolute", bottom:3, right:4, fontSize:8, lineHeight:1, opacity:0.8}}><MetalIcon name="eye" size={12}/></span>}
                    {isBlocked && (() => { const qc = queueMap[`${dateStrCol}_${time}`]; return qc > 0 ? (
                      <div data-help="queue" style={{position:"absolute", bottom:2, right:4, display:"flex", alignItems:"center", gap:1}}>
                        <svg width="8" height="8" viewBox="0 0 24 24" fill={GOLD}><circle cx="12" cy="7" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>
                        <span style={{fontSize:7, fontWeight:800, color:GOLD, lineHeight:1}}>{qc}</span>
                      </div>
                    ) : null; })()}
                    {isPlainFree && !isPastDay && (
                      <div
                        onPointerDown={e=>{
                          if (scheduleLocked) return;
                          e.stopPropagation(); e.preventDefault();
                          clearTimeout(slotHoldTimerRef.current);
                          slotMovedRef.current = false;
                          slotDownRef.current = { x: e.clientX, y: e.clientY, sl: gridRef.current?.scrollLeft || 0, st: gridRef.current?.scrollTop || 0 };
                          resizeHoldPosRef.current = { startX: e.clientX, startY: e.clientY, lastY: e.clientY };
                          resizeHoldTimerRef.current = setTimeout(()=>{
                            const rp = resizeHoldPosRef.current;
                            if (!rp) return;
                            navigator.vibrate?.(20);
                            freeResizeRef.current = { dateStr: dateStrCol, time, slot, startClientY: rp.lastY, startClientX: rp.startX, startDur: slotDurMin, maxDur: maxDurMin, moved: false, newDur: slotDurMin };
                          }, 600);
                        }}
                        onPointerMove={e=>{
                          const rp = resizeHoldPosRef.current;
                          if (!rp || freeResizeRef.current) return;
                          rp.lastY = e.clientY;
                          const dx = e.clientX - rp.startX;
                          const dy = e.clientY - rp.startY;
                          // Маленька ручка ресайзу на короткому слоті займає велику частку
                          // всієй висоти — дотик, що мав би бути свайпом днів, часто
                          // потрапляє саме сюди. Та сама симетрична перевірка ("яка вісь
                          // більша"), що й на самому слоті, передає керування скролу.
                          if (Math.hypot(dx, dy) > 8) {
                            slotMovedRef.current = true;
                            clearTimeout(resizeHoldTimerRef.current);
                            resizeHoldPosRef.current = null;
                            if (Math.abs(dx) >= Math.abs(dy) && swipeRef.current) {
                              swipeRef.current.manualScroll = true;
                            }
                          }
                        }}
                        onPointerUp={(e)=>{
                          // rp === null, якщо палець уже зрушив (свайп) або дотик не був заявлений
                          const rp = resizeHoldPosRef.current;
                          clearTimeout(resizeHoldTimerRef.current);
                          resizeHoldPosRef.current = null;
                          // Не покладаємось лише на window-рівневий pointerup (нижче) — на
                          // деяких WebView він іноді не долітає з цієї вкладеної ручки.
                          // Тримали без руху — відкриваємо модалку опцій прямо тут.
                          const fr = freeResizeRef.current;
                          if (fr && !fr.moved) {
                            freeResizeRef.current = null;
                            setFreeResizePreview(null);
                            setSlotOptions({ dateStr: fr.dateStr, time: fr.time, startTime: fr.time, slot: fr.slot });
                          } else if (!fr) {
                            // Короткий тап без утримання (ручка resize стоїть поверх слота
                            // й перехоплює дотик з onClick.stopPropagation нижче) — той самий
                            // ефект, що й тап деінде на вільному слоті. РАНІШЕ закривало слот
                            // (червоний) від БУДЬ-ЯКОГО відпускання пальця — навіть після свайпу,
                            // що почався на цій ручці (а вона займає майже всю ширину слота).
                            // Тепер: лише чистий тап (без руху/скролу) і лише подвійний.
                            if (rp && !slotGestureMoved(e) && isDoubleTapOnSlot(`${dateStrCol}_${time}`)) {
                              toggleSlotFree(dateStrCol, time, slot);
                            }
                          }
                        }}
                        onPointerCancel={()=>{ clearTimeout(resizeHoldTimerRef.current); resizeHoldPosRef.current = null; }}
                        onClick={e=>e.stopPropagation()}
                        style={{
                          // Хіт-зона лишається ВСЕРЕДИНІ меж слота (bottom:0) — слоти йдуть впритул
                          // один до одного, і зона, що стирчить за межі власного div, потрапляє під
                          // сусідній слот у DOM-порядку та стає непроклацуваною. Пігулка (pointer-events:none)
                          // може візуально стирчати нижче — на перехоплення подій це вже не впливає.
                          position:"absolute", bottom:0, left:"50%", transform:"translateX(-50%)",
                          width:44, height:"10%",
                          display:"flex", alignItems:"flex-end", justifyContent:"center",
                          cursor:"ns-resize", touchAction:"none", zIndex:7,
                        }}
                      >
                        <div style={{width:26, height:8, borderRadius:5, background:borderColor, boxShadow:"0 2px 4px rgba(0,0,0,0.4)", pointerEvents:"none", transform:"translateY(5px)"}}/>
                      </div>
                    )}
                  </div>
                );
              });
            })()}

              {/* 30-min grid lines */}
              {Array.from({length:Math.max(0, Math.ceil(weMinAbs/30) - Math.floor(wsMinAbs/30) - 1)},(_,i)=>{
                const absMin = (Math.floor(wsMinAbs/30) + 1 + i) * 30;
                if (absMin <= wsMinAbs || absMin >= weMinAbs) return null;
                const isHour = absMin % 60 === 0;
                return <div key={i} style={{
                  position:"absolute",left:0,right:0,
                  top:(absMin - wsMinAbs)*PX_PER_MIN,
                  height:1,
                  background:isHour ? GRID_H : GRID_HH
                }}/>;
              })}

              {/* Lunch block */}
              {colLunch.enabled && (
                <div style={{
                  position:"absolute",
                  top:minToPx(colLunch.start*60), left:0, right:0,
                  height:(colLunch.end - colLunch.start)*60*PX_PER_MIN,
                  background: isLight ? `repeating-linear-gradient(135deg, transparent, transparent 6px, rgba(0,0,0,0.05) 6px, rgba(0,0,0,0.05) 12px)` : `repeating-linear-gradient(135deg, transparent, transparent 6px, rgba(255,255,255,0.04) 6px, rgba(255,255,255,0.04) 12px)`,
                  border: neonCal && !isLight ? "1px solid rgba(96,165,250,0.45)" : `2px solid #1d4ed8`,
                  borderRadius: neonCal ? 12 : 8, pointerEvents:"none",
                  display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:3,
                }}>
                  <span style={{fontSize:7,fontWeight:700,color:TEXT_FAINT,letterSpacing:0.5,textTransform:"uppercase"}}>обід</span>
                </div>
              )}

              {/* Viewing indicators — only for TAKEN slots (open slots already show 👁 inside) */}
              {(viewingSlots[dateStrCol] || []).filter(time => {
                const s = openSlots[dateStrCol]?.[time];
                if (s && !s.adminBlocked) return false;
                const [h, m] = time.split(":").map(Number);
                const sm = h * 60 + m;
                return sm >= wsMinAbs && sm < weMinAbs;
              }).map(time => {
                const [h, m] = time.split(":").map(Number);
                const topPx = minToPx(h * 60 + m);
                return (
                  <div key={`v-${time}`} style={{
                    position:"absolute", left:2, right:2,
                    top:topPx, height:60*PX_PER_MIN,
                    background:"rgba(247,201,72,0.10)",
                    borderLeft:"2px solid rgba(247,201,72,0.5)",
                    borderRadius:6, pointerEvents:"none",
                    display:"flex", alignItems:"center", paddingLeft:5,
                    gap:3,
                  }}>
                    <span style={{fontSize:10, color:"rgba(247,201,72,0.7)", fontWeight:700, letterSpacing:0.5}}><span style={{display:"inline-flex",alignItems:"center",gap:4}}><MetalIcon name="eye" size={14}/>{time}</span></span>
                  </div>
                );
              })}

              {/* «Привид» копії при перетягуванні значка 📋 */}
              {copyGhost && copyGhost.day === absDay && (
                <div style={{
                  position:"absolute", left:0, right:0,
                  top:minToPx(copyGhost.startMin)+1, height:copyGhost.durMin*PX_PER_MIN-2,
                  zIndex:25, pointerEvents:"none", borderRadius:8,
                  border:`2px dashed ${copyGhost.busy ? "#f87171" : "#60a5fa"}`,
                  background: copyGhost.busy ? "rgba(248,113,113,0.25)" : "rgba(96,165,250,0.30)",
                  boxShadow:"0 4px 14px rgba(0,0,0,0.35)",
                }}/>
              )}

              {/* Bookings */}
              {(bookingsByDay.get(absDay) || EMPTY_LIST).map(origB=>{
                if (origB.status === "cancelled") return null;
                // Сусідній (без розриву) запис того ж клієнта — "поглинутий" сусідньою карткою, не рендеримо окремо.
                const mi = mergeInfoMap[origB.id];
                if (mi?.hidden) return null;
                const gi = groupMap[origB.id];
                if (gi?.hidden) return null;
                // Для першого запису об'єднаної групи — синтетична копія лише для геометрії/ціни картки
                // (клік відкриває деталі саме origB, щоб модалка й дії лишались "чесними" для одного запису).
                const b0 = mi?.mergedIds?.length
                  ? { ...origB, durMin: mi.mergedDurMin, _mergedIds: mi.mergedIds, _mergedPrice: mi.mergedPrice }
                  : origB;
                const b = gi?.rep ? { ...b0, name: `👥 ${gi.members.length}/${origB.groupCap || "?"} · ${origB.name}` } : b0;
                const wsMin = wsMinAbs;
                const weMin = weMinAbs;
                if (b.startMin >= weMin || b.startMin + b.durMin <= wsMin) return null;
                const visStart = Math.max(b.startMin, wsMin);
                const visEnd   = Math.min(b.startMin + b.durMin, weMin);
                const top    = minToPx(visStart);
                const height = (visEnd - visStart) * PX_PER_MIN;
                // На стиснутих слотах фіксовані 12px-хендли зверху+знизу (24px разом)
                // перекривали весь запис, не лишаючи місця для тапу "відкрити модалку" —
                // звужуємо хендли пропорційно висоті (разом ~1/3 слоту), лишаючи
                // тапабельний центр 2/3 висоти.
                const handleH = Math.min(12, Math.max(4, Math.floor(height / 6)));
                const c = slotColor(b);
                const isPending = b.status==="pending" && settings.pendingEnabled;
                const isCancelling = cancellingSet.has(b.id);
                const isBlock = b.type === "block";
                const isVipSlot = b.type === "vip-slot";
                const isPersonal = b.type === "personal";
                const slotTimeStr = String(Math.floor(b.startMin/60)).padStart(2,'0')+':'+String(b.startMin%60).padStart(2,'0');
                const queueCount = b.date ? (queueMap[`${b.date}_${slotTimeStr}`] || 0) : 0;
                const isPast = absDay < 0 || (absDay === 0 && b.startMin + b.durMin <= nowMin);
                const isLockedPast = settings.lockPastBookings && !isBlock && !isVipSlot && !isPersonal && isPast;
                const isDimmed = !isBlock && !isVipSlot && !isPersonal && (b.status==="noshow" || isCancelling || isLockedPast);
                const price = b._mergedPrice != null ? b._mergedPrice : computeBookingPrice(b, settings.services);
                // Геометрія верху картки: бейдж-мітка → час → текст. Час стоїть ПІД бейджем,
                // а текст починається ПІД часом — раніше на картках з міткою ("1-й запис",
                // "Борг"...) час перекривав першу строку імені. Висоти рахуємо з тих самих
                // розмірів, що й у бейджа (tagFs/відступи), тож на широких колонках теж без накладання.
                const _hasTag = !isBlock && !isVipSlot && !isPersonal && height >= 14 && !!effectiveTag(b);
                const _tagFs = Math.max(6, Math.min(9, Math.round(COL_W / 11)));
                const _tagBottom = Math.round(_tagFs * 0.9) + 0.99 * (_tagFs * 1.3 + 2 * (COL_W >= 34 ? Math.max(1, Math.round(_tagFs * 0.25)) : 2));
                const _timeFs = Math.min(8, Math.max(6, height / 9));
                const _timeTagTop = Math.max(16, Math.floor(_tagBottom));
                const _textTopTagged = _timeTagTop + Math.ceil(_timeFs) + 2;
                // У тісній картці з міткою для імені під часом місця немає — час ховаємо
                // (він видний за шкалою зліва), а текст лишається як було.
                const _tagRoomy = _hasTag && height - _textTopTagged - 4 >= 20;
                const showTime = !_hasTag || _tagRoomy;
                const timeTop = _hasTag ? _timeTagTop : 2;
                const textTop = _tagRoomy ? _textTopTagged : 11;
                return (
                  /* Обгортка — overflow:visible щоб значок не обрізався */
                  <div key={b.id} className="cal-slot-wrap" style={{
                    position:"absolute", top:top+1, left:0, right:0,
                    height:height-2, overflow:"visible",
                    zIndex: dragId===b.id?10:quickCancelId===b.id?20:2, // з ✕/📋 — над сусідніми картками
                    background: BG_DEEP,
                    borderRadius: 8,
                  }}>
                    {/* Мітка (іспит/перевірка/1-й запис/борг/повтор) — бейдж-пігулка у
                        верхньому правому куті картки, під кутом (як цінник на маркерах карт).
                        Автоматична (за порядком запису/сумою боргу), поки не змінена вручну.
                        Розмір шрифту/відступів і сама наявність тексту (проти лише іконки)
                        масштабуються під ширину колонки, щоб охайно виглядало і на
                        вузьких мобільних колонках, і на широких десктопних. */}
                    {!isBlock && !isVipSlot && !isPersonal && height >= 14 && (() => {
                      const curTag = effectiveTag(b);
                      if (!curTag) return null;
                      const tp = TAG_PRESETS.find(t => t.id === curTag);
                      if (!tp) return null;
                      const label = curTag === "debt" && b.debtAmount > 0 ? `${tp.label} ${money(b.debtAmount)}` : tp.label;
                      const tagFs = Math.max(6, Math.min(9, Math.round(COL_W / 11)));
                      const showText = COL_W >= 34;
                      // «1-й запис» — бейдж літає по орбіті навколо картки (по периметру).
                      const orbit = curTag === "first";
                      const oW = COL_W - 2, oH = Math.max(4, height - 2), oR = Math.min(8, oW / 2, oH / 2);
                      const orbitPath = `path("M ${oR} 0 H ${oW - oR} A ${oR} ${oR} 0 0 1 ${oW} ${oR} V ${oH - oR} A ${oR} ${oR} 0 0 1 ${oW - oR} ${oH} H ${oR} A ${oR} ${oR} 0 0 1 0 ${oH - oR} V ${oR} A ${oR} ${oR} 0 0 1 ${oR} 0 Z")`;
                      return (
                        <div className={orbit ? "tag-orbit" : undefined} style={orbit ? {
                          position:"absolute", top:0, left:0, zIndex:8, pointerEvents:"none",
                          offsetPath:orbitPath, offsetRotate:"0deg", offsetAnchor:"center",
                          animationDuration:`${Math.round(Math.max(6, (oW + oH) / 30))}s`,
                        } : {
                          position:"absolute", top:Math.round(tagFs * 0.9), right:2, zIndex:8,
                          pointerEvents:"none",
                        }}>
                          <div style={{
                            fontSize:tagFs, fontWeight:900, color:"#fff", lineHeight:1.3,
                            padding: showText ? `${Math.max(1, Math.round(tagFs*0.25))}px ${Math.max(5, Math.round(tagFs*0.85))}px` : "2px 3px",
                            borderRadius:999,
                            background:`linear-gradient(135deg, color-mix(in srgb, ${tp.color} 90%, #fff), ${tp.color})`,
                            boxShadow:"0 4px 10px rgba(0,0,0,0.45)",
                            display:"inline-flex", alignItems:"center", gap:3, minWidth:0, boxSizing:"border-box",
                            whiteSpace:"nowrap", overflow:"hidden",
                            maxWidth: Math.max(18, Math.min(COL_W - 6, 300)),
                            transform: orbit ? "none" : "rotate(9deg)", transformOrigin:"top right",
                          }}><TagIcon tag={tp} size={Math.max(12, tagFs + 4)}/>{showText && <span style={{minWidth:0,overflow:"hidden",textOverflow:"ellipsis"}}>{label}</span>}</div>
                        </div>
                      );
                    })()}
                    {/* Сам слот */}
                    <div
                      className={`slot-base ${(isBlock||isPersonal)?"":"slot-colored"} ${!isBlock&&!isPersonal&&isPending?"slot-pending-ring":""} ${!isBlock&&!isPersonal&&holdId===b.id?"slot-holding":""} ${!isBlock&&!isPersonal&&shineId===b.id&&!isDimmed?"shine-active":""}`}
                      onPointerDown={e=>{
                        if (isLockedPast || gi?.rep) {
                          // Заблокований минулий запис (і групова картка: групу не тягнемо — учасників переносять поодинці) — редагування/перенесення заборонено,
                          // але свайп по картці все одно мусить гортати дні (як і по
                          // порожньому місцю), інакше день з минулими уроками "мертвий"
                          // для свайпу. Той самий шлях, що й для scheduleLocked.
                          e.stopPropagation();
                          pendingDragRef.current = { id:b.id, startClientY:e.clientY, startClientX:e.clientX, locked:true };
                          return;
                        }
                        onPointerDown(e,b,"move");
                      }}
                      onContextMenu={e=>{ e.preventDefault(); if (isMouseContext(e)) e.currentTarget.click(); }}
                      onClick={e=>{
                        e.stopPropagation();
                        if(xJustShownRef.current){ xJustShownRef.current=false; return; }
                        if(quickCancelId){ xVisibleRef.current=false; setQuickCancelId(null); return; }
                        if(dragEndedRef.current) return;
                        // Режим копіювання / щойно вставлена копія під пальцем — «привидний» click не відкриває картку
                        if(copySourceRef.current || Date.now() - copyPastedAtRef.current < 800) return;
                        if(isVipSlot){ setVipSlotModal(b); return; }
                        if(isBlock){ setBlockModal(b); return; }
                        if(isPersonal){
                          setPersonalEventView(b);
                          setPeEditTitle(b.name || "");
                          setPeEditDur(b.durMin || 60);
                          setPeEditNote(b.note || "");
                          setPeEditDate(b.date || absDayToDateStr(b.day));
                          setPeEditTime(fmtTime(b.startMin));
                          setPeEditReminderHours(b.reminderHours || null);
                          return;
                        }
                        if(isCancelling){
                          clearTimeout(cancelTimers.current[b.id]);
                          delete cancelTimers.current[b.id];
                          setCancellingSet(s=>{ const ns=new Set(s); ns.delete(b.id); return ns; });
                          return;
                        }
                        if(!dragRef.current){ setLocalSelectedBooking(origB); onSlotClick?.(origB); }
                      }}
                      style={isVipSlot ? {
                        position:"relative", width:"100%", height:"100%",
                        borderRadius:8,
                        background:"rgba(168,85,247,0.13)",
                        border:"1.5px solid rgba(168,85,247,0.5)",
                        display:"flex", flexDirection:"column",
                        alignItems:"flex-start", justifyContent:"center",
                        padding:"0 7px", overflow:"hidden",
                      } : isPersonal ? {
                        position:"relative", width:"100%", height:"100%",
                        borderRadius:8,
                        background:"rgba(45,212,191,0.12)",
                        border:"1.5px solid rgba(45,212,191,0.4)",
                        display:"flex", flexDirection:"column",
                        alignItems:"center", justifyContent:"center",
                        padding:"0 7px", overflow:"hidden",
                      } : isBlock ? {
                        position:"relative", width:"100%", height:"100%",
                        borderRadius:8,
                        background:`repeating-linear-gradient(45deg,${STRIPE_A},${STRIPE_A} 6px,${STRIPE_B} 6px,${STRIPE_B} 12px)`,
                        border:`1px solid ${ink(0.08)}`,
                        boxShadow:`inset 0 1px 0 ${glow(0.04)}`,
                        display:"flex", alignItems:"center", justifyContent:"center",
                        overflow:"hidden",
                      } : {
                        "--c": c,
                        position:"relative", width:"100%", height:"100%",
                        padding:"2px 6px",
                        display:"flex", flexDirection:"column",
                        opacity: isDimmed ? 0.38 : 1,
                        filter: isDimmed ? "grayscale(0.6)" : "none",
                        transition:"opacity 0.4s, filter 0.4s",
                      }}>
                      {/* Ресайз відключений на об'єднаній картці — невідомо, який із поглинутих записів стискати/розтягувати */}
                      {!b._mergedIds && !isLockedPast && <div className="slot-handle top" style={{height:handleH}} onPointerDown={e=>onPointerDown(e,b,"top")}/>}
                      {!isBlock && !isVipSlot && !isPersonal && <div className="shine-layer"/>}
                      {isVipSlot && height >= 14 && (
                        <span style={{fontSize:11, lineHeight:1}}><MetalIcon name="crown" size={16}/></span>
                      )}
                      {isPersonal && height >= 14 && (() => {
                        const maxFs = Math.min(11, Math.floor(COL_W / 5.5));
                        const nameLines = b.name ? b.name.split(" ") : ["Подія"];
                        const fs = Math.max(6, Math.min(maxFs, Math.floor((height - 8) / (Math.min(nameLines.length, 2) * 1.3 + 1))));
                        return (
                          <div style={{
                            position:"absolute", top:2, left:4, right:2, bottom:2,
                            display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
                            gap:1, overflow:"hidden", textAlign:"center",
                          }}>
                            <span style={{fontSize:Math.min(fs+1,11), lineHeight:1}}><MetalIcon name="pushpin" size={Math.max(12,Math.min(fs+5,16))}/></span>
                            {nameLines.slice(0,2).map((word,i)=>(
                              <div key={i} style={{
                                fontSize:fs, fontWeight:700, color:"#2dd4bf",
                                lineHeight:1.2, whiteSpace:"normal", textAlign:"center",
                                wordBreak:"break-word", overflowWrap:"anywhere",
                                textShadow:"none",
                              }}>{word}</div>
                            ))}
                          </div>
                        );
                      })()}
                      {isBlock && height >= 18 && (() => {
                        const sz = Math.min(height * 0.62, 36);
                        return (
                          <svg width={sz} height={sz} viewBox="0 0 100 100" style={{opacity:0.55,flexShrink:0}}>
                            <polygon points="30,5 70,5 95,30 95,70 70,95 30,95 5,70 5,30"
                              fill="#ef4444" stroke="#ff6b6b" strokeWidth="3"/>
                            <rect x="20" y="43" width="60" height="14" rx="7" fill="white"/>
                          </svg>
                        );
                      })()}
                      {!isBlock && !isVipSlot && !isPersonal && height >= 12 && (() => {
                        const [fName, ...lParts] = b.name.split(' ');
                        const lName = lParts.join(' ');
                        const si = a => `rgba(${neonCal && !isLight ? "255,255,255" : INK === "255,255,255" ? "0,0,0" : INK},${a})`;
                        const priceColor = b.surcharge ? GOLD : si(0.9);
                        const priceText = price > 0 ? `${money(price)}` : null;
                        const typeLabel = b.cardLabel || (salonCard && b.serviceName) || (b.type==="school" ? "Стандарт" : "Індивідуальний"); // cardLabel — лише демо-пресети (назва послуги)
                        const allLines = [
                          { text: fName,     w: 800, c: si(0.95) },
                          ...(lName          ? [{ text: lName,     w: 700, c: si(0.80) }] : []),
                          { text: typeLabel, w: 600, c: si(0.58) },
                          ...(priceText      ? [{ text: priceText, w: 900, c: priceColor, shadow: !!b.surcharge }] : []),
                        ];
                        // Верхні 9px зарезервовані під час старту запису (праворуч зверху) —
                        // інакше прізвище/ім'я могли заходити під нього при малому зумі.
                        const availH = height - textTop - 4 - (queueCount > 0 ? 11 : 0); // знизу-ліворуч — бейдж черги
                        const availW = COL_W - 8;
                        const maxLinesByH = Math.max(1, Math.floor(availH / 10));
                        const maxLinesByW = COL_W < 44 ? 2 : COL_W < 58 ? 3 : 4;
                        const maxLines = Math.min(maxLinesByH, maxLinesByW);
                        const lines = allLines.slice(0, maxLines);
                        // Однаковий розмір у сусідніх картках: від ширини КОЛОНКИ (≈8 символів), а не від довжини тексту —
                        // інакше одне довге слово («Індивідуальний») робило всю картку дрібною. Довге — «…».
                        const fsByW = Math.max(6, Math.floor(availW / (8 * 0.62)));
                        const fsByH = Math.max(6, Math.floor(availH / (lines.length * 1.4)));
                        const fs = Math.min(11, fsByW, fsByH);
                        return (
                          <div style={{
                            position:"absolute", top:textTop, left:2, right:2, bottom: queueCount > 0 ? 13 : 2,
                            display:"flex", flexDirection:"column", justifyContent:"center",
                            alignItems:"center", gap:1,
                            overflow:"hidden", zIndex:2,
                          }}>
                            {lines.map((ln, i) => (
                              <div key={i} style={{
                                fontSize: fs, fontWeight: ln.w, color: ln.c,
                                lineHeight: 1.2, textAlign:"center",
                                whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis",
                                width:"100%",
                                // Надбавка (GOLD) інакше зливається з жовтим кольором слоту —
                                // темна обводка тримає контраст на будь-якому фоні картки.
                                textShadow: ln.shadow ? "0 0 3px rgba(0,0,0,0.85), 0 1px 2px rgba(0,0,0,0.7)" : "none",
                              }}>{ln.text}</div>
                            ))}
                          </div>
                        );
                      })()}
                      {/* № запису — кумулятивні години клієнта на момент цього запису */}
                      {!isBlock && !isVipSlot && !isPersonal && cumulativeHoursMap[b.id] != null && height >= 20 && (
                        <div style={{
                          position:"absolute", top:2, left:2, zIndex:4,
                          width:10, height:10, borderRadius:"50%",
                          background:"rgba(20,20,24,0.85)", color:"rgba(255,255,255,0.75)",
                          border:"1px solid rgba(255,255,255,0.2)",
                          fontSize:6, fontWeight:900, lineHeight:1,
                          display:"flex", alignItems:"center", justifyContent:"center",
                          pointerEvents:"none",
                        }}>{cumulativeHoursMap[b.id]}</div>
                      )}
                      {/* Час початку запису — праворуч зверху. Опущено нижче, якщо на картці
                          є мітка (бейдж-пігулка), щоб час не перекривався нею. */}
                      {!isBlock && !isVipSlot && !isPersonal && height >= 14 && showTime && (
                        <div style={{
                          position:"absolute", top:timeTop, right:3, zIndex:4,
                          fontSize:_timeFs,
                          fontWeight:800, lineHeight:1, color: neonCal && !isLight ? "rgba(255,255,255,0.92)" : "rgba(0,0,0,0.8)",
                          pointerEvents:"none",
                          textShadow: neonCal && !isLight ? "none" : "0 0 3px rgba(255,255,255,0.9), 0 0 1px rgba(255,255,255,0.9)",
                        }}>{b.time || fmtTime(b.startMin)}</div>
                      )}
                      {/* VIP crown badge for regular bookings marked as VIP — ліворуч зверху,
                          трохи правіше кружечка з к-стю записів, щоб не перекривались */}
                      {b.isVipOnly && !isVipSlot && height >= 14 && (
                        <div data-help="crown" style={{
                          position:"absolute", top:1, left: cumulativeHoursMap[b.id] != null && height >= 20 ? 13 : 2, zIndex:4,
                          fontSize:Math.min(11, Math.max(7, height/7)),
                          lineHeight:1, pointerEvents:"none",
                          filter:`drop-shadow(0 1px 3px ${shade(0.7)})`,
                        }}><MetalIcon name="crown" size={14}/></div>
                      )}
                      {/* Бейдж будильника — показує, що на подію виставлено нагадування */}
                      {isPersonal && b.reminderHours && height >= 14 && (
                        <div style={{
                          position:"absolute", top:3, right:3, zIndex:4,
                          fontSize:10, lineHeight:1,
                          filter:`drop-shadow(0 1px 2px ${shade(0.6)})`,
                          pointerEvents:"none",
                        }}><MetalIcon name="bell" size={14}/></div>
                      )}
                      {/* Queue badge */}
                      {queueCount > 0 && !isBlock && !isVipSlot && height >= 14 && (
                        <div data-help="queue" style={{
                          position:"absolute", bottom:3, left:3, zIndex:4,
                          background:`${shade(0.55)}`, borderRadius:5,
                          padding:"1px 4px", display:"flex", alignItems:"center", gap:2,
                          pointerEvents:"none",
                        }}>
                          <svg width="7" height="7" viewBox="0 0 24 24" fill={GOLD}><circle cx="12" cy="7" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>
                          <span style={{fontSize:7, fontWeight:800, color:GOLD, lineHeight:1}}>{queueCount}</span>
                        </div>
                      )}
                      {/* Кутик "є нотатка від клієнта" — низ-право, єдиний вільний
                          кут картки (верхній зайнятий часом/лічильником/короною,
                          нижньо-лівий — бейджем черги) */}
                      {b.studentNote && !isBlock && !isVipSlot && !isPersonal && height >= 14 && (
                        <>
                        <div className="note-corner-halo" style={{
                          position:"absolute", bottom:0, right:0, zIndex:3, width:24, height:24,
                          background:"radial-gradient(circle at 100% 100%, rgba(255,255,255,0.98) 0%, rgba(255,244,190,0.7) 30%, rgba(255,244,190,0) 72%)",
                          pointerEvents:"none",
                        }}/>
                        <div className="note-corner-glow" style={{
                          position:"absolute", bottom:0, right:0, zIndex:4,
                          width:0, height:0,
                          borderStyle:"solid", borderWidth:"0 0 9px 9px",
                          borderColor:"transparent transparent #f7c948 transparent",
                          borderBottomRightRadius:8,
                          filter:`drop-shadow(-1px -1px 2px ${shade(0.35)})`,
                          pointerEvents:"none",
                        }}/>
                        </>
                      )}
                      {!b._mergedIds && !isLockedPast && <div className="slot-handle bottom" style={{height:handleH}} onPointerDown={e=>onPointerDown(e,b,"bottom")}/>}

                    </div>

                    {/* ── Значок копіювання: тап = режим вставки, затиснути й тягнути = «привид» копії ── */}
                    {quickCancelId===b.id && !isBlock && !isVipSlot && !isPersonal && b.userId && !b._mergedIds && (
                      <div
                        onPointerDown={e=>{
                          e.stopPropagation();
                          copyPressRef.current = { src: b, x: e.clientX, y: e.clientY, dragging: false, target: null };
                        }}
                        onClick={e=>e.stopPropagation()}
                        style={{
                          position:"absolute", top:-11, left:-11, zIndex:30,
                          width:30, height:30, borderRadius:"50%",
                          display:"flex", alignItems:"center", justifyContent:"center",
                          cursor:"pointer", touchAction:"none",
                        }}>
                        <MetalIcon name="copy" size={30} color="#1d4ed8"/>
                      </div>
                    )}

                    {/* ── Нижні кружки-віяла: праве 💬 (зв'язок), ліве ⭐ (урок) ── */}
                    {quickCancelId===b.id && !isBlock && !isVipSlot && !isPersonal && b.userId && !b._mergedIds && [
                      { side:"r", pos:{ bottom:-11, right:-11 }, bg:"linear-gradient(145deg,#4ade80,#15803d)", sh:"#15803d99", icon:<MetalIcon name="chat" size={26}/> },
                      { side:"l", pos:{ bottom:-11, left:-11 },  bg:"linear-gradient(145deg,#fbbf24,#b45309)", sh:"#b4530999", icon:<MetalIcon name="star" size={26}/> },
                    ].map(c => (
                      <div key={c.side} data-fan="1"
                        onPointerDown={e=>e.stopPropagation()}
                        onClick={e=>{
                          e.stopPropagation();
                          if (xJustShownRef.current || Date.now() - copyPastedAtRef.current < 400) return;
                          if (fan && fan.b.id===b.id && fan.side===c.side) { setFan(null); return; }
                          setRatePanel(null);
                          openFan(e, c.side, b, isPast && b.status!=="cancelled" && b.status!=="noshow" && !b.reviewRequestedAt);
                        }}
                        style={{
                          position:"absolute", ...c.pos, zIndex:30,
                          width:30, height:30, borderRadius:"50%", background:c.bg,
                          boxShadow:`0 0 0 3px rgba(30,30,40,0.85), 0 4px 12px ${c.sh}`,
                          display:"flex", alignItems:"center", justifyContent:"center",
                          cursor:"pointer", fontSize:14, lineHeight:1, touchAction:"manipulation",
                        }}>{c.icon}</div>
                    ))}

                    {/* ── Значок скасування (довге натискання) — поза slot-base щоб не обрізатись ── */}
                    {quickCancelId===b.id && (
                      <div
                        onPointerDown={e=>e.stopPropagation()}
                        onClick={e=>{
                          e.stopPropagation();
                          xVisibleRef.current = false;
                          setQuickCancelId(null);
                          // Прямий запис cancelled у Firebase одразу (не покладаємось на 2с-таймер)
                          const idsCancel = b._mergedIds || [b.id];
                          idsCancel.forEach(id => {
                            const mb = bookingsRef.current?.find(x => x.id === id) || (id === b.id ? b : null);
                            if (!mb?.userId) return;
                            const ks = [...new Set([mb._fbKey, mb.id].filter(Boolean))];
                            ks.forEach(k => update(iRef( `bookings/${mb.userId}/${k}`),
                              { status:"cancelled", cancelledAt:Date.now(), cancelledBy:"admin" }).catch(()=>{}));
                          });
                          // Звільняємо слоти за єдиними правилами (phantom видаляється,
                          // справжні повертаються як були) — раніше ВСІ позиції, включно
                          // з проміжними phantom, ставали окремими 30-хв слотами.
                          if (b.startMin !== undefined && b.durMin && !b.groupKey) {
                            restoreSlotRange(b.date || absDayToDateStr(b.day), b.startMin, b.durMin + bufferOf(b)).catch(()=>{});
                          }
                          // Починаємо 2с відлік — затемнення → видалення
                          setCancellingSet(s=>new Set([...s, b.id, ...(b._mergedIds || [])]));
                          cancelTimers.current[b.id] = setTimeout(()=>{
                            setCancellingSet(s=>{ const ns=new Set(s); ns.delete(b.id); return ns; });
                            const idsX = b._mergedIds || [b.id];
                            setBookings(bs=>bs.filter(x=>!idsX.includes(x.id)));
                            delete cancelTimers.current[b.id];
                          }, 2000);
                        }}
                        style={{
                          position:"absolute", top:-11, right:-11, zIndex:30,
                          width:30, height:30, borderRadius:"50%",
                          display:"flex", alignItems:"center", justifyContent:"center",
                          cursor:"pointer",
                        }}>
                        <MetalIcon name="cross" size={30}/>
                      </div>
                    )}
                  </div>
                );
              })}
              </div>

              {/* Daily income sum — sticky bottom, moves with column natively (no scroll lag) */}
              {(() => {
                const daySum = (bookingsByDay.get(absDay) || EMPTY_LIST)
                  .filter(b=>b.type!=="block" && b.type!=="vip-slot" && b.type!=="personal" && b.status!=="cancelled" && b.status!=="noshow")
                  .reduce((s,b)=>s+computeBookingPrice(b, settings.services||[]),0);
                if (daySum<=0) return null;
                return (
                  <div data-help="daysum" style={{
                    // zIndex нижче за картки запису (zIndex:2, рядок ~2653) — щоб
                    // плашка суми лежала ПІД записами, а не ховала їх текст/ціну
                    // при скролі вниз, і показувалась лише над порожнім фоном.
                    position:"sticky", bottom:0, zIndex:1,
                    flexShrink:0, marginTop:4,
                    background:`linear-gradient(180deg, color-mix(in srgb, ${SURF_HI} 78%, transparent), color-mix(in srgb, ${SURFACE} 78%, transparent))`,
                    backdropFilter:"blur(10px)", WebkitBackdropFilter:"blur(10px)",
                    borderRadius:7,
                    border:`1px solid ${ink(0.08)}`,
                    boxShadow:`0 2px 6px ${shade(0.35)}`,
                    padding:"2px 4px",
                    textAlign:"center",
                    fontSize:10, fontWeight:800,
                    color:GREEN, letterSpacing:0.2,
                    lineHeight:1.4,
                  }}>{money(daySum.toLocaleString("uk"))}</div>
                );
              })()}
            </div>
            );
          }}/>
          </div>
        </div>

      {/* TODAY BUTTON */}
      {todayDir && (
        <button data-help="todayarrow"
          onClick={()=>{
            const el = gridRef.current;
            const cw = calcRef.current.COL_W;
            if (el && cw) el.scrollTo({ left: PAST_DAYS * (cw + 4), behavior:"smooth" });
          }}
          title="Сьогодні"
          style={{
            position:"absolute",
            bottom:4,
            right:8,
            zIndex:20,
            width:44,
            height:44,
            borderRadius:"50%",
            border:"none",
            background:BLUE,
            color:"#fff",
            cursor:"pointer",
            display:"flex",
            alignItems:"center",
            justifyContent:"center",
            boxShadow:"0 2px 10px rgba(0,0,0,0.3)",
            touchAction:"none",
          }}
        >
          {todayDir==="left" && <svg width="14" height="14" viewBox="0 0 10 10"><path d="M7 1L3 5l4 4" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>}
          {todayDir==="right" && <svg width="14" height="14" viewBox="0 0 10 10"><path d="M3 1l4 4-4 4" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>}
        </button>
      )}
      {/* Велика кнопка «?» поверх календаря: 30% висоти екрана зверху, 10% ширини справа. Вимикається в Налаштуваннях → Робочий графік */}
      {settings.showHelpBtn !== false && createPortal(
        <button
          onClick={()=>{ if (helpDrag.current?.moved) { helpDrag.current = null; return; } setHelpOpen(true); }}
          onPointerDown={e=>{
            const r = e.currentTarget.getBoundingClientRect();
            helpDrag.current = { dx:e.clientX - r.left, dy:e.clientY - r.top, sx:e.clientX, sy:e.clientY, moved:false };
            try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
          }}
          onPointerMove={e=>{
            const d = helpDrag.current; if (!d) return;
            if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 6) return;
            d.moved = true;
            setHelpPos({ x:Math.min(Math.max(0, e.clientX - d.dx), window.innerWidth - 46), y:Math.min(Math.max(0, e.clientY - d.dy), window.innerHeight - 46) });
          }}
          onPointerUp={()=>{
            if (helpDrag.current?.moved && helpPos) { try { localStorage.setItem("helpBtnPos", JSON.stringify(helpPos)); } catch { /* ignore */ } }
            if (!helpDrag.current?.moved) helpDrag.current = null; // перетягування: прапорець moved гасить наступний click
          }}
          onPointerCancel={()=>{ helpDrag.current = null; }}
          title="Підказки по розкладу. Утримуйте і перетягніть, щоб перемістити" aria-label="Підказки по розкладу" style={{
          position:"fixed", zIndex:60,
          left:Math.min(Math.max(0, helpPos ? helpPos.x : 2), window.innerWidth - 46),
          top:Math.min(Math.max(0, helpPos ? helpPos.y : window.innerHeight - 150), window.innerHeight - 46),
          touchAction:"none", userSelect:"none", WebkitUserSelect:"none", WebkitTouchCallout:"none",
          width:38, height:38, borderRadius:"50%", cursor:"grab", fontFamily:"inherit", opacity:0.85,
          border:"none", background:"transparent", padding:0, lineHeight:1,
          display:"flex", alignItems:"center", justifyContent:"center",
        }}><MetalIcon name="info" size={38}/></button>,
        document.getElementById("app-shell") || document.body
      )}
      {helpOpen && <ScheduleHelp onClose={()=>setHelpOpen(false)} onPick={key=>{ setHelpOpen(false); setTimeout(()=>highlightHelp(key), 280); }}/>}
      </div>{/* /outer flex */}

    </Card>

    {/* Кнопка «📅 Місячний календар» — портується в шапку (по центру, замість лого; ключик — тепер у стовпці часу) */}
    {keyPortalEl && createPortal(
      <button data-help="monthcal"
        onClick={openMonthCal}
        title="Місячний календар"
        style={{
          width:32, height:32, borderRadius:11, cursor:"pointer",
          background:"none", padding:0,
          border:"none",
          display:"flex", alignItems:"center", justifyContent:"center",
          transition:"background .15s", flexShrink:0,
        }}>
        <MetalIcon name="calendar" size={32}/>
      </button>
    , keyPortalEl)}

    {showMonthCal && (
      <MonthCalendarSheet
        key={calOpenKey}
        bookings={bookings}
        onClose={()=>setShowMonthCal(false)}
        onPickDate={(dateStr)=>{ if (setJumpTarget) setJumpTarget({ date: dateStr, ts: Date.now() }); }}
      />
    )}

    {confirmNode}
    <BookingModalFog booking={localSelectedBooking ? (bookings.find(x=>x.id===localSelectedBooking.id) || localSelectedBooking) : null} onClose={()=>setLocalSelectedBooking(null)}
      onAction={handleAction} settings={settings} bookings={bookings} onViewStudent={onViewStudent}
      autoTag={localSelectedBooking ? getAutoTag(localSelectedBooking) : null}
      mergeInfo={(() => {
        const mi = localSelectedBooking && mergeInfoMap[localSelectedBooking.id];
        if (!mi?.mergedIds?.length) return null;
        return { durMin: mi.mergedDurMin, price: mi.mergedPrice, count: mi.mergedIds.length + 1 };
      })()}/>

    {/* ── Модалка блокування ── */}
    {(blockModal || blockModalClosing) && (({BG,BG_DEEP,SURFACE,SURF_HI,SURF_LO,BORDER,TEXT,DIM,FAINT,ACCENT,ACC_HI,GREEN,BLUE,PURPLE,GOLD,RED,TEAL,SO,SI,GLOW,SHADE,INK,STRIPE_A,STRIPE_B,BTN_R,CARD_R,MODAL_R,BTN_TX,BTN_GRAD,BTN_SH}) => {
      const _closeBlock = () => setBlockModalClosing(true);
      return (
        <>
          <style>{`
            @keyframes _bl-up{from{transform:translateY(100%)}to{transform:translateY(0)}}
            @keyframes _bl-down{from{transform:translateY(0);opacity:1}to{transform:translateY(100%);opacity:0}}
            @keyframes _bl-bg-in{from{opacity:0}to{opacity:1}}
            @keyframes _bl-bg-out{from{opacity:1}to{opacity:0}}
          `}</style>
          <div onClick={blockModalClosing ? undefined : _closeBlock} style={{
            position:"fixed",inset:0,zIndex:200,background:shade(0.55),
            display:"flex",alignItems:"flex-end",justifyContent:"center",
            backdropFilter:"blur(8px)",
            animation: blockModalClosing ? `_bl-bg-out 0.26s ease-in forwards` : `_bl-bg-in 0.2s ease-out`,
          }}>
            <div onClick={e=>e.stopPropagation()}
              onAnimationEnd={blockModalClosing ? ()=>{ setBlockModalClosing(false); setBlockModal(null); } : undefined}
              style={{
                position:"relative",
                width:"100%",background:BG_DEEP,
                borderRadius:"24px 24px 0 0",
                boxShadow:`0 -2px 0 ${glow(0.08)}, 0 -16px 60px ${shade(0.8)}`,
                display:"flex",flexDirection:"column",overflow:"hidden",
                pointerEvents: blockModalClosing ? "none" : undefined,
                animation: blockModalClosing ? `_bl-down 0.26s ease-in forwards` : `_bl-up 0.38s cubic-bezier(0.34,1.56,0.64,1)`,
              }}>
              <button aria-label="Закрити" onClick={_closeBlock} style={{
                position:"absolute", top:10, right:12, zIndex:5,
                width:32,padding:0, height:32, borderRadius:"50%", border:"none", cursor:"pointer",
                background:"none", color:"#ef4444",
                display:"flex", alignItems:"center", justifyContent:"center",
                fontSize:13, fontWeight:800, lineHeight:1,
              }}><MetalIcon name="cross" size={32}/></button>
              {/* Hero */}
              <div style={{
                padding:"14px 16px 18px",
                background:`repeating-linear-gradient(45deg,${STRIPE_A},${STRIPE_A} 8px,${STRIPE_B} 8px,${STRIPE_B} 16px)`,
                position:"relative",
              }}>
                <div style={{width:38,height:4,borderRadius:2,background:`${ink(0.1)}`,margin:"0 auto 14px"}}/>
                <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:8,padding:"0 36px",textAlign:"center"}}>
                  <div style={{
                    width:50,height:50,borderRadius:25,flexShrink:0,
                    background:`${ink(0.06)}`,border:`1.5px solid ${ink(0.1)}`,
                    display:"flex",alignItems:"center",justifyContent:"center",
                  }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={ink(0.35)} strokeWidth="2" strokeLinecap="round">
                      <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                    </svg>
                  </div>
                  <div>
                    <div style={{fontSize:18,fontWeight:900,color:`${ink(0.5)}`,letterSpacing:-0.4}}>Заблоковано</div>
                    <div style={{fontSize:12,color:`${ink(0.25)}`,marginTop:3}}>
                      {getDayInfo(blockModal.day).fullLabel} · {fmtTime(blockModal.startMin)} · {fmtDur(blockModal.durMin)}
                    </div>
                  </div>
                </div>
              </div>
              {/* Buttons */}
              <div className="modal-footer" style={{padding:"14px 16px 28px",gap:10}}>
                <button onClick={_closeBlock} style={{
                  padding:"14px 8px",borderRadius:18,border:"none",cursor:"pointer",fontFamily:"inherit",
                  background:`linear-gradient(135deg,${SURF_HI},${SURFACE})`,
                  color:DIM,fontSize:14,fontWeight:800,boxShadow:SO,
                }}>Закрити</button>
                <button onClick={()=>{
                  setBookings(bs=>bs.filter(x=>x.id!==blockModal.id));
                  _closeBlock();
                }} style={{
                  padding:"14px 8px",borderRadius:18,border:"none",cursor:"pointer",fontFamily:"inherit",
                  background:`linear-gradient(160deg,${GREEN},#4ade80)`,
                  color:"#fff",fontSize:14,fontWeight:800,
                  boxShadow:`0 6px 20px ${GREEN}55`,
                }}>Розблокувати</button>
              </div>
            </div>
          </div>
        </>
      );
    })(FOG_STYLE.theme)}

    {addSlotPos && (({BG,BG_DEEP,SURFACE,SURF_HI,SURF_LO,BORDER,TEXT,DIM,FAINT,ACCENT,ACC_HI,GREEN,BLUE,PURPLE,GOLD,RED,TEAL,SO,SI,GLOW,SHADE,INK,STRIPE_A,STRIPE_B,BTN_R,CARD_R,MODAL_R,BTN_TX,BTN_GRAD,BTN_SH}) => (
      <div onClick={()=>setAddSlotPos(null)} style={{position:"fixed",inset:0,zIndex:150}}>
        <div onClick={e=>e.stopPropagation()} style={{
          position:"absolute",
          top: Math.max(60, Math.min(addSlotPos.clientY - 50, window.innerHeight - 110)),
          left: Math.max(10, Math.min(addSlotPos.clientX - 10, window.innerWidth - 180)),
          width:168, maxWidth:"calc(100vw - 24px)",
          background:`linear-gradient(135deg,${SURFACE},${BG_DEEP})`,
          borderRadius:14, padding:"10px 12px",
          boxShadow:"0 8px 32px rgba(0,0,0,0.65),inset 1px 1px 0 rgba(255,255,255,0.08)",
          border:`1px solid ${BORDER}`
        }}>
          <div style={{fontSize:18,fontWeight:900,color:TEXT,marginBottom:8,letterSpacing:0.5}}>
            {fmtTime(addSlotPos.startMin)}
          </div>
          <button onClick={()=>{
            const hh = String(Math.floor(addSlotPos.startMin/60)).padStart(2,'0');
            const mm = String(addSlotPos.startMin%60).padStart(2,'0');
            update(iRef( `${slotRoot()}/${addSlotPos.dateStr}/slot${hh}${mm}`), {
              available: true, time: `${hh}:${mm}`, lunchOverride: true // ручне відкриття: клієнт не ховає слот фільтром обіду/шаблону
            }).catch(()=>{});
            setAddSlotPos(null);
          }} style={{
            width:"100%",padding:"9px 12px",borderRadius:10,border:"none",cursor:"pointer",
            background:`linear-gradient(165deg,rgba(99,211,120,0.9),rgba(34,197,94,0.85))`,
            color:"#fff",fontSize:12,fontWeight:800,
            boxShadow:`0 4px 12px rgba(99,211,120,0.35)`,
          }}>+ Вільний слот</button>
        </div>
      </div>
    ))(FOG_STYLE.theme)}

    {bubbleData && (({BG,BG_DEEP,SURFACE,SURF_HI,SURF_LO,BORDER,TEXT,DIM,FAINT,ACCENT,ACC_HI,GREEN,BLUE,PURPLE,GOLD,RED,TEAL,SO,SI,GLOW,SHADE,INK,STRIPE_A,STRIPE_B,BTN_R,CARD_R,MODAL_R,BTN_TX,BTN_GRAD,BTN_SH}) => (
      <div onClick={()=>setBubbleData(null)} style={{position:"fixed",inset:"0 0 80px 0",zIndex:100}}>
        <div onClick={e=>e.stopPropagation()} style={{
          position:"absolute",
          top: Math.max(60, Math.min(bubbleData.clientY - 50, window.innerHeight - 120)),
          left: Math.max(10, Math.min(bubbleData.clientX - 10, window.innerWidth - 180)),
          width:168, maxWidth:"calc(100vw - 24px)",
          background:`linear-gradient(135deg,${SURFACE},${BG_DEEP})`,
          borderRadius:14, padding:"10px 12px",
          boxShadow:`0 8px 32px ${shade(0.65)},inset 1px 1px 0 ${glow(0.08)}`,
          border:`1px solid ${BORDER}`
        }}>
          <div style={{fontSize:18,fontWeight:900,color:TEXT,marginBottom:8,letterSpacing:0.5}}>
            {fmtTime(bubbleData.startMin)}
            <span style={{fontSize:10,fontWeight:600,color:TEXT_DIM,marginLeft:6}}>
              {getDayInfo(bubbleData.day).label} {getDayInfo(bubbleData.day).num}
            </span>
          </div>
          <button onClick={()=>{setFormData(bubbleData);setBubbleData(null);}} style={{
            width:"100%",padding:"9px 12px",borderRadius:10,border:"none",cursor:"pointer",
            background:`linear-gradient(165deg,#f59e0b,#d97706)`,
            color:"#fff",fontSize:12,fontWeight:800,
            boxShadow:`0 4px 12px rgba(245,158,11,0.4)`,
          }}><span style={{display:"inline-flex",alignItems:"center",gap:7}}><MetalIcon name="user" size={20}/>Записати клієнта</span></button>
          <button onClick={()=>{
            const sh = String(Math.floor(bubbleData.startMin/60)).padStart(2,'0');
            const sn = String(bubbleData.startMin%60).padStart(2,'0');
            setPersonalEventData({ dateStr: bubbleData.dateStr || absDayToDateStr(bubbleData.day), time: `${sh}:${sn}` });
            setBubbleData(null);
          }} style={{
            marginTop:8, width:"100%",padding:"9px 12px",borderRadius:10,cursor:"pointer",
            background:"rgba(45,212,191,0.12)",
            color:"#2dd4bf",fontSize:12,fontWeight:800,
            border:"1px solid rgba(45,212,191,0.3)",
          }}><span style={{display:"inline-flex",alignItems:"center",gap:7}}><MetalIcon name="pushpin" size={20}/>Особиста подія</span></button>
        </div>
      </div>
    ))(FOG_STYLE.theme)}

    {(longTapMenu || ltmClosing || ltmScatter) && (({BG,BG_DEEP,SURFACE,SURF_HI,SURF_LO,BORDER,TEXT,DIM,FAINT,ACCENT,ACC_HI,GREEN,BLUE,PURPLE,GOLD,RED,TEAL,SO,SI,GLOW,SHADE,INK,STRIPE_A,STRIPE_B,BTN_R,CARD_R,MODAL_R,BTN_TX,BTN_GRAD,BTN_SH}) => {
      const _menu = longTapMenu || {};
      const _closeLtm = () => setLtmClosing(true);
      const _scatterLtm = (cb) => {
        setLtmScatter(true);
        setTimeout(() => { setLtmScatter(false); setLongTapMenu(null); if(cb) cb(); }, 400);
      };
      const _ltmD = _menu.dateStr ? new Date(_menu.dateStr + "T12:00:00") : new Date();
      const _ltmLabel = _ltmD.toLocaleDateString("uk", { weekday:"short", day:"numeric", month:"short" });
      const _anyClose = ltmClosing || ltmScatter;
      return (
      <>
        <style>{`
          @keyframes _ltm-up{from{transform:translateY(100%)}to{transform:translateY(0)}}
          @keyframes _ltm-down{from{transform:translateY(0);opacity:1}to{transform:translateY(100%);opacity:0}}
          @keyframes _ltm-bg-in{from{opacity:0}to{opacity:1}}
          @keyframes _ltm-bg-out{from{opacity:1}to{opacity:0}}
          @keyframes _ltm-sc-sheet{from{opacity:1}to{opacity:0}}
          @keyframes _ltm-sc-l{from{transform:translate(0,0) rotate(0);opacity:1}to{transform:translate(-180px,70px) rotate(-22deg);opacity:0}}
          @keyframes _ltm-sc-c{from{transform:translate(0,0) scale(1);opacity:1}to{transform:translate(0,-90px) scale(0.3);opacity:0}}
          @keyframes _ltm-sc-r{from{transform:translate(0,0) rotate(0);opacity:1}to{transform:translate(180px,70px) rotate(22deg);opacity:0}}
          @keyframes _ltm-sc-chips{from{transform:translateY(0);opacity:1}to{transform:translateY(-50px);opacity:0}}
          .ltm-btns{display:flex;gap:10px}
          .ltm-btns>button{min-width:0}
          @media (max-width:379px){.ltm-btns{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}}
        `}</style>
        <div onClick={_anyClose ? undefined : ()=>{ if (Date.now() - overlayOpenedAtRef.current < 700) return; _closeLtm(); }} style={{
          position:"fixed",inset:0,zIndex:200,
          background:`${shade(0.55)}`,
          display:"flex",alignItems:"flex-end",
          animation: _anyClose ? `_ltm-bg-out 0.38s ease-in forwards` : `_ltm-bg-in 0.2s ease-out`,
        }}>
          <div onClick={e=>e.stopPropagation()}
            onAnimationEnd={ltmClosing ? ()=>{ setLtmClosing(false); setLongTapMenu(null); } : undefined}
            style={{
              position:"relative",
              width:"100%",
              background:`linear-gradient(180deg,${SURFACE},${BG_DEEP})`,
              borderRadius:"20px 20px 0 0",
              padding:"10px 16px 32px",
              boxShadow:`0 -8px 40px ${shade(0.6)},inset 0 1px 0 ${glow(0.08)}`,
              border:`1px solid ${BORDER}`,borderBottom:"none",
              pointerEvents: _anyClose ? "none" : undefined,
              animation: ltmClosing
                ? `_ltm-down 0.26s ease-in forwards`
                : ltmScatter
                  ? `_ltm-sc-sheet 0.38s ease-in forwards`
                  : `_ltm-up 0.38s cubic-bezier(0.34,1.56,0.64,1)`,
            }}>
            {!_anyClose && (
              <button aria-label="Закрити" onClick={_closeLtm} style={{
                position:"absolute", top:8, right:12, zIndex:5,
                width:32,padding:0, height:32, borderRadius:"50%", border:"none", cursor:"pointer",
                background:"none", color:"#ef4444",
                display:"flex", alignItems:"center", justifyContent:"center",
                fontSize:13, fontWeight:800, lineHeight:1,
              }}><MetalIcon name="cross" size={32}/></button>
            )}
            {/* handle */}
            <div style={{width:36,height:4,borderRadius:2,background:ink(0.18),margin:"0 auto 14px"}}/>
            {/* header — time chips */}
            {!ltmClosing && <div style={{marginBottom:16,
              ...(ltmScatter ? {animation:`_ltm-sc-chips 0.25s ease-in forwards`} : {}),
            }}>
              <div style={{fontSize:12,color:TEXT_DIM,fontWeight:700,marginBottom:10,textAlign:"center",margin:"0 40px 10px"}}>{_ltmLabel}</div>
              <div style={{display:"flex",gap:4,alignItems:"stretch"}}>
                {[-60,-30,0,30,60].map(delta=>{
                  const _cm = _menu.startMin + delta;
                  if (_cm < 0 || _cm > 23*60+30) return null;
                  const _isActive = _cm === (_menu.selectedMin ?? _menu.startMin);
                  return (
                    <button key={delta} onClick={()=>setLongTapMenu(prev=>({...prev,selectedMin:_cm}))} style={{
                      flex:1,padding:"8px 2px",borderRadius:20,cursor:"pointer",fontFamily:"inherit",
                      background: _isActive ? ink(0.14) : "transparent",
                      color: _isActive ? TEXT : TEXT_DIM,
                      fontSize: _isActive ? 18 : 13,
                      fontWeight: _isActive ? 900 : 500,
                      letterSpacing: _isActive ? 0.3 : 0,
                      border: _isActive ? `1px solid ${ink(0.22)}` : `1px solid ${ink(0.07)}`,
                      transition: ltmScatter ? "none" : "all 0.15s",
                      textAlign:"center",
                    }}>
                      {fmtTime(_cm)}
                    </button>
                  );
                })}
              </div>
            </div>}
            {/* buttons row */}
            {!ltmClosing && <div className="ltm-btns">
              {/* "Вільний слот" доступна і на закритому дні — адмін може вручну
                  відкрити окремий слот, не відкриваючи весь день: клієнт бачить
                  слоти напряму з timeslots/{date} незалежно від статусу дня. */}
              <button onClick={()=>{
                  const _sm = _menu.selectedMin ?? _menu.startMin;
                  const _hh = String(Math.floor(_sm/60)).padStart(2,'0');
                  const _mm = String(_sm%60).padStart(2,'0');
                  // lunchOverride — сигнал клієнтському застосунку не ховати
                  // цей слот своїм окремим фільтром обідньої перерви (він
                  // фільтрує за часом незалежно від того, чи слот реально
                  // існує в базі) — адмін відкрив його вручну саме на цей час.
                  update(iRef( `${slotRoot()}/${_menu.dateStr}/slot${_hh}${_mm}`), { available: true, time: `${_hh}:${_mm}`, lunchOverride: true }).catch(()=>{});
                  _closeLtm();
                }} style={{
                  flex:1,padding:"16px 8px",borderRadius:16,cursor:"pointer",fontFamily:"inherit",
                  background:`linear-gradient(160deg,rgba(99,211,120,0.22),rgba(34,197,94,0.14))`,
                  color:GREEN,fontSize:12,fontWeight:800,
                  display:"flex",flexDirection:"column",alignItems:"center",gap:6,
                  border:`1px solid rgba(99,211,120,0.28)`,
                  ...(ltmScatter ? {animation:`_ltm-sc-l 0.32s ease-in forwards`} : {}),
                }}>
                  <span style={{display:"inline-flex"}}><MetalIcon name="clock" size={28}/></span>
                  Вільний слот
                </button>
              <button onClick={()=>{
                setPersonalEventData({ dateStr: _menu.dateStr, time: fmtTime(_menu.selectedMin ?? _menu.startMin) });
                _scatterLtm();
              }} style={{
                flex:1,padding:"16px 8px",borderRadius:16,cursor:"pointer",fontFamily:"inherit",
                background:"rgba(45,212,191,0.1)",
                color:"#2dd4bf",fontSize:12,fontWeight:800,
                display:"flex",flexDirection:"column",alignItems:"center",gap:6,
                border:"1px solid rgba(45,212,191,0.22)",
                ...(ltmScatter ? {animation:`_ltm-sc-c 0.28s ease-in forwards`} : {}),
              }}>
                <span style={{display:"inline-flex"}}><MetalIcon name="pushpin" size={28}/></span>
                Особиста подія
              </button>
              <button onClick={()=>{
                const _sm = _menu.selectedMin ?? _menu.startMin;
                const today = new Date(); today.setHours(0,0,0,0);
                const dayOffset = Math.floor((new Date(_menu.dateStr + "T12:00:00") - today) / 86400000);
                setFormData({ day: Math.max(0, dayOffset), startMin: _sm });
                _scatterLtm();
              }} style={{
                flex:1,padding:"16px 8px",borderRadius:16,cursor:"pointer",fontFamily:"inherit",
                background:"rgba(99,102,241,0.1)",
                color:"#818cf8",fontSize:12,fontWeight:800,
                display:"flex",flexDirection:"column",alignItems:"center",gap:6,
                border:"1px solid rgba(99,102,241,0.22)",
                ...(ltmScatter ? {animation:`_ltm-sc-c 0.28s ease-in forwards`} : {}),
              }}>
                <span style={{display:"inline-flex"}}><MetalIcon name="note" size={28}/></span>
                Додати запис
              </button>
              <button onClick={()=>{
                toggleDayBlocked(_menu.dateStr);
                _closeLtm();
              }} style={{
                flex:1,padding:"16px 8px",borderRadius:16,cursor:"pointer",fontFamily:"inherit",
                background:"rgba(239,68,68,0.09)",
                color:"#f87171",fontSize:12,fontWeight:800,
                display:"flex",flexDirection:"column",alignItems:"center",gap:6,
                border:"1px solid rgba(239,68,68,0.2)",
                ...(ltmScatter ? {animation:`_ltm-sc-r 0.32s ease-in forwards`} : {}),
              }}>
                <span style={{display:"inline-flex"}}><MetalIcon name="lock" size={28}/></span>
                {_menu.isClosedDay ? "Відкрити" : "Закрити"} день
              </button>
            </div>}
          </div>
        </div>
      </>
      );
    })(FOG_STYLE.theme)}

    {/* ── Меню опцій слота (довгий тап на вільний слот) — bottom sheet ── */}
    {(slotOptions || slotClosing) && (({BG,BG_DEEP,SURFACE,SURF_HI,SURF_LO,BORDER,TEXT,DIM,FAINT,ACCENT,ACC_HI,GREEN,BLUE,PURPLE,GOLD,RED,TEAL,SO,SI,GLOW,SHADE,INK,STRIPE_A,STRIPE_B,BTN_R,CARD_R,MODAL_R,BTN_TX,BTN_GRAD,BTN_SH}) => {
      const _so = slotOptions || {};
      const _closeSO = () => { setFixedPriceEditing(false); setSlotClosing(true); };
      const _soStartMin = _so.startTime
        ? (([h,m]) => h*60+m)(_so.startTime.split(":").map(Number))
        : 0;
      const _soSelMin = _so.selectedMin ?? _soStartMin;
      return (
      <>
        <style>{`
          @keyframes _so-up{from{transform:translateY(100%)}to{transform:translateY(0)}}
          @keyframes _so-down{from{transform:translateY(0);opacity:1}to{transform:translateY(100%);opacity:0}}
          @keyframes _so-bg-in{from{opacity:0}to{opacity:1}}
          @keyframes _so-bg-out{from{opacity:1}to{opacity:0}}
        `}</style>
        <div onClick={slotClosing ? undefined : ()=>{ if (Date.now() - overlayOpenedAtRef.current < 700) return; _closeSO(); }} style={{
          position:"fixed",inset:0,zIndex:200,
          background:`${shade(0.55)}`,
          display:"flex",alignItems:"flex-end",justifyContent:"center",
          backdropFilter:"blur(8px)",
          animation: slotClosing ? `_so-bg-out 0.26s ease-in forwards` : `_so-bg-in 0.2s ease-out`,
        }}>
          <div onClick={e=>e.stopPropagation()}
            onAnimationEnd={slotClosing ? ()=>{ setSlotClosing(false); setSlotOptions(null); } : undefined}
            style={{
              position:"relative",
              width:"100%",
              background:BG_DEEP,
              borderRadius:"24px 24px 0 0",
              boxShadow:`0 -2px 0 rgba(34,197,94,0.3), 0 -16px 60px ${shade(0.6)}`,
              maxHeight:"85vh",overflowY:"auto",
              WebkitOverflowScrolling:"touch",scrollbarWidth:"none",
              pointerEvents: slotClosing ? "none" : undefined,
              animation: slotClosing
                ? `_so-down 0.26s ease-in forwards`
                : `_so-up 0.38s cubic-bezier(0.34,1.56,0.64,1)`,
            }}>
            <button aria-label="Закрити" onClick={_closeSO} style={{
              position:"absolute", top:10, right:12, zIndex:5,
              width:32,padding:0, height:32, borderRadius:"50%", border:"none", cursor:"pointer",
              background:"none", color:"#ef4444",
              display:"flex", alignItems:"center", justifyContent:"center",
              fontSize:13, fontWeight:800, lineHeight:1,
            }}><MetalIcon name="cross" size={32}/></button>
            {/* header (includes handle) */}
            <div style={{
              padding:"10px 18px 14px",
              background:"linear-gradient(145deg,rgba(34,197,94,0.12),rgba(22,163,74,0.05))",
              borderBottom:"1px solid rgba(34,197,94,0.15)",
              borderRadius:"24px 24px 0 0",
            }}>
              <div style={{width:36,height:4,borderRadius:2,background:"rgba(34,197,94,0.35)",margin:"0 auto 12px"}}/>
              <div style={{textAlign:"center",padding:"0 36px"}}>
              <div style={{fontSize:18,fontWeight:800,color:"#22c55e"}}><span style={{display:"inline-flex",alignItems:"center",gap:7}}><MetalIcon name="plusCircle" size={28}/>Вільний слот</span></div>
              <div style={{fontSize:12,color:TEXT_FAINT,marginTop:2}}>{_so.dateStr} · {fmtTime(_soSelMin)}</div>
              </div>
            </div>
            {/* time chips */}
            <div style={{padding:"12px 16px 4px"}}>
              <div style={{fontSize:11,color:TEXT_FAINT,fontWeight:600,marginBottom:8,textAlign:"center"}}>Оберіть час</div>
              <div style={{display:"flex",gap:4,alignItems:"center"}}>
                {[-60,-30,0,30,60].map(delta=>{
                  const _cm = _soStartMin + delta;
                  if (_cm < 0 || _cm > 23*60+59) return null;
                  const _isActive = _cm === _soSelMin;
                  return (
                    <button key={delta} onClick={()=>setSlotOptions(prev=>({...prev, selectedMin:_cm}))} style={{
                      flex:1,padding:"8px 2px",borderRadius:20,cursor:"pointer",fontFamily:"inherit",
                      background: _isActive ? ink(0.14) : "transparent",
                      color: _isActive ? TEXT : TEXT_DIM,
                      fontSize: _isActive ? 18 : 13,
                      fontWeight: _isActive ? 900 : 500,
                      border: _isActive ? `1px solid ${ink(0.22)}` : `1px solid ${ink(0.07)}`,
                      transition:"all 0.15s",
                      textAlign:"center",
                    }}>
                      {fmtTime(_cm)}
                    </button>
                  );
                })}
              </div>
            </div>
            {/* actions */}
            <div className="win-cols win-gap" style={{padding:"8px 10px 12px",gap:5}}>
              {/* Додати запис */}
              <button onClick={()=>{
                const today = new Date(); today.setHours(0,0,0,0);
                const slotDate = new Date(_so.dateStr + "T00:00:00");
                const day = Math.round((slotDate - today) / (1000 * 60 * 60 * 24));
                setFormData({ startMin: _soSelMin, day });
                setSlotOptions(null);
              }} style={{
                width:"100%",padding:"13px 14px",border:"none",cursor:"pointer",
                background:"rgba(245,158,11,0.09)",borderRadius:14,
                color:"#f59e0b",fontSize:15,fontWeight:700,
                display:"flex",alignItems:"center",gap:10,
              }}>
                <span style={{display:"inline-flex"}}><MetalIcon name="user" size={26}/></span> Додати запис
              </button>
              {/* Особиста подія */}
              <button onClick={()=>{
                setPersonalEventData({ dateStr: _so.dateStr, time: fmtTime(_soSelMin), slot: _so.slot });
                setSlotOptions(null);
              }} style={{
                width:"100%",padding:"13px 14px",border:"none",cursor:"pointer",
                background:"rgba(45,212,191,0.09)",borderRadius:14,
                color:"#2dd4bf",fontSize:15,fontWeight:700,
                display:"flex",alignItems:"center",gap:10,
              }}>
                <span style={{display:"inline-flex"}}><MetalIcon name="pushpin" size={26}/></span> Особиста подія
              </button>
              {/* Розіслати клієнтам */}
              <button onClick={()=>{
                setBroadcastInit({ date: _so.dateStr, slot: fmtTime(_soSelMin) });
                setSlotOptions(null);
              }} style={{
                width:"100%",padding:"13px 14px",border:"none",cursor:"pointer",
                background:"rgba(129,140,248,0.09)",borderRadius:14,
                color:"#818cf8",fontSize:15,fontWeight:700,
                display:"flex",alignItems:"center",gap:10,
              }}>
                <span style={{display:"inline-flex"}}><MetalIcon name="mega" size={26}/></span> Розіслати клієнтам
              </button>
              {/* VIP слот */}
              <button onClick={()=>applySlotOption(_so.dateStr, fmtTime(_soSelMin), "vip")} style={{
                width:"100%",padding:"13px 14px",border:"none",cursor:"pointer",
                background:"rgba(192,132,252,0.09)",borderRadius:14,
                color:"#c084fc",fontSize:15,fontWeight:700,
                display:"flex",alignItems:"center",gap:10,
              }}>
                <span style={{display:"inline-flex"}}><MetalIcon name="crown" size={26}/></span> VIP слот
                {_so.slot?.vipOnly && <span style={{marginLeft:"auto",fontSize:11,color:"#c084fc",opacity:0.7}}>✓ активний</span>}
              </button>
              {/* Індивідуальний слот */}
              <button onClick={()=>applySlotOption(_so.dateStr, fmtTime(_soSelMin), "private")} style={{
                width:"100%",padding:"13px 14px",border:"none",cursor:"pointer",
                background:"rgba(234,179,8,0.09)",borderRadius:14,
                color:"#eab308",fontSize:15,fontWeight:700,
                display:"flex",alignItems:"center",gap:10,
              }}>
                <span style={{display:"inline-flex"}}><MetalIcon name="user" size={26}/></span> Індивідуальний слот
                {_so.slot?.privateOnly && <span style={{marginLeft:"auto",fontSize:11,color:"#eab308",opacity:0.7}}>✓ активний</span>}
              </button>
              {/* Фіксована ціна — повністю замінює тарифну ціну послуги для цього слота */}
              <button onClick={()=>{
                setFixedPriceInput(_so.slot?.fixedPrice != null ? String(_so.slot.fixedPrice) : "");
                setFixedPriceEditing(v=>!v);
              }} style={{
                width:"100%",padding:"13px 14px",border:"none",cursor:"pointer",
                background:"rgba(74,222,128,0.09)",borderRadius:14,
                color:GREEN,fontSize:15,fontWeight:700,
                display:"flex",alignItems:"center",gap:10,
              }}>
                <span style={{display:"inline-flex"}}><MetalIcon name="coin" size={26}/></span> Фіксована ціна
                {_so.slot?.fixedPrice != null && <span style={{marginLeft:"auto",fontSize:11,color:GREEN,opacity:0.8}}>{money(_so.slot.fixedPrice)}</span>}
              </button>
              {fixedPriceEditing && (
                <div style={{display:"flex",gap:8,padding:"2px 2px 6px"}}>
                  <input type="number" min={0} step={50} autoFocus value={fixedPriceInput}
                    onChange={e=>setFixedPriceInput(e.target.value)}
                    placeholder={`Сума, ${curSym()}`}
                    style={{flex:1,minWidth:0,width:0,padding:"10px 12px",borderRadius:10,border:`1px solid ${ink(0.12)}`,background:BG_DEEP,color:TEXT,fontSize:14,fontWeight:700,fontFamily:"inherit"}}/>
                  {_so.slot?.fixedPrice != null && (
                    <button onClick={()=>{ applySlotOption(_so.dateStr, fmtTime(_soSelMin), "fixedPrice_remove"); setFixedPriceEditing(false); }} style={{
                      flexShrink:0,padding:"10px 14px",borderRadius:10,border:"none",cursor:"pointer",fontFamily:"inherit",
                      background:"rgba(239,68,68,0.12)",color:"#f87171",fontSize:13,fontWeight:700,
                    }}>Скинути</button>
                  )}
                  <button onClick={()=>{
                    const n = Math.max(0, parseInt(fixedPriceInput, 10) || 0);
                    if (!fixedPriceInput || n <= 0) return;
                    applySlotOption(_so.dateStr, fmtTime(_soSelMin), { fixedPrice: n });
                    setFixedPriceEditing(false);
                  }} style={{
                    flexShrink:0,padding:"10px 16px",borderRadius:10,border:"none",cursor:"pointer",fontFamily:"inherit",
                    background:GREEN,color:"#062910",fontSize:13,fontWeight:800,
                  }}>Застосувати</button>
                </div>
              )}
              {/* Надбавка — фіксована сума з налаштувань (Settings → Надбавки) */}
              <button onClick={()=>setSurchargeEditing(v=>!v)} style={{
                width:"100%",padding:"13px 14px",border:"none",cursor:"pointer",
                background:"rgba(245,158,11,0.09)",borderRadius:14,
                color:GOLD,fontSize:15,fontWeight:700,
                display:"flex",alignItems:"center",gap:10,
              }}>
                <span style={{display:"inline-flex"}}><MetalIcon name="bolt" size={26}/></span> Надбавка
                {_so.slot?.surcharge ? <span style={{marginLeft:"auto",fontSize:11,color:GOLD,opacity:0.8}}>+{money(_so.slot.surcharge)}</span> : null}
              </button>
              {surchargeEditing && (
                <div style={{display:"flex",gap:6,padding:"2px 2px 6px"}}>
                  {(settings.surcharges || []).map(amt=>{
                    const _isActive = _so.slot?.surcharge === amt;
                    return (
                      <button key={amt} onClick={()=>{ applySlotOption(_so.dateStr, fmtTime(_soSelMin), amt); setSurchargeEditing(false); }} style={{
                        flex:1,padding:"9px 4px",borderRadius:20,cursor:"pointer",fontFamily:"inherit",
                        background: _isActive ? "rgba(245,158,11,0.22)" : "transparent",
                        color: _isActive ? "#f59e0b" : GOLD,
                        fontSize:14,fontWeight:700,
                        border: _isActive ? `1px solid rgba(245,158,11,0.5)` : `1px solid ${ink(0.1)}`,
                        textAlign:"center",
                      }}>+{money(amt)}</button>
                    );
                  })}
                  {_so.slot?.surcharge != null && (
                    <button aria-label="Прибрати надбавку" onClick={()=>{ applySlotOption(_so.dateStr, fmtTime(_soSelMin), "surcharge_remove"); setSurchargeEditing(false); }} style={{
                      padding:"9px 12px",borderRadius:20,border:"none",cursor:"pointer",fontFamily:"inherit",
                      background:"rgba(239,68,68,0.12)",color:"#f87171",fontSize:13,fontWeight:700,
                    }}>×</button>
                  )}
                </div>
              )}
              {/* Заблокувати / Розблокувати слот */}
              <button onClick={()=>{
                toggleSlotFree(_so.dateStr, fmtTime(_soSelMin), _so.slot);
                _closeSO();
              }} style={{
                width:"100%",padding:"13px 14px",border:"none",cursor:"pointer",
                background: _so.slot?.adminBlocked ? "rgba(34,197,94,0.09)" : "rgba(239,68,68,0.09)",
                borderRadius:14,
                color: _so.slot?.adminBlocked ? GREEN : "#f87171",
                fontSize:15,fontWeight:700,
                display:"flex",alignItems:"center",gap:10,
              }}>
                <span style={{display:"inline-flex"}}>{<MetalIcon name="ban" size={26}/>}</span>
                {_so.slot?.adminBlocked ? "Розблокувати слот" : "Заблокувати слот"}
              </button>
              {/* Видалити слот повністю */}
              <button onClick={()=>{
                deleteSlot(_so.dateStr, fmtTime(_soSelMin));
                _closeSO();
              }} style={{
                width:"100%",padding:"13px 14px",border:"none",cursor:"pointer",
                background:"rgba(239,68,68,0.09)",borderRadius:14,
                color:"#f87171",fontSize:15,fontWeight:700,
                display:"flex",alignItems:"center",gap:10,
              }}>
                <span style={{display:"inline-flex"}}><MetalIcon name="trash" size={26}/></span> Видалити слот
              </button>
            </div>
            {/* Скинути — тільки якщо є що скидати */}
            {(_so.slot?.vipOnly || _so.slot?.privateOnly || _so.slot?.surcharge || _so.slot?.fixedPrice) && (
              <div style={{padding:"4px 16px 32px"}}>
                <button onClick={()=>applySlotOption(_so.dateStr, fmtTime(_soSelMin), "reset")} style={{
                  width:"100%",padding:"12px 0 0",border:"none",cursor:"pointer",
                  background:"none",color:TEXT_FAINT,fontSize:13,fontWeight:600,
                }}>Скинути</button>
              </div>
            )}
          </div>
        </div>
      </>
      );
    })(FOG_STYLE.theme)}

    {/* ── VIP слот модалка ── */}
    {(vipSlotModal || vipSlotModalClosing) && (({BG,BG_DEEP,SURFACE,SURF_HI,SURF_LO,BORDER,TEXT,DIM,FAINT,ACCENT,ACC_HI,GREEN,BLUE,PURPLE,GOLD,RED,TEAL,SO,SI,GLOW,SHADE,INK,STRIPE_A,STRIPE_B,BTN_R,CARD_R,MODAL_R,BTN_TX,BTN_GRAD,BTN_SH}) => {
      const _closeVip = () => setVipSlotModalClosing(true);
      return (
        <>
          <style>{`
            @keyframes _vip-up{from{transform:translateY(100%)}to{transform:translateY(0)}}
            @keyframes _vip-down{from{transform:translateY(0);opacity:1}to{transform:translateY(100%);opacity:0}}
            @keyframes _vip-bg-in{from{opacity:0}to{opacity:1}}
            @keyframes _vip-bg-out{from{opacity:1}to{opacity:0}}
          `}</style>
          <div onClick={vipSlotModalClosing ? undefined : _closeVip} style={{
            position:"fixed",inset:0,zIndex:200,background:shade(0.55),
            display:"flex",alignItems:"flex-end",justifyContent:"center",
            backdropFilter:"blur(8px)",
            animation: vipSlotModalClosing ? `_vip-bg-out 0.26s ease-in forwards` : `_vip-bg-in 0.2s ease-out`,
          }}>
            <div onClick={e=>e.stopPropagation()}
              onAnimationEnd={vipSlotModalClosing ? ()=>{ setVipSlotModalClosing(false); setVipSlotModal(null); } : undefined}
              style={{
                position:"relative",
                width:"100%",background:BG_DEEP,
                borderRadius:"24px 24px 0 0",
                boxShadow:`0 -2px 0 rgba(168,85,247,0.4), 0 -16px 60px ${shade(0.8)}`,
                display:"flex",flexDirection:"column",overflow:"hidden",
                pointerEvents: vipSlotModalClosing ? "none" : undefined,
                animation: vipSlotModalClosing ? `_vip-down 0.26s ease-in forwards` : `_vip-up 0.38s cubic-bezier(0.34,1.56,0.64,1)`,
              }}>
              <button aria-label="Закрити" onClick={_closeVip} style={{
                position:"absolute", top:10, right:12, zIndex:5,
                width:32,padding:0, height:32, borderRadius:"50%", border:"none", cursor:"pointer",
                background:"none", color:"#ef4444",
                display:"flex", alignItems:"center", justifyContent:"center",
                fontSize:13, fontWeight:800, lineHeight:1,
              }}><MetalIcon name="cross" size={32}/></button>
              <div style={{
                padding:"16px 16px 18px",
                background:"linear-gradient(145deg,rgba(168,85,247,0.18),rgba(124,58,237,0.08))",
                borderBottom:"1px solid rgba(168,85,247,0.2)",
              }}>
                <div style={{width:38,height:4,borderRadius:2,background:`${ink(0.1)}`,margin:"0 auto 14px"}}/>
                <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:8,padding:"0 36px",textAlign:"center"}}>
                  <div style={{
                    width:52,height:52,borderRadius:26,flexShrink:0,
                    background:"linear-gradient(145deg,#a855f7,#7c3aed)",
                    boxShadow:"0 0 0 3px rgba(168,85,247,0.3), 0 6px 20px rgba(168,85,247,0.4)",
                    display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,
                  }}><MetalIcon name="crown" size={34}/></div>
                  <div style={{minWidth:0}}>
                    <div style={{fontSize:18,fontWeight:900,color:PURPLE}}>VIP Слот</div>
                    <div style={{fontSize:12,color:TEXT_DIM,marginTop:3}}>
                      {getDayInfo(vipSlotModal.day).fullLabel} · {fmtTime(vipSlotModal.startMin)} · {fmtDur(vipSlotModal.durMin)}
                    </div>
                    <div style={{fontSize:11,color:TEXT_FAINT,marginTop:4}}>
                      Тільки для клієнтів категорії VIP
                    </div>
                  </div>
                </div>
              </div>
              <div className="modal-footer" style={{padding:"14px 16px 32px",gap:10}}>
                <button onClick={_closeVip} style={{
                  padding:"14px 8px",borderRadius:18,border:"none",cursor:"pointer",fontFamily:"inherit",
                  background:`linear-gradient(135deg,${SURFACE_HI},${SURFACE})`,
                  color:TEXT_DIM,fontSize:14,fontWeight:800,boxShadow:SHADOW_OUT,
                }}>Закрити</button>
                <button onClick={()=>{
                  const v = vipSlotModal;
                  const dateStr = v._dateStr || absDayToDateStr(v.day);
                  const hh = String(Math.floor(v.startMin / 60)).padStart(2, "0");
                  const mm = String(v.startMin % 60).padStart(2, "0");
                  update(iRef( `${slotRoot()}/${dateStr}/slot${hh}${mm}`), { vipOnly: false }).catch(() => {});
                  _closeVip();
                }} style={{
                  padding:"14px 8px",borderRadius:18,border:"none",cursor:"pointer",fontFamily:"inherit",
                  background:"linear-gradient(160deg,#ef4444,#dc2626)",
                  color:"#fff",fontSize:14,fontWeight:800,
                  boxShadow:"0 6px 20px rgba(239,68,68,0.35)",
                }}>Видалити</button>
              </div>
            </div>
          </div>
        </>
      );
    })(FOG_STYLE.theme)}

    <NewBookingModalFog data={formData} onClose={()=>setFormData(null)}
      onConfirm={b=>{
        if (b.id) {
          const fbData = {
            id: b.id, date: b.date || "", time: fmtTime(b.startMin),
            startMin: b.startMin, durMin: b.durMin, durationHours: b.durMin / 60,
            studentName: b.name, name: b.name, phone: b.phone,
            serviceId: b.serviceId, serviceType: b.type, type: b.type,
            status: b.status, hours: b.hoursDone || 0,
            createdAt: Date.now(), createdBy: "admin",
            ...newBookingMasterFields(),
            ...(b.note && { note: b.note }),
            ...(b.addons?.length && { addons: b.addons, addonsPrice: b.addonsPrice || 0 }),
            ...(b.bufferMin > 0 && { bufferMin: b.bufferMin }),
            ...(b.packageId && { packageId: b.packageId, packageName: b.packageName || "" }),
            ...(b.groupKey && { groupKey: b.groupKey, groupCap: b.groupCap || null }),
          };
          if (b.userId) {
            update(iRef( `bookings/${b.userId}/${b.id}`), fbData).catch(()=>{});
          } else {
            // Клієнт без акаунту (гість) — пишемо в той самий bookings/ дерево під
            // синтетичним guest_<телефон> uid, а не в окремий bookings_by_phone.
            // Інакше запис невидимий для власного розкладу/списків адмінки і не
            // отримує жодної логіки з onBookingChanged (блокування слоту, синк
            // з Google Calendar, звільнення черги тощо).
            const phone = (b.phone || '').replace(/\D/g, '');
            if (phone) {
              update(iRef( `bookings/guest_${phone}/${b.id}`), fbData).catch(()=>{});
              // Дзеркалимо у users/, звідки читається вкладка "Клієнти" — інакше
              // гість видно тільки в розкладі/бронюваннях, а не в списку клієнтів.
              const studentRef = iRef( `users/guest_${phone}`);
              get(studentRef).then(s => {
                if (s.exists()) {
                  update(studentRef, { name: b.name, phone: b.phone }).catch(()=>{});
                } else {
                  update(studentRef, {
                    name: b.name, phone: b.phone, type: b.type || "private",
                    discount: 0, notes: "", blocked: false, isVip: false, hours: 0,
                    createdAt: Date.now(),
                  }).catch(()=>{});
                }
              }).catch(()=>{});
            }
          }
        }
        if (b.date && b.startMin !== undefined && b.durMin) {
          // Миттєво блокуємо слоти в UI, не чекаючи round-trip через onBookingChanged.
          // Позиції без власного документа позначаються phantom (див. slotRules) —
          // інакше після скасування вони лишались би окремими 30-хв слотами.
          // bookingStart — явний прапорець реального старту бронювання: клієнт
          // показує лише його, а не кожен 30-хвилинний блок.
          blockSlotRange(b.date, b.startMin, b.durMin, { bookingStart: true, bufferMin: bufferOf(b) }).catch(() => {});
        }
        setFormData(null);
      }}
      settings={{...settings, workStart: effectiveWorkStart, workEnd: effectiveWorkEnd}}
      bookings={bookings}/>

    {createSlotData && <CreateSlotSheet data={createSlotData} settings={settings} onClose={()=>setCreateSlotData(null)}/>}

    <PersonalEventModal
      data={personalEventData}
      onClose={()=>setPersonalEventData(null)}
      onConfirm={b=>{
        const fbData = {
          id: b.id, date: b.date, time: fmtTime(b.startMin),
          startMin: b.startMin, durMin: b.durMin,
          studentName: b.name, name: b.name, note: b.note || "",
          type: "personal", status: "personal",
          reminderHours: b.reminderHours || null, reminderSent: false,
          createdAt: Date.now(), createdBy: "admin",
          ...newBookingMasterFields(),
        };
        update(iRef( `bookings/personal/${b.id}`), fbData).catch(() => {});
        blockPersonalSlots(b.date, b.startMin, b.durMin);
        setBookings(bs => [...bs, { ...b, userId: "personal", _fbKey: b.id }]);
        setPersonalEventData(null);
      }}
    />

    {/* Редагування особистої події */}
    {personalEventView && (({BG,BG_DEEP,SURFACE,SURF_HI,SURF_LO,BORDER,TEXT,DIM,FAINT,ACCENT,ACC_HI,GREEN,BLUE,PURPLE,GOLD,RED,TEAL,SO,SI,GLOW,SHADE,INK,STRIPE_A,STRIPE_B,BTN_R,CARD_R,MODAL_R,BTN_TX,BTN_GRAD,BTN_SH}) => (
      <div onClick={()=>setPersonalEventView(null)} style={{
        position:"fixed",inset:0,zIndex:200,background:`${shade(0.6)}`,
        display:"flex",alignItems:"center",justifyContent:"center",
        backdropFilter:"blur(8px)",
      }}>
        <div onClick={e=>e.stopPropagation()} style={{
          position:"relative",width:"calc(100vw - 24px)", maxWidth:720,maxHeight:"92vh",overflowY:"auto",background:BG_DEEP,
          borderRadius:20,
          boxShadow:`0 8px 40px ${shade(0.7)}, 0 0 0 1.5px rgba(45,212,191,0.3)`,
        }}>
          <button aria-label="Закрити" onClick={()=>setPersonalEventView(null)} style={{
            position:"absolute", top:12, right:14, zIndex:5,
            width:32,padding:0, height:32, borderRadius:"50%", border:"none", cursor:"pointer",
            background:"none", color:"#ef4444",
            display:"flex", alignItems:"center", justifyContent:"center",
            fontSize:13, fontWeight:800, lineHeight:1,
          }}><MetalIcon name="cross" size={32}/></button>
          <div style={{
            padding:"14px 44px 12px",textAlign:"center",
            background:"rgba(45,212,191,0.1)",
            borderBottom:"1px solid rgba(45,212,191,0.15)",
            borderRadius:"20px 20px 0 0",
          }}>
            <div style={{fontSize:15,fontWeight:800,color:"#2dd4bf"}}><span style={{display:"inline-flex",alignItems:"center",gap:7}}><MetalIcon name="pushpin" size={28}/>Особиста подія</span></div>
          </div>
          <div className="win-cols win-gap" style={{padding:"14px 16px",gap:12}}>
            <div>
              <div style={{fontSize:10,fontWeight:700,letterSpacing:1.2,color:FAINT,textTransform:"uppercase",marginBottom:6}}>Назва</div>
              <input
                value={peEditTitle}
                onChange={e=>setPeEditTitle(e.target.value)}
                style={{
                  width:"100%",padding:"9px 11px",borderRadius:10,
                  background:SURF_LO,border:`1px solid ${BORDER}`,
                  color:TEXT,fontSize:14,outline:"none",boxSizing:"border-box",fontFamily:"inherit",
                }}
              />
            </div>
            <div style={{display:"flex",gap:8}}>
              <div style={{flex:1}}>
                <div style={{fontSize:10,fontWeight:700,letterSpacing:1.2,color:FAINT,textTransform:"uppercase",marginBottom:6}}>Дата</div>
                <input
                  type="date"
                  value={peEditDate}
                  onChange={e=>setPeEditDate(e.target.value)}
                  style={{
                    width:"100%",padding:"9px 11px",borderRadius:10,
                    background:SURF_LO,border:`1px solid ${BORDER}`,
                    color:TEXT,fontSize:13,outline:"none",boxSizing:"border-box",fontFamily:"inherit",
                  }}
                />
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:10,fontWeight:700,letterSpacing:1.2,color:FAINT,textTransform:"uppercase",marginBottom:6}}>Час</div>
                <div style={{display:"flex",gap:6}}>
                  <select
                    value={peEditTime.split(":")[0] || "09"}
                    onChange={e=>setPeEditTime(`${e.target.value}:${peEditTime.split(":")[1] || "00"}`)}
                    style={{
                      flex:1,padding:"9px 4px",borderRadius:10,
                      background:SURF_LO,border:`1px solid ${BORDER}`,
                      color:TEXT,fontSize:13,outline:"none",boxSizing:"border-box",fontFamily:"inherit",
                    }}
                  >
                    {Array.from({length:24},(_,h)=>String(h).padStart(2,"0")).map(h=>(
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                  <select
                    value={peEditTime.split(":")[1] || "00"}
                    onChange={e=>setPeEditTime(`${peEditTime.split(":")[0] || "09"}:${e.target.value}`)}
                    style={{
                      flex:1,padding:"9px 4px",borderRadius:10,
                      background:SURF_LO,border:`1px solid ${BORDER}`,
                      color:TEXT,fontSize:13,outline:"none",boxSizing:"border-box",fontFamily:"inherit",
                    }}
                  >
                    {["00","05","10","15","20","25","30","35","40","45","50","55"].map(m=>(
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div>
              <div style={{fontSize:10,fontWeight:700,letterSpacing:1.2,color:FAINT,textTransform:"uppercase",marginBottom:6}}>Тривалість</div>
              <div style={{display:"flex",gap:6}}>
                <select
                  value={String(Math.floor(peEditDur/60))}
                  onChange={e=>setPeEditDur(Math.max(15, Number(e.target.value)*60 + (peEditDur%60)))}
                  style={{
                    flex:1,padding:"9px 4px",borderRadius:10,
                    background:SURF_LO,border:`1px solid ${BORDER}`,
                    color:TEXT,fontSize:13,outline:"none",boxSizing:"border-box",fontFamily:"inherit",
                  }}
                >
                  {[0,1,2,3,4,5].map(h=>(
                    <option key={h} value={h}>{h} год</option>
                  ))}
                </select>
                <select
                  value={String(peEditDur%60).padStart(2,"0")}
                  onChange={e=>setPeEditDur(Math.max(15, Math.floor(peEditDur/60)*60 + Number(e.target.value)))}
                  style={{
                    flex:1,padding:"9px 4px",borderRadius:10,
                    background:SURF_LO,border:`1px solid ${BORDER}`,
                    color:TEXT,fontSize:13,outline:"none",boxSizing:"border-box",fontFamily:"inherit",
                  }}
                >
                  {["00","15","30","45"].map(m=>(
                    <option key={m} value={m}>{m} хв</option>
                  ))}
                </select>
              </div>
              <div style={{display:"flex",gap:4,marginTop:6}}>
                {[1,2,3,4,5].map(h=>(
                  <button key={h} onClick={()=>setPeEditDur(h*60)} style={{
                    flex:1,padding:"5px 0",borderRadius:8,border:"none",cursor:"pointer",fontSize:11,fontWeight:700,fontFamily:"inherit",
                    background: peEditDur===h*60 ? "rgba(45,212,191,0.2)" : SURFACE,
                    color: peEditDur===h*60 ? "#2dd4bf" : DIM,
                  }}>{`${h}г`}</button>
                ))}
              </div>
            </div>
            <div>
              <div style={{fontSize:10,fontWeight:700,letterSpacing:1.2,color:FAINT,textTransform:"uppercase",marginBottom:6}}>Нотатка</div>
              <textarea
                value={peEditNote}
                onChange={e=>setPeEditNote(e.target.value)}
                rows={2}
                style={{
                  width:"100%",padding:"9px 11px",borderRadius:10,resize:"none",
                  background:SURF_LO,border:`1px solid ${BORDER}`,
                  color:TEXT,fontSize:13,outline:"none",boxSizing:"border-box",fontFamily:"inherit",
                }}
              />
            </div>
            <div>
              <div style={{fontSize:10,fontWeight:700,letterSpacing:1.2,color:FAINT,textTransform:"uppercase",marginBottom:6}}><span style={{display:"inline-flex",alignItems:"center",gap:7}}><MetalIcon name="clock" size={16}/>Нагадування з будильником</span></div>
              <select
                value={peEditReminderHours ?? ""}
                onChange={e=>setPeEditReminderHours(e.target.value === "" ? null : Number(e.target.value))}
                style={{
                  width:"100%",padding:"9px 11px",borderRadius:10,
                  background:SURF_LO,border:`1px solid ${BORDER}`,
                  color:TEXT,fontSize:13,outline:"none",boxSizing:"border-box",fontFamily:"inherit",
                }}
              >
                <option value="">Без нагадування</option>
                <option value="0.25">За 15 хв</option>
                <option value="0.5">За 30 хв</option>
                <option value="1">За 1 годину</option>
                <option value="2">За 2 години</option>
                <option value="4">За 4 години</option>
                <option value="24">За 1 день</option>
              </select>
            </div>
            <div className="modal-footer" style={{gap:10,breakInside:"avoid"}}>
            <button onClick={()=>setPersonalEventView(null)} style={{
                padding:"12px 8px",borderRadius:14,border:`1px solid ${BORDER}`,cursor:"pointer",fontFamily:"inherit",
                background:"transparent",color:DIM,fontSize:14,fontWeight:800,
              }}>Скасувати</button>
            <button
              disabled={!peEditTitle.trim()}
              onClick={savePersonalEventEdit}
              style={{
                padding:"12px 8px",borderRadius:14,border:"none",cursor:"pointer",fontFamily:"inherit",
                background: peEditTitle.trim() ? "linear-gradient(145deg,#2dd4bf,#14b8a6)" : ink(0.07),
                color: peEditTitle.trim() ? "#fff" : FAINT,
                fontSize:14,fontWeight:800,
              }}
            >Зберегти</button>
            </div>
          </div>
          <button
            onClick={deletePersonalEvent}
            style={{
              width:"100%",padding:"12px",border:"none",cursor:"pointer",
              borderTop:`1px solid ${ink(0.06)}`,borderRadius:"0 0 20px 20px",
              background:"none",color:"#f87171",fontSize:13,fontWeight:700,
            }}
          >
            Видалити
          </button>
        </div>
      </div>
    ))(FOG_STYLE.theme)}
    {broadcastInit && <BroadcastModal initialDate={broadcastInit.date} initialSlot={broadcastInit.slot} onClose={() => setBroadcastInit(null)}/>}
    {dayNotesModal && (
      <DayNotesModal
        dateStr={dayNotesModal.dateStr}
        dayLabel={dayNotesModal.dayLabel}
        dayNum={dayNotesModal.dayNum}
        dayMonth={dayNotesModal.dayMonth}
        note={dayNotes[dayNotesModal.dateStr]}
        settings={settings}
        onClose={() => setDayNotesModal(null)}
      />
    )}
    </>
  );
}

export { ScheduleView };
