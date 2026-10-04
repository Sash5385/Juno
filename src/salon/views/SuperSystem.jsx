// Суперадмін → Система: резервні копії, звернення з лендингу, журнал помилок застосунків
import { useMemo, useState } from "react";
import { set, update, remove } from "firebase/database";
import { Section, Card, Btn, Toggle, Pill } from "../../ui.jsx";
import { rootRef, useValue, toList } from "../data.js";
import { Empty, Row, Hint, useTh } from "../kit.jsx";

const fmt = (ts) => (ts ? new Date(ts).toLocaleString("uk", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");
const kb = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} МБ` : `${Math.max(1, Math.round(n / 1024))} КБ`);

export default function SuperSystem({ toast }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <Section title="Резервні копії" icon="💾" defaultOpen><Backups toast={toast} /></Section>
      <Section title="Звернення з лендингу" icon="✉️" defaultOpen><Messages toast={toast} /></Section>
      <Section title="Помилки застосунків" icon="🐞"><Errors toast={toast} /></Section>
    </div>
  );
}

function Backups({ toast }) {
  const th = useTh();
  const on = useValue(() => rootRef("system/backupEnabled"), []);
  const st = useValue(() => rootRef("system/backupStatus"), []);
  const req = useValue(() => rootRef("system/backupRequest"), []);
  const s = st.value;
  const run = async () => { try { await set(rootRef("system/backupRequest"), Date.now()); toast("Копію запущено — статус оновиться за хвилину"); } catch { toast("Не вдалося запустити", "err"); } };
  return (
    <>
      <Row gap={10} style={{ marginBottom: 8 }}>
        <div style={{ flex: 1, fontSize: 13 }}>Нічна копія (03:00 за Києвом)<div style={{ fontSize: 11, color: th.DIM }}>JSON кожного салону в Storage, зберігається 30 діб</div></div>
        <Toggle on={on.value === true} onChange={(v) => set(rootRef("system/backupEnabled"), v).catch(() => toast("Не вдалося зберегти", "err"))} />
      </Row>
      <div data-testid="sa-backup-status" style={{ fontSize: 12.5, marginBottom: 10, color: s ? (s.ok ? th.GREEN : th.RED) : th.DIM }}>
        {!s ? "Копій ще не було" : s.ok ? `✅ ${fmt(s.at)} · ${s.trigger === "manual" ? "вручну" : "за розкладом"} · салонів: ${s.salons} · ${kb(s.bytes)}${s.removed ? ` · прибрано старих: ${s.removed}` : ""}` : `⛔ ${fmt(s.at)} · ${s.error || "помилка"}`}
      </div>
      <Btn variant="ghost" disabled={req.value != null} onClick={run}>{req.value != null ? "Копія виконується…" : "Зробити копію зараз"}</Btn>
      <Hint>Ручна копія працює й коли нічна вимкнена. Видалені салони архівуються окремо в backups/deleted.</Hint>
    </>
  );
}

function Messages({ toast }) {
  const th = useTh();
  const m = useValue(() => rootRef("system/contactMessages"), []);
  const list = useMemo(() => toList(m.value).sort((a, b) => (b.at || 0) - (a.at || 0)), [m.value]);
  const act = (p) => p.catch(() => toast("Не вдалося", "err"));
  if (!list.length) return <Empty icon="✉️" text="Звернень немає" />;
  return list.map((x) => (
    <Card key={x.id} data-testid="sa-message" style={{ marginBottom: 8, opacity: x.status === "done" ? 0.6 : 1 }}>
      <div style={{ padding: "10px 12px" }}>
        <Row gap={8}><div style={{ flex: 1, fontWeight: 800, fontSize: 14 }}>{x.name}</div><span style={{ fontSize: 11, color: th.DIM }}>{fmt(x.at)}</span>{x.status !== "done" && <Pill label="нове" color={th.ACCENT} bg="rgba(255,90,60,0.16)" />}</Row>
        <div style={{ fontSize: 12.5, margin: "2px 0 6px" }}><a href={`mailto:${x.email}`} style={{ color: th.BLUE }}>{x.email}</a>{x.phone ? <> · <a href={`tel:${x.phone}`} style={{ color: th.BLUE }}>{x.phone}</a></> : null}</div>
        <div style={{ fontSize: 13.5, lineHeight: 1.5, whiteSpace: "pre-wrap", marginBottom: 8 }}>{x.message}</div>
        <Row gap={8}>
          <Btn flex={1} variant="ghost" onClick={() => act(update(rootRef(`system/contactMessages/${x.id}`), { status: x.status === "done" ? "new" : "done" }))}>{x.status === "done" ? "Повернути в нові" : "Опрацьовано"}</Btn>
          <Btn flex={1} variant="ghost" accent={th.RED} onClick={() => act(remove(rootRef(`system/contactMessages/${x.id}`)))}>Видалити</Btn>
        </Row>
      </div>
    </Card>
  ));
}

function Errors({ toast }) {
  const th = useTh();
  const e = useValue(() => rootRef("system/errorLog"), []);
  const [open, setOpen] = useState(null);
  const list = useMemo(() => toList(e.value).sort((a, b) => (b.last || 0) - (a.last || 0)), [e.value]);
  const act = (p) => p.catch(() => toast("Не вдалося", "err"));
  if (!list.length) return <Empty icon="🐞" text="Помилок немає" />;
  return (
    <>
      <Btn variant="ghost" accent={th.RED} style={{ marginBottom: 8 }} onClick={() => act(remove(rootRef("system/errorLog")))}>Очистити журнал ({list.length})</Btn>
      {list.map((x) => (
        <Card key={x.id} data-testid="sa-error" style={{ marginBottom: 8 }}>
          <div style={{ padding: "9px 12px" }}>
            <Row gap={8}><Pill label={x.app === "client" ? "клієнт" : "адмінка"} color={th.PURPLE} bg="rgba(192,132,252,0.16)" /><span style={{ fontSize: 11, color: th.DIM, flex: 1 }}>{x.version} · {fmt(x.last)}</span><b style={{ fontSize: 12 }}>×{x.count || 1}</b></Row>
            <div onClick={() => setOpen(open === x.id ? null : x.id)} style={{ fontSize: 13, fontWeight: 700, margin: "5px 0", wordBreak: "break-word", cursor: "pointer" }}>{x.message}</div>
            {open === x.id && <div style={{ fontSize: 11, color: th.DIM, whiteSpace: "pre-wrap", wordBreak: "break-word", marginBottom: 6 }}>{x.url ? `${x.url}\n` : ""}{x.ua}{x.stack ? `\n\n${x.stack}` : ""}</div>}
            <Btn variant="ghost" onClick={() => act(remove(rootRef(`system/errorLog/${x.id}`)))}>Прибрати</Btn>
          </div>
        </Card>
      ))}
    </>
  );
}
