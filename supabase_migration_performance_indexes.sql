-- Performance indexes for frequently used read queries.
-- Safe to run multiple times (IF NOT EXISTS).

-- Dashboard / API match list ordering and pagination
create index if not exists idx_matches_played_created_desc
  on public.matches (played_date desc, created_at desc);

-- Common filters on matches
create index if not exists idx_matches_season_id
  on public.matches (season_id);

create index if not exists idx_matches_match_type
  on public.matches (match_type);

create index if not exists idx_matches_player1_id
  on public.matches (player1_id);

create index if not exists idx_matches_player2_id
  on public.matches (player2_id);

create index if not exists idx_matches_winner_id
  on public.matches (winner_id);

-- Date range filtering
create index if not exists idx_matches_played_date
  on public.matches (played_date);

-- Members queries (active roster + name ordering/lookup)
create index if not exists idx_members_is_active_name
  on public.members (is_active, name);

-- Optional: faster exact username queries in admin tables
create index if not exists idx_admins_username
  on public.admins (username);
