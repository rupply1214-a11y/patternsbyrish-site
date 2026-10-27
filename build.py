"""Build the Patterns by Rish website from data/listings.json (or the sample data).

    python build.py              -> production build in dist/ (clean URLs like /pattern/name/)
    python build.py --preview    -> same pages, but links point at index.html files so it opens from disk
"""
import csv, hashlib, html, json, os, re, shutil, sys
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from jinja2 import Environment, FileSystemLoader, select_autoescape

ROOT = os.path.dirname(os.path.abspath(__file__))
CFG = json.load(open(os.path.join(ROOT, "site.config.json"), encoding="utf-8"))
PREVIEW = "--preview" in sys.argv
DIST = os.path.join(ROOT, "dist")

# ---------- data ----------
live = os.path.join(ROOT, "data", "listings.json")
DATA = json.load(open(live if os.path.exists(live) else os.path.join(ROOT, "data", "sample_listings.json"), encoding="utf-8"))

SITE_URL = (os.environ.get("SITE_URL") or CFG.get("site_url") or "").rstrip("/")
if not SITE_URL and CFG.get("custom_domain"):
    SITE_URL = "https://" + CFG["custom_domain"]

CATS = {  # slug: (name, short intro used on the category page and for SEO)
    "dresses": ("Dresses", "Maxi, midi and mini dress sewing patterns, from linen summer dresses to cottagecore and evening gowns."),
    "tops": ("Tops & blouses", "Tank tops, crop tops, flared-sleeve blouses and knit tops you can sew in an afternoon."),
    "bottoms": ("Skirts & pants", "Maxi skirts, mini skirts, trumpet skirts and wide leg trousers."),
    "jumpsuits": ("Jumpsuits", "Wide leg and one-shoulder jumpsuit sewing patterns."),
    "plus-size": ("Plus size", "Sewing patterns drafted for curvy and plus size bodies."),
    "mens": ("Men", "Shirts and everyday menswear sewing patterns, including plus size."),
    "hoodies": ("Hoodies & sweatshirts", "Cosy hoodie and sweatshirt sewing patterns."),
    "kids": ("Kids", "Sewing patterns for children's clothing."),
    "bundles": ("Bundles", "Pattern bundles that cost less than buying each pattern on its own."),
}
SECTION_TO_CAT = [("plus size", "plus-size"), ("mens", "mens"), ("men", "mens"), ("dress", "dresses"), ("top", "tops"),
                  ("bottom", "bottoms"), ("skirt", "bottoms"), ("pant", "bottoms"), ("jumpsui", "jumpsuits"),
                  ("hood", "hoodies"), ("sweat", "hoodies"), ("kid", "kids"), ("child", "kids"), ("bundle", "bundles")]


HERO_COLORS = ["#E07A93", "#E8956A", "#D9A92B", "#9DB84A", "#4FB08A", "#3FA6A6", "#5A9BD8", "#8B7FD9", "#B77FC9"]
HERO_SIZES = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"]


def hero_lines():
    """Nested graded lines of a half dress front, one per size (like a real multi-size pattern sheet)."""
    out = []
    for i, (size, col) in enumerate(zip(HERO_SIZES, HERO_COLORS)):
        g = i * 1.45
        neck = (40, 70 - g * 0.6); snp = (88 + g * 0.8, 40 - g * 0.8); tip = (148 + g * 3.2, 56 + g * 0.6)
        arm_c = (136 + g * 4.4, 108 + g * 2.2); under = (158 + g * 6.2, 132 + g * 3.2)
        waist = (148 + g * 6.4, 214 + g * 1.4); hem = (226 + g * 6.6, 418 + g * 2.2); hem_c = (140 + g * 3, 440 + g * 2.4); cf_hem = (40, 438 + g * 2.4)
        f = lambda p: f"{p[0]:.1f} {p[1]:.1f}"
        d = (f"M{f(neck)} Q{f((78 + g * 0.6, 70 - g * 0.6))} {f(snp)} L{f(tip)} Q{f(arm_c)} {f(under)} "
             f"Q{f((150 + g * 6.2, 170 + g * 2))} {f(waist)} L{f(hem)} Q{f(hem_c)} {f(cf_hem)}")
        out.append(dict(size=size, color=col, d=d, lx=hem[0] + 8, ly=hem[1] + 4, i=i))
    return out


