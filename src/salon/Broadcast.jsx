// Розсилка клієнтам (власник): push усім клієнтам із сповіщеннями. Шаблони — pushTemplates, журнал — pushLog.
import { useState, useMemo } from "react";
import { update, push, remove } from "firebase/database";
import { Modal, Btn, Field, ModalSection } from "../ui.jsx";
import { useSalon } from "./ctx.js";
import { sref, useValue, toList } from "./data.js";
import { callFn, errText } from "./api.js";
import { Row, Hint, Select, Confirm, useTh } from "./kit.jsx";

const fmt = (ts) => new Date(ts).toLocaleString("uk", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export default function Broadcast({ onClose }) {
  const ctx = useSalon();
  const th = useTh();
  const tpl = useValue(() => sref(ctx.salonId, "pushTemplates"), [ctx.salonId]);
  const log = useValue(() => sref(ctx.salonId, "pushLog"), [ctx.salonId]);
  const templates = useMemo(() => toList(tpl.value).sort((a, b) => String(a.name).localeCompare(String(b.name))), [tpl.value]);
  const history = useMemo(() => toList(log.value).sort((a, b) => (b.sentAt || 0) - (a.sentAt || 0)).slice(0, 5), [log.value]);
  const [f, setF] = useState({ tplId: "", title: "", body: "" });
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState(false);
  const chosen = templates.find((t) => t.id === f.tplId);
  const pick = (id) => { const t = templates.find((x) => x.id === id); setF({ tplId: id, title: t?.title || "", body: t?.body || "" }); };
  const valid = f.title.trim() && f.body.trim();

  const send = async () => {
    setAsk(false); setBusy(true);
    try {
      const r = await callFn("salonSendBroadcast", { title: f.title.trim(), body: f.body.trim() });
      ctx.toast(`Надіслано: ${r.sent} з ${r.recipients}`);
      onClose();
    } catch (e) { ctx.toast(errText(e), "err"); } finally { setBusy(false); }
  };
  const saveTpl = async () => {
    try {
      const id = f.tplId || push(sref(ctx.salonId, "pushTemplates")).key;
      const name = chosen?.name || f.title.trim().slice(0, 30);
      await update(sref(ctx.salonId, `pushTemplates/${id}`), { name, title: f.title.trim(), body: f.body.trim() });
      setF({ ...f, tplId: id });
      ctx.toast("Шаблон збережено");
    } catch { ctx.toast("Не вдалося зберегти шаблон", "err"); }
  };
  const delTpl = async () => { try { await remove(sref(ctx.salonId, `pushTemplates/${f.tplId}`)); setF({ tplId: "", title: "", body: "" }); ctx.toast("Шаблон видалено"); } catch { ctx.toast("Не вдалося видалити", "err"); } };

  return (
    <>
      <Modal open onClose={onClose} title="Розсилка клієнтам" icon="📣" footer={<Btn flex={1} disabled={busy || !valid} onClick={() => setAsk(true)}>{busy ? "Надсилаю…" : "Надіслати всім"}</Btn>}>
        {templates.length > 0 && <Select label="Шаблон" value={f.tplId} onChange={pick} options={[{ v: "", l: "— новий текст —" }, ...templates.map((t) => ({ v: t.id, l: t.name }))]} />}
        <Field label="Заголовок" value={f.title} onChange={(v) => setF({ ...f, title: v.slice(0, 60) })} placeholder="Напр.: Знижка на манікюр" />
        <Field label="Текст" value={f.body} onChange={(v) => setF({ ...f, body: v.slice(0, 300) })} textarea rows={3} placeholder="Напр.: {ім'я}, цього тижня −20% на манікюр" />
        <Hint>{"{ім'я}"} підставляється для кожного клієнта. Отримають лише ті, хто увімкнув сповіщення. До 5 розсилок на добу.</Hint>
        <Row gap={8} style={{ marginBottom: 6 }}>
          <Btn flex={1} variant="ghost" disabled={!valid} onClick={saveTpl}>{f.tplId ? "Оновити шаблон" : "Зберегти як шаблон"}</Btn>
          {f.tplId && <Btn flex={1} variant="ghost" accent={th.RED} onClick={delTpl}>Видалити шаблон</Btn>}
        </Row>
        {history.length > 0 && (
          <ModalSection label="Останні розсилки">
            {history.map((h) => <div key={h.id} style={{ fontSize: 12, padding: "6px 0", borderTop: `1px solid ${th.BORDER}` }}><b>{h.title}</b> · {fmt(h.sentAt)}{h.sent != null ? ` · ${h.sent}/${h.recipients}` : ""}</div>)}
          </ModalSection>
        )}
      </Modal>
      <Confirm open={ask} title="Надіслати розсилку?" text={`«${f.title.trim()}»\n${f.body.trim()}\n\nСповіщення отримають усі клієнти з увімкненими сповіщеннями.`} yes="Надіслати" no="Скасувати" onYes={send} onNo={() => setAsk(false)} />
    </>
  );
}
