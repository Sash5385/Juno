// Адмінка Juno (салон/барбершоп/майстри): оболонка, роль (власник/майстер), вкладки.
import { useState, useEffect, useMemo, useCallback } from "react";
import { DEMO, demoTheme } from "../demo/demoMode.js";
import { ThemeContext, getTheme } from "../theme.js";
import { UICss } from "../ui.jsx";
import { SalonCtx } from "./ctx.js";
import { sref, useValue, useAuthUser, resolveSession, ensureGrid, toList } from "./data.js";
import { registerPush, onForegroundPush, pushPermission } from "./push.js";
import { SalonLogin, Onboarding } from "./SalonAuth.jsx";
import { Spinner, useToast } from "./kit.jsx";
import Schedule from "./views/Schedule.jsx";
import Bookings from "./views/Bookings.jsx";
import Clients from "./views/Clients.jsx";
import Services from "./views/Services.jsx";
import Masters from "./views/Masters.jsx";
import Chats from "./views/Chats.jsx";
import Stats from "./views/Stats.jsx";
import Settings from "./views/Settings.jsx";

const OWNER_TABS = [["schedule", "📅", "Календар"], ["bookings", "📋", "Записи"], ["clients", "👥", "Клієнти"], ["services", "✂️", "Послуги"], ["masters", "💇", "Майстри"], ["chats", "💬", "Чати"], ["stats", "📊", "Статист."], ["settings", "⚙️", "Налашт."]];
const MASTER_TABS = [["schedule", "📅", "Календар"], ["bookings", "📋", "Записи"], ["chats", "💬", "Чати"], ["settings", "⚙️", "Профіль"]];
const VIEWS = { schedule: Schedule, bookings: Bookings, clients: Clients, services: Services, masters: Masters, chats: Chats, stats: Stats, settings: Settings };

const inviteFromUrl = () => {
  try {
    const m = /^\/join\/([^/]+)/.exec(window.location.pathname);
    if (m) { sessionStorage.setItem("salon_invite", decodeURIComponent(m[1])); window.history.replaceState(null, "", "/"); }
    return sessionStorage.getItem("salon_invite") || null;
  } catch { return null; }
};

export default function SalonApp() {
  const [mode, setMode] = useState(() => { try { return localStorage.getItem("salon_theme") || (DEMO ? demoTheme() : "dark"); } catch { return "dark"; } });
  const theme = useMemo(() => getTheme(mode), [mode]);
  const setThemeMode = useCallback((m) => { setMode(m); try { localStorage.setItem("salon_theme", m); } catch { /* ignore */ } }, []);
  const user = useAuthUser();
  const [invite] = useState(inviteFromUrl);
  const [sess, setSess] = useState({ uid: null, value: null });
  const [reload, setReload] = useState(0);
  const session = user && sess.uid === user.uid ? sess.value : null;

  useEffect(() => {
    document.body.style.background = theme.BG;
    document.body.style.backgroundImage = theme.BG_IMAGE || "none";
  }, [theme]);

  useEffect(() => {
    if (!user) return undefined;
    let dead = false;
    const uid = user.uid;
    resolveSession(uid).then((v) => { if (!dead) setSess({ uid, value: v }); }).catch(() => { if (!dead) setSess({ uid, value: { status: "onboard" } }); });
    return () => { dead = true; };
  }, [user, reload]);

  let body;
  if (user === undefined || (user && !session)) body = <Spinner />;
  else if (!user) body = <SalonLogin inviteCode={invite} />;
  else if (session.status === "onboard") body = <Onboarding user={user} inviteCode={invite} onDone={() => { setSess({ uid: null, value: null }); setReload((n) => n + 1); }} />;
  else body = <Shell user={user} session={session} setThemeMode={setThemeMode} mode={mode} />;

  return (
    <ThemeContext.Provider value={theme}>
      <UICss />
      <div style={{ minHeight: "100dvh", color: theme.TEXT, fontFamily: "ui-sans-serif,-apple-system,BlinkMacSystemFont,system-ui,sans-serif" }}>{body}</div>
    </ThemeContext.Provider>
  );
}

