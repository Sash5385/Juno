// Валюта цін майстра (admin_settings/currency). Лише символ — суми не перераховуються.
// Тариф ліцензії Juno завжди в гривні (оплата через Monobank).
export const CURRENCIES = [["UAH", "₴"], ["USD", "$"], ["EUR", "€"], ["PLN", "zł"]];
let sym = "₴";
export const setCurrency = (code) => { sym = (CURRENCIES.find((c) => c[0] === code) || CURRENCIES[0])[1]; };
export const cur = () => sym;