KIND_WORDS = [("bundle", r"bundle|\d.in.1|wholeshop|mother daughter"), ("jumpsuit", r"jumpsuit|romper|overall"),
              ("hoodie", r"hoodie|sweatshirt"), ("vest", r"\bvest|corset"), ("mens-shirt", r"\bmen'?s?\b.*(shirt|tee)"),
              ("dress", r"dress|gown|abaya|kaftan|pinafore|sundress"), ("skirt", r"skirt"),
              ("pants", r"trouser|pants|palazzo|\bshorts\b|jeans|capri|chino"), ("top", r"\btops?\b|blouse|camisole|tank|\btee\b|t-shirt|t shirt|shirt|peplum")]


def kind_of(text):
    """Garment type, read from the start of the title first (the main keyword), then the rest."""
    for chunk in ([text] if isinstance(text, str) else text):
        t = chunk.lower()
        for k, rx in KIND_WORDS:
            if re.search(rx, t):
                return "shirt" if k == "mens-shirt" else k
    return "dress"


KIND_CAT = {"dress": "dresses", "top": "tops", "vest": "tops", "shirt": "tops", "skirt": "bottoms", "pants": "bottoms",
            "jumpsuit": "jumpsuits", "hoodie": "hoodies", "bundle": "bundles"}


def slugify(s, n=8):
    words = re.sub(r"[^a-z0-9]+", " ", s.lower()).split()
    return "-".join(words[:n]) or "pattern"


def clean_name(title):
    first = re.split(r"\s[|]\s|,|\(", title)[0].strip()
    return re.sub(r"\s+PDF\b", "", first).strip(" -|")


SIZE = r"\b(XXS|XS|S|M|L|XL|XXL|[2-6]XL)\b"
SIZE_ANY = r"(?:XXS|XS|S|M|L|XL|XXL|[2-6]XL)"
JUNK = r"\b(PDF|Sewing Patterns?|Patterns?|DIY|Digital Download|Instant Download|Printable)\b"


def parts(title):
    """Etsy title 'Linen Dress Pattern | Boatneck A-Line Tea Dress | XS-5XL PDF' -> ('Linen Dress', 'Boatneck A-Line Tea Dress')."""
    out = []
    for s in re.split(r"\s[|]\s|,|\(|\)", title):
        c = re.sub(JUNK, "", s, flags=re.I)
        c = re.sub(r"\b" + SIZE_ANY + r"\s*(?:-|–|to)\s*" + SIZE_ANY + r"\b", "", c)
        c = re.sub(r"\s{2,}", " ", c).strip(" -–|,&:")
        if c and len(c) > 2 and not re.fullmatch(r"(ages?\s*[\d\- ]+|natural waist|summer sewing)", c, flags=re.I):
            out.append(c)
    return (out[0] if out else title), (out[1] if len(out) > 1 else "")


def short_name(title):
    n = clean_name(title)
    n = re.sub(r"\b(PDF|Sewing Pattern|Pattern|DIY)\b", "", n, flags=re.I)
    return re.sub(r"\s{2,}", " ", n).strip(" -|,") or clean_name(title)


def size_range(text):
    m = re.search(SIZE + r"\s*(?:-|–|to)\s*" + SIZE, text)
    if m:
        return f"{m.group(1)} to {m.group(2)}"
    m = re.search(r"\bAges?\s*(\d{1,2})\s*(?:-|–|to)\s*(\d{1,2})\b", text, flags=re.I)
    return f"Ages {m.group(1)} to {m.group(2)}" if m else ""


def formats(text):
    t = text.upper()
    return [f for f, k in [("A4", "A4"), ("US Letter", "US LETTER"), ("A0 copy shop", "A0"), ("Projector", "PROJECTOR")] if k in t]