function Shell({ user, session, setThemeMode, mode }) {
  const th = useMemo(() => getTheme(mode), [mode]);
  const { salonId, masterId } = session;
  const role = session.status === "owner" ? "owner" : "master";
  const tabs = role === "owner" ? OWNER_TABS : MASTER_TABS;
  const [tab, setTab] = useState(() => { try { const t = localStorage.getItem("salon_tab"); return tabs.some((x) => x[0] === t) ? t : "schedule"; } catch { return "schedule"; } });
  const [toastEl, toast] = useToast();
  const [perm, setPerm] = useState(pushPermission());

  const prof = useValue(() => sref(salonId, "profile"), [salonId]);
  const mst = useValue(() => sref(salonId, "masters"), [salonId]);
  const svc = useValue(() => sref(salonId, "services"), [salonId]);
  const lic = useValue(() => (role === "owner" ? sref(salonId, "license") : null), [salonId, role]);
  const profile = useMemo(() => prof.value || {}, [prof.value]);
  const [now] = useState(() => Date.now());
  const masters = useMemo(() => toList(mst.value).sort((a, b) => (a.profile?.order ?? 0) - (b.profile?.order ?? 0)), [mst.value]);
  const services = useMemo(() => toList(svc.value), [svc.value]);
  const step = [10, 15, 20, 30, 60].includes(Number(profile.slotStep)) ? Number(profile.slotStep) : 30;

  const tokenRef = useCallback((dev) => (role === "owner" ? sref(salonId, `fcmTokens/${dev}`) : sref(salonId, `masterTokens/${masterId}/${dev}`)), [role, salonId, masterId]);
  const enablePush = useCallback(async () => { const ok = await registerPush(tokenRef); setPerm(pushPermission()); toast(ok ? "Сповіщення увімкнено" : "Не вдалося увімкнути сповіщення", ok ? "ok" : "err"); }, [tokenRef, toast]);
  const go = useCallback((t) => { setTab(t); try { localStorage.setItem("salon_tab", t); } catch { /* ignore */ } }, []);

  const ctx = useMemo(() => ({
    user, salonId, role, masterId, profile, masters, services, step, payment: profile.payment || {}, license: lic.value,
    toast, setThemeMode, mode, go, enablePush, pushPerm: perm,
    ready: !prof.loading && !mst.loading && !svc.loading,
  }), [user, salonId, role, masterId, profile, masters, services, step, lic.value, toast, setThemeMode, mode, go, enablePush, perm, prof.loading, mst.loading, svc.loading]);

  // Сітка слотів на 45 днів: власник — для всіх активних майстрів, майстер — для себе
  useEffect(() => {
    if (!ctx.ready) return;
    const list = (role === "owner" ? masters.filter((m) => m.profile?.active !== false) : masters.filter((m) => m.id === masterId));
    if (list.length) ensureGrid({ salonId, masters: list, step }).catch((e) => console.warn("grid:", e.message));
  }, [ctx.ready, role, masters, masterId, salonId, step]);

  // Повернення зі сторінки оплати підписки (redirectUrl функції salonCreateSubscriptionInvoice): статус оновить вебхук
  useEffect(() => {
    try {
      if (new URLSearchParams(window.location.search).get("subscription") !== "paid") return;
      window.history.replaceState(null, "", window.location.pathname);
      queueMicrotask(() => { toast("Дякуємо! Оплату обробляємо — підписка оновиться за хвилину"); go("settings"); });
    } catch { /* ignore */ }
  }, [toast, go]);

  // Push-токени: якщо дозвіл уже надано — тихо оновлюємо токен пристрою
  useEffect(() => { if (pushPermission() === "granted") registerPush(tokenRef); }, [tokenRef]);
  useEffect(() => onForegroundPush((p) => toast(`${p.data?.title || "Сповіщення"}${p.data?.body ? " — " + p.data.body.split("\n")[0] : ""}`)), [toast]);

  // Бейдж непрочитаних чатів
  const chatMeta = useValue(() => (role === "owner" ? sref(salonId, "chatMeta") : sref(salonId, `masterChatMeta/${masterId}`)), [salonId, role, masterId]);
  const unread = useMemo(() => Object.values(chatMeta.value || {}).reduce((s, m) => s + (role === "owner" ? m?.unreadForAdmin || 0 : m?.unreadForMaster || 0), 0), [chatMeta.value, role]);

  const View = VIEWS[tab] || Schedule;
  const lc = ctx.license, until = lc ? (lc.status === "trial" ? lc.trialEndsAt : lc.expiresAt) : null;
  const daysLeft = until ? Math.ceil((until - now) / 86400000) : null;
  const banner = role !== "owner" || !lc ? null
    : lc.status === "suspended" ? { c: th.RED, t: "Режим читання: підписку не оплачено — нові записи клієнтів вимкнено" }
      : daysLeft !== null && daysLeft <= 3 ? { c: th.GOLD, t: `${lc.status === "trial" ? "Пробний період" : "Підписка"} закінчується через ${Math.max(daysLeft, 0)} дн.` } : null;

  return (
    <SalonCtx.Provider value={ctx}>
      <div style={{ maxWidth: 720, margin: "0 auto", paddingBottom: "calc(86px + env(safe-area-inset-bottom,0px))" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "calc(10px + env(safe-area-inset-top,0px)) 14px 8px" }}>
          <div style={{ fontSize: 22 }}>💈</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{profile.name || "Салон"}</div>
            <div style={{ fontSize: 11, color: th.DIM }}>{role === "owner" ? "Власник" : `Майстер · ${masters.find((m) => m.id === masterId)?.profile?.name || ""}`}</div>
          </div>
          {perm === "default" && <button onClick={ctx.enablePush} style={{ border: "none", borderRadius: 10, padding: "7px 10px", background: th.SURF_HI, color: th.TEXT, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>🔔 Сповіщення</button>}
        </div>
        {banner && <div onClick={() => ctx.go("settings")} style={{ margin: "0 14px 8px", padding: "8px 12px", borderRadius: 10, background: `color-mix(in srgb, ${banner.c} 18%, transparent)`, color: banner.c, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{banner.t} · Підписка →</div>}
        <div className="tab-anim" key={tab} style={{ padding: "4px 14px 0" }}>{ctx.ready ? <View /> : <Spinner />}</div>
      </div>
      {toastEl}
      <nav id="salon-nav" style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 100, background: `linear-gradient(180deg,${th.SURF_HI},${th.SURFACE})`, borderTop: `1px solid ${th.BORDER}`, display: "flex", overflowX: "auto", padding: "6px 4px calc(8px + env(safe-area-inset-bottom,0px))" }}>
        {tabs.map(([id, icon, label]) => (
          <button key={id} onClick={() => ctx.go(id)} style={{ flex: "1 0 auto", minWidth: 64, border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", padding: "4px 6px", position: "relative", color: tab === id ? th.ACCENT : th.DIM, fontWeight: tab === id ? 800 : 600 }}>
            <div style={{ fontSize: 20, lineHeight: 1.1 }}>{icon}</div>
            <div style={{ fontSize: 10, marginTop: 2, whiteSpace: "nowrap" }}>{label}</div>
            {id === "chats" && unread > 0 && <span style={{ position: "absolute", top: 0, right: 10, minWidth: 16, height: 16, borderRadius: 8, background: th.ACCENT, color: "#fff", fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px" }}>{unread}</span>}
          </button>
        ))}
      </nav>
    </SalonCtx.Provider>
  );
}

