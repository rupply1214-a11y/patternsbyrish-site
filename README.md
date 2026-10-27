# Patterns by Rish website

Your Etsy shop is the only place you add patterns. Every 4 hours this site reads your active
PatternsByRish listings from the Etsy API (read only, nothing is ever changed on Etsy) and
rebuilds the website: product pages, category pages, sitemap for Google, an RSS feed for
Pinterest auto-pins, and a ready Pinterest bulk-upload CSV.

## What is in this folder

| File | What it does |
|---|---|
| `sync_etsy.py` | Reads your active listings, photos and sections from Etsy |
| `build.py` | Turns that data into the website in `dist/` |
| `site.config.json` | Your settings: domain, the "what comes with every pattern" list, Pinterest boards and posting times |
| `templates/`, `static/` | Page design |
| `.github/workflows/sync-and-deploy.yml` | Runs the sync and publishes the site automatically |

## One-time setup (Claude will walk you through it)

1. Create a new **public** GitHub repository called `patternsbyrish-site` and upload this folder.
2. In the repository: Settings > Secrets and variables > Actions > New repository secret
   - `ETSY_API_KEY` = keystring of the storemind-analytics app
   - `ETSY_SHARED_SECRET` = its shared secret
3. Settings > Pages > Source: **GitHub Actions**.
4. Actions tab > "Sync from Etsy and publish website" > Run workflow. The site goes live in about 2 minutes.

## When the domain is bought

1. Put the domain in `site.config.json` as `"custom_domain": "patternsbyrish.com"`.
2. Settings > Secrets and variables > Actions > Variables: add `SITE_URL` = `https://patternsbyrish.com`.
3. Point the domain's DNS at GitHub Pages and tick "Enforce HTTPS" under Settings > Pages.
4. Claim the domain in Pinterest (Settings > Claimed accounts) and add the RSS feed
   `https://patternsbyrish.com/feed.xml` under Bulk create Pins > Auto-publish.
5. Add the site to Google Search Console and submit `https://patternsbyrish.com/sitemap.xml`.

## Pinterest CSV

Each run builds `tools/pinterest-pins.csv`: up to 3 pins per pattern (one per photo), each with a
different title, the right board, and a publish time at US Eastern 8:30 am, 1 pm and 8:30 pm for the
next 28 days. Download it from the latest run (Actions > run > Artifacts > pinterest-pins) or from
`https://<your-site>/tools/pinterest-pins.csv`, then upload it in Pinterest > Create > Bulk create Pins.
Create the boards listed in `site.config.json` in Pinterest first.

## Try it on your computer

```
pip install -r requirements.txt
python build.py --preview
```
Then open `dist/index.html`. Without an Etsy key it uses `data/sample_listings.json`.
