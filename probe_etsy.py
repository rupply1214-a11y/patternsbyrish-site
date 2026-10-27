"""One-off, read-only check: does any Etsy endpoint return the sale (buyer) price? Writes data/etsy_probe.json."""
import json, os, time
import requests
key = os.environ.get("ETSY_API_KEY", "").strip(); sec = os.environ.get("ETSY_SHARED_SECRET", "").strip()
if not key:
    raise SystemExit(0)
k = key if ":" in key or not sec else f"{key}:{sec}"
H = {"x-api-key": k}
API = "https://openapi.etsy.com/v3/application"
LID = 4502577803
out = {}
def go(name, path, **params):
    time.sleep(0.4)
    try:
        r = requests.get(API + path, params=params, headers=H, timeout=30)
        j = r.json() if r.headers.get("content-type", "").startswith("application/json") else {"text": r.text[:300]}
        res = j.get("results") if isinstance(j, dict) and "results" in j else [j]
        first = res[0] if res else {}
        out[name] = {"status": r.status_code, "price": first.get("price") if isinstance(first, dict) else None,
                     "buyer_price": first.get("buyer_price") if isinstance(first, dict) else None,
                     "keys_with_price_or_sale": sorted(x for x in (first.keys() if isinstance(first, dict) else []) if any(w in x for w in ("price", "sale", "promo", "discount"))),
                     "error": j.get("error") if isinstance(j, dict) else None, "raw_bp": json.dumps(first.get("buyer_price"))[:300] if isinstance(first, dict) else None, "count": j.get("count") if isinstance(j, dict) else None}
    except Exception as e:
        out[name] = {"exception": str(e)}
go("bp_lower", f"/listings/{LID}", includes="buyerprice")
go("bp_region", f"/listings/{LID}", includes="buyerprice", region="US")
go("bp_country", f"/listings/{LID}", includes="buyerprice", country_iso="US", currency="USD")
go("bp_language", f"/listings/{LID}", includes="buyerprice", language="en-US", currency_code="USD")
go("bp_batch", "/listings/batch", listing_ids=str(LID), includes="images,buyerprice")
go("bp_shop", "/shops/63693525/listings/active", limit=1, includes="buyerprice")
go("bp_search", "/listings/active", keywords="Wide Leg Linen Jumpsuit Sewing Pattern Scandinavian", limit=3, includes="buyerprice")
os.makedirs("data", exist_ok=True)
json.dump(out, open("data/etsy_probe.json", "w"), indent=1)
print(json.dumps(out, indent=1)[:3000])