def price_text(p):
    if not p:
        return ""
    v = p["amount"] / (p.get("divisor") or 100)
    sym = {"USD": "$", "GBP": "£", "EUR": "€", "CAD": "CA$", "AUD": "A$"}.get(p.get("currency_code"), "")
    return f"{sym}{v:,.2f}" if sym else f"{v:,.2f} {p.get('currency_code')}"


def para(desc):
    """Etsy plain-text description -> safe HTML blocks."""
    out, items = [], []
    for raw in html.unescape(desc or "").replace("\r", "").split("\n"):
        line = raw.strip()
        if line.endswith(":") and len(line) < 60:
            if items:
                out.append("<ul>" + "".join(f"<li>{i}</li>" for i in items) + "</ul>"); items = []
            out.append(f"<h3>{html.escape(line[:-1])}</h3>")
            continue
        bullet = re.match(r"^([•\-*✔✓✅☑►▶➤→◆♦★☆✨🔹🔸💗🌸]+)\s*(.+)", line)
        if bullet:
            items.append(html.escape(bullet.group(2)))
            continue
        if items:
            out.append("<ul>" + "".join(f"<li>{i}</li>" for i in items) + "</ul>"); items = []
        if line:
            out.append(f"<p>{html.escape(line)}</p>")
    if items:
        out.append("<ul>" + "".join(f"<li>{i}</li>" for i in items) + "</ul>")
    return "\n".join(out)


TINTS = ["#F6D9E0", "#FBE7C8", "#F3EBB9", "#DCEFC9", "#CDEBDD", "#CBE6EC", "#D3E2F6", "#E1DAF6", "#EBD8F0"]
sections = {s["shop_section_id"]: s["title"] for s in DATA.get("sections", [])}
products = []
for l in DATA["listings"]:
    title = html.unescape(l["title"])
    full = title + " " + (l.get("description") or "")
    sec = sections.get(l.get("shop_section_id"), "")
    head, detail = parts(title)
    kind = "bundle" if re.search(r"\bbundle\b|\d.in.1", title, flags=re.I) else kind_of([head, detail, title])
    cats = []
    for key, cat in SECTION_TO_CAT:
        if key in sec.lower() and cat not in cats:
            cats.append(cat); break
    if KIND_CAT.get(kind) and KIND_CAT[kind] not in cats:
        cats.append(KIND_CAT[kind])
    if "plus size" in title.lower() and "plus-size" not in cats:
        cats.append("plus-size")
    if re.search(r"\bmen'?s?\b", head.lower()) and "mens" not in cats:
        cats.append("mens")
    lid = l["listing_id"]
    slug = f"{slugify(head + ' ' + detail, 9)}-{lid}"
    desc_body = html.unescape(l.get("description") or "")
    first = desc_body.strip().split("\n", 1)
    if first and first[0].strip() == title.strip():  # many descriptions start by repeating the title
        desc_body = first[1] if len(first) > 1 else ""
    desc_plain = re.sub(r"\s+", " ", desc_body).strip()
    products.append(dict(
        id=lid, title=title, name=(f"{head}: {detail}" if detail else head), short=head, sub=detail, slug=slug, kind=kind, cats=cats,
        cat=cats[0] if cats else "dresses", section=sec, etsy=l.get("url") or f"https://www.etsy.com/listing/{lid}",
        price=price_text(l.get("price")), price_value=(l.get("price") or {}).get("amount", 0) / ((l.get("price") or {}).get("divisor") or 100),
        currency=(l.get("price") or {}).get("currency_code", "USD"), images=l.get("images") or [],
        sizes=size_range(full), formats=formats(full), tags=[t for t in (l.get("tags") or [])],
        desc_html=para(desc_body), created=l.get("original_creation_timestamp") or 0,
        meta=(desc_plain[:155].rsplit(" ", 1)[0] + "…") if len(desc_plain) > 155 else (desc_plain or f"{head}. {detail}. Printable PDF sewing pattern with instant download from Etsy."),
        tint=TINTS[int(hashlib.md5(str(lid).encode()).hexdigest(), 16) % len(TINTS)],
        plus="plus-size" in cats,
    ))
