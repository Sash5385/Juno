// Поле фото: прев'ю (Avatar) + «Завантажити / Змінити» + «Прибрати». Файл стискається й вантажиться одразу (onUploaded(url)),
// прибирання лише повідомляє onRemove() — видалення файлу з Storage робить викликач, коли зміни збережено.
import { useRef, useState } from "react";
import { Btn } from "../ui.jsx";
import { useSalon } from "./ctx.js";
import { Avatar, Row, Hint } from "./kit.jsx";
import { uploadSalonImage } from "./photo.js";

const ERR = { not_image: "Оберіть зображення (JPG, PNG)", too_big: "Файл завеликий (до 15 МБ)", encode_failed: "Не вдалося обробити зображення" };

export default function PhotoField({ url, name, kind, masterId, size = 64, radius = 18, label = "Фото", onUploaded, onRemove }) {
  const ctx = useSalon();
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try { onUploaded(await uploadSalonImage({ salonId: ctx.salonId, kind, masterId, file })); }
    catch (err) { ctx.toast(ERR[err.code] || "Не вдалося завантажити фото", "err"); }
    finally { setBusy(false); }
  };
  return (
    <div style={{ marginBottom: 10 }}>
      <Row gap={12}>
        <Avatar url={url} name={name} size={size} radius={radius} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, marginBottom: 6, opacity: 0.7 }}>{label}</div>
          <Row gap={8}>
            <Btn variant="ghost" disabled={busy} onClick={() => input.current?.click()}>{busy ? "Завантажую…" : url ? "Змінити" : "Завантажити"}</Btn>
            {url && !busy && <Btn variant="ghost" onClick={onRemove}>Прибрати</Btn>}
          </Row>
        </div>
      </Row>
      <input ref={input} type="file" accept="image/*" data-testid={`photo-${kind}`} onChange={pick} style={{ display: "none" }} />
      <Hint>JPG або PNG, стискається автоматично.</Hint>
    </div>
  );
}
