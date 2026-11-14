"use strict";

// RandPulse web app. Plain JavaScript, no build step, no dependencies.
// Feed content comes from third parties, so everything is rendered with textContent
// (never innerHTML) and links are limited to http(s). Information only, not financial advice.

const FEED_URL = "feed.json";
const REFRESH_MS = 5 * 60 * 1000;
const KEY = "rp."; // storage prefix: keeps this app separate from other apps on the same github.io address

const WINDOWS = [["hour", "Hour"], ["day", "Day"], ["week", "Week"], ["year", "Year"]];
const FILTERS = [
  ["all", "All", () => true],
  ["critical", "Breaking", (i) => i.severity === "critical"],
  ["sa", "South Africa", (i) => i.tags.includes("sa")],
  ["rand", "Rand and rates", (i) => has(i, ["rand", "rates", "inflation"])],
  ["stocks", "Stocks", (i) => has(i, ["stocks"])],
  ["commodities", "Gold, platinum and oil", (i) => has(i, ["gold", "platinum", "oil", "mining", "commodities"])],
  ["empower", "Empowerment", (i) => has(i, ["empowerment", "sme", "savings", "jobs", "debt"])],
  ["posts", "Posts", (i) => i.category === "posts"],
];
const MARKET_GROUPS = [
  ["all", "All"], ["watch", "Watchlist"], ["rand", "Rand"], ["commodities", "Commodities"],
  ["indices", "Indices"], ["jse", "JSE shares"], ["crypto", "Crypto"], ["gauges", "Global gauges"],
];
const GROUP_TITLES = { rand: "Rand", commodities: "Gold, platinum, oil and more", indices: "Stock indices", jse: "JSE shares", crypto: "Crypto", gauges: "Global gauges" };
const RANGES = [["1M", 31], ["3M", 92], ["6M", 183], ["1Y", 99999]];
const TICKER = ["ZAR=X", "GOLD-ZAR", "PL=F", "BZ=F", "^J203.JO", "^GSPC"];
const DEFAULT_WATCH = ["ZAR=X", "GC=F", "PL=F"];

const TOPIC_LABELS = {
  rand: "Rand", rates: "Interest rates", inflation: "Inflation", stocks: "Stocks", gold: "Gold", platinum: "Platinum",
  oil: "Oil and fuel", mining: "Mining", banking: "Banking", crypto: "Crypto", trade: "Trade", growth: "Growth",
  jobs: "Jobs", sme: "Small business", empowerment: "Empowerment", savings: "Savings", energy: "Energy", tax: "Tax",
  debt: "Debt", property: "Property", fraud: "Scams", commodities: "Commodities", sa: "South Africa", idea: "Ideas", quote: "Prices",
};
const TABS = [
  ["home", "Home", "home", "Home"],
  ["markets", "Markets", "chart", "Markets"],
  ["sa", "South Africa", "flag", "SA"],
  ["saved", "Saved", "bookmark", "Saved"],
  ["thoughts", "My thoughts", "pen", "Thoughts"],
];
const ICONS = {
  home: "M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  chart: "M3 17l6-6 4 4 8-8|M15 7h6v6",
  flag: "M5 21V4|M5 4h12l-2.5 4 2.5 4H5",
  bookmark: "M6 3h12v18l-6-4-6 4z",
  pen: "M12 20h9|M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z",
  comment: "M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
  share: "M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7|M16 6l-4-4-4 4|M12 2v14",
  open: "M14 3h7v7|M21 3l-9 9|M19 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5",
  refresh: "M21 12a9 9 0 1 1-3-6.7|M21 4v5h-5",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z|M21 21l-4.3-4.3",
  moon: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z",
  sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z|M12 2v2|M12 20v2|M4.9 4.9l1.4 1.4|M17.7 17.7l1.4 1.4|M2 12h2|M20 12h2|M4.9 19.1l1.4-1.4|M17.7 6.3l1.4-1.4",
  up: "M12 19V5|M5 12l7-7 7 7",
  star: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z",
};

const $ = (id) => document.getElementById(id);
function has(item, tags) { return (item.tags || []).some((t) => tags.includes(t)); }

// ---------------------------------------------------------------- storage

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(KEY + key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}
function store(key, value) {
  try { localStorage.setItem(KEY + key, JSON.stringify(value)); } catch (e) { /* storage blocked: app still works */ }
}
function arr(v) { return Array.isArray(v) ? v : []; }
function obj(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }

const prefs = obj(load("prefs", {}));
const savedWatch = load("watch", null);
const state = {
  feed: null,
  pending: null,
  tab: "home",
  win: WINDOWS.some((w) => w[0] === prefs.win) ? prefs.win : "day",
  filter: FILTERS.some((f) => f[0] === prefs.filter) ? prefs.filter : "all",
  mkGroup: MARKET_GROUPS.some((g) => g[0] === prefs.mkGroup) ? prefs.mkGroup : "all",
  range: {},
  tag: "",
  q: "",
  saved: arr(load("saved", [])),
  notes: obj(load("notes", {})),
  watch: new Set(Array.isArray(savedWatch) ? savedWatch : DEFAULT_WATCH),
  read: new Set(arr(load("read", []))),
  open: new Set(),
  mkOpen: new Set(),
  drafts: {},
  error: "",
  loading: false,
  lastFetch: 0,
};
const savePrefs = () => store("prefs", prefs);
const persistSaved = () => store("saved", state.saved);
const persistNotes = () => store("notes", state.notes);
const persistWatch = () => store("watch", Array.from(state.watch));
function persistRead() { store("read", Array.from(state.read).slice(-1500)); }

// ---------------------------------------------------------------- dom helpers

