"""Publish the Instagram post planned for today (India time).

Reads schedule.json, posts every planned post whose date is today (or the date given with --date)
and that is not yet in posted.json, using the Instagram Graph API (Facebook Login for Business).

Needs two GitHub secrets:
  IG_USER_ID       the Instagram professional account id (a long number)
  IG_ACCESS_TOKEN  a Page access token that never expires (see README.md in this folder)

Images are read by Instagram from this public repository (raw.githubusercontent.com).
"""
import argparse
import datetime as dt
import json
import os
import sys
import time
from zoneinfo import ZoneInfo

import requests

HERE = os.path.dirname(os.path.abspath(__file__))
API = "https://graph.facebook.com/v26.0"
REPO = os.environ.get("GITHUB_REPOSITORY", "rupply1214-a11y/patternsbyrish-site")
BRANCH = os.environ.get("GITHUB_REF_NAME", "main")


def load(name, default):
    try:
        with open(os.path.join(HERE, name), encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return default


def api(method, path, **params):
    params["access_token"] = os.environ["IG_ACCESS_TOKEN"]
    r = requests.request(method, f"{API}/{path}", data=params if method == "POST" else None,
                         params=None if method == "POST" else params, timeout=60)
    try:
        body = r.json()
    except ValueError:
        body = {"error": {"message": r.text[:300]}}
    if r.status_code >= 400 or "error" in body:
        err = body.get("error", {})
        raise RuntimeError(f"Instagram said: {err.get('message', 'unknown error')} (code {err.get('code')}, {err.get('error_subcode', '')})")
    return body


def check():
    me = api("GET", os.environ["IG_USER_ID"], fields="username,media_count")
    print(f"Connected to Instagram account @{me.get('username')} ({me.get('media_count')} posts). Everything is set up.")


def publish(post):
    image_url = f"https://raw.githubusercontent.com/{REPO}/{BRANCH}/social/instagram/{post['image']}"
    ig = os.environ["IG_USER_ID"]
    params = dict(image_url=image_url, caption=post["caption"])
    if post.get("alt_text"):
        params["alt_text"] = post["alt_text"]
    try:
        c = api("POST", f"{ig}/media", **params)
    except RuntimeError as e:
        if "alt_text" in params and "alt_text" in str(e).lower():
            params.pop("alt_text")
            c = api("POST", f"{ig}/media", **params)
        else:
            raise
    cid = c["id"]
    for _ in range(30):
        st = api("GET", cid, fields="status_code").get("status_code")
        if st == "FINISHED":
            break
        if st in ("ERROR", "EXPIRED"):
            raise RuntimeError(f"Instagram could not process the image ({st}).")
        time.sleep(5)
    m = api("POST", f"{ig}/media_publish", creation_id=cid)
    return m["id"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", default="", help="YYYY-MM-DD to post instead of today")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--check", action="store_true")
    a = ap.parse_args()
    if not os.environ.get("IG_USER_ID") or not os.environ.get("IG_ACCESS_TOKEN"):
        sys.exit("Missing IG_USER_ID or IG_ACCESS_TOKEN secret. See social/instagram/README.md.")
    if a.check:
        check()
        return
    day = a.date or dt.datetime.now(ZoneInfo("Asia/Kolkata")).date().isoformat()
    schedule = load("schedule.json", [])
    posted = load("posted.json", {})
    todo = [p for p in schedule if p["date"] == day and f"{p['date']} {p['sku']}" not in posted]
    if not todo:
        print(f"Nothing to post for {day}.")
        return
    failed = False
    for p in todo:
        key = f"{p['date']} {p['sku']}"
        if a.dry_run:
            print(f"[dry run] Would post {key}: {p['image']}")
            continue
        try:
            mid = publish(p)
            posted[key] = mid
            print(f"Posted {key} (Instagram media id {mid}).")
        except Exception as e:  # keep going with the next post, report at the end
            failed = True
            print(f"FAILED {key}: {e}")
    with open(os.path.join(HERE, "posted.json"), "w", encoding="utf-8") as f:
        json.dump(posted, f, indent=1)
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
