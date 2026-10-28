"""Build the Patterns by Rish website.

Data comes from three places, in this order:
  data/listings.json      Etsy listings (sync_etsy.py), or data/sample_listings.json when there is no Etsy key
  content/site.json       default banners, sale, sections; data/admin_content.json overrides it (admin panel)
  content/blog/*.md       blog posts; data/admin_posts.json adds the posts written in the admin panel

    python build.py              -> production build in dist/ (clean URLs like /pattern/name/)
    python build.py --preview    -> same pages, but links point at index.html files so it opens from disk
"""
import csv, hashlib, html, json, os, re, shutil, sys
from datetime import datetime, timedelta, timezone, date
from decimal import Decimal, ROUND_HALF_UP
from zoneinfo import ZoneInfo
import markdown
import studio
from jinja2 import Environment, FileSystemLoader, select_autoescape

ROOT = os.path.dirname(os.path.abspath(__file__))
CFG = json.load(open(os.path.join(ROOT, "site.config.json"), encoding="utf-8"))
PREVIEW = "--preview" in sys.argv
DIST = os.path.join(ROOT, "dist")


def load(path, default=None):
    p = os.path.join(ROOT, path)
    return json.load(open(p, encoding="utf-8")) if os.path.exists(p) else default


DATA = load("data/listings.json") or load("data/sample_listings.json")
CONTENT = load("content/site.json", {})
CONTENT.update({k: v for k, v in (load("data/admin_content.json", {}) or {}).items() if v not in (None, "")})

SITE_URL = (os.environ.get("SITE_URL") or CFG.get("site_url") or "").rstrip("/")
if CFG.get("custom_domain"):
    SITE_URL = "https://" + CFG["custom_domain"]

CATS = {  # slug: (name, intro used on the category page and for SEO, tint)
    "dresses": ("Dresses", "Maxi, midi and mini dress sewing patterns: linen summer dresses, tea dresses, wrap dresses, cottagecore styles and evening gowns.", "blush"),
    "tops": ("Tops & blouses", "Tank tops, crop tops, peplum tops, bishop sleeve blouses and knit tops you can sew in an afternoon.", "sky"),
    "bottoms": ("Skirts & pants", "Maxi, mini, circle and trumpet skirts, wide leg trousers, palazzo pants, shorts and flare jeans.", "butter"),
    "jumpsuits": ("Jumpsuits", "Wide leg, palazzo and one-shoulder jumpsuit and romper sewing patterns.", "lilac"),
    "plus-size": ("Plus size", "Dresses, trousers and tops drafted with real room through the bust, waist and hips, up to 5XL.", "mint"),
    "mens": ("Men", "Linen shirts, tees, trousers, shorts and hoodies for men, including plus size.", "sky"),
    "hoodies": ("Hoodies & sweatshirts", "Cosy hoodie and sweatshirt sewing patterns in knit fabric.", "lilac"),
    "kids": ("Kids", "Dresses for girls aged 2 to 16, including mother and daughter matching sets.", "butter"),
    "bundles": ("Bundles", "Matching sets and pattern bundles that cost less than buying each pattern on its own.", "mint"),
}
SECTION_TO_CAT = [("plus size", "plus-size"), ("mens", "mens"), ("men", "mens"), ("dress", "dresses"), ("top", "tops"),
                  ("bottom", "bottoms"), ("skirt", "bottoms"), ("pant", "bottoms"), ("jumpsui", "jumpsuits"),
                  ("hood", "hoodies"), ("sweat", "hoodies"), ("kid", "kids"), ("child", "kids"), ("bundle", "bundles")]
KIND_WORDS = [("bundle", r"bundle|\d.in.1|wholeshop|mother daughter"), ("jumpsuit", r"jumpsuit|romper|overall"),
              ("hoodie", r"hoodie|sweatshirt"), ("vest", r"\bvest|corset"), ("mens-shirt", r"\bmen'?s?\b.*(shirt|tee)"),
              ("dress", r"dress|gown|abaya|kaftan|pinafore|sundress"), ("skirt", r"skirt"),
              ("pants", r"trouser|pants|palazzo|\bshorts\b|jeans|capri|chino"), ("top", r"\btops?\b|blouse|camisole|tank|\btee\b|t-shirt|t shirt|shirt|peplum")]