function el(tag, props, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (k === "class") node.className = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) node.setAttribute(k, v === true ? "" : String(v));
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}
const SVG_NS = "http://www.w3.org/2000/svg";
function svg(tag, attrs, ...children) {
  const n = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) n.setAttribute(k, String(v));
  children.forEach((c) => c && n.append(c));
  return n;
}
function icon(name, size = 20, filled = false) {
  const s = svg("svg", { viewBox: "0 0 24 24", width: size, height: size, fill: filled ? "currentColor" : "none", stroke: "currentColor",
    "stroke-width": "1.9", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" });
  ICONS[name].split("|").forEach((d) => s.append(svg("path", { d })));
  return s;
}
const safeUrl = (u) => (/^https?:\/\//i.test(u || "") ? u : null);

function ago(iso) {
  const t = typeof iso === "number" ? iso * 1000 : new Date(iso).getTime();
  const mins = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h`;
  const days = Math.round(hours / 24);
  return days < 60 ? `${days}d` : `${Math.round(days / 30)}mo`;
}
function fmtTime(iso) {
  const d = new Date(iso);
  return isNaN(d) ? "" : d.toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
function fmtDate(sec) {
  return new Date(sec * 1000).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
}
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const topicLabel = (t) => TOPIC_LABELS[t] || t;
let toastTimer;
function toast(text) {
  const t = $("toast");
  t.textContent = text;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 1900);
}
function autosize(ta) {
  ta.style.height = "auto";
  ta.style.height = `${Math.min(ta.scrollHeight, 260)}px`;
}

// ---------------------------------------------------------------- money formatting

function num(v, dec) {
  return Number(v).toLocaleString("en-GB", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function fmtPrice(q, v) {
  return `${q.prefix || ""}${num(v == null ? q.price : v, q.dec)}${q.suffix || ""}`;
}
function fmtPct(p) {
  if (p == null || isNaN(p)) return "n/a";
  return `${p > 0 ? "+" : ""}${Number(p).toFixed(2)}%`;
}
const dir = (p) => (p > 0.005 ? "up" : p < -0.005 ? "down" : "flat");
const arrow = (p) => (p > 0.005 ? "▲" : p < -0.005 ? "▼" : "▬");
function chgNode(p, cls = "") {
  return el("span", { class: `chg ${dir(p)} ${cls}`.trim() }, `${arrow(p)} ${fmtPct(p)}`);
}
const quotes = () => (state.feed && state.feed.markets && state.feed.markets.quotes) || [];
const quoteBySym = (sym) => quotes().find((q) => q.sym === sym);

// ---------------------------------------------------------------- data

async function refresh(manual) {
  if (state.loading) return;
  state.loading = true;
  $("refresh").classList.add("spin");
  try {
    const res = await fetch(`${FEED_URL}?_=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const initial = !state.lastFetch;
    state.lastFetch = Date.now();
    state.error = "";
    store("feed", data);
    if (!state.feed || manual || initial) {
      state.feed = data;
      state.pending = null;
      render();
    } else if (data.generated_at !== state.feed.generated_at) {
      const known = new Set([...(state.feed.hour || []), ...(state.feed.day || [])].map((i) => i.id));
      const fresh = (data.day || []).filter((i) => !known.has(i.id)).length;
      if (fresh > 0) {
        state.pending = { data, fresh };
      } else {
        state.feed = data;
        renderMarketsLive();
      }
      renderHeader();
      renderRail();
    }
    if (manual) toast("Refreshed");
  } catch (e) {
    const cached = load("feed", null);
    if (cached && !state.feed) state.feed = cached;
    state.error = state.feed
      ? "You are offline or the feed is unavailable. Showing the last data you loaded."
      : "The feed is not available yet. Run the Build feed action on GitHub once, then reload.";
    render();
  } finally {
    state.loading = false;
    $("refresh").classList.remove("spin");
    renderHeader();
  }
}
function applyPending() {
  if (!state.pending) return;
  state.feed = state.pending.data;
  state.pending = null;
  render();
  window.scrollTo(0, 0);
}
// Prices change even when no new stories arrive, so redraw the price lists in place.
function renderMarketsLive() {
  if (state.tab === "markets") renderList(); else renderRail();
}

// ---------------------------------------------------------------- saves, watchlist and notes

const isSaved = (item) => state.saved.some((s) => s.id === item.id);
const notesFor = (id) => (state.notes[id] && state.notes[id].notes) || [];

function snapshot(item) {
  return {
    id: String(item.id), title: String(item.title || ""), summary: String(item.summary || "").slice(0, 300),
    link: String(item.link || ""), source: String(item.source || ""), category: String(item.category || "news"),
    tags: arr(item.tags).map(String).slice(0, 8), severity: String(item.severity || "normal"),
    published: String(item.published || new Date().toISOString()), also: arr(item.also).map(String).slice(0, 6),
    extra: item.extra ? String(item.extra).slice(0, 400) : "",
  };
}
function toggleSave(item) {
  const i = state.saved.findIndex((s) => s.id === item.id);
  if (i >= 0) { state.saved.splice(i, 1); toast("Removed from saved"); }
  else { state.saved.unshift(snapshot(item)); toast("Saved"); }
  persistSaved();
  if (state.tab === "saved") renderList(); else refreshCard(item.id);
  renderNav();
}
function toggleWatch(sym) {
  if (state.watch.has(sym)) { state.watch.delete(sym); toast("Removed from watchlist"); }
  else { state.watch.add(sym); toast("Added to watchlist"); }
  persistWatch();
  if (state.tab === "markets" && (state.mkGroup === "watch" || state.mkGroup === "all")) renderList(); else refreshCard(`q:${sym}`);
  renderRail();
  renderControls();
}
function addNote(item, text) {
  const rec = state.notes[item.id] || (state.notes[item.id] = { item: snapshot(item), notes: [] });
  rec.notes.push({ id: uid(), text, ts: new Date().toISOString() });
  persistNotes();
  renderNav();
}
function editNote(itemId, noteId, text) {
  const n = notesFor(itemId).find((x) => x.id === noteId);
  if (n) { n.text = text; n.edited = true; persistNotes(); }
}
function deleteNote(itemId, noteId) {
  const rec = state.notes[itemId];
  if (!rec) return;
  rec.notes = rec.notes.filter((n) => n.id !== noteId);
  if (!rec.notes.length) delete state.notes[itemId];
  persistNotes();
  renderNav();
}
function afterNoteChange(id) {
  if (state.tab === "thoughts" && !state.notes[id]) renderList(); else refreshCard(id);
}

async function share(item) {
  const mine = notesFor(item.id).slice(-1)[0];
  const text = mine ? `${item.title}\n\nMy take: ${mine.text}` : item.title;
  const data = { title: item.title, text, url: safeUrl(item.link) || undefined };
  if (navigator.share) {
    try { await navigator.share(data); return; } catch (e) { if (e && e.name === "AbortError") return; }
  }
  try {
    await navigator.clipboard.writeText(`${text}${data.url ? `\n${data.url}` : ""}`);
    toast("Copied to your clipboard");
  } catch (e) {
    toast("Could not share from this browser");
  }
}

function exportBackup() {
  const data = { app: "randpulse", version: 1, exported: new Date().toISOString(), saved: state.saved, notes: state.notes, watch: Array.from(state.watch) };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = el("a", { href: URL.createObjectURL(blob), download: `randpulse-backup-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  toast("Backup downloaded");
}
async function importBackup(file) {
  try {
    const data = JSON.parse(await file.text());
    if (!data || data.app !== "randpulse") throw new Error("not a RandPulse backup");
    let added = 0;
    arr(data.saved).forEach((s) => {
      if (s && typeof s.id === "string" && typeof s.title === "string" && !state.saved.some((x) => x.id === s.id)) {
        state.saved.push(snapshot(s)); added++;
      }
    });
    Object.entries(obj(data.notes)).forEach(([id, rec]) => {
      if (!rec || !rec.item || !Array.isArray(rec.notes)) return;
      const mine = state.notes[id] || (state.notes[id] = { item: snapshot({ ...rec.item, id }), notes: [] });
      rec.notes.forEach((n) => {
        if (n && typeof n.text === "string" && !mine.notes.some((x) => x.id === n.id)) {
          mine.notes.push({ id: String(n.id || uid()), text: n.text.slice(0, 2000), ts: String(n.ts || new Date().toISOString()), edited: !!n.edited });
          added++;
        }
      });
      mine.notes.sort((a, b) => a.ts.localeCompare(b.ts));
      if (!mine.notes.length) delete state.notes[id];
    });
    arr(data.watch).forEach((s) => { if (typeof s === "string" && s.length < 30 && !state.watch.has(s)) { state.watch.add(s); added++; } });
    persistSaved(); persistNotes(); persistWatch();
    render();
    toast(added ? `Restored ${added} item${added === 1 ? "" : "s"}` : "Nothing new in that backup");
  } catch (e) {
    toast("That file is not a RandPulse backup");
  }
}

// ---------------------------------------------------------------- story cards

const AVATARS = [["#b3283f", "#6e1426"], ["#c9822b", "#7a4a12"], ["#1f8f78", "#115043"], ["#3b6fd6", "#1d3d85"], ["#8a4fc4", "#4d2478"], ["#c24f8a", "#78234e"]];
function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}
function avatar(item) {
  const [a, b] = AVATARS[hash(item.source || "x") % AVATARS.length];
  const words = (item.source || "").replace(/[^A-Za-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  const label = item.category === "idea" ? "\u{1F4A1}" : item.category === "quote" ? "\u{1F4C8}" : ((words[0] || "?")[0] + (words[1] ? words[1][0] : "")).toUpperCase();
  return el("div", { class: "avatar", style: `background:linear-gradient(135deg,${a},${b})` }, label);
}

function buildCard(item, opts = {}) {
  const url = safeUrl(item.link);
  const saved = isSaved(item);
  const notes = notesFor(item.id);
  const isOpen = opts.forceOpen || state.open.has(item.id);
  const special = item.category === "idea" || item.category === "quote";
  const tags = (item.tags || []).filter((t) => t !== "sa" && t !== "idea" && t !== "quote").slice(0, 4);
  const also = item.also || [];

  const title = url
    ? el("a", { class: "c-title", href: url, target: "_blank", rel: "noopener noreferrer", onclick: () => markRead(item.id) }, item.title)
    : el("span", { class: "c-title" }, item.title);

  const noteBtn = el("button", {
    class: `act ${notes.length ? "has-notes" : ""}`.trim(),
    "aria-label": notes.length ? `${notes.length} thought${notes.length === 1 ? "" : "s"}, open` : "Write a thought",
    title: "My thoughts", onclick: () => toggleNotes(item, opts),
  }, icon("comment", 19, notes.length > 0), notes.length ? String(notes.length) : null);

  const card = el("article", { class: `card ${item.severity === "critical" ? "critical" : ""} ${state.read.has(item.id) ? "read" : ""}`.trim() },
    el("div", { class: "c-top" },
      avatar(item),
      el("div", { class: "c-body" },
        el("div", { class: "c-who" },
          el("span", { class: "c-source" }, item.source),
          special ? null : el("span", { class: "c-time" }, ago(item.published)),
          item.severity === "critical" ? el("span", { class: "pill critical" }, "Breaking") : null,
          item.severity === "high" ? el("span", { class: "pill high" }, "Notable") : null,
          (item.tags || []).includes("sa") && !special ? el("span", { class: "pill sa" }, "South Africa") : null,
        ),
        title,
        item.summary ? el("p", { class: "c-summary" }, item.summary) : null,
        item.extra ? el("p", { class: "c-extra" }, item.extra) : null,
        also.length ? el("p", { class: "c-also" }, `Also reported by ${also.slice(0, 2).join(", ")}${also.length > 2 ? ` and ${also.length - 2} more` : ""}`) : null,
        tags.length ? el("div", { class: "c-tags" }, tags.map((t) => el("button", { class: "tag", onclick: () => setTag(t) }, `#${topicLabel(t)}`))) : null,
        el("div", { class: "actions" },
          noteBtn,
          el("button", { class: `act ${saved ? "saved" : ""}`.trim(), "aria-label": saved ? "Remove from saved" : "Save", title: saved ? "Saved" : "Save", onclick: () => toggleSave(item) }, icon("bookmark", 19, saved)),
          el("button", { class: "act", "aria-label": "Share", title: "Share", onclick: () => share(item) }, icon("share", 19)),
          url ? el("a", { class: "act", href: url, target: "_blank", rel: "noopener noreferrer", "aria-label": "Read the story", title: "Read the story", onclick: () => markRead(item.id) }, icon("open", 19)) : null,
        ),
      ),
    ),
    isOpen ? notesPanel(item) : null,
  );
  card.dataset.id = item.id;
  card._rebuild = () => buildCard(item, opts);
  return card;
}

function markRead(id) {
  if (state.read.has(id)) return;
  state.read.add(id);
  persistRead();
  document.querySelectorAll(".card").forEach((c) => { if (c.dataset.id === id) c.classList.add("read"); });
}
function refreshCard(id, focus) {
  document.querySelectorAll(".card, .qwrap").forEach((c) => {
    if (c.dataset.id !== id || !c._rebuild) return;
    const fresh = c._rebuild();
    c.replaceWith(fresh);
    if (focus) {
      const ta = fresh.querySelector(".note-compose .note-input");
      if (ta) { ta.focus(); autosize(ta); }
    }
  });
}
function toggleNotes(item, opts) {
  if (opts && opts.forceOpen) {
    const ta = Array.from(document.querySelectorAll(".card")).find((c) => c.dataset.id === item.id);
    const input = ta && ta.querySelector(".note-compose .note-input");
    if (input) input.focus();
    return;
  }
  if (state.open.has(item.id)) state.open.delete(item.id); else state.open.add(item.id);
  refreshCard(item.id, state.open.has(item.id));
}

function notesPanel(item) {
  const list = notesFor(item.id);
  const wrap = el("div", { class: "notes" });
  list.forEach((n) => wrap.append(noteRow(item, n)));

  const ta = el("textarea", { class: "note-input", rows: "2", maxlength: "2000", placeholder: "What do you make of this? Write your thoughts.", "aria-label": "Your thoughts" });
  ta.value = state.drafts[item.id] || "";
  const post = el("button", { class: "btn primary small", onclick: submit }, "Save thought");
  post.disabled = !ta.value.trim();
  ta.addEventListener("input", () => { state.drafts[item.id] = ta.value; post.disabled = !ta.value.trim(); autosize(ta); });
  ta.addEventListener("keydown", (e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit(); });
  function submit() {
    const text = ta.value.trim();
    if (!text) return;
    addNote(item, text);
    delete state.drafts[item.id];
    state.open.add(item.id);
    refreshCard(item.id);
    toast("Thought saved");
  }
  wrap.append(el("div", { class: "note-compose" }, ta, el("div", { class: "note-foot" }, el("span", { class: "hint" }, "Private. Stored on this device."), post)));
  return wrap;
}

function noteRow(item, n) {
  const body = el("div", { class: "note-text" }, n.text);
  const row = el("div", { class: "note" },
    el("div", { class: "note-meta" },
      el("span", {}, `You, ${fmtTime(n.ts)}${n.edited ? ", edited" : ""}`),
      el("span", { class: "note-btns" }, el("button", { class: "link-btn", onclick: startEdit }, "Edit"), el("button", { class: "link-btn", onclick: remove }, "Delete"))),
    body);
  function startEdit() {
    const ta = el("textarea", { class: "note-input", rows: "3", maxlength: "2000", "aria-label": "Edit your thought" });
    ta.value = n.text;
    ta.addEventListener("input", () => autosize(ta));
    const save = el("button", { class: "btn primary small", onclick: () => {
      const t = ta.value.trim();
      if (!t) return;
      editNote(item.id, n.id, t);
      refreshCard(item.id);
      toast("Thought updated");
    } }, "Update thought");
    body.replaceChildren(ta, el("div", { class: "note-foot" }, el("button", { class: "btn small", onclick: () => refreshCard(item.id) }, "Cancel"), save));
    autosize(ta);
    ta.focus();
  }
  function remove() {
    if (!window.confirm("Delete this thought?")) return;
    deleteNote(item.id, n.id);
    afterNoteChange(item.id);
    toast("Thought deleted");
  }
  return row;
}

// ---------------------------------------------------------------- markets: rows, charts

function sparkline(series, n = 30) {
  const pts = series.slice(-n).map((p) => p[1]);
  const s = svg("svg", { class: `spark ${dir(pts.length > 1 ? pts[pts.length - 1] - pts[0] : 0)}`, viewBox: "0 0 84 28", "aria-hidden": "true" });
  if (pts.length < 2) return s;
  const min = Math.min(...pts), max = Math.max(...pts), span = max - min || 1;
  const coords = pts.map((v, i) => `${((84 * i) / (pts.length - 1)).toFixed(1)},${(26 - ((v - min) / span) * 24).toFixed(1)}`);
  s.append(svg("polyline", { points: coords.join(" ") }));
  return s;
}

function quoteItem(q) {
  return {
    id: `q:${q.sym}`, title: q.name, summary: `${fmtPrice(q)} (${fmtPct(q.pct)}) when you last wrote.`, extra: "",
    link: `https://finance.yahoo.com/quote/${encodeURIComponent(q.sym.includes("-ZAR") ? (q.sym === "GOLD-ZAR" ? "GC=F" : "PL=F") : q.sym)}`,
    source: "Markets", category: "quote", tags: [q.group === "rand" ? "rand" : "quote"], severity: "normal", published: new Date().toISOString(), also: [],
  };
}

function buildQuote(q) {
  const open = state.mkOpen.has(q.sym);
  const wrap = el("div", { class: "qwrap" });
  const row = el("button", { class: "qrow", "aria-expanded": String(open), onclick: () => {
    if (state.mkOpen.has(q.sym)) state.mkOpen.delete(q.sym); else state.mkOpen.add(q.sym);
    refreshCard(`q:${q.sym}`);
  } },
    el("span", {}, el("span", { class: "q-name" }, q.name), el("span", { class: "q-sub" }, `${q.sym.replace(/\.JO$/, "")}${q.stale ? ", delayed" : ""}`)),
    sparkline(q.series || []),
    el("span", { class: "q-price" }, el("b", {}, fmtPrice(q)), chgNode(q.pct)));
  wrap.append(row);
  if (open) wrap.append(quoteDetail(q));
  wrap.dataset.id = `q:${q.sym}`;
  wrap._rebuild = () => buildQuote(quoteBySym(q.sym) || q);
  return wrap;
}

function rangeChange(q, pts) {
  return pts.length > 1 ? ((pts[pts.length - 1][1] - pts[0][1]) / Math.abs(pts[0][1])) * 100 : 0;
}

function buildChart(q) {
  const all = q.series || [];
  if (all.length < 2) return el("p", { class: "section-sub" }, "No chart data yet.");
  const rangeKey = state.range[q.sym] || prefs.range || "3M";
  const days = (RANGES.find((r) => r[0] === rangeKey) || RANGES[1])[1];
  const lastTs = all[all.length - 1][0];
  const pts = all.filter((p) => p[0] >= lastTs - days * 86400);
  const W = 600, H = 220, padL = 6, padR = 6, padT = 12, padB = 20;
  const vals = pts.map((p) => p[1]);
  const min = Math.min(...vals), max = Math.max(...vals), span = max - min || 1;
  const x = (i) => padL + ((W - padL - padR) * i) / (pts.length - 1);
  const y = (v) => padT + (H - padT - padB) * (1 - (v - min) / span);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p[1]).toFixed(1)}`).join(" ");
  const area = `${line} L${x(pts.length - 1).toFixed(1)} ${H - padB} L${x(0).toFixed(1)} ${H - padB} Z`;
  const change = rangeChange(q, pts);
  const gid = `g${hash(q.sym)}`;

  const wrap = el("div", { class: `chart ${dir(change) === "down" ? "down" : ""}`.trim() });
  const big = el("b", {}, fmtPrice(q));
  const sub = el("span", {}, `${fmtPct(change)} over ${rangeKey === "1Y" ? "the past year" : rangeKey === "1M" ? "1 month" : rangeKey === "3M" ? "3 months" : "6 months"}`);
  const readout = el("div", { class: "readout" }, big, chgNode(change), sub);

  const cross = svg("line", { class: "cross", y1: padT, y2: H - padB, x1: 0, x2: 0, visibility: "hidden" });
  const dot = svg("circle", { class: "dot", r: 5, cx: 0, cy: 0, visibility: "hidden" });
  const chart = svg("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `${q.name} price chart` },
    svg("defs", {}, svg("linearGradient", { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 },
      svg("stop", { offset: "0%", style: "stop-color:currentColor;stop-opacity:.28" }),
      svg("stop", { offset: "100%", style: "stop-color:currentColor;stop-opacity:0" }))),
    svg("path", { d: area, fill: `url(#${gid})` }),
    svg("path", { class: "line", d: line }),
    svg("text", { class: "axis", x: padL, y: H - 4 }, fmtDate(pts[0][0])),
    svg("text", { class: "axis", x: W - padR, y: H - 4, "text-anchor": "end" }, fmtDate(pts[pts.length - 1][0])),
    svg("text", { class: "axis", x: W - padR, y: padT + 2, "text-anchor": "end" }, num(max, q.dec)),
    svg("text", { class: "axis", x: W - padR, y: H - padB - 4, "text-anchor": "end" }, num(min, q.dec)),
    cross, dot);

  function point(e) {
    const r = chart.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - r.left) / (r.width || 1)));
    const i = Math.round(ratio * (pts.length - 1));
    const p = pts[i];
    const cx = x(i);
    cross.setAttribute("x1", cx); cross.setAttribute("x2", cx);
    dot.setAttribute("cx", cx); dot.setAttribute("cy", y(p[1]));
    cross.setAttribute("visibility", "visible"); dot.setAttribute("visibility", "visible");
    big.textContent = fmtPrice(q, p[1]);
    const c = ((p[1] - pts[0][1]) / Math.abs(pts[0][1])) * 100;
    readout.replaceChildren(big, chgNode(c), el("span", {}, fmtDate(p[0])));
  }
  function leave() {
    cross.setAttribute("visibility", "hidden"); dot.setAttribute("visibility", "hidden");
    big.textContent = fmtPrice(q);
    readout.replaceChildren(big, chgNode(change), sub);
  }
  chart.addEventListener("pointermove", point);
  chart.addEventListener("pointerdown", point);
  chart.addEventListener("pointerleave", leave);
  chart.addEventListener("pointercancel", leave);

  const ranges = el("div", { class: "ranges", role: "group", "aria-label": "Chart range" }, RANGES.map(([k]) =>
    el("button", { class: k === rangeKey ? "active" : "", "aria-pressed": String(k === rangeKey), onclick: () => {
      state.range[q.sym] = k; prefs.range = k; savePrefs(); refreshCard(`q:${q.sym}`);
    } }, k)));
  wrap.append(readout, chart, ranges);
  return wrap;
}

