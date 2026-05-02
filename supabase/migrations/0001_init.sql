-- Move Tracker initial schema
-- Run this in the Supabase SQL editor.

create extension if not exists "pgcrypto";

-- ---------- rooms ----------
create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  created_at timestamptz not null default now()
);

-- ---------- boxes ----------
create table if not exists public.boxes (
  id uuid primary key default gen_random_uuid(),
  number int unique not null,
  destination_room text not null,
  notes text,
  sealed boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists boxes_number_idx on public.boxes (number);
create index if not exists boxes_destination_room_idx on public.boxes (destination_room);
create index if not exists boxes_created_at_idx on public.boxes (created_at desc);
create index if not exists boxes_updated_at_idx on public.boxes (updated_at desc);

-- ---------- items ----------
create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  box_id uuid not null references public.boxes(id) on delete cascade,
  name text not null,
  description text,
  search_vector tsvector generated always as (
    to_tsvector('english', coalesce(name, '') || ' ' || coalesce(description, ''))
  ) stored,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists items_box_id_idx on public.items (box_id);
create index if not exists items_search_idx on public.items using gin (search_vector);
create index if not exists items_updated_at_idx on public.items (updated_at desc);

-- ---------- item_photos ----------
create table if not exists public.item_photos (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete cascade,
  storage_path text not null,
  display_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists item_photos_item_id_idx on public.item_photos (item_id);

-- ---------- updated_at trigger ----------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists boxes_set_updated_at on public.boxes;
create trigger boxes_set_updated_at
  before update on public.boxes
  for each row execute function public.set_updated_at();

drop trigger if exists items_set_updated_at on public.items;
create trigger items_set_updated_at
  before update on public.items
  for each row execute function public.set_updated_at();

-- ---------- RLS ----------
alter table public.rooms enable row level security;
alter table public.boxes enable row level security;
alter table public.items enable row level security;
alter table public.item_photos enable row level security;

-- Drop and recreate to keep this migration idempotent
drop policy if exists "rooms_authenticated_all" on public.rooms;
create policy "rooms_authenticated_all"
  on public.rooms for all
  to authenticated using (true) with check (true);

drop policy if exists "boxes_authenticated_all" on public.boxes;
create policy "boxes_authenticated_all"
  on public.boxes for all
  to authenticated using (true) with check (true);

drop policy if exists "items_authenticated_all" on public.items;
create policy "items_authenticated_all"
  on public.items for all
  to authenticated using (true) with check (true);

drop policy if exists "item_photos_authenticated_all" on public.item_photos;
create policy "item_photos_authenticated_all"
  on public.item_photos for all
  to authenticated using (true) with check (true);

-- ---------- Pre-seeded rooms ----------
insert into public.rooms (name) values
  ('Kitchen'),
  ('Living Room'),
  ('Master Bedroom'),
  ('Bedroom 2'),
  ('Bedroom 3'),
  ('Bathroom'),
  ('Office'),
  ('Garage'),
  ('Loft'),
  ('Hallway'),
  ('Dining Room'),
  ('Outhouse'),
  ('Other')
on conflict (name) do nothing;
