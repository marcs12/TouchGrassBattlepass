-- Migration 4: Sunday Night - the weekly ritual loop.
-- Run this after 003-zero-seed-balance.sql, in the Supabase SQL editor.
--
-- Adds:
--   weeks               - one row per household per week: the stakes both
--                         players put up, the settled result, and who has
--                         opened the recap
--   cosigns             - a partner's stamp on the other's check-off. Worth
--                         zero points on purpose: the balance is derived from
--                         habit_checks, tier_claims and redemptions, and a new
--                         points source would mean rewriting that invariant
--                         and inflating the bank. A cosign is worth being seen.
--   habit_checks.proof_* - the photo attached to a check-off, if any
--   catalog_items 'stake' - so the stake list is authored in the app exactly
--                         like habits and rewards
--
-- Week prizes are minted as zero-cost rows in `redemptions`, so they show up
-- in the Redeemed tab as coupons and move the balance by nothing.

-- ---------------------------------------------------------------- tables

create table if not exists weeks (
  household_id uuid not null references households (id) on delete cascade,
  -- Monday, in the pair's own timezone. The client decides where a week
  -- starts for the same reason it decides where a day starts.
  start_day date not null,
  -- Text snapshots rather than references, for the same reason
  -- habit_checks.title is one: editing the stake list later must not rewrite
  -- what was actually wagered.
  stake_1 text,
  stake_2 text,
  stake_team text,
  status text not null default 'open' check (status in ('open', 'settled')),
  -- null once settled means a dead heat, not a missing result.
  winner_member_id uuid references members (id) on delete set null,
  score jsonb,
  opened_by uuid[] not null default '{}',
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (household_id, start_day)
);

create table if not exists cosigns (
  check_id uuid not null references habit_checks (id) on delete cascade,
  -- Denormalized so the policy can use the same shape as every other table.
  household_id uuid not null references households (id) on delete cascade,
  member_id uuid not null references members (id) on delete cascade,
  stamp text not null default 'star',
  created_at timestamptz not null default now(),
  primary key (check_id, member_id)
);

create index if not exists cosigns_household_idx
  on cosigns (household_id, created_at desc);

-- A photo is decoration on a check-off, never a condition of one: these are
-- all nullable and nothing reads them to work out points.
alter table habit_checks add column if not exists proof_path text;
alter table habit_checks add column if not exists proof_w integer;
alter table habit_checks add column if not exists proof_h integer;

alter table catalog_items drop constraint if exists catalog_items_kind_check;
alter table catalog_items add constraint catalog_items_kind_check
  check (kind in ('habit', 'reward', 'stake'));

-- ---------------------------------------------------------------- rls

alter table weeks enable row level security;
alter table cosigns enable row level security;

-- Read-only, like redemptions and tier_claims: a client that could write here
-- could hand itself the win. Every write goes through the functions below.
drop policy if exists weeks_read on weeks;
create policy weeks_read on weeks
  for select using (household_id in (select my_households()));

drop policy if exists cosigns_rw on cosigns;
create policy cosigns_rw on cosigns
  for all using (household_id in (select my_households()))
  with check (
    household_id in (select my_households())
    -- Stamp as yourself, and not on your own check-off.
    and member_id = (
      select hu.member_id from household_users hu
      where hu.user_id = auth.uid() and hu.household_id = cosigns.household_id
    )
    and not exists (
      select 1 from habit_checks hc
      where hc.id = cosigns.check_id and hc.member_id = cosigns.member_id
    )
  );

-- ---------------------------------------------------------------- helpers

-- Which player the calling device is, on this board.
create or replace function my_member(p_household uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select member_id from household_users
  where user_id = auth.uid() and household_id = p_household;
$$;

-- Points a member banked between two days, inclusive.
--
-- Every function in this file is reachable as an RPC, so this checks the
-- caller's own membership rather than trusting settle_week to have done it.
-- security definer keeps auth.uid(), so the check still passes when settle_week
-- calls it.
create or replace function member_points(p_household uuid, p_member uuid, p_from date, p_to date)
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
      and member_id = p_member
      and day between p_from and p_to
  ), 0);
$$;

-- ---------------------------------------------------------------- rpcs