function quoteDetail(q) {
  const item = quoteItem(q);
  const stat = (label, node) => el("div", {}, el("small", {}, label), node);
  const watching = state.watch.has(q.sym);
  const url = safeUrl(item.link);
  return el("div", { class: "qdetail" },
    q.note ? el("p", { class: "section-sub", style: "padding:0 0 8px;border:0" }, q.derived ? q.note : `${q.note}.`) : null,
    q.stale ? el("p", { class: "delayed" }, "This price could not be refreshed this hour. It is the last one we got.") : null,
    buildChart(q),
    el("div", { class: "stats" },
      stat("Previous close", el("b", {}, fmtPrice(q, q.prev))),
      stat("Highest in a year", el("b", {}, fmtPrice(q, q.hi))),
      stat("Lowest in a year", el("b", {}, fmtPrice(q, q.lo))),
      stat("Past week", chgNode(q.w1)),
      stat("Past month", chgNode(q.m1)),
      stat("Past year", chgNode(q.y1))),
    el("div", { class: "q-actions" },
      el("button", { class: `btn small ${watching ? "on" : ""}`.trim(), "aria-pressed": String(watching), onclick: () => toggleWatch(q.sym) }, watching ? "On my watchlist" : "Add to watchlist"),
      el("button", { class: "btn small", onclick: () => share({ ...item, title: `${q.name} ${fmtPrice(q)} (${fmtPct(q.pct)})` }) }, "Share"),
      url ? el("a", { class: "btn small", href: url, target: "_blank", rel: "noopener noreferrer", style: "text-decoration:none" }, "Open quote page") : null),
    notesPanel(item));
}

