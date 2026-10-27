"""Pull PatternsByRish data from the Etsy API (read only) into data/listings.json.

Nothing is ever written to Etsy. Needs two environment variables (set as GitHub secrets):
  ETSY_API_KEY        - the keystring of your Etsy app (storemind-analytics)
  ETSY_SHARED_SECRET  - the shared secret of the same app
"""
import json, os, sys, time
from datetime import datetime, timezone
import requests

API = "https://openapi.etsy.com/v3/application"
CONFIG = json.load(open(os.path.join(os.path.dirname(__file__), "site.config.json"), encoding="utf-8"))
OUT = os.path.join(os.path.dirname(__file__), "data", "listings.json")


def api_key():
    key = os.environ.get("ETSY_API_KEY", "").strip()
    secret = os.environ.get("ETSY_SHARED_SECRET", "").strip()
    if not key:
        return None
    return key if ":" in key or not secret else f"{key}:{secret}"


class Etsy:
    def __init__(self, key):
        self.s = requests.Session()
        self.s.headers.update({"x-api-key": key, "Accept": "application/json"})
        self.last = 0.0

    def get(self, path, **params):
        for attempt in range(5):
            wait = 0.25 - (time.time() - self.last)  # stay under 5 requests a second
            if wait > 0:
                time.sleep(wait)
            self.last = time.time()
            r = self.s.get(API + path, params=params, timeout=30)
            if r.status_code == 429 or r.status_code >= 500:
                time.sleep(2 * (attempt + 1))
                continue
            if r.status_code >= 400:
                raise SystemExit(f"Etsy API error {r.status_code} on {path}: {r.text[:300]}")
            return r.json()
        raise SystemExit(f"Etsy API kept failing on {path}")


def main():
    key = api_key()
    if not key:
        print("No ETSY_API_KEY set: the site will be built from data/sample_listings.json")
        return 0
    e = Etsy(key)
    name = CONFIG["etsy_shop_name"]
    found = e.get("/shops", shop_name=name).get("results") or []
    shop = next((s for s in found if s["shop_name"].lower() == name.lower()), None)
    if not shop:
        raise SystemExit(f"Shop {name} not found on Etsy")
    sid = shop["shop_id"]
    shop = e.get(f"/shops/{sid}")
    sections = e.get(f"/shops/{sid}/sections").get("results") or []

    ids, offset = [], 0
    while True:
        page = e.get(f"/shops/{sid}/listings/active", limit=100, offset=offset)
        res = page.get("results") or []
        ids += [l["listing_id"] for l in res]
        offset += 100
        if not res or offset >= page.get("count", 0):
            break

    listings = []
    for i in range(0, len(ids), 100):
        # "BuyerPrice" is the price a US buyer sees on Etsy right now, including any running sale and when it ends
        batch = e.get("/listings/batch", listing_ids=",".join(map(str, ids[i:i + 100])), includes="Images,BuyerPrice", buyer_country="US")
        listings += batch.get("results") or []

    keep = ["listing_id", "title", "description", "url", "tags", "shop_section_id", "original_creation_timestamp",
            "last_modified_timestamp", "price", "buyer_price", "num_favorers", "views", "skus", "materials"]
    clean = []
    for l in listings:
        row = {k: l.get(k) for k in keep}
        imgs = sorted(l.get("images") or [], key=lambda im: im.get("rank") or 99)
        row["images"] = [{"full": im.get("url_fullxfull"), "medium": im.get("url_570xN"), "alt": im.get("alt_text") or "",
                          "w": im.get("full_width"), "h": im.get("full_height")} for im in imgs]
        clean.append(row)

    data = {"shop": {k: shop.get(k) for k in ["shop_name", "title", "announcement", "transaction_sold_count", "review_average",
                                              "review_count", "url", "listing_active_count", "icon_url_fullxfull"]},
            "sections": [{"shop_section_id": s["shop_section_id"], "title": s["title"]} for s in sections],
            "listings": clean, "synced_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "sample": False}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(data, open(OUT, "w", encoding="utf-8"), ensure_ascii=False)
    print(f"Synced {len(clean)} active listings from {name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