KIND_CAT = {"dress": "dresses", "top": "tops", "vest": "tops", "shirt": "tops", "skirt": "bottoms", "pants": "bottoms",
            "jumpsuit": "jumpsuits", "hoodie": "hoodies", "bundle": "bundles"}
SIZE = r"\b(XXS|XS|S|M|L|XL|XXL|[2-6]XL)\b"
SIZE_ANY = r"(?:XXS|XS|S|M|L|XL|XXL|[2-6]XL)"
JUNK = r"\b(PDF|Sewing Patterns?|Patterns?|DIY|Digital Download|Instant Download|Printable)\b"


def kind_of(text):
    for chunk in ([text] if isinstance(text, str) else text):
        t = chunk.lower()
        for k, rx in KIND_WORDS:
            if re.search(rx, t):
                return "shirt" if k == "mens-shirt" else k
    return "dress"


def slugify(s, n=8):
    return "-".join(re.sub(r"[^a-z0-9]+", " ", s.lower()).split()[:n]) or "pattern"


def parts(title):
    """'Linen Dress Pattern | Boatneck A-Line Tea Dress | XS-5XL PDF' -> ('Linen Dress', 'Boatneck A-Line Tea Dress')."""
    out = []
    for s in re.split(r"\s[|]\s|,|\(|\)", title):
        c = re.sub(JUNK, "", s, flags=re.I)
        c = re.sub(r"\b" + SIZE_ANY + r"\s*(?:-|–|to)\s*" + SIZE_ANY + r"\b", "", c)
        c = re.sub(r"\s{2,}", " ", c).strip(" -–|,&:")
        if c and len(c) > 2 and not re.fullmatch(r"(ages?\s*[\d\- ]+|natural waist|summer sewing)", c, flags=re.I):
            out.append(c)
    return (out[0] if out else title), (out[1] if len(out) > 1 else "")


def size_range(text):
    m = re.search(SIZE + r"\s*(?:-|–|to)\s*" + SIZE, text)
    if m:
        return f"{m.group(1)} to {m.group(2)}"
    m = re.search(r"\bAges?\s*(\d{1,2})\s*(?:-|–|to)\s*(\d{1,2})\b", text, flags=re.I)
    return f"Ages {m.group(1)} to {m.group(2)}" if m else ""


def formats(text):
    t = text.upper()
    return [f for f, k in [("A4", "A4"), ("US Letter", "US LETTER"), ("A0 copy shop", "A0"), ("Projector", "PROJECTOR")] if k in t]


SYM = {"USD": "$", "GBP": "£", "EUR": "€", "CAD": "CA$", "AUD": "A$"}


def money(v, cur):
    s = SYM.get(cur, "")
    return f"{s}{v:,.2f}" if s else f"{v:,.2f} {cur}"


def para(desc):
    """Etsy plain-text description -> safe HTML blocks."""
    out, items = [], []

    def flush():
        if items:
            out.append("<ul>" + "".join(f"<li>{i}</li>" for i in items) + "</ul>"); items.clear()
    for raw in desc.replace("\r", "").split("\n"):
        line = raw.strip()
        if line.endswith(":") and len(line) < 60:
            flush(); out.append(f"<h3>{html.escape(line[:-1])}</h3>"); continue
        b = re.match(r"^([•\-*✔✓✅☑►▶➤→◆♦★☆✨🔹🔸💗🌸]+)\s*(.+)", line)
        if b:
            items.append(html.escape(b.group(2))); continue
        flush()
        if line:
            out.append(f"<p>{html.escape(line)}</p>")
    flush()
    return "\n".join(out)