// ---------------------------------------------------------------- filtering

function setTag(t) {
  state.tag = t;
  if (state.tab === "thoughts" || state.tab === "markets") state.tab = "home";
  render();
  window.scrollTo(0, 0);
}
function matchesQuery(i) {
  const q = state.q.trim().toLowerCase();
  if (!q) return true;
  return `${i.title} ${i.summary || ""} ${i.source} ${(i.tags || []).map(topicLabel).join(" ")}`.toLowerCase().includes(q);
}
const matchesTag = (i) => !state.tag || (i.tags || []).includes(state.tag);
function matchesQuote(q) {
  const s = state.q.trim().toLowerCase();
  return !s || `${q.name} ${q.sym} ${q.note}`.toLowerCase().includes(s);
}
function ideaItem(idea, feed) {
  return {
    id: `idea:${idea.id}`, title: idea.title, summary: idea.action,
    extra: `${idea.why}${idea.evidence_title ? ` Evidence: ${idea.evidence_title}` : ""}`,
    link: idea.evidence_link || "", source: "SA opportunity", category: "idea", tags: ["sa", "idea"],
    severity: "normal", published: feed.generated_at, also: [],
  };
}

// ---------------------------------------------------------------- rendering

function emptyState(iconName, heading, text) {
  return el("div", { class: "empty" }, icon(iconName, 40), el("h3", {}, heading), el("p", {}, text));
}
function skeletons() {
  return [1, 2, 3, 4].map(() => el("div", { class: "skel" }, el("i", { class: "a" }), el("div", { class: "l" }, el("i", { style: "width:40%" }), el("i", { style: "width:92%" }), el("i", { style: "width:78%" }))));
}
function backupBox(cls) {
  return el("section", { class: `box ${cls || ""}`.trim() },
    el("h2", {}, "Back up"),
    el("p", {}, "Your saves, thoughts and watchlist live on this device. Download a backup to keep them safe or move them to another device."),
    el("div", { class: "backup" },
      el("button", { class: "btn small", onclick: exportBackup }, "Download backup"),
      el("button", { class: "btn small", onclick: () => $("importFile").click() }, "Restore from file")));
}
function tile(q) {
  return el("button", { class: "tile", onclick: () => openQuote(q.sym), "aria-label": `${q.name} ${fmtPrice(q)} ${fmtPct(q.pct)}` },
    el("div", { class: "t-name" }, q.name), el("div", { class: "t-price" }, fmtPrice(q)), chgNode(q.pct));
}
function openQuote(sym) {
  state.tab = "markets";
  state.mkGroup = "all";
  state.q = ""; $("q").value = "";
  state.mkOpen.add(sym);
  render();
  const node = Array.from(document.querySelectorAll(".qwrap")).find((n) => n.dataset.id === `q:${sym}`);
  if (node) node.scrollIntoView({ block: "start" }); else window.scrollTo(0, 0);
}

