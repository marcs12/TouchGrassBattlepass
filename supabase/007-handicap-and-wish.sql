-- Migration 7: a handicap for the week, and something to save for.
-- Run this after 006-week-on-points.sql, in the Supabase SQL editor.
--
-- Adds:
--   members.handicap          - each player's agreed multiplier for the week
--   households.wish_reward_id - the reward you are both saving toward
--   set_wish()                - the only way to change it, since households
--                               has no update policy and should not get one
--
-- The handicap exists because a race on raw points quietly favours whoever has
-- the lighter week at work. The two of you already know which of you that is,
-- so this is a number you agree on out loud rather than one the database
-- guesses at - which is exactly what the old median target was doing.

-- ---------------------------------------------------------------- tables

-- 1 is level. The check keeps a typo from making a week unwinnable.
alter table members add column if not exists handicap numeric not null default 1;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'members_handicap_check'
  ) then
    alter table members add constraint members_handicap_check
      check (handicap >= 0.5 and handicap <= 2);
  end if;
end
$$;

-- Null means nothing pinned. It holds a reward id rather than a reference,
-- like habit_checks.habit_id does: the catalog is editable, and a wish that
-- outlives the reward it pointed at should simply stop being shown.
alter table households add column if not exists wish_reward_id text;

-- ---------------------------------------------------------------- rpcs

-- households has read-only policies on purpose - seed_balance lives there, and
-- an update policy would be an update policy on the bank. So the one field
-- that is meant to change goes through a function.
create or replace function set_wish(p_household uuid, p_reward_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_household not in (select my_households()) then
    raise exception 'not your household';
  end if;

  update households
  set wish_reward_id = nullif(trim(coalesce(p_reward_id, '')), '')
  where id = p_household;
end;
$$;

-- ---------------------------------------------------------------- the week

-- Same race as migration 6, with each side's points multiplied by their own
-- agreed handicap first. With both at 1 - the default, and the case this is
-- tuned for - it settles identically.
create or replace function settle_week(
  p_household uuid,
  p_start date,
  p_today date,
  p_week_target integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_end date := p_start + 6;
  v_now date;
  v_m1 uuid;
  v_m2 uuid;
  v_h1 numeric;
  v_h2 numeric;
  v_p1 integer;
  v_p2 integer;
  v_a1 integer;
  v_a2 integer;
  v_target integer;
  v_front integer;
  v_lead integer;
  v_winner uuid;
  v_clear boolean;
  v_week weeks%rowtype;
begin
  if p_household not in (select my_households()) then
    raise exception 'not your household';
  end if;

  -- Developer mode can shift the client's idea of today by up to a week, so
  -- allow that much slack and no more: this must never settle a future week.
  v_now := least(coalesce(p_today, current_date), current_date + 7);
  if v_now <= v_end then
    raise exception 'week is not over yet';
  end if;

  -- The target is a divisor, so it can never be zero.
  v_target := greatest(coalesce(p_week_target, 1), 1);

  select id, coalesce(handicap, 1) into v_m1, v_h1
  from members where household_id = p_household and slot = 1;
  select id, coalesce(handicap, 1) into v_m2, v_h2
  from members where household_id = p_household and slot = 2;

  insert into weeks (household_id, start_day)
  values (p_household, p_start)
  on conflict (household_id, start_day) do nothing;

  v_p1 := member_points(p_household, v_m1, p_start, v_end);
  v_p2 := member_points(p_household, v_m2, p_start, v_end);
  v_a1 := round(v_p1 * v_h1);
  v_a2 := round(v_p2 * v_h2);

  v_front := greatest(v_a1, v_a2);
  v_lead := abs(v_a1 - v_a2);

  -- Nobody takes a week off the other one over a rounding error, and a week
  -- nobody played is nobody's win.
  v_winner := case
    when v_front = 0 or v_lead < v_front * 0.05 then null
    when v_a1 > v_a2 then v_m1
    else v_m2
  end;
  v_clear := (v_a1 + v_a2) >= (v_target * 2);

  update weeks set
    status = 'settled',
    settled_at = now(),
    winner_member_id = v_winner,
    score = jsonb_build_object(
      'members', jsonb_build_object(
        v_m1::text, jsonb_build_object(
          'points', v_p1, 'adjusted', v_a1, 'weight', v_h1, 'target', v_target,
          'score', round(v_a1::numeric / v_target, 4)
        ),
        v_m2::text, jsonb_build_object(
          'points', v_p2, 'adjusted', v_a2, 'weight', v_h2, 'target', v_target,
          'score', round(v_a2::numeric / v_target, 4)
        )
      ),
      'team', jsonb_build_object(
        'points', v_a1 + v_a2, 'target', v_target * 2, 'clear', v_clear
      ),
      'tie', v_winner is null
    )
  where household_id = p_household
    and start_day = p_start
    and status = 'open'
  returning * into v_week;

  -- Someone else settled it first. Their prizes are already minted.
  if not found then
    return;
  end if;

  if v_winner is not null then
    insert into redemptions (household_id, member_id, reward_id, title, cost, icon, tier)
    values (
      p_household,
      v_winner,
      'week-' || p_start || '-win',
      coalesce(
        case when v_winner = v_m1 then v_week.stake_2 else v_week.stake_1 end,
        'Winner picks'
      ),
      0, 'trophy', 'high'
    );
  end if;

  if v_clear then
    insert into redemptions (household_id, member_id, reward_id, title, cost, icon, tier)
    values (
      p_household, null,
      'week-' || p_start || '-team',
      coalesce(v_week.stake_team, 'Team clear'),
      0, 'flag', 'high'
    );
  end if;
end;
$$;
