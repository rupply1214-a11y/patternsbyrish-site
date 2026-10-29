-- Patterns by Rish website: admin panel database.
-- Run once in Supabase: SQL Editor > New query > paste everything > Run.
-- Safe to run again.

-- 1. Who may use the admin panel. Change the email if you log in with a different one.
create table if not exists public.admins (email text primary key);
insert into public.admins (email) values ('patternsbyrish@gmail.com') on conflict do nothing;

create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where lower(email) = lower(auth.jwt() ->> 'email'));
$$;


-- 2. Website settings saved from the admin panel. Starts empty: the website's own content is the default,
--    and only what you change in the admin panel is stored here.
create table if not exists public.site_content (
  id int primary key default 1 check (id = 1),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);
insert into public.site_content (id, data) values (1, '{}'::jsonb) on conflict (id) do nothing;

-- 3. Stitch Journal posts written in the admin panel (the built-in guides stay on the website as well)
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

-- 6. Customer wishlists ("My sewing room"): each signed-in customer sees and changes only their own saved patterns.
create table if not exists public.wishlist (
  user_id uuid not null references auth.users (id) on delete cascade,
  listing_id text not null,
  created_at timestamptz default now(),
  primary key (user_id, listing_id)
);
alter table public.wishlist enable row level security;
drop policy if exists "own wishlist" on public.wishlist;
create policy "own wishlist" on public.wishlist for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 7. Lets the login page check whether the signed-in person is an admin (returns true or false only).
grant execute on function public.is_admin() to authenticated;

-- 8. Website orders (PayPal). Orders are written only by the payment check on the server, never by the browser.
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  email text not null,
  items jsonb not null default '[]'::jsonb,        -- [{ "id": "<etsy listing id>", "name": "...", "price": 4.50 }]
  amount numeric(10,2) not null,
  currency text not null default 'USD',
  paypal_order_id text unique,
  paypal_capture_id text,
  status text not null default 'created' check (status in ('created','paid','refunded','failed')),
  created_at timestamptz default now(),
  paid_at timestamptz
);
create index if not exists orders_user_idx on public.orders (user_id);
create index if not exists orders_created_idx on public.orders (created_at);
alter table public.orders enable row level security;
drop policy if exists "own orders" on public.orders;
create policy "own orders" on public.orders for select using (auth.uid() = user_id or public.is_admin());
drop policy if exists "admins delete orders" on public.orders;
create policy "admins delete orders" on public.orders for delete using (public.is_admin());

-- 9. Google Drive download link for each pattern. Only admins can see or change these;
--    buyers get a link only for patterns they have paid for (see my_downloads below).
create table if not exists public.pattern_files (
  listing_id text primary key,
  drive_url text not null,
  updated_at timestamptz default now()
);
alter table public.pattern_files enable row level security;
drop policy if exists "admins manage files" on public.pattern_files;
create policy "admins manage files" on public.pattern_files for all using (public.is_admin()) with check (public.is_admin());

create or replace function public.my_downloads()
returns table (listing_id text, name text, drive_url text, paid_at timestamptz)
language sql stable security definer set search_path = public as $$
  select distinct on (i->>'id') i->>'id', i->>'name', f.drive_url, o.paid_at
  from public.orders o
  cross join lateral jsonb_array_elements(o.items) i
  left join public.pattern_files f on f.listing_id = i->>'id'
  where o.status = 'paid' and o.user_id = auth.uid()
  order by i->>'id', o.paid_at desc;
$$;
grant execute on function public.my_downloads() to authenticated;

-- 10. Storage meter for the admin panel (free plan = 500 MB database).
create or replace function public.db_usage()
returns bigint language sql stable security definer set search_path = public as $$
  select case when public.is_admin() then pg_database_size(current_database()) else null end;
$$;
grant execute on function public.db_usage() to authenticated;

-- 11. Website-only patterns (not on Etsy), added in the admin panel. Everyone can read published ones.
create table if not exists public.products (
  id text primary key default ('w' || to_char(now(), 'YYMMDDHH24MISS')),
  title text not null,
  subtitle text default '',
  description text default '',
  price numeric(10,2) not null default 0,
  compare_at numeric(10,2),
  cats text[] not null default '{dresses}',
  sizes text default '',
  formats text[] default '{A4,US Letter,A0 copy shop}',
  tags text[] default '{}',
  images jsonb not null default '[]'::jsonb,       -- [{ "full": "https://…", "medium": "https://…" }]
  sketch text default '',
  published boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.products enable row level security;
drop policy if exists "public reads published products" on public.products;
create policy "public reads published products" on public.products for select using (published or public.is_admin());
drop policy if exists "admins change products" on public.products;
create policy "admins change products" on public.products for all using (public.is_admin()) with check (public.is_admin());

-- 12. Coupon codes. Only admins see them; the checkout on the server checks a code a buyer types.
create table if not exists public.coupons (
  code text primary key check (code = upper(code)),
  percent int not null check (percent between 1 and 90),
  active boolean default true,
  expires_at timestamptz,
  max_uses int,
  used int not null default 0,
  note text default '',
  created_at timestamptz default now()
);
alter table public.coupons enable row level security;
drop policy if exists "admins manage coupons" on public.coupons;
create policy "admins manage coupons" on public.coupons for all using (public.is_admin()) with check (public.is_admin());

-- 13. Orders: coupon used, discount, and admin can mark refunds.
alter table public.orders add column if not exists coupon text;
alter table public.orders add column if not exists discount numeric(10,2) default 0;
alter table public.orders add column if not exists note text default '';
drop policy if exists "admins update orders" on public.orders;
create policy "admins update orders" on public.orders for update using (public.is_admin()) with check (public.is_admin());

-- 14. Email list (newsletter sign-ups). Anyone may add their own email; only admins can see or remove the list.
create table if not exists public.subscribers (
  email text primary key check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(email) <= 254),
  source text default 'footer',
  created_at timestamptz default now()
);
alter table public.subscribers enable row level security;
drop policy if exists "anyone can subscribe" on public.subscribers;
create policy "anyone can subscribe" on public.subscribers for insert with check (true);
drop policy if exists "admins see subscribers" on public.subscribers;
create policy "admins see subscribers" on public.subscribers for select using (public.is_admin());
drop policy if exists "admins remove subscribers" on public.subscribers;
create policy "admins remove subscribers" on public.subscribers for delete using (public.is_admin());

-- 15. Orders: remember when the confirmation email went out.
alter table public.orders add column if not exists emailed_at timestamptz;