TINTS = ["blush", "butter", "mint", "sky", "lilac"]
NOW = int(datetime.now(timezone.utc).timestamp())
hidden = {str(i) for i in CONTENT.get("hidden_ids") or []}
sections = {s["shop_section_id"]: s["title"] for s in DATA.get("sections", [])}
products = []
for l in DATA["listings"]:
    title = html.unescape(l["title"])
    desc_body = html.unescape(l.get("description") or "")
    first = desc_body.strip().split("\n", 1)
    if first and first[0].strip() == title.strip():
        desc_body = first[1] if len(first) > 1 else ""
    full = title + " " + desc_body
    sec = sections.get(l.get("shop_section_id"), "")
    head, detail = parts(title)
    kind = "bundle" if re.search(r"\bbundle\b|\d.in.1", title, flags=re.I) else kind_of([head, detail, title])
    cats = []
    for key, cat in SECTION_TO_CAT:
        if key in sec.lower():
            cats.append(cat); break
    if KIND_CAT.get(kind) and KIND_CAT[kind] not in cats:
        cats.append(KIND_CAT[kind])
    if "plus size" in title.lower() and "plus-size" not in cats:
        cats.append("plus-size")
    if re.search(r"\bmen'?s?\b", head.lower()) and "mens" not in cats:
        cats.append("mens")
    lid = l["listing_id"]
    pr = l.get("price") or {"amount": 0, "divisor": 100, "currency_code": "USD"}
    bp = l.get("buyer_price") or {}
    orig = bp.get("original_price") or pr
    base_v = Decimal(orig["amount"]) / Decimal(orig.get("divisor") or 100)
    cur = orig.get("currency_code", "USD")
    sale = None
    if bp.get("has_discount") and bp.get("discounted_price") and (bp.get("discount_end_epoch") or 0) > NOW:
        dp = bp["discounted_price"]
        sale = dict(price=Decimal(dp["amount"]) / Decimal(dp.get("divisor") or 100), off=int(bp.get("discount_percentage") or 0),
                    start=int(bp.get("discount_start_epoch") or 0), end=int(bp.get("discount_end_epoch") or 0))
    sale_v = sale["price"] if sale else base_v
    desc_plain = re.sub(r"\s+", " ", desc_body).strip()
    products.append(dict(
        id=lid, title=title, name=(f"{head}: {detail}" if detail else head), short=head, sub=detail,
        slug=f"{slugify(head + ' ' + detail, 9)}-{lid}", kind=kind, cats=cats, cat=cats[0] if cats else "dresses", section=sec,
        etsy=l.get("url") or f"https://www.etsy.com/listing/{lid}", currency=cur,
        price=money(sale_v, cur), price_value=float(sale_v), was=money(base_v, cur) if sale else "", off=sale["off"] if sale else 0,
        orig=money(base_v, cur), orig_value=float(base_v), sale_start=sale["start"] if sale else 0, sale_end=sale["end"] if sale else 0,
        images=l.get("images") or [], sizes=size_range(full), formats=formats(full), tags=list(l.get("tags") or []),
        desc_html=para(desc_body), created=l.get("original_creation_timestamp") or 0, favs=l.get("num_favorers") or 0,
        meta=(desc_plain[:155].rsplit(" ", 1)[0] + "…") if len(desc_plain) > 155 else (desc_plain or f"{head}. {detail}. Printable PDF sewing pattern with instant download from Etsy."),
        tint=TINTS[int(hashlib.md5(str(lid).encode()).hexdigest(), 16) % len(TINTS)], plus="plus-size" in cats,
        hidden=str(lid) in hidden,
    ))
products.sort(key=lambda p: -p["created"])
every = products  # the admin panel lists hidden patterns too
products = [p for p in products if not p["hidden"]]
by_id = {str(p["id"]): p for p in products}
from collections import Counter
_sales = Counter((p["off"], p["sale_end"]) for p in products if p["off"])
SALE_INFO = None
if _sales:
    (off, end), n = _sales.most_common(1)[0]
    SALE_INFO = dict(off=off, end=end, start=next(p["sale_start"] for p in products if p["off"] == off and p["sale_end"] == end),
                     every=n == len(products), count=n)
featured = [by_id[str(i)] for i in CONTENT.get("featured_ids") or [] if str(i) in by_id]
by_cat = {c: [p for p in products if c in p["cats"]] for c in CATS}
for c in by_cat:  # featured patterns lead their categories
    by_cat[c].sort(key=lambda p: (p not in featured,))
cat_text = CONTENT.get("category_text") or {}
CAT_ICON = {"dresses": "dress", "tops": "top", "bottoms": "skirt", "jumpsuits": "jumpsuit", "plus-size": "curvy", "mens": "shirt",
            "hoodies": "hoodie", "kids": "kids", "bundles": "bundle"}
