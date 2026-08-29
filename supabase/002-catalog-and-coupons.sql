-- Migration 2: editable catalogs and redeemed-reward coupons.
-- Run this after schema.sql, in the Supabase SQL editor.
--
-- Adds:
--   catalog_items  - habits and rewards added in the app, plus a hidden flag
--                    for switching off the ones that ship in code
--   redemptions.used_at - a redeemed reward is a coupon until it is used

create table if not exists catalog_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  kind text not null check (kind in ('habit', 'reward')),
  -- For a custom entry this is its own id; for a built-in being switched off
  -- it is that built-in's id.
  item_id text not null,
  hidden boolean not null default false,
  payload jsonb,
  created_at timestamptz not null default now(),
  unique (household_id, kind, item_id)
);

create index if not exists catalog_items_household_idx
  on catalog_items (household_id);

alter table catalog_items enable row level security;

drop policy if exists catalog_items_rw on catalog_items;
create policy catalog_items_rw on catalog_items
  for all using (household_id in (select my_households()))
  with check (household_id in (select my_households()));

alter table redemptions
  add column if not exists used_at timestamptz;

-- Marking a coupon used is the one edit normal play makes to a redemption.
drop policy if exists redemptions_update on redemptions;
create policy redemptions_update on redemptions
  for update using (household_id in (select my_households()))
  with check (household_id in (select my_households()));

alter publication supabase_realtime add table catalog_items;
