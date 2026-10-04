// Клієнти салону (власник): список з пошуком, картка (нотатки, блокування, історія візитів)
import { useState, useMemo } from "react";
import { query, orderByChild, equalTo, update } from "firebase/database";
import { Card, Modal, Btn, Field, Toggle, ModalSection, Pill } from "../../ui.jsx";
import { useSalon } from "../ctx.js";
import { sref, useValue, toList } from "../data.js";
import BookingSheet from "../BookingSheet.jsx";
import Broadcast from "../Broadcast.jsx";
import { Empty, Spinner, statusOf, money, dateLabel, initials, useTh, Row } from "../kit.jsx";
import { bookingSort } from "../../salonLogic.js";

export default function Clients() {
  const ctx = useSalon();
  const th = useTh();
  const users = useValue(() => sref(ctx.salonId, "users"), [ctx.salonId]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(null);
  const [bc, setBc] = useState(false);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return toList(users.value).map((u) => ({ uid: u.id, name: u.profile?.name || "Без імені", phone: u.profile?.phone || "", blocked: !!u.blocked, notes: u.notes || "" }))
      .filter((c) => !s || `${c.name} ${c.phone}`.toLowerCase().includes(s)).sort((a, b) => a.name.localeCompare(b.name));
  }, [users.value, q]);
  return (
    <div>
      <Btn variant="ghost" style={{ marginBottom: 10 }} onClick={() => setBc(true)}>📣 Розсилка клієнтам</Btn>
      <Field value={q} onChange={setQ} placeholder="Пошук клієнта: ім'я або телефон" style={{ marginBottom: 12 }} />
      {users.loading ? <Spinner /> : list.length === 0 ? <Empty icon="👥" text={q ? "Нічого не знайдено" : "Клієнти з'являться, коли зареєструються за вашим посиланням для запису"} /> : (
        <>
          <div style={{ fontSize: 11, color: th.DIM, marginBottom: 8 }}>Усього: {list.length}</div>
          {list.map((c) => (
            <Card key={c.uid} onClick={() => setOpen(c)} style={{ marginBottom: 8, cursor: "pointer" }}>
              <Row gap={10} style={{ padding: "10px 12px" }}>
                <div style={{ width: 38, height: 38, borderRadius: 12, background: `color-mix(in srgb, ${th.ACCENT} 25%, transparent)`, color: th.ACCENT, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 14, flexShrink: 0 }}>{initials(c.name)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
                  <div style={{ fontSize: 12, color: th.DIM }}>{c.phone || "без телефону"}</div>
                </div>
                {c.blocked && <Pill label="Заблоковано" color={th.RED} bg="rgba(239,68,68,0.16)" />}
              </Row>
            </Card>
          ))}
        </>
      )}
      {open && <ClientSheet client={open} onClose={() => setOpen(null)} />}
      {bc && <Broadcast onClose={() => setBc(false)} />}
    </div>
  );
}

function ClientSheet({ client, onClose }) {
  const ctx = useSalon();
  const th = useTh();
  const [notes, setNotes] = useState(client.notes);
  const [blocked, setBlocked] = useState(client.blocked);
  const [selected, setSelected] = useState(null);
  const hist = useValue(() => query(sref(ctx.salonId, "bookings"), orderByChild("clientUid"), equalTo(client.uid)), [ctx.salonId, client.uid]);
  const bookings = toList(hist.value).filter((b) => b.clientUid === client.uid && b.status !== "personal").sort((a, b) => -bookingSort(a, b));
  const done = bookings.filter((b) => b.status === "completed");
  const save = async (patch) => { try { await update(sref(ctx.salonId, `users/${client.uid}`), patch); ctx.toast("Збережено"); } catch { ctx.toast("Не вдалося зберегти", "err"); } };
  return (
    <>
      <Modal open onClose={onClose} title={client.name} icon="👤">
        {client.phone && <a href={`tel:${client.phone}`} style={{ display: "block", color: th.BLUE, fontWeight: 800, fontSize: 15, textDecoration: "none", marginBottom: 10 }}>📞 {client.phone}</a>}
        <Row gap={8} style={{ marginBottom: 6 }}>
          <div style={{ flex: 1, fontSize: 13 }}><b>{done.length}</b> візитів · <b>{money(done.reduce((s, b) => s + (Number(b.price) || 0), 0))}</b></div>
        </Row>
        <ModalSection label="Нотатки">
          <Field value={notes} onChange={setNotes} textarea rows={3} placeholder="Алергії, побажання, особливості…" />
          {notes !== client.notes && <Btn variant="ghost" onClick={() => save({ notes: notes.trim() || null })}>Зберегти нотатки</Btn>}
        </ModalSection>
        <ModalSection label="Доступ">
          <Row gap={10}><div style={{ flex: 1, fontSize: 13 }}>Заблокувати запис<div style={{ fontSize: 11, color: th.DIM }}>Клієнт не зможе записуватись онлайн</div></div><Toggle on={blocked} onChange={(v) => { setBlocked(v); save({ blocked: v || null }); }} /></Row>
        </ModalSection>
        <ModalSection label={`Історія (${bookings.length})`}>
          {hist.loading ? <Spinner /> : bookings.length === 0 ? <div style={{ fontSize: 12, color: th.DIM }}>Записів ще не було</div> : bookings.slice(0, 30).map((b) => {
            const st = statusOf(b);
            return <div key={b.id} onClick={() => setSelected(b)} style={{ display: "flex", gap: 8, padding: "7px 0", borderTop: `1px solid ${th.BORDER}`, fontSize: 12.5, cursor: "pointer", alignItems: "center" }}>
              <div style={{ width: 104, flexShrink: 0, fontWeight: 700 }}>{dateLabel(b.date)} {b.time}</div>
              <div style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: th.DIM }}>{b.serviceName || "—"}</div>
              <span style={{ color: st.color, fontWeight: 700, fontSize: 11 }}>{st.label}</span>
            </div>;
          })}
        </ModalSection>
      </Modal>
      {selected && <BookingSheet booking={selected} onClose={() => setSelected(null)} />}
    </>
  );
}
