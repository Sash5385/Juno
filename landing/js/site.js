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
    img.onload = function () { box.innerHTML = ""; img.alt = box.getAttribute("data-alt") || ""; box.appendChild(img); if (window.dpMarkZoom) window.dpMarkZoom(img); };
    img.src = box.getAttribute("data-src");
  });

  // --- збільшення скриншота по кліку: плавно «виїжджає» зі свого місця на весь екран
  (function () {
    var en = document.documentElement.lang === "en";
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var opened = false;
    function bigSrc(s) { return s.replace(/\.webp(\?.*)?$/, "-lg.webp"); }
    function fit(nw, nh) {
      var s = Math.min(innerWidth * 0.94 / nw, innerHeight * 0.92 / nh);
      return { w: nw * s, h: nh * s, l: (innerWidth - nw * s) / 2, t: (innerHeight - nh * s) / 2 };
    }
    function place(im, f) {
      im.style.left = f.l + "px"; im.style.top = f.t + "px"; im.style.width = f.w + "px"; im.style.height = f.h + "px";
    }
    function from(r, f) { return "translate(" + (r.left - f.l) + "px," + (r.top - f.t) + "px) scale(" + (r.width / f.w) + ")"; }
    function zoom(src) {
      if (opened) return;
      var r = src.getBoundingClientRect();
      if (!r.width || !r.height) return;
      opened = true;
      var nw = src.naturalWidth || r.width, nh = src.naturalHeight || r.height;
      var ov = document.createElement("div");
      ov.className = "zoom"; ov.setAttribute("role", "dialog"); ov.setAttribute("aria-modal", "true"); ov.setAttribute("aria-label", src.alt || "");
      var im = document.createElement("img");
      im.src = src.currentSrc || src.src; im.alt = src.alt || "";
      var x = document.createElement("button");
      x.type = "button"; x.className = "zoom-x"; x.setAttribute("aria-label", en ? "Close" : "Закрити"); x.textContent = "\u00d7";
      ov.appendChild(im); ov.appendChild(x); document.body.appendChild(ov);
      var f = fit(nw, nh);
      place(im, f);
      im.style.transition = "none"; im.style.transform = from(r, f);
      src.style.visibility = "hidden";
      document.documentElement.style.overflow = "hidden";
      void im.offsetWidth; // зафіксувати стартовий стан, щоб запустилась анімація
      im.style.transition = ""; ov.classList.add("on"); im.style.transform = "none";
      x.focus({ preventScroll: true });
      // повна якість: підміняємо ескіз на більший файл, коли він завантажиться
      var big = new Image();
      big.onload = function () { if (opened && ov.parentNode) im.src = big.src; };
      big.src = bigSrc(im.src);
      var closing = false;
      function onResize() { if (!closing) { f = fit(nw, nh); place(im, f); } }
      function close() {
        if (closing) return;
        closing = true;
        document.removeEventListener("keydown", onKey, true);
        window.removeEventListener("resize", onResize);
        var r2 = src.getBoundingClientRect();
        var visible = r2.bottom > 0 && r2.top < innerHeight && r2.right > 0 && r2.left < innerWidth;
        ov.classList.remove("on");
        if (visible) im.style.transform = from(r2, f); else im.style.opacity = "0";
        setTimeout(function () {
          if (ov.parentNode) ov.parentNode.removeChild(ov);
          src.style.visibility = "";
          document.documentElement.style.overflow = "";
          opened = false;
          try { src.focus({ preventScroll: true }); } catch (e) {}
        }, reduce ? 0 : 440);
      }
      function onKey(e) {
        if (e.key === "Escape" || e.key === "Esc") { e.preventDefault(); close(); }
        else if (e.key === "Tab") { e.preventDefault(); x.focus(); }
      }
      document.addEventListener("keydown", onKey, true);
      window.addEventListener("resize", onResize);
      ov.addEventListener("click", close);
    }
    document.addEventListener("click", function (e) {
      var t = e.target && e.target.closest ? e.target.closest(".phone img") : null;
      if (t) zoom(t);
    });
    document.addEventListener("keydown", function (e) {
      if ((e.key === "Enter" || e.key === " ") && e.target && e.target.matches && e.target.matches(".phone img")) { e.preventDefault(); zoom(e.target); }
    });
    // зображення доступні з клавіатури й для читачів з екрана
    function mark(img) { img.tabIndex = 0; img.setAttribute("role", "button"); img.title = en ? "Click to enlarge" : "Натисніть, щоб збільшити"; }
    $$(".gallery img").forEach(mark);
    window.dpMarkZoom = mark;
  })();

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
