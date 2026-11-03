// Розклад з поясненнями: наведення (на дотик — тап) на пункт списку наближає екран до потрібного елемента,
// обводить його кільцем і малює стрілку від пункту. Ціль задана у відсотках скриншота:
// data-x / data-y — центр елемента, data-w / data-h — його розмір. Екран ще й зсувається, щоб ціль була повністю видима.
(function () {
  var guide = document.querySelector("#guide .guide");
  if (!guide) return;
  var shot = guide.querySelector(".gshot");
  var path = guide.querySelector(".gpath");
  var items = [].slice.call(guide.querySelectorAll(".glist li"));
  var desktop = window.matchMedia("(min-width:861px)");
  var cur = null, lastType = "mouse", raf = 0, geo = null;

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // Геометрія: масштаб, зсув картинки, положення й розмір кільця (у пікселях рамки)
  function calc(li) {
    var W = shot.clientWidth, H = shot.clientHeight;
    var px = parseFloat(li.dataset.x) / 100 * W, py = parseFloat(li.dataset.y) / 100 * H;
    var tw = parseFloat(li.dataset.w) / 100 * W, th = parseFloat(li.dataset.h) / 100 * H;
    var zs = clamp(Math.min(0.5 * W / tw, 0.22 * H / th), 1.5, 3.2);
    var rw = Math.min(tw * zs + 14, W - 8), rh = Math.min(th * zs + 14, H - 8);
    // бажане положення цілі після збільшення: усередині рамки з відступом
    var nx = clamp(px, rw / 2 + 6, W - rw / 2 - 6), ny = clamp(py, rh / 2 + 6, H - rh / 2 - 6);
    // зсув не може оголити краї картинки: -(zs-1)*(W-px) <= dx <= (zs-1)*px
    var dx = clamp(nx - px, -(zs - 1) * (W - px), (zs - 1) * px);
    var dy = clamp(ny - py, -(zs - 1) * (H - py), (zs - 1) * py);
    return { W: W, H: H, px: px, py: py, zs: zs, dx: dx, dy: dy, rw: rw, rh: rh, cx: px + dx, cy: py + dy };
  }

  function draw() {
    if (!cur || !geo) return;
    var g = guide.getBoundingClientRect(), s = shot.getBoundingClientRect(), l = cur.getBoundingClientRect();
    var ex = s.left - g.left + geo.cx, ey = s.top - g.top + geo.cy;
    var sx, sy, c1x, c1y, c2x, c2y, tx, ty;
    if (desktop.matches) { sx = l.left - g.left - 4; sy = l.top - g.top + l.height / 2; }
    else { sx = l.left - g.left - 2; sy = l.top - g.top + l.height / 2; }
    var R = Math.max(geo.rw, geo.rh) / 2 + 8; // стрілка закінчується біля кільця, а не на ньому
    if (desktop.matches) {
      var dx = sx - ex, dy = sy - ey, d = Math.hypot(dx, dy) || 1;
      tx = ex + dx / d * R; ty = ey + dy / d * R;
      c1x = sx - Math.max(60, Math.abs(dx) * 0.35); c1y = sy;
      c2x = tx + Math.max(50, Math.abs(dx) * 0.3);  c2y = ty;
    } else {
      // телефон: стрілка йде лівим полем сторінки (не перекриває текст інших пунктів) і заходить до екрана зліва
      var gx = -12;
      tx = ex - geo.rw / 2 - 8; ty = ey;
      c1x = gx; c1y = sy;
      c2x = gx; c2y = ey;
    }
    path.setAttribute("d", "M" + sx + " " + sy + " C" + c1x + " " + c1y + ", " + c2x + " " + c2y + ", " + tx + " " + ty);
  }

  function set(li) {
    cur = li; geo = calc(li);
    items.forEach(function (x) { x.classList.toggle("on", x === li); });
    var st = guide.style;
    st.setProperty("--ox", li.dataset.x + "%"); st.setProperty("--oy", li.dataset.y + "%");
    st.setProperty("--zs", geo.zs.toFixed(3));
    st.setProperty("--tx", geo.dx.toFixed(1) + "px"); st.setProperty("--ty", geo.dy.toFixed(1) + "px");
    st.setProperty("--rx", geo.cx.toFixed(1) + "px"); st.setProperty("--ry", geo.cy.toFixed(1) + "px");
    st.setProperty("--rw", geo.rw.toFixed(1) + "px"); st.setProperty("--rh", geo.rh.toFixed(1) + "px");
    st.setProperty("--rr", Math.min(16, Math.min(geo.rw, geo.rh) / 2).toFixed(1) + "px");
    guide.classList.add("zoomed");
    draw();
  }
  function clear() {
    cur = null; geo = null;
    items.forEach(function (x) { x.classList.remove("on"); });
    guide.classList.remove("zoomed");
  }
  function redraw() { if (cur && !raf) raf = requestAnimationFrame(function () { raf = 0; if (cur) { geo = calc(cur); draw(); } }); }
  window.addEventListener("scroll", redraw, { passive: true });
  window.addEventListener("resize", redraw);

  items.forEach(function (li) {
    li.addEventListener("pointerdown", function (e) { lastType = e.pointerType || "mouse"; });
    li.addEventListener("pointerenter", function (e) { if (e.pointerType === "mouse") set(li); });
    li.addEventListener("pointerleave", function (e) { if (e.pointerType === "mouse") clear(); });
    li.addEventListener("focus", function () { if (li.matches(":focus-visible")) set(li); }); // лише з клавіатури: на дотик фокус приходить перед click і скасував би тап
    li.addEventListener("blur", clear);
    li.addEventListener("click", function () {
      if (lastType === "mouse") { set(li); return; }
      if (cur === li) { clear(); return; } // на дотик: повторний тап вимикає
      set(li);
      var r = shot.getBoundingClientRect();
      if (r.top < 70 || r.bottom > window.innerHeight) shot.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  });
})();
