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
