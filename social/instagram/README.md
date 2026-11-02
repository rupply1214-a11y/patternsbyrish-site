# Instagram auto-posting

Every day at 7:30 pm India time, GitHub posts the planned Instagram post for that day.

| File | What it is |
|---|---|
| `schedule.json` | The plan: date, SKU, image, caption (with hashtags) and alt text |
| `posts/` | The post images (1080 × 1350) |
| `posted.json` | Filled in automatically: what was already posted, so nothing posts twice |
| `post_instagram.py` | The script that posts |
| `../../.github/workflows/instagram.yml` | Runs the script every day |

## One-time setup

You need: Instagram as a **Professional** account (Business or Creator), linked to your **Facebook Page**.

1. **developers.facebook.com** › My Apps › **Create app** › "Other" › type **Business** › name it `PatternsByRish Poster`.
2. In the app, add the product **Instagram** (Facebook Login for Business). The app can stay in development mode; you are its admin.
3. Open **Graph API Explorer** (Tools menu). Choose your app, then "Get User Access Token" with these permissions:
   `instagram_basic`, `instagram_content_publish`, `pages_show_list`, `pages_read_engagement`, `business_management`.
4. Copy that token into **Access Token Debugger** › **Extend Access Token** (gives a 60-day token).
5. Back in Graph API Explorer, paste the long token and run `me/accounts`. Copy the `access_token` of your Facebook Page
   (this Page token does not expire) and the Page `id`.
6. Run `<page id>?fields=instagram_business_account`. The number shown is your **IG_USER_ID**.
7. GitHub › this repository › Settings › Secrets and variables › Actions › New repository secret:
   - `IG_USER_ID` = the number from step 6
   - `IG_ACCESS_TOKEN` = the Page token from step 5
8. Actions › **Post to Instagram** › Run workflow › mode `check`. It should say "Connected to Instagram account @...".

Never paste the token in a chat, file or commit. It only goes into the GitHub secret.

## Every day

Nothing to do. To post a missed day: Actions › Post to Instagram › Run workflow › mode `post`, date `2026-11-05`.
To change a caption, edit `schedule.json` (same date, it posts the new text).
