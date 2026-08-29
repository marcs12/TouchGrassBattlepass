-- Touch Grass Battlepass - database schema.
-- Run this once in the Supabase SQL editor (see README for the full setup).
--
-- Model: a household is the shared board. Points are never stored as a
-- balance; they are derived from the rows below, so two phones writing at the
-- same moment can't clobber each other's points.
--
--   balance = seed_balance + habit points + claimed tier bonuses - redemptions

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- tables

create table if not exists households (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  -- A season starts empty; every point in the bank was earned by someone.
  seed_balance integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  slot smallint not null check (slot in (1, 2)),
  name text not null,
  unique (household_id, slot)
);

-- Which anonymous device belongs to which household, and who they play as.
create table if not exists household_users (
  user_id uuid not null references auth.users (id) on delete cascade,
  household_id uuid not null references households (id) on delete cascade,
  member_id uuid references members (id) on delete set null,
  primary key (user_id, household_id)
);

-- One row per member per habit per day. The unique constraint makes a double
-- tap idempotent instead of double-paying.
create table if not exists habit_checks (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  member_id uuid not null references members (id) on delete cascade,
  habit_id text not null,
  title text not null,
  day date not null,
  points integer not null check (points > 0),
  created_at timestamptz not null default now(),
  unique (household_id, member_id, habit_id, day)
);

create table if not exists redemptions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  member_id uuid references members (id) on delete set null,
  reward_id text not null,
  title text not null,
  cost integer not null check (cost >= 0),
  icon text,
  hue integer,
  tier text,
  created_at timestamptz not null default now()
);

create table if not exists tier_claims (
  household_id uuid not null references households (id) on delete cascade,
  tier smallint not null,
  bonus integer not null default 0,
  claimed_by uuid references members (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (household_id, tier)
);

create index if not exists habit_checks_household_day_idx
  on habit_checks (household_id, day desc);
create index if not exists redemptions_household_idx
  on redemptions (household_id, created_at desc);

-- ---------------------------------------------------------------- helpers

-- Households the calling device has joined. Used by every policy below.
create or replace function my_households()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select household_id from household_users where user_id = auth.uid();
$$;

create or replace function household_balance(p_household uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select
    (select seed_balance from households where id = p_household)
    + coalesce((select sum(points) from habit_checks where household_id = p_household), 0)
    + coalesce((select sum(bonus) from tier_claims where household_id = p_household), 0)
    - coalesce((select sum(cost) from redemptions where household_id = p_household), 0);
$$;

create or replace function household_xp(p_household uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select sum(points) from habit_checks where household_id = p_household), 0);
$$;

-- ---------------------------------------------------------------- rls

alter table households enable row level security;
alter table members enable row level security;
alter table household_users enable row level security;
alter table habit_checks enable row level security;
alter table redemptions enable row level security;
alter table tier_claims enable row level security;

drop policy if exists households_read on households;
create policy households_read on households
  for select using (id in (select my_households()));

drop policy if exists members_read on members;
create policy members_read on members
  for select using (household_id in (select my_households()));

drop policy if exists members_write on members;
create policy members_write on members
  for update using (household_id in (select my_households()))
  with check (household_id in (select my_households()));

drop policy if exists household_users_read on household_users;
create policy household_users_read on household_users
  for select using (user_id = auth.uid());

drop policy if exists household_users_write on household_users;
create policy household_users_write on household_users
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists habit_checks_rw on habit_checks;
create policy habit_checks_rw on habit_checks
  for all using (household_id in (select my_households()))
  with check (household_id in (select my_households()));

drop policy if exists redemptions_read on redemptions;
create policy redemptions_read on redemptions
  for select using (household_id in (select my_households()));

drop policy if exists tier_claims_read on tier_claims;
create policy tier_claims_read on tier_claims
  for select using (household_id in (select my_households()));

-- Spending goes through the functions below so the balance is checked
-- server-side; there is deliberately no insert policy for these two tables.

-- ---------------------------------------------------------------- rpcs

-- Creates the board and returns the code the other phone needs.
create or replace function create_household(p_names text[])
returns table (household_id uuid, code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_code text;
  v_member uuid;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  if array_length(p_names, 1) <> 2 then
    raise exception 'two names required';
  end if;

  -- Short, unambiguous code: no O/0/I/1.
  loop
    v_code := (
      select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
                               floor(random() * 32)::int + 1, 1), '')
      from generate_series(1, 6)
    );
    exit when not exists (select 1 from households h where h.code = v_code);
  end loop;

  insert into households (code) values (v_code) returning id into v_id;

  insert into members (household_id, slot, name)
  values (v_id, 1, p_names[1]), (v_id, 2, p_names[2]);

  select id into v_member from members m where m.household_id = v_id and m.slot = 1;

  insert into household_users (user_id, household_id, member_id)
  values (auth.uid(), v_id, v_member);

  return query select v_id, v_code;
end;
$$;

-- Joins an existing board as one of the two players.
create or replace function join_household(p_code text, p_slot smallint default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_member uuid;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;

  select id into v_id from households where code = upper(trim(p_code));
  if v_id is null then
    raise exception 'no household with that code';
  end if;

  if p_slot is not null then
    select id into v_member from members where household_id = v_id and slot = p_slot;
  end if;

  insert into household_users (user_id, household_id, member_id)
  values (auth.uid(), v_id, v_member)
  on conflict (user_id, household_id)
    do update set member_id = excluded.member_id;

  return v_id;
end;
$$;

-- Spending is server-side so two simultaneous redemptions can't overdraw.
create or replace function redeem_reward(
  p_household uuid,
  p_member uuid,
  p_reward_id text,
  p_title text,
  p_cost integer,
  p_icon text,
  p_hue integer,
  p_tier text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_household not in (select my_households()) then
    raise exception 'not your household';
  end if;
  if household_balance(p_household) < p_cost then
    raise exception 'not enough points';
  end if;

  insert into redemptions (household_id, member_id, reward_id, title, cost, icon, hue, tier)
  values (p_household, p_member, p_reward_id, p_title, p_cost, p_icon, p_hue, p_tier)
  returning id into v_id;

  return v_id;
end;
$$;

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
begin
  if p_household not in (select my_households()) then
    raise exception 'not your household';
  end if;
  if household_xp(p_household) < p_xp_required then
    raise exception 'tier not unlocked';
  end if;

  insert into tier_claims (household_id, tier, bonus, claimed_by)
  values (p_household, p_tier, p_bonus, p_member)
  on conflict (household_id, tier) do nothing;
end;
$$;

-- ---------------------------------------------------------------- realtime

alter publication supabase_realtime add table habit_checks;
alter publication supabase_realtime add table redemptions;
alter publication supabase_realtime add table tier_claims;
alter publication supabase_realtime add table members;
