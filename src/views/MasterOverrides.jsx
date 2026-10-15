import { useState, useEffect, useContext } from "react";
import { onValue, update, get } from "firebase/database";
import { iRef } from "../firebase";
import { ThemeContext } from "../theme.js";
import { Toggle, NumInput, WeekScheduleEditor } from "./id4drive-settings";
import { hasOwnSchedule } from "../masterSettings";

const EMPTY_DAY = (i) => ({ enabled: i < 5, start: 9, end: 18, lunchEnabled: false, lunchStart: 12, lunchEnd: 13 });

// Власні графік і ціни майстра салону (master_settings/{mid}). Для власника — у «Майстри», для майстра — у його «Налаштуваннях».
export default function MasterOverrides({ mid }) {
  const { BORDER, TEXT, DIM, FAINT, SURFACE, ACCENT } = useContext(ThemeContext);
  const [ms, setMs] = useState(null);
  const [base, setBase] = useState(null);
  const [services, setServices] = useState([]);
  const [err, setErr] = useState("");

  useEffect(() => onValue(iRef(`master_settings/${mid}`), (s) => setMs(s.val() || {}), () => setMs({})), [mid]);
  useEffect(() => { get(iRef("admin_settings")).then((s) => setBase(s.val() || {})).catch(() => setBase({})); }, []);
  useEffect(() => onValue(iRef("admin_data/services"), (s) => { const v = s.val(); setServices(Array.isArray(v) ? v.filter((x) => x && !x.archived) : []); }, () => {}), []);

  const write = (patch) => update(iRef(`master_settings/${mid}`), patch).then(() => setErr("")).catch(() => setErr("Не вдалося зберегти"));
  if (!ms || !base) return <div style={{ color: DIM, fontSize: 13, padding: 8 }}>Завантаження…</div>;

  const own = hasOwnSchedule(ms);
  const week = own ? ms.weekSchedule : [];
  const span = (w) => {
    const on = w.filter((d) => d.enabled);
    return { workStart: on.length ? Math.min(...on.map((d) => d.start)) : (base.workStart ?? 9), workEnd: on.length ? Math.max(...on.map((d) => d.end)) : (base.workEnd ?? 18) };
  };
  const saveWeek = (w) => write({ weekSchedule: w, ...span(w) });
  const enableOwn = () => {
    const w = Array.isArray(base.weekSchedule) && base.weekSchedule.length === 7
      ? base.weekSchedule
      : Array.from({ length: 7 }, (_, i) => EMPTY_DAY(i));
    return write({ weekSchedule: w, ...span(w), lunchEnabled: base.lunchEnabled ?? null, lunchStart: base.lunchStart ?? null, lunchEnd: base.lunchEnd ?? null });
  };
  const disableOwn = () => write({ weekSchedule: null, workStart: null, workEnd: null, lunchEnabled: null, lunchStart: null, lunchEnd: null });
  const setSvc = (s, patch) => write({ [`svc/${s.id}`]: { price: s.price || 0, duration: s.duration || 60, ...(ms.svc?.[s.id] || {}), ...patch } });

  const head = { fontSize: 11, color: DIM, letterSpacing: 1, textTransform: "uppercase", fontWeight: 700, margin: "4px 0 8px" };
  const card = { borderRadius: 14, border: `1px solid ${BORDER}`, background: SURFACE, padding: "10px 12px" };
  const line = { display: "flex", alignItems: "center", gap: 10, minHeight: 44 };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={head}>Графік</div>
      <div style={card}>
        <div style={line}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14.5, fontWeight: 600, color: TEXT }}>Власний графік</div>
            <div style={{ fontSize: 11.5, color: FAINT }}>{own ? "Дні й години — тільки для цього майстра" : "Зараз діє графік салону"}</div>
          </div>
          <Toggle on={own} onChange={(v) => (v ? enableOwn() : disableOwn())} />
        </div>
      </div>
      {own && <WeekScheduleEditor weekSchedule={week} updDay={(i, p) => saveWeek(week.map((d, k) => (k === i ? { ...d, ...p } : d)))} setWeek={saveWeek} />}

      <div style={{ ...head, marginTop: 12 }}>Послуги та ціни</div>
      <div style={{ fontSize: 12, color: FAINT, marginTop: -4 }}>Залиште порожнім — діє ціна салону. Змініть число, щоб призначити свою.</div>
      {services.length === 0 && <div style={{ color: DIM, fontSize: 13 }}>Послуг ще немає.</div>}
      {services.map((s) => {
        const o = ms.svc?.[s.id];
        const price = o?.price ?? s.price ?? 0;
        const dur = o?.duration ?? s.duration ?? 60;
        const active = o?.active !== false;
        return (
          <div key={s.id} style={{ ...card, opacity: active ? 1 : 0.6 }}>
            <div style={line}>
              <div style={{ flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: 600, color: TEXT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {s.name}{o ? <span style={{ color: ACCENT, fontSize: 11, marginLeft: 6 }}>своя</span> : null}
              </div>
              <Toggle on={active} onChange={(v) => setSvc(s, { active: v })} />
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <NumInput value={price} onChange={(v) => setSvc(s, { price: v })} min={0} max={100000} step={50} suffix=" ₴" />
              <NumInput value={dur} onChange={(v) => setSvc(s, { duration: v })} min={5} max={1440} step={15} suffix=" хв" />
              {o && <button onClick={() => write({ [`svc/${s.id}`]: null })} style={{ marginLeft: "auto", background: "none", border: "none", color: DIM, fontSize: 12, cursor: "pointer" }}>Скинути</button>}
            </div>
          </div>
        );
      })}
      {err && <div style={{ color: "#f87171", fontSize: 12 }}>{err}</div>}
    </div>
  );
}