-- Puts something up for the week. Slot 1 or 2 is that player's stake; slot 0
-- is the shared prize for clearing the week as a team.
create or replace function open_week(
  p_household uuid,
  p_start date,
  p_slot smallint,
  p_stake text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_household not in (select my_households()) then
    raise exception 'not your household';
  end if;
  if p_slot not in (0, 1, 2) then
    raise exception 'bad slot';
  end if;

  insert into weeks (household_id, start_day)
  values (p_household, p_start)
  on conflict (household_id, start_day) do nothing;

  update weeks set
    stake_1 = case when p_slot = 1 then p_stake else stake_1 end,
    stake_2 = case when p_slot = 2 then p_stake else stake_2 end,
    stake_team = case when p_slot = 0 then p_stake else stake_team end
  where household_id = p_household
    and start_day = p_start
    -- Stakes are locked once the week is scored.
    and status = 'open';
end;
$$;

-- Scores a finished week, freezes the result, and mints the prizes.
--
-- Both phones call this within seconds of each other, so it has to be
-- idempotent: the `status = 'open'` predicate on the update takes a row lock,
-- and whoever loses the race matches zero rows and returns without minting.
--
-- p_today comes from the client because developer mode's time travel is
-- client-side only. It is clamped so it can't be used to settle the future.
-- p_min_target likewise: the daily point total is editable per household, so
-- only the client knows what a reachable week looks like.
create or replace function settle_week(
  p_household uuid,
  p_start date,
  p_today date,
  p_min_target integer
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
  v_t1 integer;
  v_t2 integer;
  v_s1 numeric;
  v_s2 numeric;
  v_winner uuid;
  v_clear boolean;
  v_min integer;
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
  v_min := greatest(coalesce(p_min_target, 1), 1);

  select id into v_m1 from members where household_id = p_household and slot = 1;
  select id into v_m2 from members where household_id = p_household and slot = 2;

  insert into weeks (household_id, start_day)
  values (p_household, p_start)
  on conflict (household_id, start_day) do nothing;

  v_p1 := member_points(p_household, v_m1, p_start, v_end);
  v_p2 := member_points(p_household, v_m2, p_start, v_end);

  -- Target is the median of your own last four weeks, so the week is a race
  -- against yourself. Raw points would just hand it to whoever had the
  -- lighter work week, every week.
  select greatest(v_min, coalesce(percentile_cont(0.5) within group (order by p), 0))::integer
    into v_t1
    from (select member_points(p_household, v_m1, p_start - w, p_start - w + 6) as p
          from unnest(array[7, 14, 21, 28]) as w) prior;

  select greatest(v_min, coalesce(percentile_cont(0.5) within group (order by p), 0))::integer
    into v_t2
    from (select member_points(p_household, v_m2, p_start - w, p_start - w + 6) as p
          from unnest(array[7, 14, 21, 28]) as w) prior;

  v_s1 := round(v_p1::numeric / v_t1, 4);
  v_s2 := round(v_p2::numeric / v_t2, 4);

  -- A margin under 5% is a dead heat; nobody wins a week by a rounding error.
  v_winner := case
    when v_s1 - v_s2 >= 0.05 then v_m1
    when v_s2 - v_s1 >= 0.05 then v_m2
    else null
  end;
  v_clear := (v_p1 + v_p2) >= (v_t1 + v_t2);

  update weeks set
    status = 'settled',
    settled_at = now(),
    winner_member_id = v_winner,
    score = jsonb_build_object(
      'members', jsonb_build_object(
        v_m1::text, jsonb_build_object('points', v_p1, 'target', v_t1, 'score', v_s1),
        v_m2::text, jsonb_build_object('points', v_p2, 'target', v_t2, 'score', v_s2)
      ),
      'team', jsonb_build_object(
        'points', v_p1 + v_p2, 'target', v_t1 + v_t2, 'clear', v_clear
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

-- The stake result stays face-down until both players have opened their
-- recap. The client also flips it 24h after settling, so nobody is stranded
-- when their partner is away.
create or replace function mark_recap_opened(p_household uuid, p_start date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member uuid := my_member(p_household);
begin
  if p_household not in (select my_households()) then
    raise exception 'not your household';
  end if;
  if v_member is null then
    return;
  end if;

  update weeks
  set opened_by = array_append(opened_by, v_member)
  where household_id = p_household
    and start_day = p_start
    and not (opened_by @> array[v_member]);
end;
$$;

-- ---------------------------------------------------------------- storage

-- Proof photos live at <household_id>/<check_id>.webp in a private bucket,
-- so the folder name is what the policies gate on.
insert into storage.buckets (id, name, public)
values ('proof', 'proof', false)
on conflict (id) do nothing;

drop policy if exists proof_read on storage.objects;
create policy proof_read on storage.objects
  for select using (
    bucket_id = 'proof'
    and (storage.foldername(name))[1]::uuid in (select my_households())
  );

drop policy if exists proof_write on storage.objects;
create policy proof_write on storage.objects
  for insert with check (
    bucket_id = 'proof'
    and (storage.foldername(name))[1]::uuid in (select my_households())
  );

-- Replacing a photo is an upsert, which lands as an update on an existing
-- object rather than an insert.
drop policy if exists proof_update on storage.objects;
create policy proof_update on storage.objects
  for update using (
    bucket_id = 'proof'
    and (storage.foldername(name))[1]::uuid in (select my_households())
  )
  with check (
    bucket_id = 'proof'
    and (storage.foldername(name))[1]::uuid in (select my_households())
  );

drop policy if exists proof_delete on storage.objects;
create policy proof_delete on storage.objects
  for delete using (
    bucket_id = 'proof'
    and (storage.foldername(name))[1]::uuid in (select my_households())
  );

-- ---------------------------------------------------------------- realtime

-- Guarded, unlike the earlier files: everything above is safe to re-run, and
-- adding a table twice would raise and roll the whole migration back.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'weeks'
  ) then
    alter publication supabase_realtime add table weeks;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'cosigns'
  ) then
    alter publication supabase_realtime add table cosigns;
  end if;
end
$$;
