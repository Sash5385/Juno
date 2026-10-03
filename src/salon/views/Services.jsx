// Послуги: категорія, тривалість, ціна, які майстри виконують, персональні ціни майстрів
import { useState, useMemo } from "react";
import { set, remove } from "firebase/database";
import { push } from "firebase/database";
import { Card, Modal, Btn, Field, Toggle, ModalSection, Chip, SectionTitle, Pill } from "../../ui.jsx";
import { useSalon } from "../ctx.js";
import { sref } from "../data.js";
import { Empty, Input, Row, Confirm, Hint, money, useTh } from "../kit.jsx";
import { priceFor } from "../../salonLogic.js";

const CATS = ["Стрижка", "Манікюр", "Педикюр", "Фарбування", "Догляд", "Брови та вії", "Масаж", "Інше"];

export default function Services() {
  const ctx = useSalon();
  const th = useTh();
  const [edit, setEdit] = useState(null);
  const groups = useMemo(() => {
    const g = {};
    for (const s of ctx.services) (g[s.category || "Інше"] ||= []).push(s);
    return Object.entries(g).sort((a, b) => a[0].localeCompare(b[0]));
  }, [ctx.services]);
  const mName = (id) => ctx.masters.find((m) => m.id === id)?.profile?.name || "—";
  return (
    <div>
      <Btn style={{ marginBottom: 14 }} onClick={() => setEdit({ name: "", category: "Стрижка", price: "", duration: "60", masterIds: {}, masterPrices: {}, active: true })}>＋ Нова послуга</Btn>
      {ctx.services.length === 0 && <Empty icon="✂️" text="Додайте першу послугу — без неї клієнти не зможуть записатись онлайн" />}
      {groups.map(([cat, list]) => (
        <div key={cat} style={{ marginBottom: 14 }}>
          <SectionTitle>{cat}</SectionTitle>
          {list.map((s) => (
            <Card key={s.id} onClick={() => setEdit({ ...s, price: String(s.price ?? ""), duration: String(s.duration ?? 60), masterIds: s.masterIds || {}, masterPrices: s.masterPrices || {} })} style={{ marginBottom: 8, cursor: "pointer", opacity: s.active === false ? 0.5 : 1 }}>
              <div style={{ padding: "10px 12px" }}>
                <Row gap={8}><div style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</div><div style={{ fontWeight: 900, flexShrink: 0 }}>{money(s.price)}</div></Row>
                <div style={{ fontSize: 12, color: th.DIM, marginTop: 2 }}>{s.duration || 60} хв · {Object.keys(s.masterIds || {}).filter((k) => s.masterIds[k]).map(mName).join(", ") || "немає майстрів"}</div>
                {s.active === false && <Pill label="Прихована" color={th.DIM} bg="rgba(148,163,184,0.16)" style={{ marginTop: 6 }} />}
              </div>
            </Card>
          ))}
        </div>
      ))}
      {edit && <ServiceSheet svc={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function ServiceSheet({ svc, onClose }) {
  const ctx = useSalon();
  const th = useTh();
  const [s, setS] = useState(svc);
  const [del, setDel] = useState(false);
  const [busy, setBusy] = useState(false);
  const isNew = !svc.id;
  const toggleMaster = (id) => setS({ ...s, masterIds: { ...s.masterIds, [id]: !s.masterIds[id] } });
  const valid = s.name.trim() && Number(s.price) >= 0 && s.price !== "" && Number(s.duration) >= ctx.step && Object.values(s.masterIds).some(Boolean);
  const save = async () => {
    setBusy(true);
    try {
      const id = s.id || push(sref(ctx.salonId, "services")).key;
      const masterIds = Object.fromEntries(Object.entries(s.masterIds).filter(([, v]) => v));
      const masterPrices = Object.fromEntries(Object.entries(s.masterPrices).filter(([k, v]) => masterIds[k] && v !== "" && v !== null && v !== undefined && Number(v) >= 0).map(([k, v]) => [k, Number(v)]));
      await set(sref(ctx.salonId, `services/${id}`), { name: s.name.trim(), category: s.category || "Інше", price: Number(s.price), duration: Number(s.duration), masterIds, masterPrices, active: s.active !== false });
      ctx.toast("Збережено"); onClose();
    } catch { ctx.toast("Не вдалося зберегти", "err"); } finally { setBusy(false); }
  };
  const active = ctx.masters.filter((m) => m.profile?.active !== false);
  return (
    <>
      <Modal open onClose={onClose} title={isNew ? "Нова послуга" : "Послуга"} icon="✂️" footer={<><Btn variant="ghost" flex={1} onClick={onClose}>Закрити</Btn><Btn flex={2} disabled={!valid || busy} onClick={save}>{busy ? "Зберігаю..." : "Зберегти"}</Btn></>}>
        <Field label="Назва" value={s.name} onChange={(v) => setS({ ...s, name: v })} placeholder="Жіноча стрижка" />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>{CATS.map((c) => <Chip key={c} active={s.category === c} color={th.ACCENT} onClick={() => setS({ ...s, category: c })}>{c}</Chip>)}</div>
        <Row gap={8}><Input label="Ціна, ₴" type="number" value={s.price} onChange={(v) => setS({ ...s, price: v })} style={{ flex: 1 }} /><Input label="Тривалість, хв" type="number" step={ctx.step} value={s.duration} onChange={(v) => setS({ ...s, duration: v })} style={{ flex: 1 }} /></Row>
        {Number(s.duration) % ctx.step !== 0 && Number(s.duration) > 0 && <Hint color={th.GOLD}>Тривалість не кратна кроку сітки ({ctx.step} хв) — запис займе наступний цілий слот.</Hint>}
        <ModalSection label="Хто виконує">
          {active.length === 0 ? <Hint>Спершу додайте майстрів.</Hint> : (
            <>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>{active.map((m) => <Chip key={m.id} active={!!s.masterIds[m.id]} color={th.GREEN} onClick={() => toggleMaster(m.id)}>{m.profile?.name || "Майстер"}</Chip>)}</div>
              {active.filter((m) => s.masterIds[m.id]).length > 0 && <div style={{ fontSize: 10, color: th.FAINT, letterSpacing: 1, marginBottom: 6 }}>ПЕРСОНАЛЬНА ЦІНА (НЕОБОВ'ЯЗКОВО)</div>}
              {active.filter((m) => s.masterIds[m.id]).map((m) => (
                <Row key={m.id} gap={8} style={{ marginBottom: 6 }}>
                  <div style={{ flex: 1, minWidth: 0, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.profile?.name}</div>
                  <input type="number" value={s.masterPrices[m.id] ?? ""} placeholder={String(priceFor({ price: s.price }, m.id) || "")} onChange={(e) => setS({ ...s, masterPrices: { ...s.masterPrices, [m.id]: e.target.value } })}
                    style={{ width: 92, background: th.BG_DEEP, border: `1px solid ${th.BORDER}`, borderRadius: 10, padding: "8px 10px", color: th.TEXT, fontSize: 14, outline: "none", fontFamily: "inherit" }} />
                </Row>
              ))}
              <Hint>Порожнє поле — діє загальна ціна. Клієнт бачить і платить ціну свого майстра.</Hint>
            </>
          )}
        </ModalSection>
        <ModalSection label="Видимість">
          <Row gap={10}><div style={{ flex: 1, fontSize: 13 }}>Показувати клієнтам<div style={{ fontSize: 11, color: th.DIM }}>Вимкніть, щоб тимчасово сховати послугу</div></div><Toggle on={s.active !== false} onChange={(v) => setS({ ...s, active: v })} /></Row>
        </ModalSection>
        {!isNew && <Btn variant="ghost" accent={th.RED} style={{ marginTop: 14 }} onClick={() => setDel(true)}>Видалити послугу</Btn>}
      </Modal>
      <Confirm open={del} danger title="Видалити послугу?" text="Минулі записи збережуться. Клієнти більше не зможуть її обрати." yes="Видалити" no="Ні" onNo={() => setDel(false)}
        onYes={async () => { try { await remove(sref(ctx.salonId, `services/${svc.id}`)); ctx.toast("Видалено"); onClose(); } catch { ctx.toast("Не вдалося видалити", "err"); } }} />
    </>
  );
}
