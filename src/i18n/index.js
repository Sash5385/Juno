// Локалізація клієнта: uk (основна), en, pl, de, es, fr.
// Тексти в коді лишаються українськими; для іншої мови словник (dict.json: { "<uk>": { en, pl, … } }) підвантажується
// окремим чанком, а DOM перекладається на льоту (текст, placeholder/title/aria-label/alt, alert/confirm).
// Ключі з {0},{1} — шаблони для динамічних рядків.
export const LANGS = ['uk', 'en', 'pl', 'de', 'es', 'fr']
export const LANG_NAMES = { uk: 'Українська', en: 'English', pl: 'Polski', de: 'Deutsch', es: 'Español', fr: 'Français' }
const LOCALE = { uk: 'uk-UA', en: 'en-GB', pl: 'pl-PL', de: 'de-DE', es: 'es-ES', fr: 'fr-FR' }
import { toBase } from '../terms.js'
const CY = /[А-Яа-яІіЇїЄєҐґ]/
const ATTRS = ['placeholder', 'title', 'aria-label', 'alt']

export function detectLang() {
  try {
    const q = new URLSearchParams(location.search).get('lang')
    if (q && LANGS.includes(q)) return q
    const s = localStorage.getItem('dp_lang')
    if (s && LANGS.includes(s)) return s
  } catch { /* сховище недоступне */ }
  let n = ((navigator.languages && navigator.languages[0]) || navigator.language || 'uk').slice(0, 2).toLowerCase()
  if (n === 'ru') n = 'uk'
  return LANGS.includes(n) ? n : 'en'
}
let lang = 'uk'
export const getLang = () => lang
export function setLang(l) {
  if (!LANGS.includes(l)) return
  try { localStorage.setItem('dp_lang', l) } catch { /* ігноруємо */ }
  location.reload()
}

let exact = new Map()
let lower = new Map()
let patterns = []
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function build(dict, l) {
  exact = new Map(); lower = new Map(); patterns = []
  for (const [k, v] of Object.entries(dict)) {
    const t = v && v[l]
    if (!t) continue
    if (/\{\d+\}/.test(k)) {
      const re = new RegExp('^' + esc(k).replace(/\\\{\d+\\\}/g, '(.+?)') + '$')
      patterns.push({ re, t, n: k.length })
    } else { exact.set(k, t); const lk = k.toLowerCase(); if (!lower.has(lk)) lower.set(lk, t) }
  }
  patterns.sort((a, b) => b.n - a.n)
}

export function tr(text) {
  if (lang === 'uk' || !text || !CY.test(text)) return text
  const lead = text.match(/^\s*/)[0], tail = text.match(/\s*$/)[0]
  const core = text.trim().replace(/\s+/g, ' ')
  const e = exact.get(core)
  if (e !== undefined) return lead + e + tail
  for (const p of patterns) {
    const m = core.match(p.re)
    if (m) return lead + p.t.replace(/\{(\d+)\}/g, (_, i) => tr(m[+i + 1] ?? '')) + tail
  }
  // регістр: «ОЧІКУЮТЬ» (верхній, через CSS/toUpperCase) і «очікують» (нижній) беруть переклад «Очікують»
  const lc = lower.get(core.toLowerCase())
  if (lc !== undefined) {
    const up = core === core.toUpperCase() && core !== core.toLowerCase()
    return lead + (up ? lc.toUpperCase() : lc) + tail
  }
  // «5 записів» → число + перекладене слово
  const nm = core.match(/^([+\-−]?\d+(?:[.,]\d+)?)\s+(.+)$/)
  if (nm) { const r = exact.get(nm[2]); if (r !== undefined) return lead + nm[1] + ' ' + r + tail }
  // текст міг пройти підміну напряму («запис»→«сеанс»): повертаємо до універсальних слів і шукаємо знову
  const bt = toBase(text)
  if (bt !== text) { const r = tr(bt); if (r !== bt) return r }
  return text
}

function walk(root) {
  if (root.nodeType === 3) { fixText(root); return }
  if (root.nodeType !== 1) return
  if (root.closest && root.closest('[data-no-i18n]')) return
  const tag = root.tagName
  if (tag === 'SCRIPT' || tag === 'STYLE') return
  fixAttrs(root)
  for (let n = root.firstChild; n; n = n.nextSibling) walk(n)
}
function fixText(n) {
  const p = n.parentNode
  if (!p || (p.closest && p.closest('[data-no-i18n]'))) return
  const v = n.nodeValue
  if (!CY.test(v)) return
  const t = tr(v)
  if (t !== v) n.nodeValue = t
}
function fixAttrs(el) {
  for (const a of ATTRS) {
    const v = el.getAttribute(a)
    if (v && CY.test(v)) { const t = tr(v); if (t !== v) el.setAttribute(a, t) }
  }
}

let mo = null
function start() {
  walk(document.body)
  document.title = tr(document.title)
  mo = new MutationObserver((recs) => {
    mo.disconnect()
    for (const r of recs) {
      if (r.type === 'characterData') fixText(r.target)
      else if (r.type === 'attributes') fixAttrs(r.target)
      else r.addedNodes.forEach(walk)
    }
    document.title = tr(document.title)
    mo.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS })
  })
  mo.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS })
}

export async function initI18n() {
  lang = detectLang()
  document.documentElement.lang = lang
  if (lang === 'uk') return
  // дати й час — мовою інтерфейсу
  const loc = LOCALE[lang]
  for (const fn of ['toLocaleDateString', 'toLocaleTimeString', 'toLocaleString']) {
    const orig = Date.prototype[fn]
    Date.prototype[fn] = function (l, o) { return orig.call(this, typeof l === 'string' && /^uk/.test(l) ? loc : l, o) }
  }
  const nAlert = window.alert, nConfirm = window.confirm
  window.alert = (m) => nAlert.call(window, tr(String(m)))
  window.confirm = (m) => nConfirm.call(window, tr(String(m)))
  try {
    const mod = await import('./dict.json')
    build(mod.default || mod, lang)
  } catch { return }
  const go = () => start()
  if (document.body) go(); else document.addEventListener('DOMContentLoaded', go)
}
