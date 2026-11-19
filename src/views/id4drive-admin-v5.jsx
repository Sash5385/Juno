// Точка входу адмінки: компоненти винесені в ./admin/*.jsx (чистий перенос без змін логіки).
import { useState, useRef, useEffect, useContext } from "react";
import { update, get, onValue, off } from "firebase/database";
import { iRef, slotRoot, slotBookingsRoot, newBookingMasterFields } from "../firebase";
import { ThemeContext } from "../theme.js";
import { makeGlobalCSS, ICONS, initialBookings, DEFAULT_SETTINGS, fmtTime, TABS } from "./admin/shared.jsx";
import { MonthCalendarSheet } from "./admin/ScheduleSheets.jsx";
import { BookingModalFog, NewBookingModalFog } from "./admin/BookingModals.jsx";
import { ScheduleView } from "./admin/ScheduleView.jsx";
import { SettingsView } from "./admin/SettingsView.jsx";
import { StudentsView, TemplatesView, StubView } from "./admin/MiscViews.jsx";

export { AutoSlots } from "./admin/AutoSlots.jsx";

const TITLES = {
  schedule:"Розклад", bookings:"Букінги", students:"Клієнти",
  services:"Послуги", chats:"Чати", templates:"Шаблони",
  stats:"Статистика", settings:"Налаштування"
};

