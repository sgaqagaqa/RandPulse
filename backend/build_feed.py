#!/usr/bin/env python3
"""
RandPulse feed builder.

Every hour this pulls South African and global finance news, market prices (rand, gold, platinum, oil,
JSE shares, world indices), and South African economic indicators from free public sources, ranks and
dedupes the news, and writes:

  feed.json    everything the web app shows
  widget.json  a tiny file for the iPhone widget
  history.json running news history (so the Year view fills up over time)

No API keys and no AI calls. Information only, not financial advice.
Optional: set NTFY_TOPIC to get push alerts (breaking stories and big market moves) through the free ntfy app.
"""
import calendar
import csv
import hashlib
import html
import io
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path

import feedparser

HERE = Path(__file__).resolve().parent
OUT = Path(os.environ.get("OUT_DIR", HERE.parent / "out"))
OUT.mkdir(parents=True, exist_ok=True)
CFG = json.loads((HERE / "sources.json").read_text(encoding="utf-8"))

NOW = datetime.now(timezone.utc)
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
TS_FMT = "%Y-%m-%dT%H:%M:%SZ"

# ---------------------------------------------------------------- patterns

STRONG = re.compile(
    r"plunge|plummet|crash|collapse|tumble|soar|surge|skyrocket|record (high|low)|all-time (high|low)|"
    r"rate (cut|hike)|(cuts?|hikes?|raises?|lowers?) (interest|the repo|repo)|repo rate|downgrad|junk status|"
    r"recession|default|crisis|emergency|bailout|shock|sanction|tariff",
    re.I,
)
HIGH = re.compile(
    r"plunge|surge|slump|jump|tumble|rally|record|inflation|\bGDP\b|\bMPC\b|rate decision|budget|"
    r"unemployment|jobs data|downgrad|upgrad|earnings|profit warning|trading statement|results|"
    r"dividend|retrench|strike|shortfall|deficit",
    re.I,
)
MOVE_WORDS = re.compile(r"plunge|surge|soar|tumble|crash|slump|record", re.I)

SA_RE = re.compile(
    r"south africa|\bSARB\b|\bSARS\b|\bJSE\b|(?<!Ayn )\brand\b(?!\s+(Paul|Corporation|McNally))|eskom|transnet|"
    r"national treasury|stats ?sa|godongwana|ramaphosa|sasol|capitec|\babsa\b|nedbank|standard bank|firstrand|"
    r"\bFNB\b|\bMTN\b|vodacom|shoprite|naspers|prosus|anglo american|sibanye|impala|gold fields|johannesburg|"
    r"cape town|durban|pretoria|gauteng|kwazulu|\bB-?BBEE\b|stokvel|\bSRD\b|mzansi|\.co\.za",
    re.I,
)

TOPICS = {
    "rand": r"(?<!Ayn )\brand\b(?!\s+(Paul|Corporation|McNally))|\bZAR\b|USD/ZAR",
    "rates": r"interest rate|repo rate|prime (lending )?rate|\bSARB\b|reserve bank|\bMPC\b|rate (cut|hike)|\bFed\b|federal reserve|central bank|bond yield",
    "inflation": r"inflation|\bCPI\b|\bPPI\b|cost of living|food prices|fuel price|petrol price",
    "stocks": r"\bJSE\b|\bstocks?\b|\bshares?\b|equities|\bALSI\b|Top 40|S&P 500|Nasdaq|Dow Jones|\bFTSE\b|earnings|dividend",
    "gold": r"\bgold\b|Gold Fields|Harmony|Sibanye",
    "platinum": r"platinum|palladium|\bPGMs?\b|Impala|Northam",
    "oil": r"\boil\b|crude|\bBrent\b|\bOPEC\b|petrol|diesel|fuel price|natural gas|\bLNG\b",
    "mining": r"\bmining\b|\bminers?\b|\bcoal\b|iron ore|copper|manganese|chrome|Anglo American|Exxaro|Kumba",
    "banking": r"\bbanks?\b|Capitec|\bAbsa\b|Nedbank|Standard Bank|FirstRand|\bFNB\b|fintech|lender|lending|\bcredit\b",
    "crypto": r"bitcoin|crypto|ethereum|stablecoin|blockchain",
    "trade": r"tariff|trade war|\bexports?\b|\bimports?\b|\bAGOA\b|\bBRICS\b|sanction|trade deal",
    "growth": r"\bGDP\b|recession|economic growth|economy shrinks|\bPMI\b",
    "jobs": r"unemployment|\bjobs?\b|employment|retrench|layoff|learnership",
    "sme": r"\bSMEs?\b|small business|entrepreneur|township|informal (sector|trader)|start-?up|\bSEFA\b|\bSEDA\b",
    "empowerment": r"empowerment|\bB-?BBEE\b|black-owned|transformation|\bNEF\b|\bIDC\b|financial inclusion|stokvel|\bgrant\b|\bSRD\b|social relief",
    "savings": r"\bsavings?\b|stokvel|tax-free|\bTFSA\b|retirement|pension|unit trust|\bETFs?\b",
    "energy": r"load[- ]?shedding|Eskom|electricity|solar|renewable|\benergy\b",
    "tax": r"\bSARS\b|\btax(es)?\b|\bVAT\b|budget speech|Treasury|Godongwana",
    "debt": r"\bdebt\b|\bloans?\b|credit score|debt review|garnish",
    "property": r"\bproperty\b|housing|mortgage|home loan",
    "fraud": r"\bscams?\b|fraud|ponzi|pyramid scheme|\bFSCA\b|investment scam|phishing",
}
TOPICS = {k: re.compile(v, re.I) for k, v in TOPICS.items()}

