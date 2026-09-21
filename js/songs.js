/* ============================================================
   The Songbirds — live setlist loader (songs.html only)
   ------------------------------------------------------------
   Loads the setlist from the public songs list (Google Sheet CSV)
   and renders it. Falls back to the bundled offline copy in
   js/setlist.js (window.__SETLIST_CSV) if the network is
   unreachable. Reuses window.songbirdsReveal for the staggered
   reveal of generated rows.
   ============================================================ */
(function () {
  "use strict";

  var SHEET_ID = "11OQlZcT47EdxhrQsVoqSgxDSZO_5woaWy9YhXHYplIQ";
  var SOURCES = [
    "https://docs.google.com/spreadsheets/d/" + SHEET_ID + "/export?format=csv",
    "https://docs.google.com/spreadsheets/d/" + SHEET_ID + "/gviz/tq?tqx=out:csv"
  ];
  var SHEET_URL = "https://docs.google.com/spreadsheets/d/" + SHEET_ID + "/edit";

  function q(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function slug(name) {
    return "s-" + name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  }
  function setStatus(msg) { var el = q("song-status"); if (el) el.textContent = msg; }

  /* ---------- CSV parsing ---------- */
  function splitCsvLine(line) {
    var out = [], field = "", inQ = false;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      if (inQ) {
        if (ch === '"') { if (line[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
        else field += ch;
      } else if (ch === '"') inQ = true;
      else if (ch === ",") { out.push(field); field = ""; }
      else field += ch;
    }
    out.push(field);
    return out;
  }
  function isDuration(v) { return /^\d+:\d{1,2}(:\d{2})?$/.test(v); }
  function fmtDur(dur) {
    // The sheet stores durations as h:mm:ss (e.g. "0:01:01"); display as mm:ss ("1:01").
    // Anything unrecognized passes through untouched.
    var parts = String(dur).trim().split(":");
    var m, s;
    if (parts.length === 3) { m = +parts[0] * 60 + +parts[1]; s = +parts[2]; }
    else if (parts.length === 2) { m = +parts[0]; s = +parts[1]; }
    else return String(dur);
    if (!isFinite(m) || !isFinite(s) || m < 0 || s < 0 || s > 59) return String(dur);
    return m + ":" + pad(s);
  }

  function parseCsv(csv) {
    var sections = [], current = null;
    var lines = csv.split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
      var raw = lines[i].replace(/\s+$/, "");
      if (!raw.trim()) continue;
      var parts = splitCsvLine(raw);
      // A duration, when present, lives in the final column.
      var dur = "";
      if (parts.length > 1 && isDuration(parts[parts.length - 1])) dur = parts.pop();
      // Drop any empty trailing cells ("Section Name," -> "Section Name").
      while (parts.length > 1 && parts[parts.length - 1].trim() === "") parts.pop();
      var name = parts.join(",").trim();
      if (!name) continue; // blank separator row
      if (!dur) {          // a row with no duration is a section label
        current = { name: name, songs: [] };
        sections.push(current);
        continue;
      }
      var title = name, meta = "";
      var m = name.match(/^(.*?)\s*\[([^\]]+)\]\s*$/);
      if (m) { title = m[1].trim(); meta = m[2].trim(); }
      if (!current) { current = { name: "Setlist", songs: [] }; sections.push(current); }
      current.songs.push({ title: title, meta: meta, dur: dur });
    }
    return sections.filter(function (s) { return s.songs.length > 0; });
  }

  /* ---------- Fetch with timeout, in source order ---------- */
  function withTimeout(url, ms) {
    var ctrl = ("AbortController" in window) ? new AbortController() : null;
    var id = ctrl && setTimeout(function () { ctrl.abort(); }, ms || 8000);
    var opts = ctrl ? { signal: ctrl.signal } : undefined;
    return fetch(url, opts).then(function (res) {
      clearTimeout(id);
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.text();
    }, function (err) { clearTimeout(id); throw err; });
  }
  function fetchSources() {
    var chain = Promise.resolve(null);
    SOURCES.forEach(function (url) {
      chain = chain.then(function (existing) {
        if (existing) return existing;
        return withTimeout(url, 8000).catch(function () { return null; });
      });
    });
    return chain.then(function (csv) {
      if (csv && csv.trim()) return csv;
      throw new Error("no source");
    });
  }
  /* ---------- Section navigator (TOC + scrollspy) ---------- */
  var tocObserver = null;
  var tocScrollHandler = null;
  var tocArrowState = null;
  var tocStuckObserver = null;

  // Panel background is only shown while the bar is docked to the top
  // of the page. A 1px sentinel just above the bar reports when we have
  // scrolled past its natural position; rootMargin matches the 64px
  // sticky offset so the flip lands exactly when the bar docks.
  function setupTocStuck() {
    if (tocStuckObserver) return;
    var nav = q("setlist-nav");
    var sentinel = q("toc-sentinel");
    if (!nav || !sentinel || typeof IntersectionObserver !== "function") return;
    try {
      tocStuckObserver = new IntersectionObserver(function (entries) {
        var e = entries[0];
        if (e && typeof nav.classList !== "undefined" && typeof nav.classList.toggle === "function") {
          nav.classList.toggle("toc-stuck", !e.isIntersecting);
        }
      }, { threshold: 0, rootMargin: "-64px 0px 0px 0px" });
      tocStuckObserver.observe(sentinel);
    } catch (err) { tocStuckObserver = null; }
  }

  function buildToc(sections) {
    var nav = q("setlist-nav");
    var scrollEl = q("toc-scroll");
    if (!nav || !scrollEl) return; // absent in the minimal tool-sandbox DOM
    setupTocStuck();

    var html = "";
    sections.forEach(function (s) {
      html += '<a class="toc-chip" href="#' + esc(slug(s.name)) + '">';
      html += '<span class="toc-name">' + esc(s.name) + "</span>";
      html += "</a>";
    });
    scrollEl.innerHTML = html;
    if (typeof nav.removeAttribute === "function") nav.removeAttribute("hidden");

    var chips = (typeof scrollEl.querySelectorAll === "function")
      ? scrollEl.querySelectorAll(".toc-chip") : [];

    function activate(i, doScroll) {
      if (i < 0 || i >= chips.length) return;
      for (var k = 0; k < chips.length; k++) {
        var chip = chips[k];
        if (k === i) {
          if (!chip.classList.contains("active")) chip.classList.add("active");
          if (typeof chip.setAttribute === "function") chip.setAttribute("aria-current", "true");
        } else {
          if (chip.classList.contains("active")) chip.classList.remove("active");
          if (typeof chip.removeAttribute === "function") chip.removeAttribute("aria-current");
        }
      }
      var active = chips[i];
      if (doScroll && active && scrollEl) {
        var reduce = false;
        try {
          reduce = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
        } catch (err) { reduce = false; }
        try {
          // Center the chip inside the chip row only. Element.scrollIntoView
          // would also ask the document to scroll, and on mobile that pans
          // the whole page sideways and breaks the layout, so compute the
          // target offset against the scroller ourselves.
          var chipRect = active.getBoundingClientRect();
          var rowRect = scrollEl.getBoundingClientRect();
          var target = scrollEl.scrollLeft + (chipRect.left - rowRect.left) - (scrollEl.clientWidth - active.offsetWidth) / 2;
          target = Math.max(0, target);
          if (typeof scrollEl.scrollTo === "function") {
            scrollEl.scrollTo({ left: target, behavior: reduce ? "auto" : "smooth" });
          } else {
            scrollEl.scrollLeft = target;
          }
        } catch (err) {}
      }
    }

    if (tocObserver) {
      try { tocObserver.disconnect(); } catch (err) {}
      tocObserver = null;
    }
    if (tocScrollHandler && typeof window.removeEventListener === "function") {
      try { window.removeEventListener("scroll", tocScrollHandler); } catch (err) {}
      tocScrollHandler = null;
    }

    var sectionEls = (typeof document.querySelectorAll === "function")
      ? document.querySelectorAll("#setlist section") : [];

    // Scrollspy: the reading band sits just above the viewport middle, so the
    // chip for the section in focus stays highlighted while scrolling.
    if (sectionEls.length && typeof IntersectionObserver !== "undefined") {
      var byId = {};
      for (var i = 0; i < sectionEls.length; i++) byId[sectionEls[i].id] = i;
      tocObserver = new IntersectionObserver(function (entries) {
        for (var e = 0; e < entries.length; e++) {
          if (entries[e].isIntersecting && byId.hasOwnProperty(entries[e].target.id)) {
            activate(byId[entries[e].target.id], true);
            return;
          }
        }
      }, { rootMargin: "-35% 0px -55% 0px", threshold: 0 });
      for (var j = 0; j < sectionEls.length; j++) tocObserver.observe(sectionEls[j]);
    }

    // Bottom-of-page fallback: the last section can be too short to ever
    // enter the reading band, so light it up once we reach the end.
    tocScrollHandler = function () {
      var doc = document.documentElement;
      var bottom = doc ? doc.scrollHeight : 0;
      if (bottom && (window.scrollY + window.innerHeight) >= bottom - 8) {
        activate(chips.length - 1, true);
      }
    };
    if (typeof window.addEventListener === "function") {
      window.addEventListener("scroll", tocScrollHandler, { passive: true });
    }

    // Swipe arrows — shown only when the row actually overflows (narrow
    // screens), so it's obvious the chip list can be scrolled sideways.
    var prev = q("toc-prev");
    var next = q("toc-next");
    if (prev && next) {
      if (tocArrowState) {
        try {
          if (typeof scrollEl.removeEventListener === "function") scrollEl.removeEventListener("scroll", tocArrowState.update);
          if (typeof window.removeEventListener === "function") window.removeEventListener("resize", tocArrowState.update);
        } catch (err) {}
        tocArrowState = null;
      }
      // Position indicator: a thumb with a soft gold fade on both sides
      // rides the bottom rail in step with the chip row, so the user can
      // see where they are between the front and end of the sections.
      var fade = q("toc-fade");
      var arrowUpdate = function () {
        var max = scrollEl.scrollWidth - scrollEl.clientWidth;
        var canScroll = max > 2;
        if (typeof nav.classList !== "undefined" && typeof nav.classList.toggle === "function") {
          nav.classList.toggle("toc-can-scroll", canScroll);
        }
        if (fade && typeof fade.style !== "undefined") {
          var pct = canScroll ? Math.max(0, Math.min(100, (scrollEl.scrollLeft / max) * 100)) : 0;
          fade.style.left = pct + "%";
        }
        if (typeof prev.hidden === "boolean") {
          prev.hidden = !canScroll || scrollEl.scrollLeft <= 2;
          next.hidden = !canScroll || scrollEl.scrollLeft >= max - 2;
        }
      };
      var nudge = function (dir) {
        var reduce = false;
        try { reduce = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); } catch (err) { reduce = false; }
        var step = Math.max(160, Math.floor(scrollEl.clientWidth * 0.7));
        if (typeof scrollEl.scrollBy === "function") scrollEl.scrollBy({ left: dir * step, behavior: reduce ? "auto" : "smooth" });
        else scrollEl.scrollLeft += dir * step;
      };
      if (typeof prev.addEventListener === "function") prev.addEventListener("click", function () { nudge(-1); });
      if (typeof next.addEventListener === "function") next.addEventListener("click", function () { nudge(1); });
      if (typeof scrollEl.addEventListener === "function") scrollEl.addEventListener("scroll", arrowUpdate, { passive: true });
      if (typeof window.addEventListener === "function") window.addEventListener("resize", arrowUpdate);
      arrowUpdate();
      tocArrowState = { update: arrowUpdate };
    }

    // Highlight the section we landed on (deep link), else the first one.
    var first = 0;
    var hash = (window.location && window.location.hash) ? window.location.hash : "";
    if (hash) {
      for (var h = 0; h < sections.length; h++) {
        if (hash === "#" + slug(sections[h].name)) { first = h; break; }
      }
    }
    activate(first);
  }

  /* ---------- Render ---------- */
  function render(sections) {
    var root = q("setlist");
    if (!root) return;
    var total = sections.reduce(function (n, s) { return n + s.songs.length; }, 0);
    var t = q("song-total"); if (t) t.textContent = total;
    var sc = q("section-count"); if (sc) sc.textContent = sections.length;

    var html = "";
    sections.forEach(function (s, si) {
      html += '<section id="' + esc(slug(s.name)) + '" class="py-14 sm:py-16">';
      html += '<div class="mx-auto w-full max-w-4xl px-5 sm:px-8">';
      html += '<span class="eyebrow reveal">' + pad(si + 1) + " \u00b7 " + s.songs.length + " songs</span>";
      html += '<h2 class="reveal mt-4 font-display text-3xl sm:text-4xl" style="--d:.06s">' + esc(s.name) + "</h2>";
      html += '<div class="songlist" role="list">';
      s.songs.forEach(function (song, i) {
        var d = (Math.min(i, 10) * 0.025).toFixed(3);
        html += '<div class="song reveal" role="listitem" style="--d:' + d + 's">';
        html += '<span class="idx">' + pad(i + 1) + "</span>";
        html += '<span class="name">' + esc(song.title) + "</span>";
        html += '<span class="dur">' + (song.dur ? esc(fmtDur(song.dur)) : "") + "</span>";
        html += "</div>";
      });
      html += "</div></div></section>";
    });
    root.innerHTML = html;
    buildToc(sections);
    var list = root.querySelectorAll(".reveal");
    if (window.songbirdsReveal) window.songbirdsReveal(list);
    else for (var k = 0; k < list.length; k++) list[k].classList.add("in");
  }

  function renderError() {
    var root = q("setlist");
    if (!root) return;
    setStatus("We could not load the setlist just now.");
    root.innerHTML =
      '<div class="mx-auto w-full max-w-4xl px-5 sm:px-8 py-16 sm:py-20">' +
      '<div class="note reveal in">' +
      "<b>Could not reach the public songs list.</b> This could be a connection issue. " +
      "Try <a href=\"javascript:void(0)\" id=\"retry-songs\">reloading</a>, or " +
      '<a href="' + SHEET_URL + '" target="_blank" rel="noopener">open the songs list directly</a>.' +
      "</div></div>";
    var retry = document.getElementById("retry-songs");
    if (retry) retry.addEventListener("click", load);
  }

  function load() {
    setStatus("Loading our public songs list\u2026");
    fetchSources().then(function (csv) {
      var sections = parseCsv(csv);
      if (!sections.length) throw new Error("empty");
      render(sections);
      var n = sections.reduce(function (a, s) { return a + s.songs.length; }, 0);
      setStatus("Loaded " + n + " entries from our public songs list.");
    }).catch(function () {
      if (window.__SETLIST_CSV) {
        var sections = parseCsv(window.__SETLIST_CSV);
        if (sections.length) {
          render(sections);
          setStatus("We couldn't reach the live list just now, so here is our last saved copy of the setlist.");
          return;
        }
      }
      renderError();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", load);
  } else {
    load();
  }
})();