function renderMarkets(nodes) {
  const all = quotes();
  if (!all.length) {
    nodes.push(emptyState("chart", "No prices yet", "Prices appear after the hourly update has run once. Open the Actions tab on GitHub and run Build feed."));
    return;
  }
  const visible = all.filter(matchesQuote);
  const group = state.mkGroup;
  const sections = [];
  const watched = visible.filter((q) => state.watch.has(q.sym));
  if (group === "watch") sections.push(["Your watchlist", watched]);
  else if (group === "all") {
    if (watched.length) sections.push(["Your watchlist", watched]);
    // Watched prices already sit at the top, so each price appears once in the full list.
    Object.keys(GROUP_TITLES).forEach((g) => sections.push([GROUP_TITLES[g], visible.filter((q) => q.group === g && !state.watch.has(q.sym))]));
  } else sections.push([GROUP_TITLES[group], visible.filter((q) => q.group === group)]);

  let any = false;
  sections.forEach(([title, list]) => {
    if (!list.length) return;
    any = true;
    nodes.push(el("h2", { class: "section-title" }, title));
    list.forEach((q) => nodes.push(buildQuote(q)));
  });
  if (!any) {
    nodes.push(group === "watch" && !state.q
      ? emptyState("star", "Your watchlist is empty", "Open any price and choose Add to watchlist. Your picks stay at the top.")
      : emptyState("search", "No prices match", "Try another name or clear your search."));
  }
  const m = state.feed.markets;
  nodes.push(el("p", { class: "footnote" }, `Prices from Yahoo Finance, with Stooq as a backup, delayed by up to 15 minutes. Updated ${m.updated ? ago(m.updated) + " ago" : "recently"}. Information only, not financial advice.`));
}