GROUP_TAGS = {
    "rand": ["rand"], "commodities": ["commodities"], "indices": ["stocks"], "jse": ["stocks"],
    "crypto": ["crypto"], "gauges": [],
}
SYM_TAGS = {
    "GC=F": ["gold"], "GOLD-ZAR": ["gold"], "PL=F": ["platinum"], "PLAT-ZAR": ["platinum"], "PA=F": ["platinum"],
    "BZ=F": ["oil"], "CL=F": ["oil"], "NG=F": ["oil"], "HG=F": ["mining"],
}

STOP = set(
    "the a an of to in for and on with by from is are as at after new how what why its it be "
    "this that over into via says report reports could may will can has have been".split()
)

# Ideas to help South Africans build wealth and opportunity. Matched by rule against this week's news and prices.
# "signal" ties an idea to a price that moved this week (symbol, label, move in % that counts as notable).
IDEAS = [
    {"id": "stokvel-tools", "topics": ["savings", "banking", "empowerment"],
     "title": "Simple, transparent tools for stokvels and savings clubs",
     "action": "Build a shared ledger with contribution reminders and a payout schedule that group members can all see. Pilot it with one real stokvel and ask what they would never trade away. Check FSCA and NASASA guidance before handling any money."},
    {"id": "money-basics", "topics": ["inflation", "rates", "debt", "savings"],
     "title": "Money basics in local languages",
     "action": "Make short audio and WhatsApp explainers on interest rates, debt, budgeting and inflation in isiZulu, isiXhosa, Sesotho and Afrikaans. Use this week's real news as the example so people see why it matters to them."},
    {"id": "sme-funding", "topics": ["sme", "empowerment", "banking"],
     "title": "A plain-language funding map for township and rural businesses",
     "action": "Compile grants, loans and support programmes (SEFA, SEDA, NEF, IDC, YES and municipal programmes) with who qualifies, what to prepare and how long it takes. Keep it current and share it through community groups."},
    {"id": "rand-risk", "topics": ["rand", "trade", "rates"],
     "signal": {"sym": "ZAR=X", "label": "The rand", "thr": 1.0},
     "title": "Rand-risk guide for small importers and exporters",
     "action": "Explain in simple terms how a weaker or stronger rand changes costs, and how forward contracts, invoice currency and timing can protect a small business. Add a calculator that shows the effect on a real invoice."},
    {"id": "beneficiation", "topics": ["gold", "platinum", "mining"],
     "signal": {"sym": "PL=F", "label": "Platinum", "thr": 2.5},
     "title": "Local value from South African minerals",
     "action": "Research and spotlight small manufacturers, jewellers and recyclers that turn gold and platinum-group metals into finished goods, and map how mine suppliers can get on procurement lists in nearby communities."},
    {"id": "first-investing", "topics": ["stocks", "savings"],
     "title": "Beginner investing: tax-free savings, ETFs and fees",
     "action": "Write an independent explainer comparing tax-free savings accounts, index ETFs and their real fees, with a calculator that shows 20-year fee drag. Say clearly that it is education, not advice."},
    {"id": "scam-watch", "topics": ["fraud", "crypto"],
     "title": "Investment-scam warning service",
     "action": "Track fake trading apps, pyramid schemes and crypto scams, check names against the FSCA warning list, and push short alerts to communities and WhatsApp groups before people lose money."},
    {"id": "fuel-energy", "topics": ["oil", "energy", "inflation"],
     "signal": {"sym": "BZ=F", "label": "Brent crude", "thr": 3.0},
     "title": "Fuel and energy cost tools for small businesses",
     "action": "Build a monthly fuel-price outlook and a simple saving plan for taxi owners, couriers and delivery businesses, including the break-even for solar and efficient vehicles."},
    {"id": "youth-income", "topics": ["jobs", "sme", "empowerment"],
     "title": "Pathways from unemployed to first income",
     "action": "Map entry-level work, learnerships and low-cost side businesses near a specific town, with the exact first steps. Pair each with a mentor from a local business."},
    {"id": "food-basket", "topics": ["inflation"],
     "title": "Community food-price tracker",
     "action": "Have volunteers log the price of a basic basket at local shops weekly and publish what changed. It shows real inflation where people shop, and helps households choose where to buy."},
    {"id": "cheap-transfers", "topics": ["rand", "banking"],
     "title": "Cheaper money transfers across Southern Africa",
     "action": "Compare the real cost of sending money to family in SADC countries across banks, apps and agents, including the exchange-rate margin that hides in the fine print. Publish a simple ranking."},
    {"id": "formalise", "topics": ["sme", "tax", "empowerment"],
     "title": "Help informal traders formalise step by step",
     "action": "Write a short guide to registering a business, getting a tax number and opening a business account, with the real costs and the benefits that follow, such as access to credit and tenders."},
]