cat_list = [dict(slug=c, icon=CAT_ICON.get(c, "dress"), name=CATS[c][0], intro=cat_text.get(c) or CATS[c][1], tint=CATS[c][2], count=len(by_cat[c]),
                 kind=next((p["kind"] for p in by_cat[c] if p["kind"] != "bundle"), "bundle" if c == "bundles" else "dress"),
                 photos=[p["images"][0] for p in by_cat[c] if p["images"]][:4])
            for c in CATS if by_cat[c]]
cat_by = {c["slug"]: c for c in cat_list}
shop = DATA.get("shop") or {}

# ---------- sewing worlds: patterns grouped by vibe, not by Etsy section ----------
WORLDS = []
for w in load("content/worlds.json", []):
    keys = [k.lower() for k in w["match"]]
    items = [p for p in products if any(k in (" " + p["title"].lower() + " " + " ".join(p["tags"]).lower() + " ") for k in keys)]
    if w["slug"] == "for-him":
        items = [p for p in products if "mens" in p["cats"]]
    if w["slug"] == "curvy-confident":
        items = [p for p in products if "plus-size" in p["cats"]]
    if w["slug"] == "bundle-deals":
        items = [p for p in products if "bundles" in p["cats"]]
    if len(items) >= 3:
        WORLDS.append(dict(w, items=items, count=len(items), photos=[p["images"][0] for p in items if p["images"]][:3]))


def resolve_slides():
    out = []
    for s in CONTENT.get("hero_slides") or []:
        picks = [by_id[str(i)] for i in s.get("product_ids") or [] if str(i) in by_id]
        if len(picks) < 3 and s.get("category") in by_cat:
            picks += [p for p in by_cat[s["category"]] if p not in picks and p["images"]][: 3 - len(picks)]
        if len(picks) < 3:
            picks += [p for p in products if p not in picks and p["images"]][: 3 - len(picks)]
        out.append(dict(s, picks=picks[:3], image=s.get("image") or ""))
    return out


# ---------- blog ----------
def front_matter(text):
    meta, body = {}, text
    if text.startswith("---"):
        _, fm, body = text.split("---", 2)
        for line in fm.strip().splitlines():
            k, _, v = line.partition(":")
            meta[k.strip()] = v.strip().strip('"')
    return meta, body


posts = []
md = markdown.Markdown(extensions=["extra", "toc", "sane_lists"])
blog_dir = os.path.join(ROOT, "content", "blog")
src = [(f, open(os.path.join(blog_dir, f), encoding="utf-8").read()) for f in sorted(os.listdir(blog_dir)) if f.endswith(".md")] if os.path.isdir(blog_dir) else []
for f, text in src:
    meta, body = front_matter(text)
    md.reset()
    posts.append(dict(slug=meta.get("slug") or f[:-3], title=meta.get("title", f[:-3]), description=meta.get("description", ""),
                      date=meta.get("date", "2026-10-27"), category=meta.get("category", ""), cover=meta.get("cover", ""),
                      tag=meta.get("tag", "Guide"), html=md.convert(body), toc=md.toc_tokens, words=len(body.split())))
admin_posts = load("data/admin_posts.json")
if admin_posts is not None:  # once the admin panel is set up, it is the only source of posts
    posts = []
for a in admin_posts or []:
    if a.get("published"):
        md.reset()
        posts = [p for p in posts if p["slug"] != a["slug"]]
        posts.append(dict(slug=a["slug"], title=a["title"], description=a.get("description", ""), date=(a.get("date") or "")[:10],
                          category=a.get("category", ""), cover=a.get("cover", ""), tag=a.get("tag") or "Guide",
                          html=md.convert(a.get("body", "")), toc=md.toc_tokens, words=len(a.get("body", "").split())))
for p in posts:
    if not p["cover"]:  # use a pattern photo from the post's category
        pick = next((q for q in by_cat.get(p["category"], products) if q["images"]), None)
        p["cover"] = pick["images"][0]["full"] if pick else ""
    p["related"] = by_cat.get(p["category"], products)[:4]
    p["minutes"] = max(2, round(p["words"] / 220))
    try:
        p["nice_date"] = date.fromisoformat(p["date"]).strftime("%-d %B %Y")
    except ValueError:
        p["nice_date"] = p["date"]
posts.sort(key=lambda p: p["date"], reverse=True)

