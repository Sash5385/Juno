(function () {
  var q = new URLSearchParams(location.search), v = q.get("v");
  try { if (v) sessionStorage.setItem("dp_v", v); else v = sessionStorage.getItem("dp_v"); } catch (e) {}
  v = parseInt(v || window.DP_DEFAULT_V || 1, 10); if (!(v >= 1 && v <= 10)) v = 1;
  var body = document.body; body.classList.add("fx", "v" + v);

  var BG = {
    1: '<i class="blob b1"></i><i class="blob b2"></i><i class="blob b3"></i>',
    2: '<div class="grid"></div>',
    3: '<div class="sun"></div><div class="road"></div><div class="edge"></div><div class="dash"></div>',
    4: '<canvas></canvas>',
    5: '<i class="c c1"></i><i class="c c2"></i><i class="c c3"></i><i class="c c4"></i><i class="c c5"></i>',
    6: '',
    7: '',
    8: '<div class="haze"></div><div class="beam bl"></div><div class="beam br"></div><i class="lamp l"></i><i class="lamp r"></i>',
    9: '<i class="orb o1"></i><i class="orb o2"></i><i class="orb o3"></i>',
    10: '<div class="stars"></div><div class="horizon"></div>'
  };
  var bg = document.createElement("div"); bg.id = "bg"; bg.setAttribute("aria-hidden", "true"); bg.innerHTML = BG[v]; body.insertBefore(bg, body.firstChild);
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
    var sibs = Array.prototype.filter.call(el.parentNode.children, function (c) { return c.classList.contains("rv") || els.indexOf(c) > -1; });
    el.style.setProperty("--d", Math.min(sibs.indexOf(el), 5) * 90 + "ms");
  });
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }); }, { threshold: .12, rootMargin: "0px 0px -6% 0px" });
    els.forEach(function (el) { io.observe(el); });
  } else els.forEach(function (el) { el.classList.add("in"); });

  // частинки для варіанта 4
  if (v === 4) {
    var cv = bg.querySelector("canvas"), cx = cv.getContext("2d"), W, H, P = [];
    function size() { W = cv.width = window.innerWidth; H = cv.height = window.innerHeight; P = []; for (var i = 0; i < Math.min(90, Math.floor(W * H / 14000)); i++) P.push({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - .5) * .3, vy: (Math.random() - .5) * .3 }); }
    size(); window.addEventListener("resize", size);
    (function loop() {
      cx.clearRect(0, 0, W, H);
      var off = (window.pageYOffset || 0) * .15;
      for (var i = 0; i < P.length; i++) {
        var a = P[i]; a.x += a.vx; a.y += a.vy; if (a.x < 0 || a.x > W) a.vx *= -1; if (a.y < 0 || a.y > H) a.vy *= -1;
        var ay = (a.y - off % H + H) % H;
        cx.fillStyle = "rgba(255,170,140,.95)"; cx.beginPath(); cx.arc(a.x, ay, 2.4, 0, 6.3); cx.fill();
        for (var j = i + 1; j < P.length; j++) { var b = P[j], by = (b.y - off % H + H) % H, d = Math.hypot(a.x - b.x, ay - by); if (d < 120) { cx.strokeStyle = "rgba(255,120,90," + (.45 * (1 - d / 120)) + ")"; cx.beginPath(); cx.moveTo(a.x, ay); cx.lineTo(b.x, by); cx.stroke(); } }
      }
      requestAnimationFrame(loop);
    })();
  }

  // підказка "прокрутіть вниз" у hero
  var hn = document.querySelector(".hero .hero-note");
  if (hn && !document.querySelector(".scrollcue")) { var sc = document.createElement("div"); sc.className = "scrollcue"; sc.innerHTML = '<i></i><span>Гортайте вниз</span>'; if (document.documentElement.lang === "en") sc.lastChild.textContent = "Scroll down"; hn.parentNode.appendChild(sc); }

  // перемикач варіантів (лише коли відкрито з ?v=)
  if (q.get("v") || q.has("fx")) {
    var sw = document.createElement("div"); sw.id = "fxsw"; sw.className = "on";
    for (var n = 1; n <= 10; n++) (function (n) { var b = document.createElement("button"); b.textContent = n; if (n === v) b.className = "cur"; b.onclick = function () { var u = new URL(location.href); u.searchParams.set("v", n); location.href = u.toString(); }; sw.appendChild(b); })(n);
    body.appendChild(sw);
  }
})();
