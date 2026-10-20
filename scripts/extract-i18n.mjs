// Витягує українські рядки з коду клієнта для перекладу: node scripts/extract-i18n.mjs > out.json
import fs from "node:fs"; import path from "node:path";
const cy = /[А-Яа-яІіЇїЄєҐґ]/;
const skip = new Set(["demo"]);
const files = [];
(function walk(d) { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) { if (!skip.has(f.name)) walk(p); } else if (/\.(jsx?|mjs)$/.test(f.name)) files.push(p); } })("src");
const out = new Set();
const code = /`|\?\s*["']|=>|;|\bconst\b|\bfunction\b|\breturn\b|&&|\|\||\)\s*\{|\bset[A-Z]\w*\(|\bawait\b|\bnew \w+\(|\.\w+\(/;
const add = (s) => { s = s.replace(/\s+/g, " ").trim(); if (s && cy.test(s) && s.length < 600 && !code.test(s)) out.add(s); };
for (const f of files) {
  if (/i18n/.test(f)) continue;
  const src = fs.readFileSync(f, "utf8").replace(/(^|[\s{(;,])\/\*[\s\S]*?\*\//g, "$1").replace(/^\s*\/\/.*$/gm, "");
  // JSX-текст (між > і <), розбитий по {вираз}
  for (const m of src.matchAll(/(?<!=)>([^<>]*[А-Яа-яІіЇїЄєҐґ][^<>]*)</g)) {
    let t = m[1], depth = 0, cur = "";
    for (const ch of t) { if (ch === "{") { if (!depth) { add(cur); cur = ""; } depth++; } else if (ch === "}") depth--; else if (!depth) cur += ch; }
    add(cur);
  }
  // шаблонні рядки
  for (const m of src.matchAll(/`((?:[^`\\]|\\.)*)`/g)) { if (cy.test(m[1])) add(m[1].replace(/\$\{[^}]*\}/g, "{0}")); }
  // звичайні рядки
  for (const m of src.matchAll(/(["'])((?:(?!\1)[^\\\n]|\\.)*)\1/g)) { if (cy.test(m[2])) add(m[2].replace(/\\'/g, "'").replace(/\\"/g, '"')); }
}
const arr = [...out].sort();
// нумеруємо плейсхолдери {0},{0} → {0},{1}
console.log(JSON.stringify(arr.map((s) => { let i = 0; return s.replace(/\{0\}/g, () => `{${i++}}`); }), null, 0));
