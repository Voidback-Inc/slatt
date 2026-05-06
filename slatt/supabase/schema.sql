-- Run this in the Supabase SQL editor

-- profiles table — one row per auth user
create table if not exists public.profiles (
  id                    uuid references auth.users on delete cascade primary key,
  tier                  text not null default 'free' check (tier in ('free', 'pro')),
  queries_today         int  not null default 0,
  queries_reset_date    date not null default current_date,
  stripe_customer_id    text,
  stripe_subscription_id text,
  created_at            timestamptz default now()
);

-- Row-level security
alter table public.profiles enable row level security;

create policy "Users can read own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Auto-create profile row on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── Images storage bucket ─────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('images', 'images', true)
on conflict (id) do nothing;

create policy "Anyone can read images"
  on storage.objects for select
  using (bucket_id = 'images');

create policy "Authenticated users can upload images"
  on storage.objects for insert
  with check (bucket_id = 'images' and auth.role() = 'authenticated');

-- ── Collective images table ───────────────────────────────────────────────────
create table if not exists public.collective_images (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users(id) on delete cascade not null,
  image_url    text not null,
  description  text not null,
  created_at   timestamptz default now()
);

alter table public.collective_images enable row level security;

create policy "Anyone can read collective images"
  on public.collective_images for select
  using (true);

create policy "Users can insert own images"
  on public.collective_images for insert
  with check (auth.uid() = user_id);

-- Full-text search index on description
alter table public.collective_images
  add column if not exists fts tsvector
  generated always as (to_tsvector('english', description)) stored;

create index if not exists collective_images_fts_idx
  on public.collective_images using gin(fts);

-- Edge function secrets to set in Supabase dashboard → Settings → Edge Functions:
--   ANTONLYTICS_API_KEY      your Antonlytics API key
--   ANTONLYTICS_PROJECT_ID   your shared Antonlytics project ID
--   STRIPE_SECRET_KEY        sk_live_xxx
--   STRIPE_MONTHLY_PRICE_ID  price_xxx (from Stripe dashboard)
--   STRIPE_ANNUAL_PRICE_ID   price_xxx (from Stripe dashboard)
--   STRIPE_WEBHOOK_SECRET    whsec_xxx (from Stripe webhook settings)

-- Stripe webhook endpoint to register in Stripe dashboard:
--   https://<your-project>.supabase.co/functions/v1/stripe-webhook
--   Events: checkout.session.completed, customer.subscription.deleted
