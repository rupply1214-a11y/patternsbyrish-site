"""Read what was saved in the admin panel (Supabase) into data/admin_content.json and data/admin_posts.json.

Uses the public (publishable) key: the database only lets it read the site settings and published posts.
If Supabase can't be reached, the build simply uses content/site.json and the posts in content/blog.
"""
import json, os, sys
import requests

ROOT = os.path.dirname(os.path.abspath(__file__))
CFG = json.load(open(os.path.join(ROOT, "site.config.json"), encoding="utf-8"))


def main():
    url, key = CFG.get("supabase_url"), CFG.get("supabase_key")
    if not url or not key:
        print("No Supabase settings, skipping admin content"); return 0
    h = {"apikey": key, "Authorization": f"Bearer {key}"}
    os.makedirs(os.path.join(ROOT, "data"), exist_ok=True)
    try:
        r = requests.get(f"{url}/rest/v1/site_content", params={"id": "eq.1", "select": "data"}, headers=h, timeout=30)
        r.raise_for_status()
        rows = r.json()
        if rows and rows[0].get("data"):
            json.dump(rows[0]["data"], open(os.path.join(ROOT, "data", "admin_content.json"), "w", encoding="utf-8"), ensure_ascii=False)
            print("Admin settings loaded")
        r = requests.get(f"{url}/rest/v1/posts", params={"published": "eq.true", "select": "*", "order": "date.desc"}, headers=h, timeout=30)
        r.raise_for_status()
        json.dump(r.json(), open(os.path.join(ROOT, "data", "admin_posts.json"), "w", encoding="utf-8"), ensure_ascii=False)
        print(f"{len(r.json())} published posts loaded")
    except Exception as e:  # never block the site from building
        print(f"Admin content not loaded ({e}); using the defaults")
    return 0


if __name__ == "__main__":
    sys.exit(main())