function renderList() {
  const list = $("list");
  const feed = state.feed;
  const nodes = [];

  if (state.tab === "saved") {
    const items = state.saved.filter((i) => matchesQuery(i) && matchesTag(i));
    items.forEach((i) => nodes.push(buildCard(i)));
    if (!items.length) nodes.push(state.saved.length
      ? emptyState("search", "No matches", "Try a different search or clear the topic.")
      : emptyState("bookmark", "Nothing saved yet", "Tap the bookmark on any story to keep it here."));
    nodes.push(backupBox("mobile-only"));
  } else if (state.tab === "thoughts") {
    const recs = Object.values(state.notes)
      .filter((r) => r.notes && r.notes.length && matchesQuery(r.item))
      .sort((a, b) => b.notes[b.notes.length - 1].ts.localeCompare(a.notes[a.notes.length - 1].ts));
    recs.forEach((r) => nodes.push(buildCard(r.item, { forceOpen: true })));
    if (!recs.length) nodes.push(Object.keys(state.notes).length
      ? emptyState("search", "No matches", "Try a different search.")
      : emptyState("pen", "No thoughts yet", "Tap the speech bubble on any story, idea or price to write what you think. Everything you write collects here."));
    nodes.push(backupBox("mobile-only"));
  } else if (!feed) {
    if (state.error) nodes.push(emptyState("refresh", "No feed yet", state.error));
    else nodes.push(...skeletons());
  } else if (state.tab === "markets") {
    renderMarkets(nodes);
  } else if (state.tab === "sa") {
    const inds = (feed.markets && feed.markets.indicators) || [];
    if (inds.length && !state.q.trim() && !state.tag) {
      nodes.push(el("h2", { class: "section-title" }, "South Africa's economy at a glance"));
      nodes.push(el("p", { class: "section-sub" }, "Latest annual figures from the World Bank. For monthly numbers, see Stats SA and the Reserve Bank."));
      nodes.push(el("div", { class: "econ" }, inds.map((i) => el("div", { class: "tile" },
        el("div", { class: "t-name" }, i.name),
        el("div", { class: "t-price" }, `${i.unit === "$" ? "$" : ""}${num(i.value, i.dec)}${i.unit === "%" ? "%" : ""}`),
        el("small", {}, `${i.year}. ${i.note}`)))));
    }
    const ideas = (feed.sa_ideas || []).map((i) => ideaItem(i, feed)).filter(matchesQuery);
    if (ideas.length) {
      nodes.push(el("h2", { class: "section-title" }, "Ideas to build wealth and opportunity in South Africa"));
      nodes.push(el("p", { class: "section-sub" }, "Picked from this week's news and prices. Write your own plan under any of them. Ideas, not financial advice."));
      ideas.forEach((i) => nodes.push(buildCard(i)));
    }
    nodes.push(el("h2", { class: "section-title" }, "South African stories this week"));
    const stories = (feed.week || []).filter((i) => i.tags.includes("sa") && matchesQuery(i) && matchesTag(i));
    stories.forEach((i) => nodes.push(buildCard(i)));
    if (!stories.length) nodes.push(emptyState("flag", "No South African stories", "Nothing from the last 7 days matches. Check back after the next hourly update."));
  } else {
    const plain = state.filter === "all" && !state.tag && !state.q.trim();
    if (plain && quotes().length) {
      const tiles = TICKER.map(quoteBySym).filter(Boolean);
      const use = tiles.length >= 3 ? tiles : quotes().slice(0, 6);
      nodes.push(el("div", { class: "ticker", role: "list", "aria-label": "Key prices" }, use.map(tile)));
    }
    if (state.win === "year" && plain) {
      const movers = quotes().filter((q) => q.y1 != null && q.group !== "gauges" && !q.derived).sort((a, b) => b.y1 - a.y1);
      if (movers.length >= 6) {
        nodes.push(el("h2", { class: "section-title" }, "Biggest moves over the past year"));
        [...movers.slice(0, 3), ...movers.slice(-3).reverse()].forEach((q) => nodes.push(buildQuote(q)));
      }
      if ((feed.reports || []).length) {
        nodes.push(el("h2", { class: "section-title" }, "Annual reports worth reading"));
        feed.reports.forEach((r) => {
          const u = safeUrl(r.url);
          nodes.push(el(u ? "a" : "div", u ? { class: "report", href: u, target: "_blank", rel: "noopener noreferrer" } : { class: "report" },
            el("b", {}, r.title), el("p", {}, `${r.publisher}. ${r.note}`)));
        });
      }
      nodes.push(el("h2", { class: "section-title" }, "Top stories of the year"));
    }
    const match = FILTERS.find((f) => f[0] === state.filter)[2];
    const items = (feed[state.win] || []).filter((i) => match(i) && matchesQuery(i) && matchesTag(i));
    items.forEach((i) => nodes.push(buildCard(i)));
    if (!items.length) nodes.push(emptyState("search", "Nothing here", "Try a wider time window, another filter, or clear your search."));
    nodes.push(el("p", { class: "footnote" }, "Information only, not financial advice."));
  }
  list.replaceChildren(...nodes);
}

