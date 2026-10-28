// RandPulse widget for the free Scriptable app (iPhone lock screen + home screen).
// Setup: open Scriptable -> + (new script) -> paste this whole file -> name it "RandPulse".
// Then add a Scriptable widget (lock screen or home screen) and choose the "RandPulse" script.
// Your GitHub username is already filled in below.
const GITHUB_USER = "sgaqagaqa";
const REPO = "randpulse";

const DATA_URL = `https://raw.githubusercontent.com/${GITHUB_USER}/${REPO}/data/widget.json`;
const REFRESH_MINUTES = 30; // a request; iOS decides the real timing
const CACHE_FILE = "randpulse-widget.json";

const UP = new Color("#2fcf8e");
const DOWN = new Color("#ff7487");
const FLAT = new Color("#b9a0aa");
const RUBY = new Color("#e8374f");
const SEV = { critical: RUBY, high: new Color("#ffa13d"), normal: new Color("#b9a0aa") };

// ---------------------------------------------------------------- data

async function getData() {
  const fm = FileManager.local();
  const path = fm.joinPath(fm.cacheDirectory(), CACHE_FILE);
  try {
    const req = new Request(DATA_URL);
    req.timeoutInterval = 15;
    req.headers = { "Cache-Control": "no-cache" };
    const data = await req.loadJSON();
    if (data && data.quotes) {
      fm.writeString(path, JSON.stringify(data));
      return data;
    }
  } catch (e) {
    // fall through to the cached copy
  }
  if (fm.fileExists(path)) {
    try { return JSON.parse(fm.readString(path)); } catch (e) { /* ignore */ }
  }
  return sample();
}

function sample() {
  return {
    generated_at: new Date().toISOString(),
    quotes: [
      { sym: "ZAR=X", name: "US dollar / rand", prefix: "R", suffix: "", dec: 2, price: 18.0, pct: 0 },
      { sym: "GC=F", name: "Gold", prefix: "$", suffix: "", dec: 0, price: 3000, pct: 0 },
      { sym: "PL=F", name: "Platinum", prefix: "$", suffix: "", dec: 0, price: 1100, pct: 0 },
    ],
    headlines: [{ title: "Waiting for the first hourly update", source: "RandPulse", severity: "normal", published: new Date().toISOString(), link: "https://github.com" }],
  };
}

