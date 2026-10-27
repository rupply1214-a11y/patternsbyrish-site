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
                     "error": j.get("error") if isinstance(j, dict) else None, "count": j.get("count") if isinstance(j, dict) else None}
    except Exception as e:
        out[name] = {"exception": str(e)}
go("listing", f"/listings/{LID}")
go("listing_inv", f"/listings/{LID}", includes="Inventory")
go("listing_buyerprice", f"/listings/{LID}", includes="BuyerPrice")
go("batch", "/listings/batch", listing_ids=str(LID), includes="Images")
go("shop_active", "/shops/63693525/listings/active", limit=1)
go("search_active", "/listings/active", keywords="Wide Leg Linen Jumpsuit Sewing Pattern Scandinavian", limit=5)
go("listing_usd", f"/listings/{LID}", currency="USD")
os.makedirs("data", exist_ok=True)
json.dump(out, open("data/etsy_probe.json", "w"), indent=1)
print(json.dumps(out, indent=1)[:3000])
