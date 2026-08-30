-- Migration 5: seasons end, and the next one begins.
-- Run this after 004-weeks-and-proof.sql, in the Supabase SQL editor.
--
-- Adds:
--   seasons          - one row per season per household. `xp_base` is the
--                      lifetime XP at the moment the season opened, so a
--                      season's XP is simply what has been earned since.
--   tier_claims.season - tiers are claimable once per season, so the primary
--                      key grows a column and the track resets with the season
--   points_before()  - lifetime points banked before a day, so the client can
--                      hold a correct bank without fetching every check row
--
-- What a rollover moves and what it leaves alone:
--   resets  - season XP, and the twelve tier claims with it
--   carries - the shared bank, every coupon, streaks, weeks, photos, catalogs
--
-- The bank carries because points are money and the pass is a track: spending
-- has never pulled the track backwards, and ending a season must not empty
-- the wallet either.

-- ---------------------------------------------------------------- tables

create table if not exists seasons (
  household_id uuid not null references households (id) on delete cascade,
  n smallint not null check (n >= 1),
  -- The boundary is an instant rather than a day. Points banked later the same
  -- afternoon belong to the new season, and no check row has to be rewritten
  -- or double-counted at the seam.
  xp_base integer not null default 0,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  -- What the season finished on, frozen at rollover so the shelf reads the
  -- same number forever even if an old check is later undone.
  final_xp integer,
  primary key (household_id, n)
);

-- Every board that predates this file has been playing season 1 from nothing.
insert into seasons (household_id, n, xp_base, started_at)
select h.id, 1, 0, h.created_at from households h
on conflict (household_id, n) do nothing;

alter table tier_claims add column if not exists season smallint not null default 1;

-- The claim key was (household, tier); a season makes the same tier claimable
-- again. Dropping and re-adding is safe to re-run: the second block only fires
-- when the first has left no primary key behind.
do $$
declare
  v_name text;
begin
  select conname into v_name from pg_constraint
  where conrelid = 'tier_claims'::regclass and contype = 'p';
  if v_name is not null then
    execute format('alter table tier_claims drop constraint %I', v_name);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'tier_claims'::regclass and contype = 'p'
  ) then
    alter table tier_claims
      add constraint tier_claims_pkey primary key (household_id, season, tier);
  end if;
end
$$;

-- ---------------------------------------------------------------- rls

alter table seasons enable row level security;

-- Read-only, like weeks: rolling over is a function so the two phones can
-- race for it safely.
drop policy if exists seasons_read on seasons;
create policy seasons_read on seasons
  for select using (household_id in (select my_households()));

-- ---------------------------------------------------------------- helpers

-- The season currently being played, or nothing on a board that never got one.
create or replace function open_season(p_household uuid)
returns seasons
language sql
stable
security definer
set search_path = public
as $$
  select * from seasons
  where household_id = p_household and ended_at is null
  order by n desc
  limit 1;
$$;

-- XP on the current track. Lifetime XP still means every point ever earned -
-- that is what the bank is derived from - so a season is the difference.
create or replace function season_xp(p_household uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select greatest(
    0,
    household_xp(p_household)
      - coalesce((select xp_base from open_season(p_household)), 0)
  );
$$;

-- Points banked before a day. The client only reads the last few weeks of
-- check rows, so without this its bank would quietly shed every point older
-- than that window while the server's stayed right.
create or replace function points_before(p_household uuid, p_day date)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select sum(points) from habit_checks
    where household_id = p_household
      and household_id in (select my_households())
      and day < p_day
  ), 0);
$$;

-- ---------------------------------------------------------------- rpcs

-- Claiming is unchanged from the client's side; the season it lands in is
-- resolved here, and the XP it is checked against is the season's, not the
-- lifetime total.
create or replace function claim_tier(
  p_household uuid,
  p_tier smallint,
  p_xp_required integer,
  p_bonus integer,
  p_member uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_season smallint;
begin
  if p_household not in (select my_households()) then
    raise exception 'not your household';
  end if;

  select n into v_season from open_season(p_household);

  -- Not every board has a row here: one created after this migration gets its
  -- first on the first claim, and developer mode's wipe takes them all. Opening
  -- one beats refusing a claim over bookkeeping. `xp_base` is zero because
  -- that is exactly what a board with no season row already reads as.
  if v_season is null then
    insert into seasons (household_id, n, xp_base)
    values (p_household, 1, 0)
    on conflict (household_id, n) do nothing;
    select n into v_season from open_season(p_household);
  end if;

  if season_xp(p_household) < p_xp_required then
    raise exception 'tier not unlocked';
  end if;

  insert into tier_claims (household_id, season, tier, bonus, claimed_by)
  values (p_household, v_season, p_tier, p_bonus, p_member)
  on conflict (household_id, season, tier) do nothing;
end;
$$;

-- Closes the season and opens the next one.
--
-- p_required comes from the client for the same reason settle_week's target
-- does: the track lives in code, so only the client knows what finishing it
-- takes. It is clamped, so the worst a bad caller can do is roll over a season
-- that earned a single point.
--
-- Both phones may press this within seconds of each other, so it is idempotent
-- the same way settle_week is: the `ended_at is null` predicate on the update
-- takes the row lock, and whoever loses matches zero rows and returns.
create or replace function end_season(p_household uuid, p_required integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_season seasons;
  v_lifetime integer;
  v_xp integer;
begin
  if p_household not in (select my_households()) then
    raise exception 'not your household';
  end if;

  select * into v_season from open_season(p_household);

  -- Same as claim_tier: a board that has never opened one gets season 1 here,
  -- from zero, so ending it is about the track rather than the bookkeeping.
  if v_season.household_id is null then
    insert into seasons (household_id, n, xp_base)
    values (p_household, 1, 0)
    on conflict (household_id, n) do nothing;
    select * into v_season from open_season(p_household);
  end if;

  v_lifetime := household_xp(p_household);
  v_xp := greatest(0, v_lifetime - v_season.xp_base);

  if v_xp < greatest(coalesce(p_required, 1), 1) then
    raise exception 'season is not finished';
  end if;

  update seasons
  set ended_at = now(), final_xp = v_xp
  where household_id = p_household and n = v_season.n and ended_at is null;

  -- The other phone rolled it over first.
  if not found then
    return;
  end if;

  insert into seasons (household_id, n, xp_base)
  values (p_household, v_season.n + 1, v_lifetime)
  on conflict (household_id, n) do nothing;
end;
$$;

-- ---------------------------------------------------------------- realtime

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'seasons'
  ) then
    alter publication supabase_realtime add table seasons;
  end if;
end
$$;
