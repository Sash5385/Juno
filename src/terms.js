// Напрямки послуг: слова «майстер / клієнт / запис» у всьому інтерфейсі підміняються під сферу.
// Код і тексти написані «універсально» (майстер · клієнт · запис); для обраного напрямку
// відомі форми цих слів замінюються на потрібні (з відмінками) прямо в тексті сторінки.
// Напрямок зберігається в instructors/{iid}/admin_settings/direction.
// УВАГА: functions/terms.cjs — копія цього файлу для сервера (оновлюйте обидва).

const SLOTS = ["n", "g", "d", "i", "l", "np", "gp", "dp", "ip", "lp"];
const noun = (...f) => Object.fromEntries(SLOTS.map((s, k) => [s, f[k]]));

// Базові (універсальні) слова, що вже є в інтерфейсі
const BASE = {
  specialist: noun("майстер", "майстра", "майстру", "майстром", "майстрі", "майстри", "майстрів", "майстрам", "майстрами", "майстрах"),
  client:     noun("клієнт", "клієнта", "клієнту", "клієнтом", "клієнті", "клієнти", "клієнтів", "клієнтам", "клієнтами", "клієнтах"),
  salon:      noun("салон", "салону", "салону", "салоном", "салоні", "салони", "салонів", "салонам", "салонами", "салонах"),
  booking:    noun("запис", "запису", "запису", "записом", "записі", "записи", "записів", "записам", "записами", "записах"),
};

const NOUNS = {
  teacher:    noun("викладач", "викладача", "викладачу", "викладачем", "викладачеві", "викладачі", "викладачів", "викладачам", "викладачами", "викладачах"),
  pupil:      noun("учень", "учня", "учню", "учнем", "учневі", "учні", "учнів", "учням", "учнями", "учнях"),
  lesson:     noun("урок", "уроку", "уроку", "уроком", "уроці", "уроки", "уроків", "урокам", "уроками", "уроках"),
  expert:     noun("спеціаліст", "спеціаліста", "спеціалісту", "спеціалістом", "спеціалісті", "спеціалісти", "спеціалістів", "спеціалістам", "спеціалістами", "спеціалістах"),
  school:     noun("школа", "школи", "школі", "школою", "школі", "школи", "шкіл", "школам", "школами", "школах"),
  center:     noun("центр", "центру", "центру", "центром", "центрі", "центри", "центрів", "центрам", "центрами", "центрах"),
  session:    noun("сеанс", "сеансу", "сеансу", "сеансом", "сеансі", "сеанси", "сеансів", "сеансам", "сеансами", "сеансах"),
};

export const DIRECTIONS = {
  universal: { name: "Універсальний", icon: "🧩", desc: "Майстер · клієнт · запис", terms: null },
  beauty:    { name: "Краса",         icon: "💅", desc: "Майстер · клієнт · запис (барбер, манікюр, брови, косметолог)", terms: null },
  education: { name: "Навчання",      icon: "🎓", desc: "Викладач · учень · урок (репетитори, тренери, йога)", terms: { specialist: NOUNS.teacher, client: NOUNS.pupil, booking: NOUNS.lesson, salon: NOUNS.school } },
  consult:   { name: "Консультації",  icon: "💬", desc: "Спеціаліст · клієнт · сеанс (психологи, лікарі, юристи)", terms: { specialist: NOUNS.expert, client: BASE.client, booking: NOUNS.session, salon: NOUNS.center } },
};
export const DIRECTION_IDS = Object.keys(DIRECTIONS);
export const normDirection = (d) => (DIRECTIONS[d] ? d : "universal");

const cache = {};
function build(direction) {
  if (cache[direction] !== undefined) return cache[direction];
  const t = DIRECTIONS[direction]?.terms;
  if (!t) return (cache[direction] = null);
  const map = new Map();
  for (const key of Object.keys(BASE)) {
    SLOTS.forEach((s) => {
      const from = BASE[key][s], to = t[key][s];
      if (from !== to && !map.has(from)) map.set(from, to);
    });
  }
  const forms = [...map.keys()].sort((a, b) => b.length - a.length).map((f) => f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`(?<![\\p{L}\\p{N}_])(${forms.join("|")})(?![\\p{L}\\p{N}_])`, "giu");
  return (cache[direction] = { map, re });
}

function matchCase(src, dst) {
  if (src.length > 1 && src === src.toUpperCase()) return dst.toUpperCase();
  if (src[0] !== src[0].toLowerCase()) return dst[0].toUpperCase() + dst.slice(1);
  return dst;
}

