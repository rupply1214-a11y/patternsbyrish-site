"""Publish the reel planned for today (India time) to Instagram Reels and the Facebook Page.

Reads social/reels/schedule.json. Videos are served from the website (GitHub Pages) so Meta can fetch
them with the right video type. Uses the same secrets and the same posted.json as the photo posts.
Catch-up queue: one reel per day, the oldest planned reel not yet posted.
"""
import argparse, datetime as dt, json, os, sys, time
from zoneinfo import ZoneInfo
import requests

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "instagram"))
import post_instagram as pi  # noqa: E402  (api(), FB_PAGE_ID, posted.json location)

POSTED = os.path.join(HERE, "..", "instagram", "posted.json")


def load(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return default


def wait_ready(cid, what):
    for _ in range(90):  # up to ~7.5 minutes
        st = pi.api("GET", cid, fields="status_code,status").get("status_code")
        if st == "FINISHED":
            return
        if st in ("ERROR", "EXPIRED"):
            raise RuntimeError(f"Instagram could not process the {what} ({st}).")
        time.sleep(5)
    raise RuntimeError(f"Instagram took too long to process the {what}.")


def publish_ig(r):
    ig = os.environ["IG_USER_ID"]
    c = pi.api("POST", f"{ig}/media", media_type="REELS", video_url=r["video"], caption=r["caption"],
               share_to_feed="true", thumb_offset=str(r.get("thumb_offset", 0)))
    wait_ready(c["id"], "reel")
    return pi.api("POST", f"{ig}/media_publish", creation_id=c["id"])["id"]


def publish_fb(r):
    page = pi.FB_PAGE_ID
    tok = os.environ["IG_ACCESS_TOKEN"]
    try:  # Facebook Reels: start, upload from URL, finish
        s = pi.api("POST", f"{page}/video_reels", upload_phase="start")
        vid = s["video_id"]
        up = requests.post(f"https://rupload.facebook.com/video-upload/v26.0/{vid}",
                           headers={"Authorization": f"OAuth {tok}", "file_url": r["video"]}, timeout=120)
        if up.status_code >= 400:
            raise RuntimeError(f"upload: {up.text[:200]}")
        pi.api("POST", f"{page}/video_reels", upload_phase="finish", video_id=vid,
               video_state="PUBLISHED", description=r["fb_caption"])
        return f"reel {vid}"
    except Exception as e:  # fall back to a normal Page video
        print(f"Facebook Reel route did not work ({e}); posting as a Page video instead.")
        v = pi.api("POST", f"{page}/videos", file_url=r["video"], description=r["fb_caption"], published="true")
        return f"video {v['id']}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", default="")
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--extra", action="store_true", help="post from extra.json (occasional Claude-made reels)")
    a = ap.parse_args()
    sched = load(os.path.join(HERE, "extra.json" if a.extra else "schedule.json"), [])
    if a.check:
        for r in sched[:3]:
            h = requests.head(r["video"], timeout=30, allow_redirects=True)
            print(f"{r['label']}: {h.status_code} {h.headers.get('content-type')} {h.headers.get('content-length')} bytes")
        pi.check()
        return
    day = a.date or dt.datetime.now(ZoneInfo("Asia/Kolkata")).date().isoformat()
    posted = load(POSTED, {})
    key = lambda r: f"reel {r['date']} {r['label']}"
    if a.date:
        todo = [r for r in sched if r["date"] == day and key(r) not in posted]
    else:
        todo = [r for r in sorted(sched, key=lambda r: r["date"]) if r["date"] <= day and key(r) not in posted][:1]
    if not todo:
        print(f"No reel to post for {day}.")
        return
    failed = False
    for r in todo:
        k = key(r)
        try:
            posted[k] = publish_ig(r)
            print(f"Posted {k} to Instagram Reels (media id {posted[k]}).")
        except Exception as e:
            failed = True
            print(f"FAILED {k}: {e}")
            continue
        finally:
            with open(POSTED, "w", encoding="utf-8") as f:
                json.dump(posted, f, indent=1)
        if f"fb {k}" not in posted:
            try:
                posted[f"fb {k}"] = publish_fb(r)
                print(f"Posted {k} to the Facebook Page ({posted[f'fb {k}']}).")
            except Exception as e:
                print(f"Facebook not posted for {k}: {e}")
            with open(POSTED, "w", encoding="utf-8") as f:
                json.dump(posted, f, indent=1)
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
