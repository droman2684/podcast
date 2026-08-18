-- Empire Pod cloud sync — run this once in the Supabase SQL Editor
-- (Project -> SQL Editor -> New query -> paste -> Run)

create table podcasts (
  user_id uuid not null references auth.users(id),
  id text not null,
  feed_url text,
  is_private boolean not null default false,
  custom_artwork_url text,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  primary key (user_id, id)
);

create table podcast_settings (
  user_id uuid not null references auth.users(id),
  podcast_id text not null,
  notify boolean not null default false,
  -- Newest episode pubDate this account has "seen" for this podcast, synced
  -- across devices so mobile's auto-queue-new-episodes feature (state/store.ts
  -- loadLibrary) has one shared high-water mark instead of each device
  -- tracking its own locally. A per-device-only mark meant a device that
  -- hadn't loaded its library in a while could still treat an episode as
  -- "new" and re-add it to the queue after another device had already
  -- auto-queued *and the user had deliberately removed* it — the queue
  -- silently un-removing something the user just took out.
  last_seen_pub_date text,
  updated_at timestamptz not null,
  primary key (user_id, podcast_id)
);

create table stations (
  user_id uuid not null references auth.users(id),
  id text not null,
  name text,
  podcast_ids jsonb not null default '[]',
  sort_by text not null default 'newest',
  episodes_per_show int not null default 5,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  primary key (user_id, id)
);

create table queue (
  user_id uuid primary key references auth.users(id),
  episode_ids jsonb not null default '[]',
  updated_at timestamptz not null
);

create table queue_prefs (
  user_id uuid primary key references auth.users(id),
  sort_mode text not null,
  group_by_show boolean not null,
  queue_view text not null,
  updated_at timestamptz not null
);

create table playback_positions (
  user_id uuid not null references auth.users(id),
  episode_id text not null,
  position_sec numeric not null,
  updated_at timestamptz not null,
  primary key (user_id, episode_id)
);

create table episode_played (
  user_id uuid not null references auth.users(id),
  episode_id text not null,
  podcast_id text not null,
  played boolean not null default false,
  duration_sec_override numeric,
  updated_at timestamptz not null,
  primary key (user_id, episode_id)
);

create table private_feeds (
  user_id uuid not null references auth.users(id),
  id text not null,
  name text,
  url text,
  feed_user text,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  primary key (user_id, id)
);

alter table podcasts enable row level security;
alter table podcast_settings enable row level security;
alter table stations enable row level security;
alter table queue enable row level security;
alter table queue_prefs enable row level security;
alter table playback_positions enable row level security;
alter table episode_played enable row level security;
alter table private_feeds enable row level security;

create policy "owner_all" on podcasts for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "owner_all" on podcast_settings for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "owner_all" on stations for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "owner_all" on queue for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "owner_all" on queue_prefs for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "owner_all" on playback_positions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "owner_all" on episode_played for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "owner_all" on private_feeds for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Enables live cross-device sync for the mobile app (state/store.ts
-- subscribeRealtime) — without this, Supabase Realtime has nothing
-- published for these tables and the client-side subscription silently
-- receives no events (no error, just nothing happens). RLS above already
-- restricts each row to its owner, so this is safe to run as-is.
-- ADD TABLE errors if the table's already in the publication (no IF NOT
-- EXISTS form for this in Postgres), so each is wrapped to make the whole
-- block safe to re-run.
do $$ begin
  alter publication supabase_realtime add table playback_positions;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table queue;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table episode_played;
exception when duplicate_object then null;
end $$;

-- Adds the synced auto-queue watermark column for an existing database
-- (a fresh create table above already includes it) — run this once too.
alter table podcast_settings add column if not exists last_seen_pub_date text;

-- Server-authoritative updated_at — run this once too (Supabase SQL Editor).
--
-- Every sync table's updated_at was being stamped by whichever device made
-- the edit, using that device's own clock (new Date().toISOString() in both
-- the mobile and desktop apps). Both apps then decide "which edit wins" by
-- comparing those timestamps across devices. Any clock drift between
-- devices — a phone a few seconds fast, a laptop a few seconds slow, which
-- is common and not something either app can detect — makes that comparison
-- wrong in either direction: a genuinely older edit can look newer (and
-- incorrectly overwrite a real edit on another device), or a genuinely
-- newer edit can look older (and get silently rejected as stale). This is
-- what "sync randomly doesn't work" looks like from the outside — playback
-- position jumping backward, the queue reverting — with no consistent
-- pattern, because it depends on whichever device's clock happens to be off
-- at that moment.
--
-- This trigger makes the database itself stamp updated_at using its own
-- server clock, ignoring whatever value a client sent. Every device then
-- compares against the same clock, so "which edit is newer" becomes
-- unambiguous no matter how far off any individual device's clock is.
-- Neither app needs a code change for this — they already just read back
-- whatever updated_at the row ends up with.
create or replace function set_synced_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_podcasts_updated_at on podcasts;
create trigger trg_podcasts_updated_at
  before insert or update on podcasts
  for each row execute function set_synced_updated_at();

drop trigger if exists trg_podcast_settings_updated_at on podcast_settings;
create trigger trg_podcast_settings_updated_at
  before insert or update on podcast_settings
  for each row execute function set_synced_updated_at();

drop trigger if exists trg_stations_updated_at on stations;
create trigger trg_stations_updated_at
  before insert or update on stations
  for each row execute function set_synced_updated_at();

drop trigger if exists trg_queue_updated_at on queue;
create trigger trg_queue_updated_at
  before insert or update on queue
  for each row execute function set_synced_updated_at();

drop trigger if exists trg_queue_prefs_updated_at on queue_prefs;
create trigger trg_queue_prefs_updated_at
  before insert or update on queue_prefs
  for each row execute function set_synced_updated_at();

drop trigger if exists trg_playback_positions_updated_at on playback_positions;
create trigger trg_playback_positions_updated_at
  before insert or update on playback_positions
  for each row execute function set_synced_updated_at();

drop trigger if exists trg_episode_played_updated_at on episode_played;
create trigger trg_episode_played_updated_at
  before insert or update on episode_played
  for each row execute function set_synced_updated_at();

drop trigger if exists trg_private_feeds_updated_at on private_feeds;
create trigger trg_private_feeds_updated_at
  before insert or update on private_feeds
  for each row execute function set_synced_updated_at();
