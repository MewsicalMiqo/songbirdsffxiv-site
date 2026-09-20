/* ============================================================
   The Songbirds — shared interactions (runs on every page)
   ------------------------------------------------------------
   - Sticky nav background once you scroll
   - Accessible mobile menu toggle
   - Staggered scroll-reveal (IntersectionObserver) + count-up stats
   - Spotlight sparkle trail
   - Spotlight video autoplay guard
   Exposes window.songbirdsReveal(list) so dynamically generated
   content (the live setlist) can reuse the same reveal logic.
   ============================================================ */
(function () {
  "use strict";

  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var noIO = !("IntersectionObserver" in window);
  var qsa = function (sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  };

  /* ---------- Sticky nav ---------- */
  var nav = document.getElementById("nav");
  var shell = nav && nav.querySelector(".nav-shell");
  var onScroll = function () {
    if (shell) shell.classList.toggle("is-scrolled", window.scrollY > 24);
  };
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  /* ---------- Mobile menu ---------- */
  var burger = document.getElementById("nav-burger");
  var menu = document.getElementById("nav-menu");
  if (nav && burger) {
    burger.addEventListener("click", function () {
      var open = nav.classList.toggle("menu-open");
      burger.setAttribute("aria-expanded", String(open));
    });
  }
  if (menu && nav) {
    qsa("a", menu).forEach(function (a) {
      a.addEventListener("click", function () {
        nav.classList.remove("menu-open");
        if (burger) burger.setAttribute("aria-expanded", "false");
      });
    });
  }
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && nav && nav.classList.contains("menu-open")) {
      nav.classList.remove("menu-open");
      if (burger) { burger.setAttribute("aria-expanded", "false"); burger.focus(); }
    }
  });

  /* ---------- Count-up ---------- */
  function finalizeCount(el) {
    var t = parseFloat(el.getAttribute("data-count"));
    if (!isNaN(t)) el.textContent = Math.round(t) + (el.getAttribute("data-suffix") || "");
  }
  function countUp(el) {
    var target = parseFloat(el.getAttribute("data-count"));
    if (isNaN(target)) return;
    var suffix = el.getAttribute("data-suffix") || "";
    var dur = 1500, start = null;
    function tick(ts) {
      if (start === null) start = ts;
      var p = Math.min((ts - start) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * eased) + suffix;
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  /* ---------- Reveal (shared helper) ---------- */
  function revealEls(list) {
    if (reduce || noIO) {
      list.forEach(function (el) {
        el.classList.add("in");
        if (el.hasAttribute("data-count")) finalizeCount(el);
      });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        el.classList.add("in");
        if (el.hasAttribute("data-count")) countUp(el);
        io.unobserve(el);
      });
    }, { threshold: 0.14, rootMargin: "0px 0px -6% 0px" });
    list.forEach(function (el) { io.observe(el); });
  }
  window.songbirdsReveal = revealEls;

  revealEls(qsa(".reveal"));

  /* ---------- Spotlight sparkle trail ---------- */
  var spotlight = document.querySelector(".spotlight-visual");
  var field = spotlight && spotlight.querySelector(".sparkle-field");
  if (field && spotlight && !reduce) {
    var last = 0;
    function spawn(x, y) {
      if (field.childElementCount > 48) return;
      var s = document.createElement("span");
      s.className = "p";
      var size = 5 + Math.random() * 5;
      var ang = Math.random() * Math.PI * 2;
      var dist = 12 + Math.random() * 46;
      s.style.setProperty("--px", x + "px");
      s.style.setProperty("--py", y + "px");
      s.style.setProperty("--size", size + "px");
      s.style.setProperty("--dx", Math.cos(ang) * dist + "px");
      s.style.setProperty("--dy", (Math.sin(ang) * dist - 26) + "px");
      s.style.setProperty("--dur", (0.5 + Math.random() * 0.55) + "s");
      s.addEventListener("animationend", function () { s.remove(); });
      field.appendChild(s);
    }
    spotlight.addEventListener("mousemove", function (e) {
      var now = (window.performance && performance.now()) || Date.now();
      if (now - last < 28) return;
      last = now;
      var r = field.getBoundingClientRect();
      spawn(e.clientX - r.left, e.clientY - r.top);
    }, { passive: true });
  }

  /* ---------- Spotlight video autoplay guard ---------- */
  var video = document.querySelector(".spotlight-visual video");
  if (video) {
    video.muted = true;
    function play() {
      var p = video.play();
      if (p && p.catch) p.catch(function () {});
    }
    play();
    video.addEventListener("loadeddata", play);
    video.addEventListener("canplay", play);
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) play();
    });
  }

  /* ---------- Back to top (all pages) ---------- */
  var toTop = document.createElement("button");
  toTop.type = "button";
  toTop.className = "to-top";
  toTop.setAttribute("aria-label", "Back to top");
  toTop.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
  document.body.appendChild(toTop);
  var onScrollTop = function () {
    toTop.classList.toggle("is-visible", window.scrollY > 480);
  };
  onScrollTop();
  window.addEventListener("scroll", onScrollTop, { passive: true });
  toTop.addEventListener("click", function () {
    window.scrollTo(0, 0); // smooth via CSS scroll-behavior; instant under reduced motion
  });

  /* ---------- Background FX canvas (stage laser lights in haze) ---------- */
  if (!reduce) {
    var fx = document.createElement("canvas");
    fx.className = "fx-canvas";
    fx.setAttribute("aria-hidden", "true");
    document.body.appendChild(fx);
    var fctx = fx.getContext("2d");
    var FW = 0, FH = 0, TAU = Math.PI * 2;
    function fxResize() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      FW = window.innerWidth;
      FH = window.innerHeight;
      fx.width = Math.round(FW * dpr);
      fx.height = Math.round(FH * dpr);
      fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    fxResize();
    window.addEventListener("resize", fxResize);

    // Sweeping beams from stage sources (x/y in viewport fractions)
    var BEAMS = [
      { x: 0.10, y: 1.05, base: -1.5708, amp: 0.55, speed: 0.21, phase: 0.0, rgb: "79, 124, 255", w: 2.2, spread: 0.030 },
      { x: 0.10, y: 1.05, base: -1.5708, amp: 0.40, speed: 0.16, phase: 2.1, rgb: "56, 214, 255", w: 1.4, spread: 0.020 },
      { x: 0.50, y: 1.07, base: -1.5708, amp: 0.70, speed: 0.13, phase: 4.2, rgb: "122, 86, 255", w: 2.6, spread: 0.034 },
      { x: 0.50, y: 1.07, base: -1.5708, amp: 0.50, speed: 0.19, phase: 1.2, rgb: "170, 205, 255", w: 1.2, spread: 0.018 },
      { x: 0.90, y: 1.05, base: -1.5708, amp: 0.55, speed: 0.17, phase: 3.3, rgb: "79, 124, 255", w: 2.0, spread: 0.028 },
      { x: 0.90, y: 1.05, base: -1.5708, amp: 0.38, speed: 0.24, phase: 5.1, rgb: "56, 214, 255", w: 1.4, spread: 0.020 },
      { x: -0.02, y: 0.08, base: 1.5708, amp: 0.30, speed: 0.11, phase: 0.8, rgb: "122, 86, 255", w: 1.5, spread: 0.024 },
      { x: 1.02, y: 0.08, base: 1.5708, amp: 0.30, speed: 0.15, phase: 2.9, rgb: "56, 214, 255", w: 1.5, spread: 0.024 }
    ];
    // Drifting haze banks — the fog that scatters the beam light
    var HAZE = [
      { u: 0.18, v: 0.62, ru: 0.06, rv: 0.05, su: 0.05, sv: 0.04, ph: 0.0, r: 0.20, base: 0.034 },
      { u: 0.42, v: 0.35, ru: 0.08, rv: 0.06, su: 0.04, sv: 0.05, ph: 1.7, r: 0.24, base: 0.028 },
      { u: 0.62, v: 0.72, ru: 0.07, rv: 0.05, su: 0.06, sv: 0.04, ph: 3.4, r: 0.18, base: 0.038 },
      { u: 0.80, v: 0.42, ru: 0.06, rv: 0.07, su: 0.05, sv: 0.06, ph: 5.0, r: 0.22, base: 0.028 },
      { u: 0.33, v: 0.85, ru: 0.09, rv: 0.04, su: 0.03, sv: 0.05, ph: 2.6, r: 0.26, base: 0.034 },
      { u: 0.70, v: 0.15, ru: 0.08, rv: 0.05, su: 0.04, sv: 0.03, ph: 4.4, r: 0.18, base: 0.024 },
      { u: 0.05, v: 0.30, ru: 0.05, rv: 0.08, su: 0.05, sv: 0.04, ph: 0.9, r: 0.16, base: 0.030 }
    ];
    // Faint drifting dust for depth
    var MOTES = [];
    for (var mi = 0; mi < 40; mi++) {
      MOTES.push({ x: Math.random(), y: Math.random(), r: 0.6 + Math.random() * 1.3, sp: 0.006 + Math.random() * 0.02, p: Math.random() * TAU });
    }

    function beamAngle(t, b) {
      return b.base + b.amp * Math.sin(t * b.speed + b.phase);
    }

    function drawBeam(t, b) {
      var ox = b.x * FW, oy = b.y * FH;
      var ang = beamAngle(t, b);
      var dx = Math.cos(ang), dy = Math.sin(ang);
      var len = Math.sqrt(FW * FW + FH * FH) * 1.05;
      var ex = ox + dx * len, ey = oy + dy * len;
      var flicker = 0.72 + 0.28 * Math.sin(t * 1.7 + b.phase * 3.1);
      var px = -dy, py = dx;
      var halfW = Math.tan(b.spread) * len;
      // Volumetric cone — stacked nested cones for soft, hazy edges
      var layers = [
        { w: 1.00, a: 0.040 },
        { w: 0.80, a: 0.045 },
        { w: 0.63, a: 0.050 },
        { w: 0.48, a: 0.055 },
        { w: 0.34, a: 0.055 },
        { w: 0.22, a: 0.055 }
      ];
      for (var li = 0; li < layers.length; li++) {
        var lw = halfW * layers[li].w;
        var la = layers[li].a * flicker;
        var cg = fctx.createLinearGradient(ox, oy, ex, ey);
        cg.addColorStop(0, "rgba(" + b.rgb + "," + la.toFixed(3) + ")");
        cg.addColorStop(0.45, "rgba(" + b.rgb + "," + (la * 0.32).toFixed(3) + ")");
        cg.addColorStop(1, "rgba(" + b.rgb + ",0)");
        fctx.fillStyle = cg;
        fctx.beginPath();
        fctx.moveTo(ox, oy);
        fctx.lineTo(ex + px * lw, ey + py * lw);
        fctx.lineTo(ex - px * lw, ey - py * lw);
        fctx.closePath();
        fctx.fill();
      }
      // Bright laser core
      var lg = fctx.createLinearGradient(ox, oy, ex, ey);
      lg.addColorStop(0, "rgba(" + b.rgb + "," + (0.72 * flicker).toFixed(3) + ")");
      lg.addColorStop(0.7, "rgba(" + b.rgb + "," + (0.20 * flicker).toFixed(3) + ")");
      lg.addColorStop(1, "rgba(" + b.rgb + ",0)");
      fctx.strokeStyle = lg;
      fctx.lineCap = "round";
      fctx.lineWidth = b.w;
      fctx.beginPath(); fctx.moveTo(ox, oy); fctx.lineTo(ex, ey); fctx.stroke();
      // Fixture glow at the source
      var sr = 14 + b.w * 5;
      var sg = fctx.createRadialGradient(ox, oy, 0, ox, oy, sr);
      sg.addColorStop(0, "rgba(235,242,255," + (0.5 * flicker).toFixed(3) + ")");
      sg.addColorStop(1, "rgba(" + b.rgb + ",0)");
      fctx.fillStyle = sg;
      fctx.beginPath(); fctx.arc(ox, oy, sr, 0, TAU); fctx.fill();
    }

    function hazePos(t, h) {
      return {
        x: (h.u + h.ru * Math.sin(t * h.su + h.ph)) * FW,
        y: (h.v + h.rv * Math.cos(t * h.sv + h.ph)) * FH
      };
    }

    // Faint drifting fog banks (the haze medium itself)
    function drawHazeBase(t) {
      for (var i = 0; i < HAZE.length; i++) {
        var h = HAZE[i];
        var p = hazePos(t, h);
        var r = h.r * Math.min(FW, FH);
        var a = h.base * (0.7 + 0.3 * Math.sin(t * 0.25 + h.ph * 2));
        var g = fctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        g.addColorStop(0, "rgba(168, 196, 255," + a.toFixed(3) + ")");
        g.addColorStop(0.6, "rgba(150, 180, 255," + (a * 0.55).toFixed(3) + ")");
        g.addColorStop(1, "rgba(150, 180, 255,0)");
        fctx.fillStyle = g;
        fctx.beginPath(); fctx.arc(p.x, p.y, r, 0, TAU); fctx.fill();
      }
    }

    // Where a beam crosses a haze bank, the fog lights up in the beam's colour
    function drawScatter(t) {
      for (var hi = 0; hi < HAZE.length; hi++) {
        var h = HAZE[hi];
        var p = hazePos(t, h);
        var hr = h.r * Math.min(FW, FH);
        for (var bi = 0; bi < BEAMS.length; bi++) {
          var b = BEAMS[bi];
          var ox = b.x * FW, oy = b.y * FH;
          var ang = beamAngle(t, b);
          var dx = Math.cos(ang), dy = Math.sin(ang);
          var vx = p.x - ox, vy = p.y - oy;
          var tt = vx * dx + vy * dy; // distance along the beam
          if (tt < 12) continue;
          var cx = ox + dx * tt, cy = oy + dy * tt;
          var qx = vx - dx * tt, qy = vy - dy * tt;
          var d = Math.sqrt(qx * qx + qy * qy); // offset from the beam axis
          var halfW = Math.tan(b.spread) * tt;
          var dEff = Math.max(0, d - halfW);
          var illum = Math.max(0, 1 - dEff / (hr * 0.85));
          if (illum <= 0.03) continue;
          var falloff = Math.exp(-tt / (Math.max(FW, FH) * 1.1));
          var flicker = 0.72 + 0.28 * Math.sin(t * 1.7 + b.phase * 3.1);
          var a = Math.min(0.24, illum * flicker * falloff * 0.45);
          if (a < 0.015) continue;
          fctx.save();
          fctx.translate(cx, cy);
          fctx.rotate(ang);
          var gr = hr * 0.8;
          var g = fctx.createRadialGradient(0, 0, 0, 0, 0, gr);
          g.addColorStop(0, "rgba(" + b.rgb + "," + a.toFixed(3) + ")");
          g.addColorStop(0.5, "rgba(" + b.rgb + "," + (a * 0.45).toFixed(3) + ")");
          g.addColorStop(1, "rgba(" + b.rgb + ",0)");
          fctx.scale(1.9, 0.75);
          fctx.fillStyle = g;
          fctx.beginPath(); fctx.arc(0, 0, gr, 0, TAU); fctx.fill();
          fctx.restore();
        }
      }
    }

    function fxFrame(now) {
      requestAnimationFrame(fxFrame);
      if (document.hidden) return;
      var t = now / 1000;
      fctx.clearRect(0, 0, FW, FH);
      fctx.globalCompositeOperation = "lighter";
      for (var i = 0; i < MOTES.length; i++) {
        var m = MOTES[i];
        var my = ((((m.y - t * m.sp) % 1) + 1) % 1) * FH;
        var mx = (m.x + 0.02 * Math.sin(t * 0.3 + m.p)) * FW;
        var ma = 0.14 + 0.2 * (0.5 + 0.5 * Math.sin(t * 0.8 + m.p * 5));
        fctx.fillStyle = "rgba(150,190,255," + ma.toFixed(3) + ")";
        fctx.beginPath(); fctx.arc(mx, my, m.r, 0, TAU); fctx.fill();
      }
      drawHazeBase(t);
      for (var bi = 0; bi < BEAMS.length; bi++) drawBeam(t, BEAMS[bi]);
      drawScatter(t);
      fctx.globalCompositeOperation = "source-over";
    }
    requestAnimationFrame(fxFrame);
  }

  /* ---------- Stage gallery (index) — cycles /screenshots/web with pan & zoom ---------- */
  var gallery = document.getElementById("stage-gallery");
  if (gallery && !reduce) {
    // Base paths in /screenshots/web — each slide has a .webp + .jpg pair.
    var SLIDES = [
      "screenshots/web/Songbirds",
      "screenshots/web/2022-06-17_13-51-13-831_Sakis_wonderland",
      "screenshots/web/2022-06-22_19-27-06-409_Sakis_wonderland",
      "screenshots/web/2022-10-29_21-00-58-180_Talim_-_Gameplay"
    ];
    var DUR = 7500; // ms each slide stays up (matches the Ken Burns duration)
    var KB = ["kb-a", "kb-b", "kb-c", "kb-d"];

    // First slide lives in the markup (no-JS fallback); add the rest lazily.
    var slides = [];
    var first = gallery.querySelector("picture");
    if (first) slides.push(first);
    function addSlide(base, alt) {
      var pic = document.createElement("picture");
      var src = document.createElement("source");
      src.type = "image/webp";
      src.srcset = base + ".webp";
      var im = document.createElement("img");
      im.src = base + ".jpg";
      im.alt = alt;
      im.loading = "lazy";
      im.decoding = "async";
      pic.appendChild(src);
      pic.appendChild(im);
      var capEl = gallery.querySelector(".cap");
      if (capEl) gallery.insertBefore(pic, capEl); else gallery.appendChild(pic);
      return pic;
    }
    for (var gi = slides.length; gi < SLIDES.length; gi++) {
      slides.push(addSlide(SLIDES[gi], "The Songbirds performing in-game"));
    }

    var idx = -1, kb = 0, elapsed = 0, paused = false, inView = !noIO;
    function activate(n) {
      if (n === idx || !slides[n]) return;
      if (idx >= 0) {
        var prev = slides[idx];
        prev.classList.remove("is-active");
        prev.classList.remove("kb-a", "kb-b", "kb-c", "kb-d");
      }
      var next = slides[n];
      next.classList.remove("kb-a", "kb-b", "kb-c", "kb-d");
      next.classList.add("is-active");
      void next.offsetWidth; // restart the pan/zoom animation
      next.classList.add(KB[kb % KB.length]);
      kb++;
      idx = n;
      elapsed = 0;
    }
    if (!noIO) {
      var gio = new IntersectionObserver(function (es) {
        es.forEach(function (e) { inView = e.isIntersecting; });
      }, { threshold: 0.25 });
      gio.observe(gallery);
    }
    gallery.addEventListener("mouseenter", function () { paused = true; });
    gallery.addEventListener("mouseleave", function () { paused = false; });
    activate(0);
    setInterval(function () {
      if (paused || !inView || document.hidden) return;
      elapsed += 1000;
      if (elapsed >= DUR) activate((idx + 1) % slides.length);
    }, 1000);
  }
})();