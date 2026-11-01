// Локалізація лендингу: uk (основна), en, pl, de, es, fr. Ключ — український текст елемента (innerHTML).
// Дані перекладів — js/i18n-data.js (window.DP_I18N = { "<uk>": { en, pl, de, es, fr } }).
(function () {
  var LANGS = ["uk", "en", "pl", "de", "es", "fr"];
  var NAMES = { uk: "Українська", en: "English", pl: "Polski", de: "Deutsch", es: "Español", fr: "Français" };
  var D = window.DP_I18N || {};
  var cy = /[А-Яа-яІіЇїЄє]/;
  var lang = "uk";

  function detect() {
    var q = (location.search.match(/[?&]lang=([a-z]{2})/) || [])[1];
    if (q && LANGS.indexOf(q) >= 0) return q;
    try { var s = localStorage.getItem("dp_lang"); if (s && LANGS.indexOf(s) >= 0) return s; } catch (e) {}
    var nav = ((navigator.languages && navigator.languages[0]) || navigator.language || "uk").slice(0, 2).toLowerCase();
    if (nav === "ru") nav = "uk";
    return LANGS.indexOf(nav) >= 0 ? nav : "en";
  }
  function tr(uk) {
    if (lang === "uk") return uk;
    var e = D[uk];
    return (e && e[lang]) || uk;
  }
  window.dpT = tr;
  window.dpLang = function () { return lang; };

  function own(el) { var s = ""; for (var n = el.firstChild; n; n = n.nextSibling) if (n.nodeType === 3) s += n.textContent; return s; }
  function leaf(el) {
    for (var i = 0; i < el.children.length; i++) {
      var k = el.children[i];
      if (["A", "EM", "B", "BR", "SMALL", "SPAN", "I"].indexOf(k.tagName) < 0 || k.children.length) return false;
    }
    return true;
  }
  function apply() {
    document.documentElement.lang = lang;
    var els = [].slice.call(document.querySelectorAll("body *"));
    els.forEach(function (el) {
      if (!el.isConnected || el.tagName === "SCRIPT" || el.tagName === "STYLE" || el.tagName === "SELECT" || el.tagName === "OPTION") return;
      if (el.closest("[data-cal],[data-slots],[data-noi18n]")) return;
      var uk = el.getAttribute("data-uk");
      if (uk === null) {
        if (!(cy.test(own(el)) && leaf(el))) return;
        uk = el.innerHTML.trim();
        el.setAttribute("data-uk", uk);
      }
      var t = tr(uk);
      if (el.innerHTML !== t) el.innerHTML = t;
    });
    document.querySelectorAll("[aria-label],[title]").forEach(function (el) {
      ["aria-label", "title"].forEach(function (a) {
        var k = "data-uk-" + a, v = el.getAttribute(k);
        if (v === null) { var cur = el.getAttribute(a); if (!cur || !cy.test(cur)) return; v = cur; el.setAttribute(k, v); }
        el.setAttribute(a, tr(v));
      });
    });
    // <title> і meta
    var T = document.querySelector("title");
    if (T) { if (!T.getAttribute("data-uk")) T.setAttribute("data-uk", T.textContent); T.textContent = tr(T.getAttribute("data-uk")); }
    document.querySelectorAll('meta[name="description"],meta[property="og:title"],meta[property="og:description"]').forEach(function (m) {
      if (!m.getAttribute("data-uk")) m.setAttribute("data-uk", m.getAttribute("content"));
      m.setAttribute("content", tr(m.getAttribute("data-uk")));
    });
    var sel = document.getElementById("lang");
    if (sel) sel.value = lang;
    window.dispatchEvent(new CustomEvent("dp-lang", { detail: lang }));
  }
  function set(l) {
    lang = l;
    try { localStorage.setItem("dp_lang", l); } catch (e) {}
    apply();
  }
  window.dpSetLang = set;

  function init() {
    lang = detect();
    var sel = document.getElementById("lang");
    if (sel) {
      sel.innerHTML = LANGS.map(function (l) { return '<option value="' + l + '">' + NAMES[l] + "</option>"; }).join("");
      sel.addEventListener("change", function () { set(sel.value); });
    }
    apply();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
