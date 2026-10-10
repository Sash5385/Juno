// Салон = група окремих майстрів (кожен зі своїм входом, розкладом і клієнтами) зі спільною публічною сторінкою
// {клієнтський сайт}/s/{slug}. salons/{slug} = { ownerIid, name, createdAt, masters: { iid: 'owner' | токен } },
// запрошення — salon_invites/{token} = { salon, ownerIid, expiresAt } (чинні 7 днів). Масив salonSlug у admin_settings
// майстра лише вказує, у якому він салоні; правда про членство — вузол salons/{slug}/masters/{iid}.

export const CLIENT_URL = "https://juno-booking-client.web.app";
export const ADMIN_URL = "https://juno-booking-admin.web.app";
export const INVITE_DAYS = 7;
export const INVITE_KEY = "juno_salon_invite";

// Запрошення з адреси (?salon_invite=…) запам'ятовуємо, щоб Налаштування → Салон підставили його самі
export function rememberSalonInvite() {
  try {
    const t = new URLSearchParams(window.location.search).get("salon_invite");
    if (t) localStorage.setItem(INVITE_KEY, t);
  } catch { /* приватний режим — не страшно */ }
}

const TRANSLIT = {
  "а":"a","б":"b","в":"v","г":"g","ґ":"g","д":"d","е":"e","є":"ye","ж":"zh","з":"z","и":"y","і":"i","ї":"yi","й":"y","к":"k","л":"l",
  "м":"m","н":"n","о":"o","п":"p","р":"r","с":"s","т":"t","у":"u","ф":"f","х":"kh","ц":"ts","ч":"ch","ш":"sh","щ":"shch","ь":"","ю":"yu","я":"ya",
  "ы":"y","э":"e","ъ":"", " ":"-",
};
export const RESERVED_SALON_SLUGS = ["admin", "api", "i", "s", "salon", "juno", "demo", "test", "www"];

// «Салон Краса №1» → «salon-krasa-1» (3–40 символів a-z0-9-)
export function salonSlugFrom(name) {
  const s = String(name || "").toLowerCase().split("").map((c) => TRANSLIT[c] ?? c).join("")
    .replace(/[^a-z0-9-]+/g, "").replace(/-+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/g, "");
  return s;
}
export const salonSlugValid = (slug) => /^[a-z0-9-]{3,40}$/.test(slug || "") && !RESERVED_SALON_SLUGS.includes(slug);

export const salonPublicUrl = (slug) => `${CLIENT_URL}/s/${slug}`;
export const inviteUrl = (token) => `${ADMIN_URL}/?salon_invite=${token}`;

// Токен із вставленого посилання або коду
export function parseInviteToken(input) {
  const raw = String(input || "").trim();
  const m = /[?&]salon_invite=([A-Za-z0-9_-]+)/.exec(raw);
  const tok = (m ? m[1] : raw).replace(/[^A-Za-z0-9_-]/g, "");
  return tok.length >= 12 ? tok : "";
}

// Випадковий токен запрошення (24 символи)
export function newInviteToken() {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(24);
  (globalThis.crypto || { getRandomValues: (a) => a.map(() => Math.floor(Math.random() * 256)) }).getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

// Список майстрів салону з вузла salons/{slug}: [{ iid, owner }]
export function salonMasters(node) {
  return Object.entries(node?.masters || {}).map(([iid, v]) => ({ iid, owner: v === "owner" })).sort((a, b) => Number(b.owner) - Number(a.owner));
}
