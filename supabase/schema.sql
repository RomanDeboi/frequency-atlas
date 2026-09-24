-- Frequency Atlas initial database schema for Supabase/PostgreSQL.
-- Execute after enabling Supabase Auth. All user-owned rows are protected with RLS.

create extension if not exists pgcrypto;

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  slug text not null,
  color text not null default '#93a0b2',
  icon text,
  created_at timestamptz not null default now(),
  unique(user_id, slug)
);

create table if not exists public.entities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  name text not null,
  manufacturer text,
  entity_type text not null default 'technology',
  description text not null default '',
  notes text not null default '',
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.frequency_bands (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_id uuid not null references public.entities(id) on delete cascade,
  band_name text not null,
  start_mhz numeric(14,6) not null check (start_mhz >= 0),
  end_mhz numeric(14,6) not null check (end_mhz >= start_mhz),
  center_mhz numeric(14,6),
  bandwidth_mhz numeric(14,6),
  purpose text not null default '',
  technology text,
  modulation text,
  channel_plan text,
  description text not null default '',
  color_override text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.observations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  frequency_band_id uuid references public.frequency_bands(id) on delete set null,
  title text not null default '',
  observed_at timestamptz not null default now(),
  center_mhz numeric(14,6),
  bandwidth_mhz numeric(14,6),
  receiver text,
  location_label text,
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.screenshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_id uuid references public.entities(id) on delete cascade,
  frequency_band_id uuid references public.frequency_bands(id) on delete cascade,
  observation_id uuid references public.observations(id) on delete cascade,
  storage_path text not null,
  kind text not null default 'spectrum' check (kind in ('spectrum','waterfall','other')),
  caption text not null default '',
  center_mhz numeric(14,6),
  span_mhz numeric(14,6),
  captured_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists frequency_bands_start_end_idx on public.frequency_bands(start_mhz, end_mhz);
create index if not exists entities_user_idx on public.entities(user_id);
create index if not exists observations_user_time_idx on public.observations(user_id, observed_at desc);

alter table public.categories enable row level security;
alter table public.entities enable row level security;
alter table public.frequency_bands enable row level security;
alter table public.observations enable row level security;
alter table public.screenshots enable row level security;

create policy "users own categories" on public.categories for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users own entities" on public.entities for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users own bands" on public.frequency_bands for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users own observations" on public.observations for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users own screenshots" on public.screenshots for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
