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
