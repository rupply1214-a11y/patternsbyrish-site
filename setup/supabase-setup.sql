-- Patterns by Rish website: admin panel database.
-- Run once in Supabase: SQL Editor > New query > paste everything > Run.
-- Safe to run again.

-- 1. Who may use the admin panel. Change the email if you log in with a different one.
create table if not exists public.admins (email text primary key);
insert into public.admins (email) values ('patternsbyrish@gmail.com') on conflict do nothing;

create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where lower(email) = lower(auth.jwt() ->> 'email'));
$$;

-- 2. Website settings (banners, sale, announcement bar, sections, featured and hidden patterns)
create table if not exists public.site_content (
  id int primary key default 1 check (id = 1),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);
insert into public.site_content (id, data) values (1, $q${
  "sale_percent": 35,
  "announcements": [
    "35% off every pattern on Etsy right now",
    "Instant PDF download, nothing to wait for",
    "Most patterns come in sizes XS to 5XL",
    "Print on A4, US Letter or A0"
  ],
  "hero_slides": [
    {
      "title": "Sew the dress you can't find in stores",
      "text": "Linen maxis, tea dresses, wrap dresses and bridal gowns. Printable PDF patterns, graded XS to 5XL.",
      "button": "Shop dress patterns",
      "link": "category/dresses/",
      "category": "dresses",
      "product_ids": [],
      "color": "blush",
      "note": "cut 1 on fold"
    },
    {
      "title": "Patterns drafted for every body",
      "text": "Plus size dresses, trousers and tops with proper room through the bust, waist and hips.",
      "button": "Shop plus size",
      "link": "category/plus-size/",
      "category": "plus-size",
      "product_ids": [],
      "color": "mint",
      "note": "XS to 5XL"
    },
    {
      "title": "More patterns, less money",
      "text": "Matching sets and bundles cost less than buying each pattern on its own.",
      "button": "See the bundles",
      "link": "category/bundles/",
      "category": "bundles",
      "product_ids": [],
      "color": "butter",
      "note": "save with a set"
    }
  ],
  "home_rows": ["dresses", "plus-size", "tops", "bottoms", "mens", "kids"],
  "featured_ids": [],
  "hidden_ids": [],
  "category_text": {},
  "promo": {
    "title": "Build your own bundle",
    "text": "Pick any 5 or any 20 patterns from the shop in one order and pay much less per pattern.",
    "button": "See the bundles",
    "link": "category/bundles/"
  }
}
$q$::jsonb) on conflict (id) do nothing;

