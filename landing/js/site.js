(function () {
  var C = window.DP_SITE || {};
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  // --- посилання реєстрації
  $$("[data-app]").forEach(function (a) { a.href = C.appUrl || "#"; });

  // --- контакти з config.js (порожні — ховаємо рядок)
  function show(sel, val, build) {
    $$(sel).forEach(function (el) {
      if (!val) { (el.closest("[data-hide-empty]") || el).style.display = "none"; return; }
      build(el, val);
    });
  }
  show("[data-email]", C.email, function (el, v) { el.innerHTML = '<a href="mailto:' + v + '">' + v + "</a>"; });
  show("[data-phone]", C.phone, function (el, v) { el.innerHTML = '<a href="tel:' + v.replace(/[^+\d]/g, "") + '">' + v + "</a>"; });
  show("[data-telegram]", C.telegram, function (el, v) { el.innerHTML = '<a href="' + v + '" target="_blank" rel="noopener">Telegram</a>'; });
  var f = C.fop || {};
  $$("[data-fop-name]").forEach(function (e) { e.textContent = f.name || "—"; });
  show("[data-fop-ipn]", f.ipn, function (el, v) { el.textContent = v; });
  show("[data-fop-address]", f.address, function (el, v) { el.textContent = v; });
  $$("[data-docs-date]").forEach(function (e) { e.textContent = C.docsDate || ""; });
  $$("[data-year]").forEach(function (e) { e.textContent = new Date().getFullYear(); });

  // --- реальні скриншоти замість макетів: покладіть файл у img/ (напр. img/admin.png)
  $$(".shot[data-src]").forEach(function (box) {
    var img = new Image();
    img.onload = function () { box.innerHTML = ""; img.alt = box.getAttribute("data-alt") || ""; box.appendChild(img); };
    img.src = box.getAttribute("data-src");
  });

  // --- cookie-згода (аналітика вантажиться лише після "Прийняти")
  var KEY = "dp_cookie_consent";
  function loadAnalytics() {
    if (!C.analyticsId || window.__dpGa) return;
    window.__dpGa = true;
    var s = document.createElement("script");
    s.async = true; s.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(C.analyticsId);
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag("js", new Date()); window.gtag("config", C.analyticsId, { anonymize_ip: true });
  }
  var saved = null; try { saved = localStorage.getItem(KEY); } catch (e) {}
  var bar = $("#cookie");
  if (saved === "all") loadAnalytics();
  else if (!saved && bar) bar.style.display = "block";
  function choose(v) { try { localStorage.setItem(KEY, v); } catch (e) {} if (bar) bar.style.display = "none"; if (v === "all") loadAnalytics(); }
  var ba = $("#cookie-all"), bn = $("#cookie-necessary");
  if (ba) ba.addEventListener("click", function () { choose("all"); });
  if (bn) bn.addEventListener("click", function () { choose("necessary"); });
  $$("[data-cookie-settings]").forEach(function (a) { a.addEventListener("click", function (e) { e.preventDefault(); if (bar) bar.style.display = "block"; }); });

  // --- форма зв'язку
  var form = $("#contact-form");
  if (form) form.addEventListener("submit", function (e) {
    e.preventDefault();
    var msg = $("#form-msg"), btn = form.querySelector("button[type=submit]");
    var en = document.documentElement.lang === "en";
    msg.className = "form-msg";
    var data = { name: form.name.value.trim(), email: form.email.value.trim(), phone: form.phone.value.trim(), message: form.message.value.trim(), website: form.website.value };
    if (!data.name || !data.email || data.message.length < 5) { msg.className = "form-msg err"; msg.textContent = en ? "Please fill in name, email and message." : "Заповніть ім'я, email і повідомлення."; return; }
    btn.disabled = true;
    fetch("/api/contact", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })
      .then(function (r) { if (!r.ok) throw new Error(r.status); form.reset(); msg.className = "form-msg ok"; msg.textContent = en ? "Thank you! We will reply soon." : "Дякуємо! Ми відповімо найближчим часом."; })
      .catch(function () { msg.className = "form-msg err"; msg.textContent = en ? "Could not send. Please try again later." : "Не вдалося надіслати. Спробуйте пізніше."; })
      .then(function () { btn.disabled = false; });
  });
})();
