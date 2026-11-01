// Робочий простір: «Один майстер» (solo) або «Салон» (salon) — один акаунт із кількома майстрами всередині.
// Дані простору лежать, як і раніше, в instructors/{iid}/… (iid = uid власника). Склад — instructors/{iid}/staff/{uid}:
// { role: 'owner' | 'master', name, color, joinedAt }. Власник завжди є рядком staff/{iid} із роллю owner.
// masterId у записі, слоті чи послузі вказує, чий це майстер; без нього це майстер = власник (так працює «Один майстер»).
// Файл однаковий в адмінці й клієнті (src/workspace.js / src/utils/workspace.js).

import { ADMIN_URL, newInviteToken } from "./salon.js";

export const ACCOUNT_SOLO = "solo";
export const ACCOUNT_SALON = "salon";
export const ROLE_OWNER = "owner";
export const ROLE_MASTER = "master";
export const MAX_MASTERS = 30;
export const MASTER_COLORS = ["#60a5fa", "#34d399", "#fbbf24", "#f87171", "#a78bfa", "#f472b6", "#2dd4bf", "#fb923c"];

// Тип акаунта з admin_settings.accountType; все, що не «salon», — «Один майстер»
export const accountTypeOf = (settings) => (settings?.accountType === ACCOUNT_SALON ? ACCOUNT_SALON : ACCOUNT_SOLO);
export const isSalon = (settings) => accountTypeOf(settings) === ACCOUNT_SALON;

// Чий це майстер: поле masterId, а без нього — власник простору
export const masterOf = (obj, ownerIid) => (obj && typeof obj.masterId === "string" && obj.masterId) || ownerIid || "";

// Склад простору → [{ id, role, name, color, owner }], власник першим, далі за датою вступу
export function normStaff(node, ownerIid) {
  const out = Object.entries(node || {})
    .filter(([, v]) => v && typeof v === "object" && (v.role === ROLE_OWNER || v.role === ROLE_MASTER))
    .map(([id, v]) => ({
      id,
      role: v.role,
      owner: v.role === ROLE_OWNER,
      name: String(v.name || "").trim().slice(0, 60) || "Майстер",
      color: typeof v.color === "string" && /^#[0-9a-fA-F]{6}$/.test(v.color) ? v.color : MASTER_COLORS[0],
      joinedAt: Number(v.joinedAt) || 0,
    }))
    .sort((a, b) => Number(b.owner) - Number(a.owner) || a.joinedAt - b.joinedAt || a.name.localeCompare(b.name));
  // Власник завжди присутній, навіть якщо рядка ще немає (старий акаунт, щойно перетворений на салон)
  if (ownerIid && !out.some((m) => m.id === ownerIid)) {
    out.unshift({ id: ownerIid, role: ROLE_OWNER, owner: true, name: "Власник", color: MASTER_COLORS[0], joinedAt: 0 });
  }
  return out;
}

// Колір для нового майстра: перший невикористаний, інакше за колом
export function pickMasterColor(staff) {
  const used = new Set((staff || []).map((m) => m.color));
  return MASTER_COLORS.find((c) => !used.has(c)) || MASTER_COLORS[(staff || []).length % MASTER_COLORS.length];
}

// Рядок власника для нового салону
export function ownerRow(name, color = MASTER_COLORS[0], now = Date.now()) {
  return { role: ROLE_OWNER, name: String(name || "Власник").trim().slice(0, 60) || "Власник", color, joinedAt: now };
}

// Рядок нового майстра
export function masterRow(name, color, now = Date.now()) {
  return { role: ROLE_MASTER, name: String(name || "Майстер").trim().slice(0, 60) || "Майстер", color, joinedAt: now };
}

export const isOwnerId = (staffList, id) => !!(staffList || []).find((m) => m.id === id && m.owner);
export const canManageStaff = (staffList, uid) => isOwnerId(staffList, uid);
// Що бачить користувач: власник — усі майстри, майстер — лише себе
export const visibleMasterIds = (staffList, uid) => {
  const me = (staffList || []).find((m) => m.id === uid);
  if (!me) return [];
  return me.owner ? staffList.map((m) => m.id) : [uid];
};

// ── Запрошення майстра в салон-простір ─────────────────────────────────────────────
// workspace_invites/{token} = { iid, expiresAt } (чинні 7 днів); майстер, що приймає запрошення, пише СВІЙ рядок
// instructors/{iid}/staff/{uid} (role master + inviteToken) і staff_index/{uid} = { iid } — за ним застосунок знає, куди його пускати.
export const WS_INVITE_KEY = "juno_workspace_invite";
export const WS_INVITE_DAYS = 7;
export const workspaceInviteUrl = (token) => `${ADMIN_URL}/?workspace_invite=${token}`;
export const newWorkspaceToken = newInviteToken;

// Токен із вставленого посилання або коду
export function parseWorkspaceToken(input) {
  const raw = String(input || "").trim();
  const m = /[?&]workspace_invite=([A-Za-z0-9_-]+)/.exec(raw);
  const tok = (m ? m[1] : raw).replace(/[^A-Za-z0-9_-]/g, "");
  return tok.length >= 12 ? tok : "";
}

// Запрошення з адреси (?workspace_invite=…) запам'ятовуємо до кінця реєстрації
export function rememberWorkspaceInvite() {
  try {
    const t = parseWorkspaceToken(new URLSearchParams(window.location.search).get("workspace_invite") || "");
    if (t) localStorage.setItem(WS_INVITE_KEY, t);
  } catch { /* приватний режим — не страшно */ }
}
export function storedWorkspaceInvite() {
  try { return localStorage.getItem(WS_INVITE_KEY) || ""; } catch { return ""; }
}
export function forgetWorkspaceInvite() {
  try { localStorage.removeItem(WS_INVITE_KEY); } catch { /* ігноруємо */ }
}

// Колір для майстра, що приєднався сам (власник потім змінить): стабільно з uid
export function colorForUid(uid) {
  let h = 0;
  for (const c of String(uid || "")) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return MASTER_COLORS[h % MASTER_COLORS.length];
}
