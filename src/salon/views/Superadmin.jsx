// Екран суперадміна (власник платформи): салони й підписки, тарифи, копії, звернення, помилки.
// Доступ задають правила бази (email суперадміна); тут лише вирішується, чи показувати екран. Не залежить від SalonCtx —
// працює і поверх Shell власника, і самостійно (суперадмін без свого салону).
import { useState, useMemo, useEffect } from "react";
import { get, update } from "firebase/database";
import { Card, Modal, Btn, Field, ModalSection, Pill, Chip } from "../../ui.jsx";
import { sref, rootRef, useValue } from "../data.js";
import { callFn, errText } from "../api.js";
import { Empty, Spinner, Row, Hint, Select, Confirm, useTh, useToast, dateLabel } from "../kit.jsx";
import { kop } from "../subscription.js";
import SuperTariffs from "./SuperTariffs.jsx";
import SuperSystem from "./SuperSystem.jsx";

const DAY = 86400000;
const ymd = (ts) => new Date(ts).toISOString().slice(0, 10);

// Стан підписки салону для списку й фільтрів
function stateOf(l, now) {
  if (!l) return { k: "none", label: "Без підписки" };
  const until = l.status === "trial" ? l.trialEndsAt : l.expiresAt;
  if (l.status === "suspended") return { k: "bad", label: "Призупинено", until };
  if (until && until < now) return { k: "bad", label: "Прострочено", until };
  if (l.status === "trial") return { k: "trial", label: "Пробний", until };
  return { k: "paid", label: "Активна", until };
}

export default function Superadmin({ embedded = false, onCreateSalon, onSignOut }) {
  const th = useTh();
  const [toastEl, toast] = useToast();
  const [tab, setTab] = useState("salons");
  const msgs = useValue(() => rootRef("system/contactMessages"), []);
  const newMsgs = Object.values(msgs.value || {}).filter((m) => m && m.status !== "done").length;
  const tabs = [["salons", "Салони"], ["tariffs", "Тарифи"], ["system", `Система${newMsgs ? ` · ${newMsgs}` : ""}`]];
  return (
    <div style={embedded ? undefined : { maxWidth: 720, margin: "0 auto", padding: "calc(12px + env(safe-area-inset-top,0px)) 14px 96px" }}>
      {!embedded && <Row gap={10} style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 22 }}>🛠</div>
        <div style={{ flex: 1 }}><div style={{ fontSize: 16, fontWeight: 900 }}>Juno · суперадмін</div><div style={{ fontSize: 11, color: th.DIM }}>Салони, підписки, тарифи, система</div></div>
        {onSignOut && <Btn variant="ghost" onClick={onSignOut}>Вийти</Btn>}
      </Row>}
      <Row gap={8} wrap style={{ marginBottom: 12 }}>
        {tabs.map(([id, l]) => <Chip key={id} active={tab === id} color={th.ACCENT} onClick={() => setTab(id)}>{l}</Chip>)}
      </Row>
      {tab === "salons" && <Salons toast={toast} />}
      {tab === "tariffs" && <SuperTariffs toast={toast} />}
      {tab === "system" && <SuperSystem toast={toast} />}
      {onCreateSalon && <Btn variant="ghost" style={{ marginTop: 18 }} onClick={onCreateSalon}>＋ Створити власний салон</Btn>}
      {toastEl}
    </div>
  );
}

