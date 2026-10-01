(function () {
  var q = new URLSearchParams(location.search), f = q.get("f");
  try { if (f) sessionStorage.setItem("dp_f", f); else f = sessionStorage.getItem("dp_f"); } catch (e) {}
  f = parseInt(f || 1, 10); if (!(f >= 1 && f <= 10)) f = 1;
  document.documentElement.classList.add("f" + f);
  if (q.get("f")) {
    var names = ["Manrope", "Montserrat", "Unbounded+Onest", "Onest", "Inter", "Rubik", "Nunito", "Exo 2+Inter", "Playfair+Inter", "Oswald+Onest"];
    var sw = document.createElement("div");
    sw.style.cssText = "position:fixed;right:10px;bottom:10px;z-index:200;background:rgba(20,21,24,.92);border:1px solid rgba(255,255,255,.18);border-radius:14px;padding:8px;display:flex;gap:5px;flex-wrap:wrap;max-width:270px;justify-content:flex-end";
    names.forEach(function (n, i) {
      var b = document.createElement("button"); b.textContent = i + 1; b.title = n;
      b.style.cssText = "width:32px;height:32px;border-radius:9px;border:1px solid rgba(255,255,255,.2);background:" + (i + 1 === f ? "#ff5a3c" : "transparent") + ";color:#fff;font-weight:800;cursor:pointer";
      b.onclick = function () { var u = new URL(location.href); u.searchParams.set("f", i + 1); location.href = u.toString(); };
      sw.appendChild(b);
    });
    document.body.appendChild(sw);
  }
})();