products.sort(key=lambda p: -p["created"])
by_cat = {c: [p for p in products if c in p["cats"]] for c in CATS}
cat_list = [dict(slug=c, name=CATS[c][0], intro=CATS[c][1], count=len(by_cat[c]), kind=next((p["kind"] for p in by_cat[c] if p["kind"] != "bundle"), "bundle" if c == "bundles" else "dress"))
            for c in CATS if by_cat[c]]
shop = DATA.get("shop") or {}

FAQS = [
  ("How do I get my pattern after I buy it?", "Right after checkout, Etsy shows a download button on the order page. You can also find it any time under You, then Purchases and reviews, on etsy.com or in the Etsy app. Etsy emails you a link too."),
  ("Do you post a paper pattern?", "No. Every pattern is a digital PDF, so nothing is shipped. That also means there are no postage costs or customs waits, wherever you live."),
  ("Can I buy from outside the US?", "Yes. Etsy shows prices in your currency and accepts cards and PayPal in most countries. The download works the same everywhere."),
  ("What do I need to print it?", "A normal home printer and A4 or US Letter paper is enough for most patterns. Print at 100 percent or actual size, never fit to page. If your file has a test square, measure it before printing the rest."),
  ("How do I pick my size?", "Measure your bust, waist and hips with a soft tape and compare them with the size chart inside the pattern. If you sit between two sizes, many sewists trace the larger one and take it in at the side seams."),
  ("Can I return a pattern?", "Digital files download instantly, so they can't be returned. If a file won't open or something looks wrong, message us through Etsy and we'll help you sort it out."),
]

# ---------- rendering ----------
env = Environment(loader=FileSystemLoader(os.path.join(ROOT, "templates")), autoescape=select_autoescape(["html", "xml"]),
                  trim_blocks=True, lstrip_blocks=True)


def render(path, template, **ctx):
    """path like 'pattern/x/' or '' ; writes dist/<path>index.html"""
    depth = path.count("/")
    prefix = "../" * depth
    if path == "404.html" and not PREVIEW:  # served at any address, so links must start from the site root
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

    out = env.get_template(template).render(u=u, canon=canon, path=path, cfg=CFG, shop=shop, cats=cat_list, catmap=CATS,
                                            year=datetime.now().year, sample=DATA.get("sample"), **ctx)
    dest = os.path.join(DIST, path, "index.html") if not path.endswith(".html") else os.path.join(DIST, path)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    open(dest, "w", encoding="utf-8").write(out)