function Salons({ toast }) {
  const th = useTh();
  const idx = useValue(() => rootRef("salon_index"), []);
  const ids = useMemo(() => Object.keys(idx.value || {}).sort(), [idx.value]);
  const idsKey = ids.join(",");
  const [reload, setReload] = useState(0);
  const [lic, setLic] = useState({ key: null, map: {} });
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [open, setOpen] = useState(null);
  const [now] = useState(() => Date.now());
  const key = `${idsKey}|${reload}`;
  useEffect(() => {
    let off = false;
    Promise.all(ids.map((id) => get(sref(id, "license")).then((s) => [id, s.val()]).catch(() => [id, null])))
      .then((e) => { if (!off) setLic({ key, map: Object.fromEntries(e) }); });
    return () => { off = true; };
  }, [key, ids]);
  const loading = idx.loading || lic.key !== key;
  const rows = useMemo(() => ids.map((id) => ({ id, ...(idx.value[id] || {}), license: lic.map[id], st: stateOf(lic.map[id], now) })), [ids, idx.value, lic.map, now]);
  const sum = useMemo(() => {
    const paid = rows.filter((r) => r.st.k === "paid");
    return { total: rows.length, paid: paid.length, trial: rows.filter((r) => r.st.k === "trial").length, bad: rows.filter((r) => r.st.k === "bad").length, mrr: paid.reduce((s, r) => s + (Number(r.license?.monthKop) || 0), 0) };
  }, [rows]);
  const list = rows.filter((r) => (filter === "all" || r.st.k === filter) && (!q.trim() || `${r.name} ${r.slug}`.toLowerCase().includes(q.trim().toLowerCase())));
  const tile = (label, v, c) => <div style={{ flex: "1 1 30%", minWidth: 90, padding: "8px 10px", borderRadius: 12, background: th.SURFACE }}><div style={{ fontSize: 11, color: th.DIM }}>{label}</div><div style={{ fontSize: 18, fontWeight: 900, color: c }}>{v}</div></div>;
  return (
    <div>
      {loading ? <Spinner /> : (
        <>
          <div data-testid="sa-summary"><Row gap={8} wrap style={{ marginBottom: 12 }}>
            {tile("Салонів", sum.total)}{tile("Платних", sum.paid, th.GREEN)}{tile("Пробних", sum.trial, th.GOLD)}{tile("Проблемних", sum.bad, th.RED)}{tile("≈ за місяць", kop(sum.mrr), th.ACCENT)}
          </Row></div>
          <Field value={q} onChange={setQ} placeholder="Пошук: назва або посилання" style={{ marginBottom: 8 }} />
          <Row gap={6} wrap style={{ marginBottom: 10 }}>
            {[["all", "Усі"], ["paid", "Платні"], ["trial", "Пробні"], ["bad", "Проблемні"], ["none", "Без підписки"]].map(([k, l]) => <Chip key={k} active={filter === k} color={th.ACCENT} onClick={() => setFilter(k)}>{l}</Chip>)}
          </Row>
          {list.length === 0 && <Empty icon="🏪" text={rows.length ? "Нічого не знайдено" : "Салонів ще немає"} />}
          {list.map((r) => {
            const c = { paid: th.GREEN, trial: th.GOLD, bad: th.RED, none: th.DIM }[r.st.k];
            return (
              <Card key={r.id} data-testid="sa-salon" onClick={() => setOpen(r)} style={{ marginBottom: 8, cursor: "pointer" }}>
                <Row gap={10} style={{ padding: "10px 12px" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name || r.id}</div>
                    <div style={{ fontSize: 12, color: th.DIM }}>/{r.slug || "—"}{r.license?.tier ? ` · ${r.license.tier}` : ""}{r.license?.masterLimit ? ` · до ${r.license.masterLimit} майстрів` : ""}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <Pill label={r.st.label} color={c} bg={`color-mix(in srgb, ${c} 16%, transparent)`} />
                    {r.st.until && <div style={{ fontSize: 11, color: th.DIM, marginTop: 3 }}>до {dateLabel(ymd(r.st.until))}</div>}
                  </div>
                </Row>
              </Card>
            );
          })}
        </>
      )}
      {open && <SalonSheet salon={open} toast={toast} onClose={() => setOpen(null)} onChanged={() => setReload((n) => n + 1)} />}
    </div>
  );
}

function SalonSheet({ salon, toast, onClose, onChanged }) {
  const th = useTh();
  const l = salon.license || {};
  const startUntil = l.status === "trial" ? l.trialEndsAt : l.expiresAt;
  const [f, setF] = useState({ status: l.status || "trial", until: startUntil ? ymd(startUntil) : "", masterLimit: l.masterLimit ? String(l.masterLimit) : "", tier: l.tier || "" });
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState(false);
  const [word, setWord] = useState("");
  const [now] = useState(() => Date.now());
  const bill = useValue(() => rootRef(`salon_billing/${salon.id}`), [salon.id]);
  const payments = Object.entries(bill.value || {}).map(([id, p]) => ({ id, ...p })).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const bump = (days) => { const base = f.until && new Date(f.until).getTime() > now ? new Date(`${f.until}T12:00:00`).getTime() : now; setF({ ...f, until: ymd(base + days * DAY) }); };
  const save = async () => {
    setBusy(true);
    try {
      const ts = f.until ? new Date(`${f.until}T12:00:00`).getTime() : null;
      const upd = { status: f.status, masterLimit: Number(f.masterLimit) > 0 ? Number(f.masterLimit) : null, tier: f.tier.trim() || null, provider: l.provider || "manual" };
      if (f.status === "trial") upd.trialEndsAt = ts; else upd.expiresAt = ts;
      await update(sref(salon.id, "license"), upd);
      toast("Підписку збережено"); onChanged(); onClose();
    } catch { toast("Не вдалося зберегти", "err"); } finally { setBusy(false); }
  };
  const del = async () => {
    setBusy(true);
    try { await callFn("salonDeleteAccount", { type: "owner", salonId: salon.id }); toast("Салон видалено"); onChanged(); onClose(); } catch (e) { toast(errText(e), "err"); setBusy(false); setAsk(false); }
  };
  const num = (k, label, ph) => <Field label={label} type="number" value={f[k]} onChange={(v) => setF({ ...f, [k]: v })} placeholder={ph} style={{ flex: 1 }} />;
  return (
    <>
      <Modal open onClose={onClose} title={salon.name || salon.id} icon="🏪" footer={<><Btn variant="ghost" flex={1} onClick={onClose}>Закрити</Btn><Btn flex={1} disabled={busy} onClick={save}>{busy ? "…" : "Зберегти"}</Btn></>}>
        <div style={{ fontSize: 12, color: th.DIM, marginBottom: 8, wordBreak: "break-all" }}>id: {salon.id}{salon.slug ? ` · /${salon.slug}` : ""}</div>
        <ModalSection label="Підписка" first>
          <Select label="Статус" value={f.status} onChange={(v) => setF({ ...f, status: v })} options={[{ v: "trial", l: "Пробний період" }, { v: "active", l: "Активна" }, { v: "suspended", l: "Призупинена (режим читання)" }]} />
          <Field label={f.status === "trial" ? "Пробний період до" : "Підписка до"} type="date" value={f.until} onChange={(v) => setF({ ...f, until: v })} />
          <Row gap={6} style={{ marginBottom: 8 }}>{[7, 30, 365].map((d) => <Btn key={d} variant="ghost" onClick={() => bump(d)}>+{d === 365 ? "рік" : `${d} дн.`}</Btn>)}</Row>
          <Row gap={8}>{num("masterLimit", "Ліміт майстрів", "—")}<Field label="Тариф (код)" value={f.tier} onChange={(v) => setF({ ...f, tier: v })} placeholder="team" style={{ flex: 1 }} /></Row>
          <Hint>Ручна зміна для компенсацій і винятків. Оплачений тариф виставляє сервер сам після оплати; ціну тарифу тут не змінюємо.</Hint>
        </ModalSection>
        <ModalSection label={`Платежі підписки (${payments.length})`}>
          {payments.length === 0 && <div style={{ fontSize: 12, color: th.DIM }}>Платежів немає</div>}
          {payments.slice(0, 10).map((p) => (
            <div key={p.id} style={{ display: "flex", gap: 8, padding: "6px 0", borderTop: `1px solid ${th.BORDER}`, fontSize: 12.5 }}>
              <div style={{ width: 82, flexShrink: 0 }}>{dateLabel(ymd(p.createdAt || 0))}</div>
              <div style={{ flex: 1 }}>{p.tierKey} · {p.months === 12 ? "рік" : "міс."} · {kop(p.amountKop)}</div>
              <span style={{ color: p.status === "success" ? th.GREEN : p.status === "reversed" ? th.GOLD : th.DIM, fontWeight: 700 }}>{p.status === "success" ? "оплачено" : p.status === "reversed" ? "повернено" : p.status}{p.needsReview ? " ⚠" : ""}</span>
            </div>
          ))}
        </ModalSection>
        <ModalSection label="Небезпечна зона">
          <Btn variant="ghost" accent={th.RED} onClick={() => setAsk(true)}>Видалити салон</Btn>
        </ModalSection>
      </Modal>
      <Confirm open={ask} danger title={`Видалити «${salon.name || salon.id}»?`} yes="Видалити назавжди" no="Скасувати" onNo={() => { setAsk(false); setWord(""); }} onYes={() => word.trim().toUpperCase() === "ВИДАЛИТИ" && !busy && del()}
        text={<><div style={{ marginBottom: 8 }}>Дані салону, клієнтів і акаунт власника буде видалено; архів лишається на сервері.</div><Field label="Для підтвердження введіть: ВИДАЛИТИ" value={word} onChange={setWord} /></>} />
    </>
  );
}