# ---------------------------------------------------------------- helpers


def iso(dt):
    return dt.astimezone(timezone.utc).strftime(TS_FMT)


def parse_iso(s):
    return datetime.strptime(s, TS_FMT).replace(tzinfo=timezone.utc)


def http_get(url, timeout=25, data=None, headers=None, retries=2):
    h = {"User-Agent": UA, "Accept": "*/*", "Accept-Language": "en-ZA,en;q=0.9"}
    h.update(headers or {})
    last = None
    for attempt in range(retries + 1):
        try:
            req = urllib.request.Request(url, data=data, headers=h)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            last = e
            if e.code in (429, 500, 502, 503, 504) and attempt < retries:
                time.sleep(1.5 * (attempt + 1))
                continue
            raise
        except Exception as e:
            last = e
            if attempt < retries:
                time.sleep(1)
                continue
            raise
    raise last


def clean(text, limit):
    text = re.sub(r"<[^>]+>", " ", text or "")
    text = html.unescape(text)
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) <= limit:
        return text
    return text[: limit - 1].rsplit(" ", 1)[0] + "…"


def norm_url(url):
    try:
        p = urllib.parse.urlsplit(url.strip())
    except ValueError:
        return ""
    q = [(k, v) for k, v in urllib.parse.parse_qsl(p.query)
         if not k.lower().startswith("utm_") and k.lower() not in {"fbclid", "gclid", "ref", "source", "cmpid", "mod", "siteid"}]
    path = p.path.rstrip("/") if len(p.path) > 1 else p.path
    return urllib.parse.urlunsplit((p.scheme, p.netloc.lower(), path, urllib.parse.urlencode(q), ""))


def entry_time(e):
    for k in ("published_parsed", "updated_parsed"):
        t = e.get(k)
        if t:
            return datetime.fromtimestamp(calendar.timegm(t), tz=timezone.utc)
    return None


def item_id(link):
    return hashlib.sha1(link.encode("utf-8")).hexdigest()[:12]


