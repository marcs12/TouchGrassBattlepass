-- Optional. Only needed if you want developer mode's "clear all points" to
-- remove receipts and claimed tiers as well as habit checks.
--
-- Normal play never deletes from these two tables - spending goes through
-- redeem_reward / claim_tier - so the base schema gives them no delete policy.
-- Run this in the Supabase SQL editor to allow members of a household to wipe
-- their own board.

drop policy if exists redemptions_delete on redemptions;
create policy redemptions_delete on redemptions
  for delete using (household_id in (select my_households()));

drop policy if exists tier_claims_delete on tier_claims;
create policy tier_claims_delete on tier_claims
  for delete using (household_id in (select my_households()));

-- Added with migration 4. Weeks and cosigns are the same story: normal play
-- only writes them through settle_week / open_week or a stamp, so a reset
-- needs its own way in. Proof photos go too, or the bucket keeps growing
-- against check rows that no longer exist.
drop policy if exists weeks_delete on weeks;
create policy weeks_delete on weeks
  for delete using (household_id in (select my_households()));

drop policy if exists cosigns_delete on cosigns;
create policy cosigns_delete on cosigns
  for delete using (household_id in (select my_households()));

-- Added with migration 5. Wiping a board takes its seasons with it; the next
-- claim opens season 1 again from wherever the (now empty) lifetime total is.
drop policy if exists seasons_delete on seasons;
create policy seasons_delete on seasons
  for delete using (household_id in (select my_households()));
