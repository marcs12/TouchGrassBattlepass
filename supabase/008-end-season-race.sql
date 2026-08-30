-- Migration 8: losing the rollover race is not an error.
-- Run this after 007-handicap-and-wish.sql, in the Supabase SQL editor.
--
-- Both phones press "start the next season" within seconds of each other. The
-- first closes season 1 and opens season 2; the second then evaluates against
-- season 2, finds it has no XP yet, and raises 'season is not finished' - so
-- the phone that lost a race it could not see shows an error for something
-- that worked.
--
-- The `ended_at is null` guard on the update was supposed to absorb that, but
-- the XP check runs first and by then it is reading the new season.
--
-- So the caller now says which season it believes it is ending. A phone
-- looking at a season that has already been closed has nothing to do, and
-- says so by returning. Passing nothing keeps the old behaviour.

drop function if exists end_season(uuid, integer);

create or replace function end_season(
  p_household uuid,
  p_required integer,
  p_season smallint default null
)
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

  -- A board that has never opened one gets season 1 here, from zero, so
  -- ending it is about the track rather than the bookkeeping.
  if v_season.household_id is null then
    insert into seasons (household_id, n, xp_base)
    values (p_household, 1, 0)
    on conflict (household_id, n) do nothing;
    select * into v_season from open_season(p_household);
  end if;

  -- The other phone already rolled this one over. Nothing to do, and nothing
  -- worth putting an error banner on screen for.
  if p_season is not null and p_season <> v_season.n then
    return;
  end if;

  v_lifetime := household_xp(p_household);
  v_xp := greatest(0, v_lifetime - v_season.xp_base);

  if v_xp < greatest(coalesce(p_required, 1), 1) then
    raise exception 'season is not finished';
  end if;

  update seasons
  set ended_at = now(), final_xp = v_xp
  where household_id = p_household and n = v_season.n and ended_at is null;

  -- Lost the race between reading and writing.
  if not found then
    return;
  end if;

  insert into seasons (household_id, n, xp_base)
  values (p_household, v_season.n + 1, v_lifetime)
  on conflict (household_id, n) do nothing;
end;
$$;