def main():
    shutil.rmtree(DIST, ignore_errors=True)
    shutil.copytree(os.path.join(ROOT, "static"), os.path.join(DIST, "static"))
    sold = shop.get("transaction_sold_count") or 0
    stats = dict(sold=(f"{sold // 100 * 100:,}+" if sold >= 1000 else str(sold)) if sold else "",
                 rating=shop.get("review_average"), reviews=shop.get("review_count"), count=len(products))
    js = [dict(id=p["id"], s=p["slug"], n=p["short"], c=p["cats"], p=p["price_value"], t=p["created"], k=(p["title"] + " " + " ".join(p["tags"])).lower()) for p in products]

    render("", "index.html", hero=hero_lines(), products=products, newest=products[:8], stats=stats,
           bundles=by_cat.get("bundles", [])[:3], featured_plus=by_cat.get("plus-size", [])[:4])
    render("patterns/", "list.html", items=products, current=None, heading="All sewing patterns",
           intro=f"Every pattern in the shop, newest first. {len(products)} PDF patterns, each with an instant download on Etsy.", js=js)
    for c in cat_list:
        render(f"category/{c['slug']}/", "list.html", items=by_cat[c["slug"]], current=c["slug"],
               heading=f"{c['name']} sewing patterns" if c["slug"] not in ("plus-size", "bundles") else
               ("Plus size sewing patterns" if c["slug"] == "plus-size" else "Sewing pattern bundles"), intro=c["intro"], js=None)
    for p in products:
        related = [q for q in by_cat.get(p["cat"], []) if q["id"] != p["id"]][:4]
        render(f"pattern/{p['slug']}/", "product.html", p=p, related=related)
    render("how-it-works/", "how.html", faqs=FAQS)
    render("about/", "about.html", stats=stats)
    render("404.html", "404.html")

    # robots, sitemap, rss, pinterest csv
    base = SITE_URL or ""
    open(os.path.join(DIST, "robots.txt"), "w").write("User-agent: *\nAllow: /\nDisallow: /tools/\n" + (f"Sitemap: {base}/sitemap.xml\n" if base else ""))
    if base:
        urls = ["", "patterns/", "how-it-works/", "about/"] + [f"category/{c['slug']}/" for c in cat_list] + [f"pattern/{p['slug']}/" for p in products]
        now = datetime.now(timezone.utc).date().isoformat()
        open(os.path.join(DIST, "sitemap.xml"), "w").write('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
            "".join(f"<url><loc>{base}/{x}</loc><lastmod>{now}</lastmod></url>\n" for x in urls) + "</urlset>\n")
    write_rss(base)
    write_pinterest_csv(base)
    if CFG.get("custom_domain") and not PREVIEW:
        open(os.path.join(DIST, "CNAME"), "w").write(CFG["custom_domain"].strip() + "\n")
    print(f"Built {len(products)} pattern pages, {len(cat_list)} categories -> dist/ ({'preview' if PREVIEW else 'production'})"
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
    """Pinterest bulk-create CSV: one pin per image (up to 3 per pattern), spread over the next weeks at US times."""
    pc = CFG["pinterest"]
    et = ZoneInfo("America/New_York")
    slots = []
    day = datetime.now(et).date() + timedelta(days=1)
    for d in range(pc["days_ahead"]):
        for t in pc["post_times_us_eastern"][:pc["pins_per_day"]]:
            hh, mm = map(int, t.split(":"))
            slots.append(datetime(day.year, day.month, day.day, hh, mm, tzinfo=et) + timedelta(days=d))
    rows = []
    for v in range(3):  # round-robin: first image of every pattern, then second images, then third
        for p in products:
            if len(p["images"]) <= v:
                continue
            name = p["name"] if "pattern" not in p["name"].lower() else re.sub(r"\s*sewing pattern", "", p["name"], flags=re.I)
            title = TITLE_STYLES[v].format(name=name, short=p["short"])[:100]
            extra = f" Sizes {p['sizes']}." if p["sizes"] else ""
            desc = (f"{p['name']}. Printable PDF sewing pattern with instant download.{extra} "
                    f"Save it for your next sewing project. " + " ".join("#" + re.sub(r"[^a-z0-9]", "", t.lower()) for t in p["tags"][:5]))[:500]
            link = (f"{base}/pattern/{p['slug']}/" if base else p["etsy"]) + f"?utm_source=pinterest&utm_medium=social&utm_campaign=pin{v + 1}"
            rows.append({"Title": title, "Media URL": p["images"][v]["full"],
                         "Pinterest board": pc["boards"].get(p["cat"], "Sewing Patterns"), "Thumbnail": "",
                         "Description": desc, "Link": link, "Publish date": "", "Keywords": ", ".join(p["tags"][:8])})
    for r, s in zip(rows, slots):
        r["Publish date"] = s.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")
    rows = [r for r in rows if r["Publish date"]]  # Pinterest takes 200 per upload; extra rows wait for next month
    os.makedirs(os.path.join(DIST, "tools"), exist_ok=True)
    with open(os.path.join(DIST, "tools", "pinterest-pins.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["Title", "Media URL", "Pinterest board", "Thumbnail", "Description", "Link", "Publish date", "Keywords"])
        w.writeheader(); w.writerows(rows[:200])


if __name__ == "__main__":
    main()