FAQS = [
    ("How do I get my pattern after I buy it?", "Right after checkout, Etsy shows a download button on the order page. You can also find it any time under You, then Purchases and reviews, on etsy.com or in the Etsy app. Etsy emails you a link too."),
    ("Do you post a paper pattern?", "No. Every pattern is a digital PDF, so nothing is shipped. That also means there are no postage costs or customs waits, wherever you live."),
    ("Can I buy from outside the US?", "Yes. Etsy shows prices in your currency and accepts cards and PayPal in most countries. The download works the same everywhere."),
    ("What do I need to print it?", "A home printer with A4 or US Letter paper. Print at 100 percent or actual size, never fit to page. You can also take the A0 file to a copy shop and get the whole pattern on a few large sheets."),
    ("How do I pick my size?", "Measure your bust, waist and hips with a soft tape and compare them with the size chart in the pattern. If you sit between two sizes, trace the larger one and take it in at the side seams."),
    ("Can I return a pattern?", "Digital files download instantly, so they can't be returned. If a file won't open or something looks wrong, message us through Etsy and we'll help you sort it out."),
]

KIT = [  # the "sewing kit" section; links go to the blog guide
    ("fabric", "Fabric", "Each pattern lists how much you need. Wash and dry it before cutting, linen shrinks."),
    ("scissors", "Fabric scissors", "Keep one sharp pair just for fabric. Paper blunts them fast."),
    ("tape", "Measuring tape", "A soft 150 cm (60 in) tape for your bust, waist and hips, and for checking the printed test square."),
    ("pins", "Pins and clips", "Hold the paper pieces to the fabric and the seams together before you sew."),
    ("thread", "Thread", "All-purpose polyester thread in a matching colour works for most woven and knit fabrics."),
    ("paper", "Tape and paper", "Clear tape to join the printed pages. Tracing paper if you want to keep the other sizes."),
]

# ---------- rendering ----------
env = Environment(loader=FileSystemLoader(os.path.join(ROOT, "templates")), autoescape=select_autoescape(["html", "xml"]),
                  trim_blocks=True, lstrip_blocks=True)
from markupsafe import Markup, escape as _esc
env.filters["accent"] = lambda t: Markup(re.sub(r"\*(.+?)\*", r'<em class="acc">\1</em>', str(_esc(t or ""))))
env.globals["reels"] = json.load(open(os.path.join(ROOT, "content", "reels.json"))) if os.path.exists(os.path.join(ROOT, "content", "reels.json")) else []
import hashlib as _h
env.globals["ver"] = _h.md5(b"".join(open(os.path.join(ROOT, "static", f), "rb").read() for f in sorted(os.listdir(os.path.join(ROOT, "static"))) if f.endswith((".css", ".js")))).hexdigest()[:8]
env.filters["isodate"] = lambda ts: datetime.fromtimestamp(int(ts), timezone.utc).date().isoformat()


def render(path, template, **ctx):
    depth = path.count("/")
    prefix = "../" * depth
    if path == "404.html" and not PREVIEW:
        from urllib.parse import urlparse
        prefix = (urlparse(SITE_URL).path.rstrip("/") + "/") if SITE_URL else "/"

    def u(target=""):
        if target.startswith("http"):
            return target
        if PREVIEW:
            return prefix + (target + "index.html" if target == "" or target.endswith("/") else target)
        return (prefix + target) if prefix else (target or "./")

    def canon(target=path):
        return (SITE_URL + "/" + target) if SITE_URL else ""

    out = env.get_template(template).render(u=u, canon=canon, path=path, cfg=CFG, shop=shop, cats=cat_list, cat_by=cat_by, catmap=CATS,
                                            content=CONTENT, sale=SALE_INFO, worlds_nav=WORLDS, year=datetime.now().year, sample=DATA.get("sample"), posts=posts, **ctx)
    dest = os.path.join(DIST, path, "index.html") if not path.endswith(".html") else os.path.join(DIST, path)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    open(dest, "w", encoding="utf-8").write(out)


def redirect(path, target):
    to = (SITE_URL + "/" + target) if SITE_URL else ("../" * path.count("/") + target)
    dest = os.path.join(DIST, path, "index.html")
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    open(dest, "w").write(f'<!doctype html><meta charset="utf-8"><title>Moved</title><link rel="canonical" href="{to}">'
                          f'<meta http-equiv="refresh" content="0; url={to}"><a href="{to}">This page has moved</a>')