def make_item(src, title, summary, link, published, extra_tags=None):
    title = clean(title, 200)
    summary = clean(summary, 280)
    text = f"{title} {summary}"
    tags = [t for t, rx in TOPICS.items() if rx.search(text)]
    for t in extra_tags or []:
        if t not in tags:
            tags.append(t)
    is_sa = bool(src.get("sa")) or bool(SA_RE.search(text))
    if is_sa:
        tags.insert(0, "sa")
    strong = bool(STRONG.search(text))
    high = bool(HIGH.search(text))
    base = float(src["weight"]) + (3 if strong else 0) + (1.5 if high else 0) + (2 if is_sa else 0)
    if src["category"] == "posts":
        # Public posts are unverified: they show in the Hour stream but never outrank reporting.
        base = float(src["weight"]) + (0.5 if high else 0)
        sev = "normal"
    elif strong and (high or is_sa):
        sev = "critical"
    elif high:
        sev = "high"
    else:
        sev = "normal"
    return {
        "id": item_id(link), "title": title, "summary": "" if summary == title else summary, "link": link,
        "source": src["name"], "category": src["category"], "tags": tags, "severity": sev,
        "base": base, "score": base, "published": iso(published), "also": [],
    }


# ---------------------------------------------------------------- news


def feed_url(src):
    if src.get("gnews"):
        q = urllib.parse.quote_plus(src["gnews"])
        return f"https://news.google.com/rss/search?q={q}&hl=en-ZA&gl=ZA&ceid=ZA:en"
    return src["url"]


def load_feed(src):
    try:
        data = http_get(feed_url(src))
    except Exception as e:  # one broken source must never stop the run
        return src["name"], [], f"{type(e).__name__}: {e}"
    parsed = feedparser.parse(data)
    items = []
    per_entry = bool(src.get("gnews") or src.get("per_entry_source"))
    for e in parsed.entries[: src.get("max", 40)]:
        link = norm_url(e.get("link", ""))
        title = e.get("title", "") or ""
        ts = entry_time(e)
        if not link or not title.strip() or not ts:
            continue
        ts = min(ts, NOW)
        if NOW - ts > timedelta(days=14):
            continue
        summary = e.get("summary", "") or ""
        s = dict(src)
        if per_entry:
            pub = e.get("source")
            if pub and pub.get("title"):
                s["name"] = pub["title"]
                title = re.sub(r"\s+[-–]\s+" + re.escape(pub["title"]) + r"$", "", title)
            summary = ""  # Google News summaries only repeat the headline
        items.append(make_item(s, title, summary, link, ts))
    return src["name"], items, None


def toks(title):
    return {w for w in re.findall(r"[a-z0-9]{3,}", title.lower()) if w not in STOP}


def dedupe(items):
    """Merge duplicate stories. Keeps the highest-base copy and lists the other outlets."""
    items = sorted(items, key=lambda i: i["base"], reverse=True)
    kept, kept_toks = [], []
    for it in items:
        t = toks(it["title"])
        when = parse_iso(it["published"])
        dup = None
        for k, kt in zip(kept, kept_toks):
            if k["link"] == it["link"]:
                dup = k
                break
            if len(t) >= 4 and len(kt) >= 4 and abs((parse_iso(k["published"]) - when).days) < 3:
                if len(t & kt) / len(t | kt) >= 0.6:
                    dup = k
                    break
        if dup is None:
            kept.append(it)
            kept_toks.append(t)
        else:
            for name in [it["source"]] + it["also"]:
                if name != dup["source"] and name not in dup["also"]:
                    dup["also"].append(name)
    for k in kept:
        k["score"] = round(k["base"] + min(len(k["also"]), 3), 2)
    return kept


def load_history():
    p = OUT / "history.json"
    if not p.exists():
        return {}
    try:
        return {i["id"]: i for i in json.loads(p.read_text(encoding="utf-8"))}
    except (ValueError, KeyError):
        return {}


def prune(items):
    """Keep 14 days in full. Older: only the top 10 per day, up to 400 days."""
    out, by_day = [], {}
    for it in items:
        age = NOW - parse_iso(it["published"])
        if age <= timedelta(days=14):
            out.append(it)
        elif age <= timedelta(days=400):
            by_day.setdefault(it["published"][:10], []).append(it)
    for day_items in by_day.values():
        day_items.sort(key=lambda i: i["score"], reverse=True)
        out.extend(day_items[:10])
    return out


def public(it):
    d = {k: v for k, v in it.items() if k != "base"}
    d["also"] = list(it["also"])
    return d


