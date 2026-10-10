// Напрямки послуг: слова «майстер / клієнт / запис» у всьому інтерфейсі підміняються під сферу.
// Код і тексти написані «універсально» (майстер · клієнт · запис); для обраного напрямку
// відомі форми цих слів замінюються на потрібні (з відмінками) прямо в тексті сторінки.
// Напрямок зберігається в instructors/{iid}/admin_settings/direction.
// УВАГА: це серверна копія src/terms.js (CommonJS, без DOM-частини) — оновлюйте обидва файли.

const SLOTS = ["n", "g", "d", "i", "l", "np", "gp", "dp", "ip", "lp"];
const noun = (...f) => Object.fromEntries(SLOTS.map((s, k) => [s, f[k]]));

// Базові (універсальні) слова, що вже є в інтерфейсі
const BASE = {
  specialist: noun("майстер", "майстра", "майстру", "майстром", "майстрі", "майстри", "майстрів", "майстрам", "майстрами", "майстрах"),
  client:     noun("клієнт", "клієнта", "клієнту", "клієнтом", "клієнті", "клієнти", "клієнтів", "клієнтам", "клієнтами", "клієнтах"),
  booking:    noun("запис", "запису", "запису", "записом", "записі", "записи", "записів", "записам", "записами", "записах"),
};

const NOUNS = {
  teacher:    noun("викладач", "викладача", "викладачу", "викладачем", "викладачеві", "викладачі", "викладачів", "викладачам", "викладачами", "викладачах"),
  pupil:      noun("учень", "учня", "учню", "учнем", "учневі", "учні", "учнів", "учням", "учнями", "учнях"),
  lesson:     noun("урок", "уроку", "уроку", "уроком", "уроці", "уроки", "уроків", "урокам", "уроками", "уроках"),
  expert:     noun("спеціаліст", "спеціаліста", "спеціалісту", "спеціалістом", "спеціалісті", "спеціалісти", "спеціалістів", "спеціалістам", "спеціалістами", "спеціалістах"),
  session:    noun("сеанс", "сеансу", "сеансу", "сеансом", "сеансі", "сеанси", "сеансів", "сеансам", "сеансами", "сеансах"),
};

const DIRECTIONS = {
  universal: { name: "Універсальний", icon: "🧩", desc: "Майстер · клієнт · запис", terms: null },
  beauty:    { name: "Краса",         icon: "💅", desc: "Майстер · клієнт · запис (барбер, манікюр, брови, косметолог)", terms: null },
  education: { name: "Навчання",      icon: "🎓", desc: "Викладач · учень · урок (репетитори, тренери, йога)", terms: { specialist: NOUNS.teacher, client: NOUNS.pupil, booking: NOUNS.lesson } },
  consult:   { name: "Консультації",  icon: "💬", desc: "Спеціаліст · клієнт · сеанс (психологи, лікарі, юристи)", terms: { specialist: NOUNS.expert, client: BASE.client, booking: NOUNS.session } },
};
const DIRECTION_IDS = Object.keys(DIRECTIONS);
const normDirection = (d) => (DIRECTIONS[d] ? d : "universal");

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

function translate(text, direction) {
  const b = build(direction);
  if (!b || !text) return text;
  return text.replace(b.re, (m) => {
    const to = b.map.get(m.toLowerCase());
    return to ? matchCase(m, to) : m;
  });
}

module.exports = { DIRECTIONS, DIRECTION_IDS, normDirection, translate };