// «салон» → знахідний («на салон» → «на школу»): лише після прийменників/дієслів, де форма точно знахідна
const ACC = { school: "школу" };
const ACC_RE = /(?<![\p{L}\p{N}_])((?:на|в|у|про|через|за|під|над|створити|створіть|створи|перетворити|перетворіть|покинути|видалити|обрати|вибрати|відкрити)\s+)салон(?![\p{L}\p{N}_])/giu;
function accSalon(text, direction) {
  const t = DIRECTIONS[direction]?.terms;
  const acc = t && t.salon === NOUNS.school ? ACC.school : null;
  return acc ? text.replace(ACC_RE, (m, p) => p + acc) : text;
}

export function translate(text, direction) {
  const b = build(direction);
  if (!b || !text) return text;
  text = accSalon(text, direction);
  return text.replace(b.re, (m) => {
    const to = b.map.get(m.toLowerCase());
    return to ? matchCase(m, to) : m;
  });
}

// ── Підміна в живому DOM (клієнт і адмінка) ──────────────────────
const SKIP = new Set(["SCRIPT", "STYLE", "TEXTAREA", "INPUT", "CODE", "NOSCRIPT"]);
const ATTRS = ["placeholder", "title", "aria-label"];
let observer = null, current = "universal";

function skipNode(el) {
  return !el || SKIP.has(el.tagName) || el.isContentEditable || !!el.closest?.("[data-notrans]");
}
function fixText(n) {
  const v = n.nodeValue;
  if (!v || v.length < 3) return;
  if (skipNode(n.parentElement)) return;
  const t = translate(v, current);
  if (t !== v) n.nodeValue = t;
}
function fixEl(el) {
  if (!el.getAttribute) return;
  for (const a of ATTRS) {
    const v = el.getAttribute(a);
    if (v) { const t = translate(v, current); if (t !== v) el.setAttribute(a, t); }
  }
}
function walk(root) {
  if (root.nodeType === 3) { fixText(root); return; }
  if (root.nodeType !== 1 || skipNode(root)) return;
  fixEl(root);
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let n;
  while ((n = tw.nextNode())) {
    if (n.nodeType === 3) fixText(n);
    else fixEl(n);
  }
}

export function startTerms(direction) {
  current = normDirection(direction);
  if (observer) { observer.disconnect(); observer = null; }
  if (!build(current) || typeof document === "undefined") return;
  walk(document.body);
  observer = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === "childList") m.addedNodes.forEach(walk);
      else if (m.type === "characterData") fixText(m.target);
      else if (m.type === "attributes") fixEl(m.target);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}

// Зворотна підміна: слова будь-якого напряму → універсальні (для пошуку у словнику локалізації).
// Деякі форми неоднозначні («школи» = «салону» або «салони»), тому toBaseAlts дає всі варіанти.
let rev = null;
function buildRev() {
  const map = new Map();
  const add = (from, to) => { if (from === to) return; const a = map.get(from) || []; if (!a.includes(to)) a.push(to); map.set(from, a); };
  for (const d of Object.values(DIRECTIONS)) {
    if (!d.terms) continue;
    for (const key of Object.keys(BASE)) SLOTS.forEach((s) => add(d.terms[key][s], BASE[key][s]));
  }
  add(ACC.school, "салон");
  const forms = [...map.keys()].sort((a, b) => b.length - a.length);
  return { map, re: new RegExp(`(?<![\\p{L}\\p{N}_])(${forms.join("|")})(?![\\p{L}\\p{N}_])`, "giu") };
}
export function toBaseAlts(text) {
  if (!text) return [text];
  rev = rev || buildRev();
  const amb = [];
  text.replace(rev.re, (m) => { const a = rev.map.get(m.toLowerCase()); if (a && a.length > 1) amb.push(a.length); return m; });
  const n = Math.min(amb.reduce((x, y) => x * y, 1), 8);
  const out = [];
  for (let v = 0; v < n; v++) {
    let k = 0, rest = v;
    out.push(text.replace(rev.re, (m) => {
      const a = rev.map.get(m.toLowerCase());
      if (!a) return m;
      let i = 0;
      if (a.length > 1) { i = rest % a.length; rest = Math.floor(rest / a.length); k++; }
      return matchCase(m, a[i]);
    }));
  }
  return out;
}
export const toBase = (text) => toBaseAlts(text)[0];