# ---------------------------------------------------------------- market prices


def parse_yahoo(data, cents=False):
    res = data["chart"]["result"][0]
    meta = res.get("meta", {})
    ts = res.get("timestamp") or []
    closes = (res.get("indicators", {}).get("quote") or [{}])[0].get("close") or []
    pts = [(int(t), float(c)) for t, c in zip(ts, closes) if c is not None]
    # JSE shares and ETFs are quoted in cents; index levels and everything else are left alone.
    scale = 0.01 if cents and meta.get("currency") in ("ZAc", "ZAC", "GBp", "GBX") else 1.0
    pts = [(t, c * scale) for t, c in pts]
    price = meta.get("regularMarketPrice")
    price = float(price) * scale if price is not None else (pts[-1][1] if pts else None)
    if price is None or not pts:
        raise ValueError("no price data")
    rmt = meta.get("regularMarketTime") or pts[-1][0]
    # The last candle is usually today's. Previous close is the candle before it.
    if len(pts) >= 2 and abs(pts[-1][0] - rmt) < 86400:
        prev = pts[-2][1]
    else:
        prev = pts[-1][1]
    return {"price": price, "prev": prev, "series": pts, "ts": int(rmt), "src": "yahoo"}


def fetch_yahoo(sym, cents=False):
    last = None
    for host in ("query1.finance.yahoo.com", "query2.finance.yahoo.com"):
        url = f"https://{host}/v8/finance/chart/{urllib.parse.quote(sym)}?range=1y&interval=1d&includePrePost=false"
        try:
            return parse_yahoo(json.loads(http_get(url, retries=1)), cents)
        except Exception as e:
            last = e
    raise last


def fetch_stooq(code):
    text = http_get(f"https://stooq.com/q/d/l/?s={urllib.parse.quote(code)}&i=d", retries=1).decode("utf-8", "replace")
    rows = list(csv.DictReader(io.StringIO(text)))
    pts = []
    for r in rows:
        try:
            d = datetime.strptime(r["Date"], "%Y-%m-%d").replace(tzinfo=timezone.utc)
            pts.append((int(d.timestamp()), float(r["Close"])))
        except (KeyError, ValueError, TypeError):
            continue
    if len(pts) < 2:
        raise ValueError("stooq returned no data")
    pts = pts[-260:]
    return {"price": pts[-1][1], "prev": pts[-2][1], "series": pts, "ts": pts[-1][0], "src": "stooq"}


def pct(a, b):
    return None if not b else round((a - b) / abs(b) * 100, 2)


def pct_since(series, price, days):
    cutoff = series[-1][0] - days * 86400
    base = None
    for t, c in series:
        if t <= cutoff:
            base = c
    return None if base is None else pct(price, base)


def make_quote(inst, raw, stale=False):
    dec = inst.get("dec", 2)
    series = [[int(t), round(c, dec + 2)] for t, c in raw["series"][-260:]]
    price, prev = raw["price"], raw["prev"]
    values = [c for _, c in series] + [price]
    return {
        "sym": inst["sym"], "name": inst["name"], "group": inst["group"], "prefix": inst.get("prefix", ""),
        "suffix": inst.get("suffix", ""), "dec": dec, "note": inst.get("note", ""), "sa": bool(inst.get("sa")),
        "derived": bool(inst.get("a")),
        "price": round(price, dec + 2), "prev": round(prev, dec + 2),
        "chg": round(price - prev, dec + 2), "pct": pct(price, prev) or 0.0,
        "ts": raw["ts"], "w1": pct_since(series, price, 7), "m1": pct_since(series, price, 30),
        "y1": pct(price, series[0][1]) if len(series) > 20 else None,
        "hi": round(max(values), dec + 2), "lo": round(min(values), dec + 2),
        "series": series, "stale": stale, "src": raw.get("src", "yahoo"),
    }


def get_quote(inst):
    errors = []
    try:
        cents = inst["group"] == "jse" or bool(inst.get("cents"))
        return make_quote(inst, fetch_yahoo(inst["sym"], cents)), None
    except Exception as e:
        errors.append(f"yahoo {type(e).__name__}")
    if inst.get("stooq"):
        try:
            return make_quote(inst, fetch_stooq(inst["stooq"])), None
        except Exception as e:
            errors.append(f"stooq {type(e).__name__}")
    return None, f"{inst['sym']}: {', '.join(errors)}"


