-- Migration 6: the week is won on points.
-- Run this after 005-seasons.sql, in the Supabase SQL editor.
--
-- The week used to score each player against the median of their own last four
-- weeks. It read well and played badly: the target moved every time you had a
-- good week, so a strong run quietly raised the bar on the person having it,
-- and a week where somebody simply did more could still be handed to the other
-- one. Two people who live together already know whose week was harder - they
-- do not need the database to model it.
--
-- So it is now a straight race: whoever banks more points over the seven days
-- takes the week. A lead under 5% of the leader's own total is still a dead
-- heat, and a week where neither of you banked anything is one too.
--
-- The client supplies the week target - five full daily lists plus the weekly
-- list - for the same reason it used to supply the minimum: the habit lists are
-- editable per household, so only the client knows what a good week is worth.
-- It is used for the progress numbers and for the team prize, never to pick a
-- winner.
--
-- The parameter is renamed, which `create or replace` will not do, so the old
-- function is dropped first. Nothing else about the week changes: the same
-- lock, the same idempotence, the same prizes.

drop function if exists settle_week(uuid, date, date, integer);

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
  v_p1 integer;
  v_p2 integer;
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

  select id into v_m1 from members where household_id = p_household and slot = 1;
  select id into v_m2 from members where household_id = p_household and slot = 2;

  insert into weeks (household_id, start_day)
  values (p_household, p_start)
  on conflict (household_id, start_day) do nothing;

  v_p1 := member_points(p_household, v_m1, p_start, v_end);
  v_p2 := member_points(p_household, v_m2, p_start, v_end);

  v_front := greatest(v_p1, v_p2);
  v_lead := abs(v_p1 - v_p2);

  -- Nobody takes a week off the other one over a rounding error, and a week
  -- nobody played is nobody's win.
  v_winner := case
    when v_front = 0 or v_lead < v_front * 0.05 then null
    when v_p1 > v_p2 then v_m1
    else v_m2
  end;
  v_clear := (v_p1 + v_p2) >= (v_target * 2);

  update weeks set
    status = 'settled',
    settled_at = now(),
    winner_member_id = v_winner,
    score = jsonb_build_object(
      'members', jsonb_build_object(
        v_m1::text, jsonb_build_object(
          'points', v_p1, 'target', v_target,
          'score', round(v_p1::numeric / v_target, 4)
        ),
        v_m2::text, jsonb_build_object(
          'points', v_p2, 'target', v_target,
          'score', round(v_p2::numeric / v_target, 4)
        )
      ),
      'team', jsonb_build_object(
        'points', v_p1 + v_p2, 'target', v_target * 2, 'clear', v_clear
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

  -- Prizes are zero-cost coupons: the Redeemed tab already knows how to show
  -- them, and the balance formula subtracts nothing.
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