-- 3. Blog posts
create table if not exists public.posts (
  slug text primary key,
  title text not null,
  description text default '',
  body text default '',
  category text default '',
  tag text default 'Guide',
  cover text default '',
  published boolean default false,
  date date default current_date,
  updated_at timestamptz default now()
);
insert into public.posts (slug, title, description, body, category, tag, published, date) values ($q$best-fabric-for-linen-dresses$q$, $q$Choosing linen for your next dress$q$, $q$Linen weights, washed linen, linen blends and how to pre-wash it so your finished dress doesn't shrink.$q$, $q$Linen is the fabric most of our dress patterns are photographed in, and for good reason: it's breathable, it gets softer with every wash and it holds the shape of a boat neck or a trapeze skirt beautifully. It's also easy to buy the wrong one. Here's what to look for.

## Linen weight

Fabric shops describe linen by weight, in grams per square metre (gsm) or ounces per square yard.

- **Light (about 110 to 150 gsm)**: floaty and slightly sheer. Good for blouses, slip dresses and anything gathered. You may want a lining or slip underneath.
- **Medium (about 150 to 200 gsm)**: the all-rounder for dresses, tops, skirts and shirts. If a pattern just says "linen", this is the safe choice.
- **Heavy (200 gsm and up)**: structured, almost like canvas. Good for trousers, pinafores, jackets and A-line skirts that should stand away from the body.

## Washed or not washed

**Stonewashed** or **pre-washed** linen has already been softened and shrunk at the mill. It's soft from day one and wrinkles in a relaxed, lived-in way. Unwashed linen is crisper and cheaper, but it will shrink and soften once you wash it, so always wash it before cutting.

## Linen blends

- **Linen-cotton** wrinkles less and is usually cheaper. A good first linen.
- **Linen-viscose (rayon)** drapes more, so it suits flowing maxi dresses and gathered skirts.
- **100% linen** is the most breathable and ages the best.

## Pre-wash before you cut

Linen can shrink noticeably the first time it's washed, especially if it's unwashed linen. Wash and dry the fabric the same way you'll wash the finished garment, before you cut anything. Then press it while it's still slightly damp; linen presses best with a hot iron and a bit of moisture.

## How much to buy

Each of our patterns lists the fabric needed for each size. Buy that amount plus a little extra for shrinkage and pattern matching if your linen is striped or checked. Check the width too: most linen is about 140 to 150 cm (55 to 60 inches) wide, and the fabric chart assumes a width.

## Sewing linen

- Use a universal or sharp machine needle, size 80/12 for medium linen.
- Linen frays, so finish the raw edges with an overlocker, zigzag stitch or French seams.
- Stay-stitch curved necklines straight away; loose-weave linen stretches out of shape if handled a lot.$q$, $q$dresses$q$, $q$Fabric$q$, true, $q$2026-10-15$q$) on conflict (slug) do nothing;
insert into public.posts (slug, title, description, body, category, tag, published, date) values ($q$how-to-choose-your-sewing-pattern-size$q$, $q$How to choose your size on a sewing pattern$q$, $q$Sewing pattern sizes don't match shop sizes. How to measure yourself, read the size chart and what to do when you're between sizes.$q$, $q$The size you buy in a shop tells you very little about your sewing pattern size. Every pattern company drafts to its own body measurements, so the only reliable way to choose is with a tape measure and the size chart in the pattern.

## Take three measurements

Use a soft measuring tape, wear thin clothes or your usual underwear, and keep the tape level and snug without pulling.

- **Bust**: around the fullest part of your chest, under your arms.
- **Waist**: around your natural waist, the narrowest point, usually just above the belly button. Bend to one side; the crease that forms is your natural waist.
- **Hips**: around the fullest part of your bottom, usually 18 to 23 cm (7 to 9 inches) below your waist.

Write them down. Measure twice if the numbers look surprising.

## Compare with the size chart, not the label

Find the body measurement chart in the pattern and find your bust, waist and hip numbers. Ignore the letter on the size for now. It's common to land in different sizes at different points. That's normal, and it's one of the best reasons to sew your own clothes.

## Look at the finished garment measurements

Many patterns also list the finished garment measurements: how big the garment itself is. The difference between your body and the garment is called **ease**. A fitted dress might have only a little ease at the waist; a relaxed linen dress might have a lot. If you like a looser or closer fit than the design shows, the finished measurements help you choose.

## Choose by the part that matters most

- **Dresses and tops**: choose by your bust measurement, because the shoulders and bust are the hardest to alter. Adjust the waist and hips afterwards.
- **Skirts and trousers**: choose by your hips, then adjust the waist.
- **Loose, relaxed styles**: you can often go by the measurement that falls in the largest size.

## Between sizes? Blend them

If your bust is one size and your waist or hips another, you can blend between sizes. On the pattern, start on your bust size line, then draw a smooth curve across to your waist size line, and on to your hip size line. Do the same on every piece that joins that seam, so the seams still match.

If blending sounds like too much for a first project, choose the larger size and take the side seams in when you try it on. It's much easier to take fabric away than to add it.

## Make a quick test version

For a fitted dress or anything in expensive fabric, sew a quick test version in cheap fabric first. Sewists call it a toile or a muslin. Try it on, pin out or let out what you need, and copy those changes to your paper pattern.$q$, $q$plus-size$q$, $q$Fit$q$, true, $q$2026-10-18$q$) on conflict (slug) do nothing;
insert into public.posts (slug, title, description, body, category, tag, published, date) values ($q$how-to-print-pdf-sewing-patterns$q$, $q$How to print a PDF sewing pattern at the right size$q$, $q$A4, US Letter or A0, actual size, the test square and taping the pages. Everything you need to print a PDF pattern that fits.$q$, $q$A PDF sewing pattern is only as accurate as your print. Print it a few percent too small and a dress drafted for your measurements comes out a size smaller. The good news is that getting it right takes one setting and one measurement.

## Pick the file that suits you

Our patterns come in three print formats, and you only need one of them.

- **A4** is the standard home printer paper in most of the world.
- **US Letter** is the standard home printer paper in the US and Canada.
- **A0** is one very large sheet (about 84 × 119 cm). Home printers can't print it, but copy shops and print shops can, and you skip the taping completely.

If you're not sure which paper your printer has, look at the box: A4 is 21 × 29.7 cm, US Letter is 8.5 × 11 inches.

## Set the printer to actual size

Open the PDF in a free PDF reader such as Adobe Acrobat Reader rather than in a web browser, which sometimes rescales pages. In the print window:

1. Choose **Actual size** or set the scale to **100%**.
2. Turn off **Fit to page**, **Shrink oversized pages** and any "scale to fit" option.
3. Print in portrait, unless the file says otherwise.

That's the setting that matters. Everything else, including colour or black and white, is up to you.

## Check the test square first

Most PDF patterns have a test square, a small box with its size printed beside it. Print that page first and measure the square with a ruler. If it matches the size printed next to it, your settings are right and you can print every page. If it's off, even by a few millimetres, recheck the scale setting before printing anything else. A small error on one page adds up across a whole skirt panel.

## Tape the pages together

Lay the pages out in order. Most PDF patterns number the pages or use a grid of letters and numbers, so you can see which page goes where.

- Trim one side and the bottom edge of each page, or fold them under.
- Line up the marks where pages meet, so the pattern lines run straight across.
- Tape row by row, then join the rows.

Plan on 15 to 30 minutes for a dress. Put on a podcast.

## Cut your size, or trace it

Each size has its own line, often in its own colour or dash style. You can cut along your size directly, or trace it onto tracing paper or medical exam paper so you keep the other sizes for later. Tracing is worth it if you're between sizes, sewing for someone else, or think you'll make the pattern again.

## When to use a copy shop instead

If you have a big pattern, no printer, or you simply hate taping, send the A0 file to a local copy shop or an online print service. Ask for it printed **at 100%, black and white, on plain paper**. It usually costs a few dollars per sheet and you'll have the whole pattern in one piece.$q$, $q$dresses$q$, $q$Printing$q$, true, $q$2026-10-20$q$) on conflict (slug) do nothing;
insert into public.posts (slug, title, description, body, category, tag, published, date) values ($q$sewing-tools-for-beginners$q$, $q$The beginner's sewing kit for PDF patterns$q$, $q$The tools you actually need to sew from a PDF pattern, and the ones you can skip until later.$q$, $q$You don't need a room full of gadgets to sew from a PDF pattern. Here's the short list that covers almost every pattern in our shop, plus a few things that are nice to have once you're hooked.

## The essentials

- **A sewing machine** that does a straight stitch and a zigzag. A basic model is fine for every woven and knit pattern we sell.
- **Fabric scissors.** One sharp pair used only for fabric. Paper blunts scissors quickly, so keep a second, cheaper pair for cutting out the printed pattern.
- **A soft measuring tape**, 150 cm or 60 inches long, for your body measurements and checking the printed test square.
- **Pins or sewing clips** to hold the pattern to the fabric and the seams together. Clips are handy on thick or delicate fabric that pins would mark.
- **All-purpose thread** in a colour that matches your fabric. Polyester thread works for most fabrics.
- **Clear tape and a ruler** to join the printed PDF pages.
- **An iron.** Pressing each seam as you go is the single biggest difference between home-made and hand-made.

## Nice to have

- **A rotary cutter and cutting mat** cut faster and more accurately than scissors, especially on slippery fabric.
- **Pattern weights** instead of pins. Tins of food work too.
- **A seam ripper.** You will unpick something. Everyone does.
- **Tracing paper** so you can trace your size and keep the original pattern intact.
- **Ballpoint or stretch needles** if you sew knit patterns like our tees, bodycon dresses and hoodies.
- **An overlocker (serger)** to finish seams quickly. Zigzag stitch does the same job more slowly.

## A good first project

Pick a pattern with few pieces and no closures, in a stable woven fabric like medium linen or cotton. A gathered or A-line skirt, a boat neck top or a simple tea dress are all good first makes. Read the instruction booklet from start to finish before you cut, so you know where you're going.$q$, $q$tops$q$, $q$Beginners$q$, true, $q$2026-10-12$q$) on conflict (slug) do nothing;
insert into public.posts (slug, title, description, body, category, tag, published, date) values ($q$woven-vs-knit-fabric$q$, $q$Woven or knit? Matching fabric to your pattern$q$, $q$Why a pattern drafted for knit fabric won't fit in a woven one, and how to tell the two apart in the fabric shop.$q$, $q$Every pattern in our shop says whether it's drafted for **woven** or **knit** fabric. It's one of the most important lines in the pattern, because the two behave completely differently.

## The difference

**Woven fabric** is made of threads crossing over and under each other, like linen, cotton poplin, denim, satin and chambray. It doesn't stretch much, except a little on the diagonal (the bias).

**Knit fabric** is made of loops of yarn, like a T-shirt. Jersey, rib knit, French terry and sweatshirt fleece are all knits. It stretches, often a lot, and springs back.

## Why it matters

A pattern drafted for knit fabric is cut smaller than your body, because the fabric stretches to fit you. That's how a bodycon dress or a fitted tee slips on without a zip. Sew the same pattern in linen and you won't be able to get it over your head.

The opposite also causes trouble. A woven pattern sewn in a stretchy knit can come out baggy and saggy, and buttonholes and zips will ripple.

## How to tell them apart

- **Look at the cut edge.** Woven fabric frays into loose threads. Knit fabric usually curls and doesn't fray.
- **Stretch it.** Pull a small section across the width. A knit stretches easily and bounces back.
- **Look closely at the surface.** Knits show tiny V-shaped columns of loops, like a T-shirt.

## Knits: check the stretch percentage

Knit patterns often say how much stretch the fabric needs, for example "at least 40% stretch". To test, mark 10 cm on the fabric, stretch it gently across the width, and see how far it goes. If 10 cm reaches 14 cm, that's 40% stretch.

## Sewing tips

- Use a **ballpoint or stretch needle** for knits, so the needle slides between the loops instead of breaking them.
- Sew knits with a narrow zigzag or a stretch stitch, so the seams can stretch with the fabric.
- For wovens, a universal needle and a straight stitch are all you need. Finish the edges so they don't fray.$q$, $q$tops$q$, $q$Fabric$q$, true, $q$2026-10-08$q$) on conflict (slug) do nothing;

-- 4. Access rules: anyone can read the site settings and published posts (they are on the public website anyway);
--    only admins can change anything.
alter table public.admins enable row level security;
alter table public.site_content enable row level security;
alter table public.posts enable row level security;

drop policy if exists "admins see admins" on public.admins;
create policy "admins see admins" on public.admins for select using (public.is_admin());

drop policy if exists "public reads settings" on public.site_content;
create policy "public reads settings" on public.site_content for select using (true);
drop policy if exists "admins change settings" on public.site_content;
create policy "admins change settings" on public.site_content for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "public reads published posts" on public.posts;
create policy "public reads published posts" on public.posts for select using (published or public.is_admin());
drop policy if exists "admins change posts" on public.posts;
create policy "admins change posts" on public.posts for all using (public.is_admin()) with check (public.is_admin());

-- 5. Image storage for banners and blog photos
insert into storage.buckets (id, name, public) values ('site-images', 'site-images', true) on conflict (id) do nothing;
drop policy if exists "public sees site images" on storage.objects;
create policy "public sees site images" on storage.objects for select using (bucket_id = 'site-images');
drop policy if exists "admins upload site images" on storage.objects;
create policy "admins upload site images" on storage.objects for insert with check (bucket_id = 'site-images' and public.is_admin());
drop policy if exists "admins change site images" on storage.objects;
create policy "admins change site images" on storage.objects for update using (bucket_id = 'site-images' and public.is_admin());
drop policy if exists "admins delete site images" on storage.objects;
create policy "admins delete site images" on storage.objects for delete using (bucket_id = 'site-images' and public.is_admin());
