"""Download images listed in content/remote_images.json (path -> URL) that are not in the repo yet,
shrink them for the web, and save them under static/. Runs in GitHub Actions, which can reach the image CDN."""
import io, json, os, sys, urllib.request
from PIL import Image

ROOT = os.path.dirname(os.path.abspath(__file__))
LIST = os.path.join(ROOT, "content", "remote_images.json")
items = json.load(open(LIST)) if os.path.exists(LIST) else {}
saved = []
for rel, url in items.items():
    out = os.path.join(ROOT, rel)
    if os.path.exists(out):
        continue
    try:
        data = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"}), timeout=60).read()
        im = Image.open(io.BytesIO(data)).convert("RGB")
        im.thumbnail((1800, 1800))
        os.makedirs(os.path.dirname(out), exist_ok=True)
        im.save(out, "JPEG", quality=82, optimize=True, progressive=True)
        saved.append(rel)
        print("saved", rel, im.size)
    except Exception as e:  # a missing image never stops the site from publishing
        print("could not fetch", rel, e, file=sys.stderr)
print(f"{len(saved)} new image(s)")
