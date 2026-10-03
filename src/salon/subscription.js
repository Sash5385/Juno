// Підписка салону: дані з Cloud Function salonSubscriptionInfo (тарифи, ліцензія, ліміт майстрів, розрахунок).
// Ціни й розрахунок рахує сервер (functions/salon/tariffs.js) — тут лише показ, тож UI і рахунок не розійдуться.
import { useEffect, useState } from "react";
import { callFn } from "./api.js";

export const kop = (n) => `${(Number(n) / 100).toFixed(2).replace(/\.00$/, "")} ₴`;

// tier/months — необов'язкові: з ними сервер додає розрахунок (quote). reloadKey — привід перечитати (напр. після оплати).
// info — остання успішна відповідь (не блимає при зміні вибору); чи quote стосується поточного вибору — перевіряє викликач.
export function useSubscription({ tier = null, months = 1, reloadKey = "" } = {}) {
  const [state, setState] = useState({ key: null, info: null, error: null });
  const key = `${tier}|${months}|${reloadKey}`;
  useEffect(() => {
    let off = false;
    callFn("salonSubscriptionInfo", tier ? { tier, months } : {})
      .then((info) => { if (!off) setState({ key, info, error: null }); })
      .catch((e) => { if (!off) setState((s) => ({ ...s, key, error: e })); });
    return () => { off = true; };
  }, [key, tier, months]);
  return { info: state.info, error: state.error, loading: state.key !== key };
}
