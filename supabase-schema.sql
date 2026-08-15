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
