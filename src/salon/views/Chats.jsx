// Чати: салон ↔ клієнт (власник) і клієнт ↔ майстер (майстер бачить свої, власник — усі)
import { useState, useMemo, useEffect, useRef } from "react";
import { push, update, increment, query, limitToLast } from "firebase/database";
import { Card, Modal, Chip } from "../../ui.jsx";
import { useSalon } from "../ctx.js";
import { sref, useValue, toList } from "../data.js";
import { Empty, Spinner, Row, initials, useTh } from "../kit.jsx";

const fmtTs = (ts) => { if (!ts) return ""; const d = new Date(ts); const t = new Date(); return d.toDateString() === t.toDateString() ? d.toLocaleTimeString("uk", { hour: "2-digit", minute: "2-digit" }) : d.toLocaleDateString("uk", { day: "2-digit", month: "2-digit" }); };

export default function Chats() {
  const ctx = useSalon();
  const th = useTh();
  const { role, salonId, masterId, masters } = ctx;
  const [section, setSection] = useState(role === "owner" ? "salon" : "master");
  const [open, setOpen] = useState(null);
  const users = useValue(() => (role === "owner" ? sref(salonId, "users") : null), [role, salonId]);
  const salonMeta = useValue(() => (role === "owner" ? sref(salonId, "chatMeta") : null), [role, salonId]);
  const masterMeta = useValue(() => (role === "owner" ? sref(salonId, "masterChatMeta") : sref(salonId, `masterChatMeta/${masterId}`)), [role, salonId, masterId]);
  const nameOf = (uid, meta) => meta?.name || users.value?.[uid]?.profile?.name || "Клієнт";

  const threads = useMemo(() => {
    if (section === "salon") return toList(salonMeta.value).map((t) => ({ key: `s-${t.id}`, uid: t.id, kind: "salon", masterId: null, meta: t }));
    const out = [];
    const tree = role === "owner" ? masterMeta.value || {} : { [masterId]: masterMeta.value || {} };
    for (const [mid, perUser] of Object.entries(tree)) for (const [uid, meta] of Object.entries(perUser || {})) out.push({ key: `m-${mid}-${uid}`, uid, kind: "master", masterId: mid, meta });
    return out;
  }, [section, salonMeta.value, masterMeta.value, role, masterId]).sort((a, b) => (b.meta?.lastTs || 0) - (a.meta?.lastTs || 0));

  const unreadOf = (t) => (t.kind === "salon" ? t.meta?.unreadForAdmin : t.meta?.unreadForMaster) || 0;
  const unreadSalon = Object.values(salonMeta.value || {}).reduce((s, m) => s + (m?.unreadForAdmin || 0), 0);
  const loading = masterMeta.loading || (role === "owner" && salonMeta.loading);
  const mName = (id) => masters.find((m) => m.id === id)?.profile?.name || "";
  return (
    <div>
      {role === "owner" && (
        <Row gap={6} style={{ marginBottom: 12 }}>
          <Chip active={section === "salon"} color={th.ACCENT} onClick={() => setSection("salon")}>Салон{unreadSalon ? ` · ${unreadSalon}` : ""}</Chip>
          <Chip active={section === "master"} color={th.ACCENT} onClick={() => setSection("master")}>З майстрами</Chip>
        </Row>
      )}
      {loading ? <Spinner /> : threads.length === 0 ? <Empty icon="💬" text="Повідомлень поки немає" /> : threads.map((t) => (
        <Card key={t.key} onClick={() => setOpen(t)} style={{ marginBottom: 8, cursor: "pointer" }}>
          <Row gap={10} style={{ padding: "10px 12px" }}>
            <div style={{ width: 38, height: 38, borderRadius: 12, background: `color-mix(in srgb, ${th.BLUE} 24%, transparent)`, color: th.BLUE, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 14, flexShrink: 0 }}>{t.uid === "general" ? "👥" : initials(nameOf(t.uid, t.meta))}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Row gap={6}><div style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.uid === "general" ? "Загальний чат" : nameOf(t.uid, t.meta)}</div><div style={{ fontSize: 11, color: th.FAINT, flexShrink: 0 }}>{fmtTs(t.meta?.lastTs)}</div></Row>
              <div style={{ fontSize: 12, color: th.DIM, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.kind === "master" && role === "owner" ? `${mName(t.masterId)} · ` : ""}{t.meta?.lastMsg || "…"}</div>
            </div>
            {unreadOf(t) > 0 && <span style={{ minWidth: 20, height: 20, borderRadius: 10, background: th.ACCENT, color: "#fff", fontSize: 11, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 5px" }}>{unreadOf(t)}</span>}
          </Row>
        </Card>
      ))}
      {open && <Thread thread={open} title={open.uid === "general" ? "Загальний чат" : nameOf(open.uid, open.meta)} onClose={() => setOpen(null)} />}
    </div>
  );
}

function Thread({ thread, title, onClose }) {
  const ctx = useSalon();
  const th = useTh();
  const { salonId, role } = ctx;
  const base = thread.kind === "salon" ? `chats/${thread.uid}` : `masterChats/${thread.masterId}/${thread.uid}`;
  const metaPath = thread.kind === "salon" ? `chatMeta/${thread.uid}` : `masterChatMeta/${thread.masterId}/${thread.uid}`;
  const msgs = useValue(() => query(sref(salonId, base), limitToLast(100)), [salonId, base]);
  const [text, setText] = useState("");
  const endRef = useRef(null);
  const me = thread.kind === "salon" ? "admin" : role === "owner" ? "admin" : "master";
  const readField = thread.kind === "salon" ? "unreadForAdmin" : "unreadForMaster";
  const list = useMemo(() => toList(msgs.value).sort((a, b) => (a.ts || 0) - (b.ts || 0)), [msgs.value]);

  useEffect(() => { update(sref(salonId, metaPath), { [readField]: 0 }).catch(() => {}); }, [salonId, metaPath, readField, list.length]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [list.length]);

  const send = async () => {
    const t = text.trim();
    if (!t) return;
    setText("");
    const ts = Date.now();
    try {
      await push(sref(salonId, base), { from: me, text: t, ts, time: new Date(ts).toLocaleTimeString("uk", { hour: "2-digit", minute: "2-digit" }) });
      await update(sref(salonId, metaPath), { lastMsg: t, lastTs: ts, unreadForClient: increment(1), [readField]: 0 });
    } catch { ctx.toast("Не вдалося надіслати", "err"); setText(t); }
  };
  const canWrite = thread.uid !== "general" || role === "owner";
  return (
    <Modal open onClose={onClose} title={title} icon="💬" pad={false} maxH="90vh">
      <div style={{ display: "flex", flexDirection: "column", height: "62vh" }}>
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px" }}>
          {msgs.loading ? <Spinner /> : list.length === 0 ? <Empty icon="💬" text="Повідомлень ще немає" /> : list.map((m) => {
            const mine = m.from === "admin" || m.from === "master";
            return (
              <div key={m.id} style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start", marginBottom: 6 }}>
                <div style={{ maxWidth: "82%", padding: "8px 11px", borderRadius: 14, fontSize: 13.5, lineHeight: 1.4, whiteSpace: "pre-wrap", wordBreak: "break-word", background: mine ? `color-mix(in srgb, ${th.ACCENT} 30%, transparent)` : th.SURF_HI, border: `1px solid ${th.BORDER}` }}>
                  {!mine && m.name && thread.uid === "general" && <div style={{ fontSize: 10.5, fontWeight: 800, color: th.DIM, marginBottom: 2 }}>{m.name}</div>}
                  {m.text}<div style={{ fontSize: 10, color: th.FAINT, textAlign: "right", marginTop: 2 }}>{m.time || fmtTs(m.ts)}{m.auto ? " · авто" : ""}</div>
                </div>
              </div>
            );
          })}
          <div ref={endRef} />
        </div>
        {canWrite && (
          <div style={{ display: "flex", gap: 8, padding: "10px 12px calc(10px + env(safe-area-inset-bottom,0px))", borderTop: `1px solid ${th.BORDER}` }}>
            <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Повідомлення…"
              style={{ flex: 1, minWidth: 0, background: th.BG_DEEP, border: `1px solid ${th.BORDER}`, borderRadius: 12, padding: "11px 12px", color: th.TEXT, fontSize: 14, outline: "none", fontFamily: "inherit" }} />
            <button onClick={send} disabled={!text.trim()} style={{ width: 46, border: "none", borderRadius: 12, background: text.trim() ? th.ACCENT : th.SURF_HI, color: "#fff", fontSize: 18, cursor: "pointer" }}>➤</button>
          </div>
        )}
      </div>
    </Modal>
  );
}