const LABEL = { "ZAR=X": "Rand", "GOLD-ZAR": "Gold in rand", "GC=F": "Gold", "PL=F": "Platinum", "BZ=F": "Brent", "^J203.JO": "JSE All Share", "^GSPC": "S&P 500" };
const short = (q) => LABEL[q.sym] || q.name;
const grp = (n, d) => Number(n).toLocaleString("en-GB", { minimumFractionDigits: d, maximumFractionDigits: d });
const price = (q) => `${q.prefix || ""}${grp(q.price, q.dec > 2 ? 2 : q.dec)}${q.suffix || ""}`;
const arrow = (p) => (p > 0.005 ? "▲" : p < -0.005 ? "▼" : "▬");
const pctText = (p) => `${arrow(p)} ${p > 0 ? "+" : ""}${Number(p).toFixed(1)}%`;
const colorOf = (p) => (p > 0.005 ? UP : p < -0.005 ? DOWN : FLAT);
const pick = (data, sym) => data.quotes.find((q) => q.sym === sym);
function ago(iso) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}m`;
  const h = Math.round(mins / 60);
  return h < 48 ? `${h}h` : `${Math.round(h / 24)}d`;
}

// ---------------------------------------------------------------- widgets

function lockScreen(data, family) {
  const w = new ListWidget();
  const rand = pick(data, "ZAR=X") || data.quotes[0];
  const gold = pick(data, "GC=F") || data.quotes[1];
  const top = data.headlines[0];

  if (family === "accessoryInline") {
    w.addText(rand ? `R/$ ${price(rand)} ${pctText(rand.pct)}` : "RandPulse");
  } else if (family === "accessoryCircular") {
    const l = w.addText("R/$");
    l.font = Font.systemFont(9);
    l.centerAlignText();
    const v = w.addText(rand ? grp(rand.price, 2) : "-");
    v.font = Font.boldSystemFont(15);
    v.centerAlignText();
    const c = w.addText(rand ? pctText(rand.pct) : "");
    c.font = Font.systemFont(8);
    c.centerAlignText();
  } else {
    // accessoryRectangular
    if (rand) {
      const a = w.addText(`Rand ${price(rand)} ${pctText(rand.pct)}`);
      a.font = Font.boldSystemFont(12);
    }
    if (gold) {
      const b = w.addText(`Gold ${price(gold)} ${pctText(gold.pct)}`);
      b.font = Font.systemFont(12);
    }
    if (top) {
      const t = w.addText(top.title);
      t.font = Font.systemFont(10);
      t.lineLimit = 1;
      t.textOpacity = 0.7;
    }
  }
  if (top) w.url = top.link;
  return w;
}

function addQuoteRow(parent, q) {
  const row = parent.addStack();
  row.centerAlignContent();
  const n = row.addText(short(q));
  n.font = Font.systemFont(13);
  row.addSpacer();
  const p = row.addText(price(q));
  p.font = Font.boldSystemFont(13);
  const c = row.addText(`  ${pctText(q.pct)}`);
  c.font = Font.systemFont(11);
  c.textColor = colorOf(q.pct);
}

function homeScreen(data, family) {
  const w = new ListWidget();
  w.backgroundColor = Color.dynamic(new Color("#fcf5f6"), new Color("#150a0f"));
  w.setPadding(12, 14, 12, 14);
  const keys = ["ZAR=X", "GC=F", "PL=F", "BZ=F", "^J203.JO", "GOLD-ZAR"];
  const quotes = keys.map((k) => pick(data, k)).filter(Boolean);

  const head = w.addStack();
  head.centerAlignContent();
  const t = head.addText("RandPulse");
  t.font = Font.boldSystemFont(12);
  t.textColor = RUBY;
  head.addSpacer();
  const u = head.addText(`${ago(data.generated_at)} ago`);
  u.font = Font.systemFont(10);
  u.textOpacity = 0.6;
  w.addSpacer(6);

  const nQuotes = family === "small" ? 3 : family === "medium" ? 3 : 6;
  quotes.slice(0, nQuotes).forEach((q) => { addQuoteRow(w, q); w.addSpacer(3); });

  const nHeads = family === "small" ? 0 : family === "medium" ? 1 : 3;
  if (nHeads) {
    w.addSpacer(6);
    data.headlines.slice(0, nHeads).forEach((h) => {
      const row = w.addStack();
      row.topAlignContent();
      row.spacing = 6;
      row.url = h.link;
      const dot = row.addText("●");
      dot.font = Font.systemFont(8);
      dot.textColor = SEV[h.severity] || SEV.normal;
      const col = row.addStack();
      col.layoutVertically();
      const tt = col.addText(h.title);
      tt.font = Font.systemFont(12);
      tt.lineLimit = 2;
      const ss = col.addText(`${h.source} ${ago(h.published)}`);
      ss.font = Font.systemFont(10);
      ss.textOpacity = 0.6;
      w.addSpacer(4);
    });
  }
  w.addSpacer();
  return w;
}

// ---------------------------------------------------------------- run

const data = await getData();
const family = config.widgetFamily || "medium"; // "medium" preview when run inside Scriptable
const lock = ["accessoryInline", "accessoryCircular", "accessoryRectangular"].includes(family);
const widget = lock ? lockScreen(data, family) : homeScreen(data, family);
widget.refreshAfterDate = new Date(Date.now() + REFRESH_MINUTES * 60 * 1000);

if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  await widget.presentMedium();
}
Script.complete();