def derive(spec, quotes):
    a, b = quotes.get(spec["a"]), quotes.get(spec["b"])
    if not a or not b:
        return None
    day = lambda t: t // 86400
    bmap = {day(t): c for t, c in b["series"]}
    series = []
    for t, c in a["series"]:
        rate = bmap.get(day(t))
        if rate:
            series.append((t, c * rate))
    if len(series) < 2:
        return None
    raw = {"price": a["price"] * b["price"], "prev": a["prev"] * b["prev"], "series": series, "ts": max(a["ts"], b["ts"]), "src": "derived"}
    return make_quote(spec, raw, stale=a["stale"] or b["stale"])


def build_markets(previous):
    prev_q = {q["sym"]: q for q in (previous or {}).get("quotes", [])}
    quotes, failures = {}, []
    with ThreadPoolExecutor(max_workers=4) as ex:
        results = list(ex.map(get_quote, CFG["instruments"]))
    for inst, (q, err) in zip(CFG["instruments"], results):
        if q:
            quotes[inst["sym"]] = q
        else:
            failures.append(err)
            old = prev_q.get(inst["sym"])
            if old:  # keep showing the last good price, marked as delayed
                old = dict(old)
                old["stale"] = True
                quotes[inst["sym"]] = old
    for spec in CFG.get("derived", []):
        d = derive(spec, quotes)
        if d:
            quotes[spec["sym"]] = d
        elif spec["sym"] in prev_q:
            old = dict(prev_q[spec["sym"]])
            old["stale"] = True
            quotes[spec["sym"]] = old
    order = [i["sym"] for i in CFG["instruments"]] + [d["sym"] for d in CFG.get("derived", [])]
    ordered = [quotes[s] for s in order if s in quotes]
    fresh = sum(1 for q in ordered if not q["stale"])
    return ordered, failures, fresh


def build_indicators(previous):
    prev = {i["id"]: i for i in (previous or {}).get("indicators", [])}
    fetched = (previous or {}).get("indicators_fetched")
    recent = False
    if fetched:
        try:
            recent = NOW - parse_iso(fetched) < timedelta(hours=20)
        except ValueError:
            recent = False
    if recent and len(prev) >= len(CFG["indicators"]) - 2:
        return [prev[i["id"]] for i in CFG["indicators"] if i["id"] in prev], fetched, []

    out, failures = [], []
    for spec in CFG["indicators"]:
        url = f"https://api.worldbank.org/v2/country/ZAF/indicator/{spec['code']}?format=json&mrnev=1"
        try:
            j = json.loads(http_get(url, retries=1))
            row = j[1][0]
            if row.get("value") is None:
                raise ValueError("no value")
            out.append({"id": spec["id"], "name": spec["name"], "unit": spec["unit"], "dec": spec["dec"],
                        "note": spec["note"], "value": round(float(row["value"]), 3), "year": str(row["date"])})
        except Exception as e:
            failures.append(f"{spec['id']}: {type(e).__name__}")
            if spec["id"] in prev:
                out.append(prev[spec["id"]])
    return out, (iso(NOW) if out else fetched), failures


def mover_items(quotes):
    items = []
    today = NOW.strftime("%Y-%m-%d")
    for spec in CFG["instruments"] + CFG.get("derived", []):
        q = next((x for x in quotes if x["sym"] == spec["sym"]), None)
        if not q or q["stale"]:
            continue
        thr = float(spec.get("move", 5.0))
        if abs(q["pct"]) < thr:
            continue
        up = q["pct"] > 0
        verb = "jumps" if up else "slides"
        value = f"{q['prefix']}{q['price']:,.{q['dec']}f}{q['suffix']}"
        link = f"https://finance.yahoo.com/quote/{urllib.parse.quote(spec.get('a') and spec['a'] or q['sym'])}/?d={today}-{q['sym']}"
        tags = list(GROUP_TAGS.get(q["group"], [])) + list(SYM_TAGS.get(q["sym"], []))
        if q["sa"]:
            tags.insert(0, "sa")
        sev = "critical" if abs(q["pct"]) >= 2 * thr else "high"
        summary = f"{q['note']}. Now {value}, {q['pct']:+.2f}% on the day."
        if q["m1"] is not None:
            summary += f" Over the past month: {q['m1']:+.1f}%."
        items.append({
            "id": item_id(link), "title": f"{q['name']} {verb} {abs(q['pct']):.1f}% to {value}", "summary": summary,
            "link": link, "source": "Market move", "category": "markets", "tags": list(dict.fromkeys(tags)),
            "severity": sev, "base": 6 + abs(q["pct"]) / thr, "score": 6 + abs(q["pct"]) / thr,
            "published": iso(NOW), "also": [],
        })
    return items