export default function App() {
  const { BG, BG_DEEP, SURFACE, SURF_HI, SURF_LO, BORDER, TEXT, DIM, FAINT, ACCENT, ACC_HI, SO, SI , GLOW, SHADE, INK } = useContext(ThemeContext);
  const glow=a=>`rgba(${GLOW},${a})`,shade=a=>`rgba(${SHADE},${a})`,ink=a=>`rgba(${INK},${a})`;
  const SURFACE_HI = SURF_HI, SURFACE_LO = SURF_LO, TEXT_DIM = DIM, TEXT_FAINT = FAINT, ACCENT_HI = ACC_HI, SHADOW_OUT = SO, SHADOW_IN = SI;
  const css = makeGlobalCSS(SURF_LO, ACCENT, GLOW, SHADE, INK);
  const [tab, setTab] = useState("schedule");
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [bookings, setBookings] = useState(initialBookings);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [newBookingData, setNewBookingData] = useState(null);
  const saveTimerRef = useRef(null);

  // Load settings from Firebase on mount
  useEffect(() => {
    get(iRef( "admin_settings")).then(snap => {
      if (snap.exists()) {
        setSettings(s => ({ ...s, ...snap.val() }));
      }
    }).catch(() => {});
  }, []);

  // Users map for TSC cross-reference
  const usersMapRef = useRef({});
  const rawBookingsDataRef = useRef(null);

  // processBookingsRef holds the latest version so async effect callbacks always use current setBookings/usersMapRef
  const processBookingsRef = useRef(null);
  processBookingsRef.current = (d) => {
    if (!d) { setBookings([]); return; }
    const today = new Date(); today.setHours(0,0,0,0);
    const all = [];
    Object.entries(d).forEach(([uid, userBkgs]) => {
      if (!userBkgs) return;
      Object.entries(userBkgs).forEach(([bkId, raw]) => {
        if (!raw) return;
        const timeStr = raw.time || (raw.startMin != null ? fmtTime(raw.startMin) : "00:00");
        const [hh, mm] = timeStr.split(":").map(Number);
        const dateStr = raw.date || "";
        let day = 0;
        if (dateStr) {
          const bkDate = new Date(dateStr + "T00:00:00");
          day = Math.round((bkDate - today) / 86400000);
        }
        all.push({
          ...raw,
          id:       raw.id || bkId,
          _fbKey:   bkId,
          userId:   uid,
          day,
          date:     dateStr,
          startMin: raw.startMin ?? (hh * 60 + mm),
          durMin:   raw.durMin ?? (raw.durationHours ? Math.round(raw.durationHours * 60) : 60),
          name:     raw.studentName || raw.name || "Клієнт",
          phone:    raw.phone || "",
          type:     raw.serviceType || raw.type || "private",
          status:   raw.status || "confirmed",
          tsc:      raw.tsc || usersMapRef.current[uid]?.profile?.tsc || usersMapRef.current[uid]?.tsc || "",
          hoursDone: raw.hours || raw.hoursDone || 0,
          categoryId: raw.categoryId || null,
          isVipOnly:  raw.isVipOnly || false,
          discount: usersMapRef.current[uid]?.discount || raw.discountAmt || 0,
          customPrice: usersMapRef.current[uid]?.customPrice ?? null,
        });
      });
    });
    setBookings(all);
  };

  useEffect(() => {
    return onValue(iRef( "users"), snap => {
      usersMapRef.current = snap.val() || {};
      // Re-process already-loaded bookings so TSC cross-reference applies after users arrive
      if (rawBookingsDataRef.current !== null) {
        processBookingsRef.current(rawBookingsDataRef.current);
      }
    });
  }, []);

  // Load bookings from Firebase (realtime)
  useEffect(() => {
    const r = iRef( "bookings");
    const handler = onValue(r, snap => {
      rawBookingsDataRef.current = snap.val();
      processBookingsRef.current(snap.val());
    });
    return () => off(r, "value", handler);
  }, []);

  // Save settings to Firebase with 1s debounce
  const setSettingsAndSave = (updater) => {
    setSettings(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        update(iRef( "admin_settings"), next).catch(() => {});
      }, 1000);
      return next;
    });
  };

  const handleAction = (action, b) => {
    if (action === "confirm")  setBookings(bs=>bs.map(x=>x.id===b.id?{...x,status:"confirmed"}:x));
    if (action === "cancel") {
      if (b.userId && b.id) {
        if (b.date && b.startMin !== undefined && b.durMin) {
          // Відновлюємо лише слоти сітки; phantom-вузли видаляємо
          get(iRef( `${slotRoot()}/${b.date}`)).then(s => {
            const day = s.val() || {};
            const upd = {};
            for (let i = 0; i < b.durMin; i += 30) {
              const sm = b.startMin + i;
              const hh = String(Math.floor(sm/60)).padStart(2,'0'), mm = String(sm%60).padStart(2,'0');
              const path = `${slotRoot()}/${b.date}/slot${hh}${mm}`;
              const node = day[`slot${hh}${mm}`];
              if (!node || node.phantom) { upd[path] = null; continue; }
              upd[`${path}/available`] = true; upd[`${path}/time`] = `${hh}:${mm}`; upd[`${path}/bookingStart`] = null;
            }
            if (Object.keys(upd).length) update(iRef('/'), upd).catch(()=>{});
          }).catch(()=>{});
        }
        // Скасовуємо обидва можливі вузли (дубль міг з'явитись від старого коду)
        const keys = [...new Set([b._fbKey, b.id].filter(Boolean))];
        keys.forEach(k => update(iRef( `bookings/${b.userId}/${k}`), { status:"cancelled", cancelledAt:Date.now(), cancelledBy:"admin" }).catch(()=>{}));
        setBookings(bs=>bs.map(x=>x.id===b.id?{...x,status:"cancelled"}:x));
      } else {
        setBookings(bs=>bs.filter(x=>x.id!==b.id));
      }
    }
    if (action === "noshow")   setBookings(bs=>bs.map(x=>x.id===b.id?{...x,status:"noshow"}:x));
    if (action === "attended") setBookings(bs=>bs.map(x=>x.id===b.id?{...x,status:"confirmed"}:x));
    if (action === "call")     window.location.href = `tel:${b.phone}`;
    if (action === "sms")      window.location.href = `sms:${b.phone}`;
    setSelectedBooking(null);
  };

  const handleNewBooking = (b) => {
    if (b.id) {
      const fbData = {
        id: b.id, date: b.date || "", time: fmtTime(b.startMin),
        startMin: b.startMin, durMin: b.durMin, durationHours: b.durMin / 60,
        studentName: b.name, name: b.name, phone: b.phone,
        serviceId: b.serviceId, serviceType: b.type, type: b.type,
        status: b.status, tsc: b.tsc || "", hours: b.hoursDone || 0,
        createdAt: Date.now(), createdBy: "admin",
        ...newBookingMasterFields(),
        ...(b.note && { note: b.note }),
        ...(b.debtAmount > 0 && { debtAmount: b.debtAmount }),
        ...(b.tag && { tag: b.tag, tagManual: true }),
      };
      if (b.userId) {
        update(iRef( `bookings/${b.userId}/${b.id}`), fbData).catch(()=>{});
      } else {
        const phone = (b.phone || '').replace(/\D/g, '');
        if (phone) {
          update(iRef( `bookings_by_phone/${phone}/${b.id}`), fbData).catch(()=>{});
          for (let i = 0; i < b.durMin; i += 30) {
            const slotMin = b.startMin + i;
            const sh = String(Math.floor(slotMin / 60)).padStart(2, '0');
            const sm = String(slotMin % 60).padStart(2, '0');
            update(iRef( `${slotBookingsRoot()}/${b.date}/slot${sh}${sm}`), {phone, bookingId: b.id}).catch(()=>{});
          }
        }
      }
    }
    if (b.date && b.startMin !== undefined && b.durMin) {
      // Вузли поза сіткою дня позначаємо phantom — при скасуванні видаляться
      get(iRef( `${slotRoot()}/${b.date}`)).then(s => {
        const day = s.val() || {};
        const slotUpd = {};
        for (let i = 0; i < b.durMin; i += 30) {
          const slotMin = b.startMin + i;
          const sh = String(Math.floor(slotMin / 60)).padStart(2, '0');
          const sm = String(slotMin % 60).padStart(2, '0');
          const id = `slot${sh}${sm}`;
          if (!day[id]) slotUpd[`${slotRoot()}/${b.date}/${id}/phantom`] = true;
          slotUpd[`${slotRoot()}/${b.date}/${id}/available`] = false;
          slotUpd[`${slotRoot()}/${b.date}/${id}/time`] = `${sh}:${sm}`;
          // Явний прапорець реального старту бронювання — клієнт показує лише
          // його, а не кожен 30-хвилинний блок.
          slotUpd[`${slotRoot()}/${b.date}/${id}/bookingStart`] = i === 0;
        }
        update(iRef(), slotUpd).catch(() => {});
      }).catch(() => {});
    }
    // onValue listener will update setBookings automatically; skip local push to avoid duplicate
  };

  const renderView = () => {
    switch(tab) {
      case "schedule":  return <ScheduleView settings={settings} setSettings={setSettingsAndSave}
                                onSlotClick={setSelectedBooking}
                                onEmptySlotClick={setNewBookingData}
                                bookings={bookings} setBookings={setBookings}/>;
      case "settings":   return <SettingsView settings={settings} setSettings={setSettingsAndSave}/>;
      case "students":   return <StudentsView/>;
      case "templates":  return <TemplatesView/>;
      default: return <StubView title={TITLES[tab]}/>;
    }
  };

  return (
    <>
      <style>{css}</style>
      <div style={{
        minHeight:"100vh", background:BG, color:TEXT,
        fontFamily:"ui-sans-serif,-apple-system,BlinkMacSystemFont,system-ui,sans-serif",
        paddingBottom:100
      }}>
        {/* TOP BAR */}
        <div style={{
          padding:"14px 18px",
          display:"flex",alignItems:"center",justifyContent:"space-between",
          position:"sticky",top:0,
          background:`linear-gradient(180deg,${BG} 60%,rgba(28,29,33,0.92))`,
          backdropFilter:"blur(20px)", zIndex:20,
          borderBottom:`1px solid ${BORDER}`
        }}>
          <button aria-label="Меню" style={{padding:0,background:"transparent",border:"none",cursor:"pointer"}}>{ICONS.menu(42)}</button>
          <div style={{fontSize:17,fontWeight:800,letterSpacing:-0.3}}>{TITLES[tab]}</div>
          {settings.notifLocation==="topbar"
            ? <button aria-label="Сповіщення" style={{padding:0,background:"transparent",border:"none",cursor:"pointer",position:"relative"}}>
                {ICONS.bell(42)}
                <span style={{
                  position:"absolute",top:-2,right:-2,
                  background:ACCENT,color:"#fff",borderRadius:10,
                  padding:"1px 6px",fontSize:11,fontWeight:800,
                  boxShadow:`0 0 8px ${ACCENT}88`
                }}>3</span>
              </button>
            : <button aria-label="Оновити" style={{padding:0,background:"transparent",border:"none",cursor:"pointer"}}>{ICONS.refresh(42)}</button>
          }
        </div>

        {/* CONTENT */}
        <div style={{padding:"16px 14px 0"}}>{renderView()}</div>

        {/* FAB on schedule */}
        {tab==="schedule" && (
          <button aria-label="Додати запис" style={{
            position:"fixed",bottom:118,right:18,
            width:60,height:60,borderRadius:30,
            background:`linear-gradient(145deg,${ACCENT_HI},${ACCENT})`,
            color:"#fff",border:"none",fontSize:30,cursor:"pointer",
            boxShadow:`0 8px 24px rgba(255,90,60,0.5),0 4px 8px ${shade(0.3)},inset 1px 1px 0 ${glow(0.3)}`,
            display:"flex",alignItems:"center",justifyContent:"center",
            zIndex:25
          }}>+</button>
        )}

        {/* BOTTOM NAV */}
        <div style={{
          position:"fixed",bottom:0,left:0,right:0,
          padding:"0 16px 14px",
          background:"transparent",
          zIndex:30,
          pointerEvents:"none",
        }}>
          <div style={{
            background:`linear-gradient(180deg,${SURFACE},${SURFACE_LO})`,
            borderRadius:26,
            border:`1px solid ${ink(0.08)}`,
            boxShadow:`0 -1px 0 ${glow(0.05)}, 0 12px 40px ${shade(0.65)}, 0 4px 16px ${shade(0.4)}`,
            display:"flex", overflow:"hidden",
            pointerEvents:"auto",
            justifyContent:"center", gap:0,
          }}>
          {TABS.filter(t=>settings.navTabs?.includes(t.id)??true).map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)} style={{
              flex:"1 1 0", minWidth:0, maxWidth:90,
              padding:"12px 6px 10px",
              background:"transparent",border:"none",cursor:"pointer",
              color: tab===t.id?ACCENT:TEXT_FAINT,
              display:"flex",flexDirection:"column",alignItems:"center",gap:4,
              position:"relative",
            }}>
              <div style={{
                transform: tab===t.id?"scale(1.1)":"scale(0.95)",
                transition:"transform .15s",
                opacity:tab===t.id?1:0.52,
              }}>{t.icon(33)}</div>
              <span style={{fontSize:11,fontWeight:700,letterSpacing:0.2}}>{t.label}</span>
              {tab===t.id && (
                <div style={{
                  position:"absolute",bottom:5,left:"50%",transform:"translateX(-50%)",
                  width:28,height:3,borderRadius:2,background:ACCENT,
                  boxShadow:`0 0 10px ${ACCENT}99`
                }}/>
              )}
            </button>
          ))}
          </div>
        </div>

        {/* MODALS */}
        <BookingModalFog booking={selectedBooking ? (bookings.find(x=>x.id===selectedBooking.id) || selectedBooking) : null} onClose={()=>setSelectedBooking(null)}
          onAction={handleAction} settings={settings}
          autoTag={null}/>
        <NewBookingModalFog data={newBookingData} onClose={()=>setNewBookingData(null)}
          onConfirm={handleNewBooking} bookings={bookings} settings={(() => {
            const sched = (settings.weekSchedule || []).filter(d => d.start != null);
            const eStart = sched.length ? Math.min(settings.workStart, ...sched.map(d=>d.start)) : settings.workStart;
            const eEnd   = sched.length ? Math.max(settings.workEnd,   ...sched.map(d=>d.end ?? settings.workEnd)) : settings.workEnd;
            return {...settings, workStart: eStart, workEnd: eEnd};
          })()}/>
      </div>
    </>
  );
}

export { ScheduleView, SettingsView, MonthCalendarSheet };
