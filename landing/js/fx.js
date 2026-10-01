(function () {
  var body = document.body; body.classList.add("fx", "v9");
  var bg = document.createElement("div"); bg.id = "bg"; bg.setAttribute("aria-hidden", "true");
  bg.innerHTML = '<i class="orb o1"></i><i class="orb o2"></i><i class="orb o3"></i>';
  body.insertBefore(bg, body.firstChild);
  var bar = document.createElement("div"); bar.id = "fxbar"; body.appendChild(bar);

  var root = document.documentElement;
  function upd() {
    var sy = window.pageYOffset || 0, max = Math.max(1, root.scrollHeight - window.innerHeight);
    root.style.setProperty("--p", Math.min(1, sy / max).toFixed(4));
    root.style.setProperty("--syn", sy.toFixed(0));
  }
  var tick = false;
  window.addEventListener("scroll", function () { if (!tick) { tick = true; requestAnimationFrame(function () { upd(); tick = false; }); } }, { passive: true });
  window.addEventListener("resize", upd); upd();

  // поява елементів при прокрутці
  var sel = ".card,.step,.plan,.pain,details,.cta-band,.sec-title,.sec-sub,.eyebrow,.phones,.checks li,.contact>*,.show>*,.price-note,.hero-grid>div:first-child>*";
  var els = Array.prototype.slice.call(document.querySelectorAll(sel));
  els.forEach(function (el) {
    el.classList.add("rv");
    var sibs = Array.prototype.filter.call(el.parentNode.children, function (c) { return els.indexOf(c) > -1; });
    el.style.setProperty("--d", Math.min(sibs.indexOf(el), 5) * 90 + "ms");
  });
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }); }, { threshold: .12, rootMargin: "0px 0px -6% 0px" });
    els.forEach(function (el) { io.observe(el); });
  } else els.forEach(function (el) { el.classList.add("in"); });

  // підказка "гортайте вниз" у hero
  var hn = document.querySelector(".hero .hero-note");
  if (hn && !document.querySelector(".scrollcue")) {
    var sc = document.createElement("div"); sc.className = "scrollcue"; sc.innerHTML = "<i></i><span>Гортайте вниз</span>";
    if (document.documentElement.lang === "en") sc.lastChild.textContent = "Scroll down";
    hn.parentNode.appendChild(sc);
  }
})();