# ---------------------------------------------------------------- views


def build_sa_ideas(week_items, quotes):
    sa_items = [i for i in week_items if "sa" in i["tags"]]
    qmap = {q["sym"]: q for q in quotes}
    scored = []
    for idea in IDEAS:
        topics = set(idea["topics"])
        hits_sa = sorted((i for i in sa_items if topics & set(i["tags"])), key=lambda i: i["score"], reverse=True)
        hits_all = sorted((i for i in week_items if topics & set(i["tags"])), key=lambda i: i["score"], reverse=True)
        weight = 3 * len(hits_sa) + len(hits_all)
        why = (f"{len(hits_sa)} South African and {len(hits_all)} total stories this week touch this area."
               if weight else "Evergreen idea (no matching stories this week).")
        sig = idea.get("signal")
        if sig and sig["sym"] in qmap and qmap[sig["sym"]].get("w1") is not None:
            move = qmap[sig["sym"]]["w1"]
            if abs(move) >= sig["thr"]:
                weight += 6
                why = f"{sig['label']} moved {move:+.1f}% over the past week. " + why
        ev = (hits_sa or hits_all or [None])[0]
        scored.append((weight, {
            "id": idea["id"], "title": idea["title"], "action": idea["action"], "why": why,
            "evidence_title": ev["title"] if ev else "", "evidence_link": ev["link"] if ev else "",
            "signal": len(hits_sa),
        }))
    scored.sort(key=lambda x: x[0], reverse=True)
    return [i for w, i in scored[:6]]


def build_windows(items):
    def within(hours):
        cutoff = NOW - timedelta(hours=hours)
        return [i for i in items if parse_iso(i["published"]) >= cutoff]

    by_time = lambda i: i["published"]
    by_score = lambda i: (i["score"], i["published"])
    hour = sorted(within(3), key=by_time, reverse=True)[:40]
    day = sorted(within(24), key=by_score, reverse=True)[:60]
    week_all = within(24 * 7)
    week = sorted(week_all, key=by_score, reverse=True)[:80]
    year = sorted(within(24 * 365), key=by_score, reverse=True)[:120]
    return hour, day, week, year, week_all


def headlines(hour, day, limit=8):
    rank = lambda i: {"critical": 2, "high": 1}.get(i["severity"], 0)
    seen, fresh = set(), []
    for i in hour + day:
        if i["category"] == "posts" or i["id"] in seen:
            continue
        if NOW - parse_iso(i["published"]) < timedelta(hours=12):
            seen.add(i["id"])
            fresh.append(i)
    fresh.sort(key=lambda i: (rank(i), i["published"]), reverse=True)
    fill = [i for i in sorted(day, key=lambda i: i["score"], reverse=True) if i["id"] not in seen]
    return (fresh + fill)[:limit]


# ---------------------------------------------------------------- ntfy push (optional)


def ascii_header(s):
    return s.encode("ascii", "ignore").decode()[:120] or "RandPulse alert"


