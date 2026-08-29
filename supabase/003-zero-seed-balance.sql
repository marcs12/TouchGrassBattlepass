-- Migration 3: a season starts empty.
--
-- Households used to open with 2,750 points so the store was explorable
-- before habits existed. Now that points are earned, that seed is just free
-- money, so new households start at zero.
--
-- The update below drops each existing household's seed to zero, except where
-- that would push the derived balance negative (a board that has already spent
-- more than it earned) - there it keeps the smallest seed that leaves the
-- balance at zero.

alter table households alter column seed_balance set default 0;

update households h
set seed_balance = greatest(
  0,
  coalesce((select sum(r.cost) from redemptions r where r.household_id = h.id), 0)
  - coalesce((select sum(c.points) from habit_checks c where c.household_id = h.id), 0)
  - coalesce((select sum(t.bonus) from tier_claims t where t.household_id = h.id), 0)
);
