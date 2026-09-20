/*
 * verify-setlist.js — end-to-end check of the songs.html setlist pipeline.
 *
 * Runs the REAL js/songs.js (parser + renderer) inside a minimal DOM stub,
 * so this verifies exactly what would be painted on screen:
 *
 *   default (offline): the stub fetch always fails, so songs.js takes its
 *                      fallback path and renders the bundled CSV from
 *                      js/setlist.js (window.__SETLIST_CSV). The render must
 *                      match the known-good snapshot below exactly.
 *
 *   --live           : songs.js fetches the public Google Sheet CSV with
 *                      Node's real fetch, then parses + renders it. The sheet
 *                      is a living document, so live counts are compared
 *                      against the bundled fallback (drift is expected; run
 *                      tools/regen-setlist.js to refresh the fallback).
 *
 * Usage:
 *   node tools/verify-setlist.js            # offline fallback check (strict)
 *   node tools/verify-setlist.js --live     # live sheet fetch + render check
 *
 * Exits 0 on success, 1 on any failure.
 * If the sheet legitimately changed: run `node tools/regen-setlist.js` and
 * update EXPECTED below to the new snapshot.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const songsSrc = fs.readFileSync(path.join(ROOT, "js", "songs.js"), "utf8");
const setlistSrc = fs.readFileSync(path.join(ROOT, "js", "setlist.js"), "utf8");

const EXPECTED = { sections: 9, songs: 522 }; // known-good bundled snapshot

function makeEl(id) {
  return {
    id: id,
    textContent: "",
    innerHTML: "",
    classList: { add: function () {}, remove: function () {} },
    querySelectorAll: function () { return []; },
    addEventListener: function () {}
  };
}

function makeSandbox(live, fetchCalls) {
  const els = {
    setlist: makeEl("setlist"),
    "song-status": makeEl("song-status"),
    "song-total": makeEl("song-total"),
    "section-count": makeEl("section-count")
  };
  const realFetch = (typeof fetch === "function") ? fetch.bind(globalThis) : null;
  const fetchImpl = function (url, opts) {
    fetchCalls.push(String(url));
    if (!live) return Promise.reject(new Error("offline stub"));
    if (!realFetch) return Promise.reject(new Error("Node fetch unavailable"));
    // songs.js expects browser-style fetch(): a promise of a Response that it
    // inspects itself (res.ok / res.text()). Hand it Node's real Response.
    return realFetch(url, opts || undefined).catch(function (err) {
      console.log("[fetch error] " + url + " -> " + (err && err.message) +
        (err && err.cause ? " (cause: " + err.cause.message + ")" : ""));
      throw err;
    });
  };
  const documentStub = {
    readyState: "complete",
    addEventListener: function () {},
    getElementById: function (id) { return els[id] || null; },
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
    body: { classList: { add: function () {} } }
  };
  const windowStub = {
    document: documentStub,
    fetch: fetchImpl,
    addEventListener: function () {},
    setTimeout: setTimeout,
    clearTimeout: clearTimeout
  };
  windowStub.window = windowStub; // songs.js references window.*
  // songs.js uses BARE globals (document, fetch, setTimeout, clearTimeout,
  // AbortController, Promise, console), so expose them at the sandbox top
  // level as well: `window.AbortController` only satisfies the `in window`
  // feature check, but `new AbortController()` needs the bare global.
  const sandbox = {
    window: windowStub,
    document: documentStub,
    fetch: fetchImpl,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    Promise: Promise,
    console: console
  };
  if (typeof AbortController !== "undefined") {
    windowStub.AbortController = AbortController;
    sandbox.AbortController = AbortController;
  }
  vm.createContext(sandbox);
  return { els: els, sandbox: sandbox };
}

function report(mode, els, fetchCalls, strict) {
  const html = els["setlist"].innerHTML || "";
  const status = String(els["song-status"].textContent || "");
  const totalEl = String(els["song-total"].textContent || "");
  const sectionEl = String(els["section-count"].textContent || "");

  // Renderer markup (render() in js/songs.js):
  //   <section id="s-..."> with an "NN · N songs" eyebrow, an <h2> title,
  //   and rows of <div class="song reveal" ...>.
  const chunks = html.split(/<section id="s-/).slice(1);
  const secs = chunks.map(function (chunk) {
    const m = chunk.match(/eyebrow reveal">(\d+) \u00b7 (\d+) songs?/);
    const titleM = chunk.match(/<h2[^>]*>([\s\S]*?)<\/h2>/);
    return {
      label: m ? m[1] : "?",
      count: m ? parseInt(m[2], 10) : (chunk.match(/class="song reveal"/g) || []).length,
      title: titleM ? titleM[1].replace(/\s+/g, " ").trim() : "?"
    };
  });
  const rows = (html.match(/class="song reveal"/g) || []).length;
  const total = secs.reduce(function (a, s) { return a + s.count; }, 0);

  console.log("");
  console.log("== " + (mode === "live" ? "LIVE SHEET FETCH" : "BUNDLED FALLBACK (js/setlist.js)") + " ==");
  console.log("status      : " + status);
  console.log("fetch calls : " + (fetchCalls.length ? fetchCalls.join("  |  ") : "(none)"));
  secs.forEach(function (s) {
    console.log("  " + s.label + ". " + s.title + " \u2014 " + s.count + " songs");
  });
  console.log("sections    : " + secs.length);
  console.log("song rows   : " + rows + "  (sum of per-section counts: " + total + ")");
  console.log('song-total  : "' + totalEl + '"   section-count: "' + sectionEl + '"');

  const problems = [];
  if (strict) {
    if (secs.length !== EXPECTED.sections) problems.push("sections " + secs.length + " != " + EXPECTED.sections);
    if (rows !== EXPECTED.songs) problems.push("song rows " + rows + " != " + EXPECTED.songs);
    if (total !== EXPECTED.songs) problems.push("per-section sum " + total + " != " + EXPECTED.songs);
    if (sectionEl !== String(EXPECTED.sections)) problems.push("section-count element is '" + sectionEl + "'");
    if (totalEl !== String(EXPECTED.songs)) problems.push("song-total element is '" + totalEl + "'");
    if (status.indexOf("last saved copy") === -1) problems.push("status does not report the offline fallback (got: " + status + ")");
    if (fetchCalls.length !== 2) problems.push("expected both sheet sources attempted, saw " + fetchCalls.length);
    if (problems.length) {
      console.log("\nFAIL: " + problems.join("; "));
      console.log("expected " + EXPECTED.sections + " sections / " + EXPECTED.songs + " songs from the bundled fallback.");
      return false;
    }
    console.log("\nOK: fallback render matches the known-good setlist (" + EXPECTED.sections + " sections, " + EXPECTED.songs + " songs).");
    return true;
  }

  // --live: require a genuine live load; a silent fallback is a failure.
  if (secs.length === 0 || rows === 0) problems.push("render produced no sections/songs");
  if (status.indexOf("Loaded") === -1) problems.push("status does not report a successful live load (got: " + status + ")");
  if (total !== rows) problems.push("per-section counts (" + total + ") != rendered rows (" + rows + ")");
  if (problems.length) {
    console.log("\nFAIL: " + problems.join("; "));
    console.log("hint: if the network is unavailable, run without --live to check the bundled fallback.");
    return false;
  }
  const drift = (secs.length === EXPECTED.sections && rows === EXPECTED.songs)
    ? " (matches the bundled fallback)"
    : " (differs from bundled fallback " + EXPECTED.sections + "/" + EXPECTED.songs +
      " \u2014 sheet is a living document; run `node tools/regen-setlist.js` and update EXPECTED)";
  console.log("\nOK: live sheet fetched, parsed and rendered." + drift);
  return true;
}

function main() {
  const live = process.argv.indexOf("--live") !== -1;
  if (live && typeof fetch !== "function") {
    console.log("FAIL: --live requires Node >= 18 (global fetch); this is Node " + process.version);
    process.exit(1);
  }
  const fetchCalls = [];
  const ctx = makeSandbox(live, fetchCalls);
  // js/setlist.js assigns window.__SETLIST_CSV (the offline fallback).
  vm.runInContext(setlistSrc, ctx.sandbox, { filename: "setlist.js" });
  if (!ctx.sandbox.window.__SETLIST_CSV) {
    console.log("FAIL: window.__SETLIST_CSV missing from js/setlist.js");
    process.exit(1);
  }
  console.log("Running js/songs.js in sandbox  (" + (live ? "live fetch enabled" : "fetch stubbed to fail -> fallback path") + ")");
  console.log("bundled CSV : " + ctx.sandbox.window.__SETLIST_CSV.length + " chars");
  try {
    vm.runInContext(songsSrc, ctx.sandbox, { filename: "songs.js" });
  } catch (e) {
    console.log("\nFAIL: js/songs.js threw while running in the sandbox: " + (e && e.message));
    process.exit(1);
  }

  // Every terminal path (live render, fallback render, error panel) writes to
  // #setlist, so poll for that instead of guessing a settle time.
  const deadline = Date.now() + (live ? 18000 : 1500);
  const settle = function () {
    const done = ctx.els["setlist"].innerHTML.length > 0 || Date.now() >= deadline;
    if (done) {
      const ok = report(live ? "live" : "fallback", ctx.els, fetchCalls, !live);
      process.exit(ok ? 0 : 1);
    }
    setTimeout(settle, 150);
  };
  setTimeout(settle, 150);
}

main();