def main():
    shutil.rmtree(DIST, ignore_errors=True)
    shutil.copytree(os.path.join(ROOT, "static"), os.path.join(DIST, "static"))
    if os.path.isdir(os.path.join(ROOT, "admin")):
        shutil.copytree(os.path.join(ROOT, "admin"), os.path.join(DIST, "admin"))
        open(os.path.join(DIST, "admin", "config.js"), "w").write("window.SITE = " + json.dumps(dict(
            url=CFG.get("supabase_url", ""), key=CFG.get("supabase_key", ""), repo=CFG.get("github_repo", ""),
            cats=[dict(slug=c["slug"], name=c["name"]) for c in cat_list], defaults=load("content/site.json", {}))) + ";\n")
    sold = shop.get("transaction_sold_count") or 0
    stats = dict(sold=(f"{sold // 100 * 100:,}+" if sold >= 1000 else str(sold)) if sold else "",
                 rating=shop.get("review_average"), reviews=shop.get("review_count"), count=len(products))
    catalog = [dict(id=p["id"], s=p["slug"], n=p["short"], d=p["sub"], c=p["cats"], p=p["price_value"], pr=p["price"], w=p["was"],
                    t=p["created"], z=p["sizes"], i=(p["images"][0]["medium"] or p["images"][0]["full"]) if p["images"] else "",
                    k=(p["title"] + " " + " ".join(p["tags"])).lower()) for p in products]
    os.makedirs(os.path.join(DIST, "static"), exist_ok=True)
    json.dump(catalog, open(os.path.join(DIST, "static", "catalog.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))

    os.makedirs(os.path.join(DIST, "tools"), exist_ok=True)
    json.dump([dict(id=p["id"], n=p["short"], d=p["sub"], c=p["cats"], pr=p["price"], h=p["hidden"], s=p["slug"],
                    i=(p["images"][0]["medium"] or p["images"][0]["full"]) if p["images"] else "") for p in every],
              open(os.path.join(DIST, "tools", "listings.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    json.dump(dict(built=datetime.now(timezone.utc).isoformat(timespec="seconds"), synced=DATA.get("synced_at"), patterns=len(products),
                   hidden=len(every) - len(products), posts=len(posts), sample=bool(DATA.get("sample"))),
              open(os.path.join(DIST, "tools", "build.json"), "w"))
    # where the model photo and the sketch sit inside each listing image (measured by looks.py)
    CROPS = load("content/look_crops.json") or {}
    def photo_box(box):
        # the model sits in an arch on the left half; never let the crop run into the flat drawings beside it
        if not box:
            return None
        x0, y0, x1, y1 = box
        if x1 > .53:
            x1 = .505
        if y1 - y0 < .5:
            return None
        return (x0, y0, x1, y1)
    def crop_style(box, default):
        x0, y0, x1, y1 = box or default
        w, h = max(.05, x1 - x0), max(.05, y1 - y0)
        return f"--ar: {w / h:.4f}; --iw: {100 / w:.2f}%; --il: {-x0 / w * 100:.2f}%; --it: {-y0 / h * 100:.2f}%"
    # the runway: one model look per pattern, mixed across categories
    FABRIC_HINT = [("linen", "Linen", "linen"), ("satin", "Satin", "satin"), ("slip", "Satin", "satin"), ("wedding", "Crepe or satin", "crepe"),
                   ("gown", "Crepe or satin", "crepe"), ("jean", "Denim", "denim"), ("denim", "Denim", "denim"), ("hoodie", "French terry", "french-terry"),
                   ("sweatshirt", "French terry", "french-terry"), ("knit", "Cotton jersey", "cotton-jersey"), ("raglan", "Cotton jersey", "cotton-jersey"),
                   ("tee", "Cotton jersey", "cotton-jersey"), ("gingham", "Gingham", "gingham"), ("shirt", "Cotton poplin", "cotton-poplin"),
                   ("blouse", "Cotton voile", "cotton-voile"), ("maxi", "Rayon challis", "rayon-challis"), ("skirt", "Rayon challis", "rayon-challis")]
    def fabric_for(p):
        t = (p["title"] + " " + p["short"]).lower()
        for k, name, slug in FABRIC_HINT:
            if k in t:
                return name, slug
        return "Cotton poplin or linen", "cotton-poplin"
    pools = [[p for p in by_cat[c["slug"]] if p["images"] and p["kind"] != "bundle"] for c in cat_list if c["slug"] not in ("bundles",)]
    runway, seen = [], set()
    while len(runway) < 18 and any(pools):
        for pool in pools:
            while pool and pool[0]["id"] in seen:
                pool.pop(0)
            if pool and len(runway) < 18:
                x = pool.pop(0); seen.add(x["id"])
                fn, fs = fabric_for(x)
                ph = x["images"][0]
                sk = x["images"][2] if len(x["images"]) > 2 else None
                runway.append(dict(p=x, fabric=fn, fabric_slug=fs, n=len(runway) + 1,
                                   photo=ph["medium"] or ph["full"], photo_big=ph["full"] or ph["medium"],
                                   photo_box=crop_style(photo_box(CROPS.get(ph["medium"] or ph["full"])), (0.008, 0.085, 0.505, 0.93)),
                                   sketch=(sk["medium"] or sk["full"]) if sk else "",
                                   sketch_box=crop_style(None, (0.0, 0.115, 0.53, 0.985))))
    order = [s for s in CONTENT.get("home_rows") or [] if s in cat_by]
    order += [c["slug"] for c in cat_list if c["slug"] not in order and c["slug"] != "bundles"]
    rows = [dict(c=cat_by[s], picks=by_cat[s][:12]) for s in order if by_cat.get(s)]
    render("", "index.html", st=studio.data(), slides=resolve_slides(), products=products, newest=(featured + [p for p in products if p not in featured])[:8],
           stats=stats, rows=rows, runway=runway, kit=KIT, bundles=by_cat.get("bundles", [])[:4], faqs=FAQS[:4])
    render("patterns/", "list.html", items=products, current=None, heading="All sewing patterns",
           intro=f"Every pattern in the shop, newest first. {len(products)} printable PDF patterns, each with an instant download on Etsy.")
    for c in cat_list:
        h = {"plus-size": "Plus size sewing patterns", "bundles": "Sewing pattern bundles", "kids": "Kids sewing patterns",
             "mens": "Men's sewing patterns"}.get(c["slug"], f"{c['name']} sewing patterns")
        render(f"category/{c['slug']}/", "list.html", items=by_cat[c["slug"]], current=c["slug"], heading=h, intro=c["intro"])
    for p in products:
        related = [q for q in by_cat.get(p["cat"], []) if q["id"] != p["id"]][:8]
        guide = next((b for b in posts if b["category"] == p["cat"]), posts[0] if posts else None)
        render(f"pattern/{p['slug']}/", "product.html", p=p, related=related, guide=guide, faqs=FAQS)
    render("worlds/", "worlds.html", worlds=WORLDS)
    for w in WORLDS:
        render(f"worlds/{w['slug']}/", "list.html", items=w["items"], current=None, world=w, heading=w["name"], intro=w["intro"])
    render("answers/", "answers.html", answers=load("content/answers.json", []))
    render("fabrics/", "fabrics.html", fabrics=load("content/fabrics.json", []))
    render("runway/", "runway.html", looks=runway, total=len(products))
    render("journal/", "journal.html")
    for b in posts:
        render(f"journal/{b['slug']}/", "journal_post.html", b=b, more=[x for x in posts if x is not b][:3])
    # old blog addresses keep working
    redirect("blog/", "journal/")
    for b in posts:
        redirect(f"blog/{b['slug']}/", f"journal/{b['slug']}/")
    render("studio/", "studio.html", st=studio.data(), stats=stats)
    render("how-it-works/", "how.html", faqs=FAQS)
    render("about/", "about.html", stats=stats)
    render("404.html", "404.html")

    base = SITE_URL or ""
    open(os.path.join(DIST, "robots.txt"), "w").write("User-agent: *\nAllow: /\nDisallow: /tools/\nDisallow: /admin/\n" + (f"Sitemap: {base}/sitemap.xml\n" if base else ""))
    if base:
        urls = ["", "patterns/", "runway/", "studio/", "worlds/", "journal/", "answers/", "fabrics/", "how-it-works/", "about/"] + [f"worlds/{w['slug']}/" for w in WORLDS] + [f"category/{c['slug']}/" for c in cat_list] + \
               [f"pattern/{p['slug']}/" for p in products] + [f"journal/{b['slug']}/" for b in posts]
        now = datetime.now(timezone.utc).date().isoformat()
        open(os.path.join(DIST, "sitemap.xml"), "w").write('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
            "".join(f"<url><loc>{base}/{x}</loc><lastmod>{now}</lastmod></url>\n" for x in urls) + "</urlset>\n")
    write_rss(base)
    write_pinterest_csv(base)
    if CFG.get("custom_domain") and not PREVIEW:
        open(os.path.join(DIST, "CNAME"), "w").write(CFG["custom_domain"].strip() + "\n")
    print(f"Built {len(products)} patterns, {len(cat_list)} categories, {len(posts)} posts -> dist/ ({'preview' if PREVIEW else 'production'})"
          + ("  [sample data]" if DATA.get("sample") else ""))


def write_rss(base):
    from email.utils import format_datetime
    items = []
    for p in products[:60]:
        img = p["images"][0]["full"] if p["images"] else ""
        link = f"{base}/pattern/{p['slug']}/" if base else p["etsy"]
        when = datetime.fromtimestamp(p["created"] or 0, timezone.utc)
        d = html.escape(f"{p['name']}. {p['meta']}")
        items.append(f"<item><title>{html.escape(p['name'])}</title><link>{link}</link><guid isPermaLink=\"false\">{p['id']}</guid>"
                     f"<pubDate>{format_datetime(when)}</pubDate><description>{d}</description>"
                     + (f'<enclosure url="{html.escape(img)}" type="image/jpeg" length="0"/><media:content url="{html.escape(img)}" medium="image"/>' if img else "")
                     + "</item>")
    open(os.path.join(DIST, "feed.xml"), "w", encoding="utf-8").write(
        '<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel>'
        f"<title>{html.escape(CFG['brand'])} new sewing patterns</title><link>{base or shop.get('url', '')}/</link>"
        f"<description>{html.escape(CFG['tagline'])}</description>" + "".join(items) + "</channel></rss>\n")


TITLE_STYLES = ["{name} Sewing Pattern PDF", "Easy {short} Sewing Pattern, Instant PDF Download", "DIY {short}: Printable Sewing Pattern"]


def write_pinterest_csv(base):
    pc = CFG["pinterest"]
    et = ZoneInfo("America/New_York")
    day = datetime.now(et).date() + timedelta(days=1)
    slots = []
    for d in range(pc["days_ahead"]):
        for t in pc["post_times_us_eastern"][:pc["pins_per_day"]]:
            hh, mm = map(int, t.split(":"))
            slots.append(datetime(day.year, day.month, day.day, hh, mm, tzinfo=et) + timedelta(days=d))
    rows = []
    for v in range(3):
        for p in products:
            if len(p["images"]) <= v:
                continue
            title = TITLE_STYLES[v].format(name=p["name"], short=p["short"])[:100]
            extra = f" Sizes {p['sizes']}." if p["sizes"] else ""
            desc = (f"{p['name']}. Printable PDF sewing pattern with instant download.{extra} "
                    f"Save it for your next sewing project. " + " ".join("#" + re.sub(r"[^a-z0-9]", "", t.lower()) for t in p["tags"][:5]))[:500]
            link = (f"{base}/pattern/{p['slug']}/" if base else p["etsy"]) + f"?utm_source=pinterest&utm_medium=social&utm_campaign=pin{v + 1}"
            rows.append({"Title": title, "Media URL": p["images"][v]["full"], "Pinterest board": pc["boards"].get(p["cat"], "Sewing Patterns"),
                         "Thumbnail": "", "Description": desc, "Link": link, "Publish date": "", "Keywords": ", ".join(p["tags"][:8])})
    for r, s in zip(rows, slots):
        r["Publish date"] = s.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")
    rows = [r for r in rows if r["Publish date"]]
    os.makedirs(os.path.join(DIST, "tools"), exist_ok=True)
    with open(os.path.join(DIST, "tools", "pinterest-pins.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["Title", "Media URL", "Pinterest board", "Thumbnail", "Description", "Link", "Publish date", "Keywords"])
        w.writeheader(); w.writerows(rows[:200])


if __name__ == "__main__":
    main()