function renderControls() {
  const home = state.tab === "home";
  const markets = state.tab === "markets";
  $("windows").hidden = !home;
  $("chips").hidden = !(home || markets);
  const searchable = state.tab !== "thoughts" || Object.keys(state.notes).length > 0;
  $("q").closest(".search").hidden = !searchable;

  if (home) {
    $("windows").replaceChildren(...WINDOWS.map(([key, label]) => el("button", {
      class: state.win === key ? "active" : "", "aria-pressed": String(state.win === key),
      onclick: () => { state.win = key; prefs.win = key; savePrefs(); render(); },
    }, label)));
    $("chips").replaceChildren(...FILTERS.map(([key, label]) => el("button", {
      class: state.filter === key ? "chip active" : "chip", "aria-pressed": String(state.filter === key),
      onclick: () => { state.filter = key; prefs.filter = key; savePrefs(); render(); },
    }, label)));
  } else if (markets) {
    $("chips").replaceChildren(...MARKET_GROUPS.map(([key, label]) => el("button", {
      class: state.mkGroup === key ? "chip active" : "chip", "aria-pressed": String(state.mkGroup === key),
      onclick: () => { state.mkGroup = key; prefs.mkGroup = key; savePrefs(); render(); },
    }, key === "watch" ? `${label} (${state.watch.size})` : label)));
  }
  const tagbar = $("tagbar");
  const showTag = !!state.tag && ["home", "sa", "saved"].includes(state.tab);
  tagbar.hidden = !showTag;
  if (showTag) {
    tagbar.replaceChildren(el("span", {}, "Showing topic"), el("button", { onclick: () => { state.tag = ""; render(); }, "aria-label": "Clear topic" }, `#${topicLabel(state.tag)}  ×`));
  }
}

