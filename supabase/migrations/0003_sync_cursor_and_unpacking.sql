-- 0003: server-stamped timestamps for reliable delta sync, plus unpacking /
-- arrival / tag fields. Additive and idempotent — safe to re-run.

-- ---------- server-stamped updated_at on INSERT as well as UPDATE ----------
-- Delta sync pulls rows with updated_at > cursor. Previously inserts kept the
-- client's timestamp, so a row created offline and uploaded later could land
-- "in the past" and never be pulled by the other device.

alter table public.item_photos add column if not exists updated_at timestamptz not null default now();
alter table public.rooms       add column if not exists updated_at timestamptz not null default now();

create index if not exists item_photos_updated_at_idx on public.item_photos (updated_at desc);
create index if not exists rooms_updated_at_idx on public.rooms (updated_at desc);

drop trigger if exists boxes_set_updated_at on public.boxes;
create trigger boxes_set_updated_at
  before insert or update on public.boxes
  for each row execute function public.set_updated_at();

drop trigger if exists items_set_updated_at on public.items;
create trigger items_set_updated_at
  before insert or update on public.items
  for each row execute function public.set_updated_at();

drop trigger if exists item_photos_set_updated_at on public.item_photos;
create trigger item_photos_set_updated_at
  before insert or update on public.item_photos
  for each row execute function public.set_updated_at();

drop trigger if exists rooms_set_updated_at on public.rooms;
create trigger rooms_set_updated_at
  before insert or update on public.rooms
  for each row execute function public.set_updated_at();

-- ---------- box flags + arrival / unpacking ----------
alter table public.boxes add column if not exists open_first boolean not null default false;
alter table public.boxes add column if not exists fragile    boolean not null default false;
alter table public.boxes add column if not exists heavy      boolean not null default false;
alter table public.boxes add column if not exists arrived    boolean not null default false;
alter table public.boxes add column if not exists unpacked   boolean not null default false;

-- ---------- item unpacking ----------
alter table public.items add column if not exists unpacked boolean not null default false;
