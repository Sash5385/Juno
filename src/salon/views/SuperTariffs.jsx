// Суперадмін → Тарифи: редактор system/tariffs (ціни й ліміти без деплою). Чинні тарифи беруться з бази або типових.
import { useState } from "react";
import { set, remove } from "firebase/database";
import { Card, Btn, Field } from "../../ui.jsx";
import { rootRef, useValue } from "../data.js";
import { Spinner, Row, Hint, useTh } from "../kit.jsx";
import { DEFAULT_TARIFFS, toDraft, validateDraft } from "../../salonTariffs.js";

export default function SuperTariffs({ toast }) {
  const raw = useValue(() => rootRef("system/tariffs"), []);
  if (raw.loading) return <Spinner />;
  // key — привід перемонтувати форму після збереження/скидання
  return <Editor key={JSON.stringify(raw.value ?? null)} stored={raw.value} toast={toast} />;
}

function Editor({ stored, toast }) {
  const th = useTh();
  const base = stored ? { ...DEFAULT_TARIFFS, ...stored, tiers: Object.values(stored.tiers || DEFAULT_TARIFFS.tiers) } : DEFAULT_TARIFFS;
  const [d, setD] = useState(() => toDraft(base));
  const [errors, setErrors] = useState([]);
  const [busy, setBusy] = useState(false);
  const setTier = (i, patch) => setD({ ...d, tiers: d.tiers.map((t, k) => (k === i ? { ...t, ...patch } : t)) });
  const save = async () => {
    const r = validateDraft(d);
    setErrors(r.errors);
    if (r.errors.length) return;
    setBusy(true);
    try { await set(rootRef("system/tariffs"), { ...r.value, currency: "UAH" }); toast("Тарифи збережено — діють одразу"); } catch { toast("Не вдалося зберегти", "err"); } finally { setBusy(false); }
  };
  const reset = async () => { setBusy(true); try { await remove(rootRef("system/tariffs")); toast("Повернуто типові тарифи"); } catch { toast("Не вдалося", "err"); } finally { setBusy(false); } };
  return (
    <div>
      <div style={{ fontSize: 12, color: th.DIM, marginBottom: 10 }}>{stored ? "Діють власні тарифи (system/tariffs)" : "Діють типові тарифи"}</div>
      {d.tiers.map((t, i) => (
        <Card key={i} style={{ marginBottom: 8, padding: "10px 12px" }} data-testid="sa-tier">
          <Row gap={8}>
            <Field label="Назва" value={t.name} onChange={(v) => setTier(i, { name: v })} style={{ flex: 2 }} />
            <Field label="Код" value={t.key} onChange={(v) => setTier(i, { key: v.toLowerCase() })} style={{ flex: 1 }} />
          </Row>
          <Row gap={8}>
            <Field label="До майстрів" type="number" value={t.maxMasters} onChange={(v) => setTier(i, { maxMasters: v })} style={{ flex: 1 }} />
            <Field label="Ціна, ₴/міс" type="number" value={t.price} onChange={(v) => setTier(i, { price: v })} style={{ flex: 1 }} />
          </Row>
          {d.tiers.length > 1 && <Btn variant="ghost" accent={th.RED} onClick={() => setD({ ...d, tiers: d.tiers.filter((_, k) => k !== i) })}>Прибрати тариф</Btn>}
        </Card>
      ))}
      <Btn variant="ghost" style={{ marginBottom: 12 }} onClick={() => setD({ ...d, tiers: [...d.tiers, { key: `tier${d.tiers.length + 1}`, name: "", maxMasters: "", price: "" }] })}>＋ Додати тариф</Btn>
      <Row gap={8}>
        <Field label="Рік = скільки місяців ціни" type="number" value={d.yearMonths} onChange={(v) => setD({ ...d, yearMonths: v })} style={{ flex: 1 }} />
        <Field label="Майстрів на пробному" type="number" value={d.trialMasterLimit} onChange={(v) => setD({ ...d, trialMasterLimit: v })} style={{ flex: 1 }} />
      </Row>
      {errors.length > 0 && <div data-testid="sa-tariff-errors" style={{ fontSize: 12.5, color: th.RED, margin: "6px 0 10px", lineHeight: 1.6 }}>{errors.map((e) => <div key={e}>• {e}</div>)}</div>}
      <Row gap={8} style={{ marginTop: 6 }}>
        <Btn flex={1} disabled={busy} onClick={save}>{busy ? "…" : "Зберегти тарифи"}</Btn>
        {stored && <Btn flex={1} variant="ghost" disabled={busy} onClick={reset}>Типові</Btn>}
      </Row>
      <Hint>Нові ціни діють для наступних оплат; чинні підписки не змінюються. Видалений тариф не зачіпає салонів, які його вже оплатили, — лише ховає його з вибору. Перед зміною лімітів перевірте, що вищий тариф дорожчий.</Hint>
    </div>
  );
}
