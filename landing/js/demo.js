// Умовні записи для лендингу: живий розклад майстра (неонові картки, обід, лінія «зараз»)
// і демо «клієнт записується сам» — обраний час одразу з'являється в розкладі майстра.
(function () {
  // --- поява блоків при прокручуванні
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (es) { es.forEach(function (x) { if (x.isIntersecting) { x.target.classList.add("in"); io.unobserve(x.target); } }); }, { threshold: .12 });
    document.querySelectorAll(".reveal").forEach(function (el) { io.observe(el); });
  } else document.querySelectorAll(".reveal").forEach(function (el) { el.classList.add("in"); });

  var T = window.dpT || function (x) { return x; };
  var H0 = 9, H1 = 18;
  var C = { std: "#4ade80", ind: "#fbbf24", grp: "#2dd4bf", vip: "#a78bfa", new: "#60a5fa" };
  var SVC = {
    std: { name: "Стрижка", dur: 1, price: 600 },
    ind: { name: "Фарбування", dur: 2, price: 1500 },
    grp: { name: "Манікюр", dur: 1.5, price: 750 }
  };
  // [день, година, тривалість, ім'я, послуга, колір, ціна]
  var BASE = [
    [0, 9, 1, "Катерина Л.", "Стрижка", C.std, 600],
    [0, 10, 2, "Богдан С.", "Фарбування", C.ind, 1500],
    [0, 14, 1, "Оксана Б.", "Стрижка", C.std, 600],
    [0, 16, 1.5, "Марія Ш.", "Манікюр", C.grp, 750],
    [1, 9, 1.5, "Дарина О.", "VIP-догляд", C.vip, 1200],
    [1, 11, 1, "Олена К.", "Стрижка", C.std, 600],
    [1, 15, 2, "Ірина М.", "Фарбування", C.ind, 1500],
    [2, 10, 1, "Ярослав К.", "Стрижка", C.std, 600],
    [2, 11, 1.5, "Анастасія М.", "Манікюр", C.grp, 750],
    [2, 15, 1, "Сергій П.", "Стрижка", C.std, 600]
  ];
  var DAYS = [["Чт", 15], ["Пт", 16], ["Сб", 17]];
  var pad = function (n) { return String(n).padStart(2, "0"); };
  var hm = function (h) { return pad(Math.floor(h)) + ":" + (h % 1 ? "30" : "00"); };

  function busy(list, d, h, dur) {
    return list.some(function (e) { return e[0] === d && h < e[1] + e[2] && e[1] < h + dur; }) || (h < 14 && h + dur > 13);
  }

  function render(root, list, opts) {
    var hh = opts.hh || 46;
    root.style.setProperty("--hh", hh + "px");
    var html = '<div></div>';
    DAYS.forEach(function (d, i) { html += '<div class="cal-head' + (i === 0 ? " today" : "") + '">' + T(d[0]) + "<b>" + d[1] + "</b></div>"; });
    html += '<div class="cal-axis" style="height:' + (H1 - H0) * hh + 'px">';
    for (var h = H0; h < H1; h++) html += '<span style="top:' + (h - H0) * hh + 'px">' + pad(h) + "</span>";
    html += "</div>";
    DAYS.forEach(function (_, d) {
      html += '<div class="cal-col" style="height:' + (H1 - H0) * hh + 'px">';
      html += '<div class="lunch" style="top:' + ((13 - H0) * hh + 1) + "px;height:" + (hh - 3) + 'px">' + T("ОБІД") + "</div>";
      list.filter(function (e) { return e[0] === d; }).forEach(function (e) {
        html += '<div class="ev' + (e[7] ? " new" : "") + '" style="--c:' + e[5] + ";top:" + ((e[1] - H0) * hh + 1) + "px;height:" + (e[2] * hh - 3) + 'px">' +
          "<i>" + hm(e[1]) + "</i><b>" + T(e[3]) + "</b><s>" + T(e[4]) + "</s><s>" + e[6] + " ₴</s></div>";
      });
      if (opts.free) {
        for (var t = H0; t < H1; t++) if (!busy(list, d, t, 1)) html += '<div class="free" style="top:' + ((t - H0) * hh + 1) + "px;height:" + (hh - 3) + 'px">' + T("вільно") + "</div>";
      }
      if (d === 0 && opts.now) html += '<div class="now" style="top:' + (opts.now - H0) * hh + 'px"></div>';
      html += "</div>";
    });
    root.innerHTML = html;
    var sum = root.parentNode.querySelector("[data-sum]");
    if (sum) {
      var s = "<div></div>";
      DAYS.forEach(function (_, d) {
        var t = list.filter(function (e) { return e[0] === d; }).reduce(function (a, e) { return a + e[6]; }, 0);
        s += "<div>" + t.toLocaleString("uk-UA") + " ₴</div>";
      });
      sum.innerHTML = s;
    }
  }

  // --- герой: розклад + «новий запис» з'являється сам
  var heroCal = document.querySelector("[data-cal=hero]");
  var heroList = BASE.slice();
  if (heroCal) {
    render(heroCal, heroList, { hh: 44, now: 12.4 });
    var toast = document.querySelector("[data-toast=hero]");
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setTimeout(function () {
      heroList.push([0, 12, 1, "Олена В.", "Стрижка", C.new, 600, true]);
      render(heroCal, heroList, { hh: 44, now: 12.4 });
      if (toast) { toast.classList.add("show"); setTimeout(function () { toast.classList.remove("show"); }, 4200); }
    }, reduce ? 0 : 1600);
  }

  // --- демо: клієнт обирає послугу, день і час
  window.addEventListener("dp-lang", function () {
    if (heroCal) render(heroCal, heroList, { hh: 44, now: 12.4 });
    if (demoCal) { render(demoCal, list, { hh: 40, free: true }); sync(); }
  });
  var demoCal = document.querySelector("[data-cal=demo]");
  var box = document.querySelector("[data-demo]");
  if (!demoCal || !box) return;
  var list = BASE.slice();
  var state = { svc: "std", day: 0 };
  var note = box.querySelector("[data-note]");

  function drawSlots() {
    var s = SVC[state.svc];
    var wrap = box.querySelector("[data-slots]");
    var html = "";
    for (var t = H0; t + s.dur <= H1; t += 1) {
      var taken = busy(list, state.day, t, s.dur);
      html += '<button type="button" data-t="' + t + '"' + (taken ? " disabled aria-label=\"" + hm(t) + " " + T("зайнято") + "\"" : "") + ">" + hm(t) + "</button>";
    }
    wrap.innerHTML = html;
  }
  function sync() {
    box.querySelectorAll("[data-svc]").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-svc") === state.svc); });
    box.querySelectorAll("[data-day]").forEach(function (b) { b.classList.toggle("on", +b.getAttribute("data-day") === state.day); });
    drawSlots();
  }
  box.addEventListener("click", function (e) {
    var b = e.target.closest("button");
    if (!b || b.disabled) return;
    if (b.hasAttribute("data-svc")) { state.svc = b.getAttribute("data-svc"); sync(); return; }
    if (b.hasAttribute("data-day")) { state.day = +b.getAttribute("data-day"); sync(); return; }
    if (b.hasAttribute("data-t")) {
      var s = SVC[state.svc], t = +b.getAttribute("data-t");
      list.forEach(function (x) { x[7] = false; });
      list.push([state.day, t, s.dur, "Ви (демо)", s.name, C.new, s.price, true]);
      render(demoCal, list, { hh: 40, free: true });
      sync();
      note.className = "demo-note ok";
      note.textContent = "✓ " + T("Готово!") + " " + T(DAYS[state.day][0]) + " " + DAYS[state.day][1] + " · " + hm(t) + " — " + T("запис уже в розкладі майстра, нагадування прийде за 24 і 2 години.");
    }
  });
  render(demoCal, list, { hh: 40, free: true });
  sync();

})();
