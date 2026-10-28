"""Measure where the model photo and the technical sketch sit inside each Etsy listing image,
so the Runway can show them without cutting anything off.

Runs in GitHub Actions (which can download Etsy images). Results are cached in
content/look_crops.json by image URL, so each image is only measured once.

Every listing's first image has the model photo in an arch on the left, and its third
image is a "Front/Back features" technical sketch, drawn on the left with notes on the right.
For both we find the first solid block of content from the left edge, on a plain background."""
import io, json, os, sys, urllib.request
from PIL import Image

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, "content", "look_crops.json")
SRC = os.path.join(ROOT, "data", "listings.json")
if not os.path.exists(SRC):
    print("no listings yet"); sys.exit(0)
cache = json.load(open(OUT)) if os.path.exists(OUT) else {}
listings = json.load(open(SRC)).get("listings", [])


def fetch(url):
    data = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"}), timeout=40).read()
    return Image.open(io.BytesIO(data)).convert("RGB")


def block(im, top=0.0, bottom=1.0, max_right=0.62, W=240, thr=45, gap_frac=0.03, need=None):
    """Bounding box (fractions) of the first block of content from the left, separated from the rest by an empty gap."""
    im = im.resize((W, round(W * im.height / im.width)))
    H = im.height
    px = im.load()
    corners = [px[2, 2], px[W - 3, 2], px[2, H - 3], px[W - 3, H - 3]]
    bg = tuple(sorted(c[i] for c in corners)[1] for i in range(3))  # median-ish background colour
    y0, y1 = int(top * H), int(bottom * H)
    diff = lambda c: abs(c[0] - bg[0]) + abs(c[1] - bg[1]) + abs(c[2] - bg[2])
    cols = [sum(1 for y in range(y0, y1) if diff(px[x, y]) > thr) for x in range(W)]
    need = need or max(2, (y1 - y0) // 60)  # a column counts as content when a few pixels differ
    start = next((x for x in range(W) if cols[x] >= need), None)
    if start is None:
        return None
    gap, end, x = 0, start, start
    while x < int(max_right * W):
        if cols[x] >= need:
            end, gap = x, 0
        else:
            gap += 1
            if gap > W * gap_frac:
                break
        x += 1
    rows = [y for y in range(y0, y1) if any(diff(px[xx, y]) > thr for xx in range(start, end + 1, 2))]
    if not rows:
        return None
    pad = 0.012
    box = [start / W - pad, rows[0] / H - pad, (end + 1) / W + pad, (rows[-1] + 1) / H + pad]
    box = [round(min(1, max(0, v)), 4) for v in box]
    if box[2] - box[0] < 0.15 or box[3] - box[1] < 0.3:  # too small to be the photo or the drawing
        return None
    return box



def sketch_block(im, top=0.13, bottom=0.99, max_right=0.72, W=480, thr=30, gap_frac=0.018, need=1):
    """Like block(), but compares each pixel with the median brightness of its own row,
    so soft background gradients don't count as drawing."""
    im = im.convert("L").resize((W, round(W * im.height / im.width)))
    H = im.height
    px = im.load()
    y0, y1 = int(top * H), int(bottom * H)
    ink = [[False] * W for _ in range(H)]
    for y in range(y0, y1):
        row = sorted(px[x, y] for x in range(W))
        med = row[W // 2]
        for x in range(W):
            ink[y][x] = abs(px[x, y] - med) > thr
    cols = [sum(1 for y in range(y0, y1) if ink[y][x]) for x in range(W)]
    start = next((x for x in range(W) if cols[x] >= need), None)
    if start is None:
        return None
    gap, end, x = 0, start, start
    while x < int(max_right * W):
        if cols[x] >= need:
            end, gap = x, 0
        else:
            gap += 1
            if gap > W * gap_frac:
                break
        x += 1
    rows = [y for y in range(y0, y1) if any(ink[y][xx] for xx in range(start, end + 1))]
    if not rows:
        return None
    pad = 0.012
    box = [start / W - pad, rows[0] / H - pad, (end + 1) / W + pad, (rows[-1] + 1) / H + pad]
    return [round(min(1, max(0, v)), 4) for v in box]


new = 0
for l in listings:
    imgs = l.get("images") or []
    jobs = []
    if imgs:
        jobs.append((imgs[0].get("medium") or imgs[0].get("full"), dict(top=0.0, bottom=1.0, max_right=0.62)))
    if len(imgs) > 2:  # sketches: thin pencil lines, so measure at a higher resolution with a lower threshold
        u2 = imgs[2].get("medium") or imgs[2].get("full")
        jobs.append(("sk4:" + u2 if u2 else None, None))
    for key, opts in jobs:
        if not key or key in cache:
            continue
        try:
            if key.startswith("sk4:"):
                cache[key] = sketch_block(fetch(key[4:]))
            else:
                cache[key] = block(fetch(key), **opts)
            new += 1
        except Exception as e:
            print("skip", key, e, file=sys.stderr)
json.dump(cache, open(OUT, "w"), indent=0, sort_keys=True)
print(f"measured {new} new image(s), {len(cache)} cached")