function renderNav() {
  ["sideNav", "bottomNav"].forEach((id) => {
    $(id).replaceChildren(...TABS.map(([key, label, ic, short]) => {
      const n = key === "saved" ? state.saved.length : key === "thoughts" ? Object.keys(state.notes).length : 0;
      return el("button", {
        class: `nav-btn ${state.tab === key ? "active" : ""}`.trim(), "aria-current": state.tab === key ? "page" : null,
        onclick: () => { state.tab = key; render(); window.scrollTo(0, 0); },
      }, icon(ic, 24, state.tab === key && key === "bookmark"), el("span", {}, id === "bottomNav" ? short : label), n && id === "sideNav" ? el("span", { class: "count" }, String(n)) : null);
    }));
  });
}

function renderHeader() {
  const feed = state.feed;
  const crit = feed ? (feed.day || []).filter((i) => i.severity === "critical").length : 0;
  const badge = $("critBadge");
  badge.hidden = crit === 0 || state.tab !== "home";
  badge.textContent = `${crit} breaking today`;
  $("status").textContent = feed ? `Updated ${ago(feed.generated_at)} ago` : "";
  $("title").textContent = (TABS.find((t) => t[0] === state.tab) || TABS[0])[1];
  const notice = $("notice");
  notice.hidden = !state.error || !state.feed;
  notice.textContent = state.error;
  const pill = $("newPill");
  if (state.pending) {
    pill.hidden = false;
    pill.replaceChildren(icon("up", 16), `${state.pending.fresh} new ${state.pending.fresh === 1 ? "story" : "stories"}`);
  } else {
    pill.hidden = true;
  }
}

function renderRail() {
  const rail = $("rail");
  const feed = state.feed;
  const nodes = [];
  if (feed) {
    const picks = [...Array.from(state.watch).map(quoteBySym), ...TICKER.map(quoteBySym)].filter(Boolean);
    const seen = new Set();
    const rows = picks.filter((q) => !seen.has(q.sym) && seen.add(q.sym)).slice(0, 6);
    if (rows.length) {
      nodes.push(el("section", { class: "box" }, el("h2", {}, "Markets now"),
        rows.map((q) => el("button", { class: "mini", onclick: () => openQuote(q.sym) },
          el("span", {}, q.name), el("span", { class: "r" }, el("b", {}, fmtPrice(q)), " ", chgNode(q.pct))))));
    }
    const counts = {};
    (feed.day || []).forEach((i) => i.tags.forEach((t) => { if (t !== "sa") counts[t] = (counts[t] || 0) + 1; }));
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
    if (top.length) {
      nodes.push(el("section", { class: "box" }, el("h2", {}, "Topics today"),
        top.map(([t, n]) => el("button", { class: "topic", onclick: () => { state.tab = "home"; state.win = "day"; state.filter = "all"; setTag(t); } },
          el("b", {}, `#${topicLabel(t)}`), el("span", {}, `${n} ${n === 1 ? "story" : "stories"}`)))));
    }
  }
  nodes.push(backupBox());
  nodes.push(el("p", { class: "footnote" }, "Information only, not financial advice."));
  rail.replaceChildren(...nodes);
}

function render() {
  renderHeader();
  renderNav();
  renderControls();
  renderList();
  renderRail();
}

// ---------------------------------------------------------------- theme

function effectiveTheme() {
  if (prefs.theme) return prefs.theme;
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}
function applyTheme() {
  if (prefs.theme) document.documentElement.dataset.theme = prefs.theme; else delete document.documentElement.dataset.theme;
  const dark = effectiveTheme() === "dark";
  $("theme").replaceChildren(icon(dark ? "sun" : "moon", 20));
  $("theme").setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", dark ? "#150a0f" : "#fcf5f6");
}

// ---------------------------------------------------------------- boot

$("refresh").replaceChildren(icon("refresh", 20));
$("searchIcon").replaceChildren(icon("search", 18));
$("refresh").addEventListener("click", () => refresh(true));
$("theme").addEventListener("click", () => { prefs.theme = effectiveTheme() === "dark" ? "light" : "dark"; savePrefs(); applyTheme(); });
$("newPill").addEventListener("click", applyPending);
$("importFile").addEventListener("change", (e) => { const f = e.target.files && e.target.files[0]; if (f) importBackup(f); e.target.value = ""; });

let searchTimer;
$("q").addEventListener("input", (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { state.q = e.target.value; renderList(); }, 120);
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && Date.now() - state.lastFetch > 60 * 1000) refresh(false);
});
setInterval(() => refresh(false), REFRESH_MS);

// Hide the header while scrolling down on phones, bring it back on the way up.
let lastY = 0;
window.addEventListener("scroll", () => {
  const y = window.scrollY;
  const d = y - lastY;
  if (Math.abs(d) < 8) return;
  $("head").classList.toggle("hide", d > 0 && y > 140);
  lastY = y;
}, { passive: true });

state.feed = load("feed", null);
applyTheme();
render();
refresh(false);

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register("sw.js").catch(() => { /* app works without the offline shell */ });
  if (hadController) {
    let reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloaded) return;
      reloaded = true;
      location.reload();
    });
  }
}