def push_alerts(items):
    topic = os.environ.get("NTFY_TOPIC", "").strip()
    p = OUT / "notified.json"
    first_run = not p.exists()
    try:
        seen = json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}
    except ValueError:
        seen = {}
    cutoff = NOW - timedelta(hours=3)
    fresh = [i for i in items
             if i["severity"] == "critical" and i["category"] != "posts"
             and parse_iso(i["published"]) >= cutoff and i["id"] not in seen]
    fresh.sort(key=lambda i: i["score"], reverse=True)
    sent = 0
    for it in fresh:
        seen[it["id"]] = iso(NOW)
        if first_run or not topic or sent >= 5:
            continue  # the first run only records, so you are not flooded
        try:
            http_get(
                f"https://ntfy.sh/{urllib.parse.quote(topic)}",
                data=(it["summary"] or it["title"]).encode("utf-8"),
                headers={"Title": ascii_header(it["title"]), "Click": it["link"], "Priority": "high",
                         "Tags": "chart_with_upwards_trend" + (",flag-za" if "sa" in it["tags"] else "")},
                retries=0,
            )
            sent += 1
        except Exception as e:
            print(f"ntfy failed: {e}", file=sys.stderr)
    seen = {k: v for k, v in seen.items() if parse_iso(v) > NOW - timedelta(days=14)}
    p.write_text(json.dumps(seen), encoding="utf-8")
    return sent


# ---------------------------------------------------------------- main


def load_previous():
    p = OUT / "feed.json"
    if not p.exists():
        return {}
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except ValueError:
        return {}


def run():
    previous = load_previous()
    prev_markets = previous.get("markets") or {}

    failed, ok, new_items = [], [], []
    with ThreadPoolExecutor(max_workers=8) as ex:
        for name, items, err in ex.map(load_feed, CFG["feeds"]):
            if err:
                failed.append(f"{name}: {err}")
            else:
                ok.append(name)
                new_items.extend(items)

    quotes, quote_failures, fresh_quotes = build_markets(prev_markets)
    indicators, indicators_fetched, ind_failures = build_indicators(prev_markets)

    print(f"news sources ok: {len(ok)}, failed: {len(failed)}, items: {len(new_items)}")
    print(f"prices fresh: {fresh_quotes}/{len(quotes)}, price failures: {len(quote_failures)}, indicators: {len(indicators)}")
    for f in failed + quote_failures + ind_failures:
        print("  FAILED", f, file=sys.stderr)

    if not new_items and fresh_quotes == 0 and not (OUT / "history.json").exists():
        print("nothing fetched and no earlier data", file=sys.stderr)
        sys.exit(1)

    new_items.extend(mover_items(quotes))

    history = load_history()
    for it in new_items:
        old = history.get(it["id"])
        if old:
            it["also"] = sorted(set(it["also"]) | set(old.get("also", [])))
            it["published"] = old["published"]  # keep the time the story was first seen
        history[it["id"]] = it

    recent_cut = NOW - timedelta(days=10)
    recent = [i for i in history.values() if parse_iso(i["published"]) >= recent_cut]
    older = [i for i in history.values() if parse_iso(i["published"]) < recent_cut]
    merged = prune(dedupe(recent) + older)

    hour, day, week, year, week_all = build_windows(merged)
    sent = push_alerts(merged)

    feed = {
        "generated_at": iso(NOW),
        "hour": [public(i) for i in hour], "day": [public(i) for i in day],
        "week": [public(i) for i in week], "year": [public(i) for i in year],
        "sa_ideas": build_sa_ideas(week_all, quotes),
        "reports": CFG.get("reports", []),
        "markets": {"updated": iso(NOW), "quotes": quotes, "indicators": indicators, "indicators_fetched": indicators_fetched},
        "stats": {"sources_ok": len(ok), "sources_failed": [f.split(":")[0] for f in failed],
                  "prices_fresh": fresh_quotes, "prices_total": len(quotes), "history_items": len(merged)},
    }
    (OUT / "feed.json").write_text(json.dumps(feed, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (OUT / "history.json").write_text(json.dumps(merged, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    key = ["ZAR=X", "GC=F", "PL=F", "BZ=F", "^J203.JO", "^GSPC", "GOLD-ZAR"]
    widget = {
        "generated_at": iso(NOW),
        "quotes": [{k: q[k] for k in ("sym", "name", "prefix", "suffix", "dec", "price", "pct", "stale")}
                   for s in key for q in quotes if q["sym"] == s],
        "headlines": [{k: i[k] for k in ("title", "source", "severity", "published", "link")} for i in headlines(hour, day)],
    }
    (OUT / "widget.json").write_text(json.dumps(widget, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"wrote feed: hour={len(hour)} day={len(day)} week={len(week)} year={len(year)} "
          f"quotes={len(quotes)} ideas={len(feed['sa_ideas'])} pushed={sent}")


if __name__ == "__main__":
    run()
