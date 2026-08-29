# Touch Grass Battlepass

A co-op habit tracker and reward storefront for two people. Daily routines earn
points into one shared bank, and that bank gets spent on real life rewards you
both agreed on ahead of time.

## How it works

1. **Daily Grind** - You each keep your own checklist. If you both did it, you
   both check it and you both get paid.
2. **Shared bank** - Everything either of you earns lands in one pooled
   balance. Personal totals are a record of who contributed, not a wallet.
3. **Season Pass** - Points earned are season XP. Twelve tiers hand out bonus
   points or agreed-on real-world perks. Spending never costs track progress.
4. **Store** - Shop the reward catalog: fill a cart, then check out.
5. **Coupons** - Every redeemed reward is a coupon until someone cashes it in.
   Used ones grey out instead of disappearing.

Habits and rewards can be added and removed in the app - the lists that ship
in code are just the starting point.

## Two modes

The app runs either **local-only** (everything in this browser, no sync) or
**synced** through Supabase, where both phones share one board. Which one you
get depends purely on whether Supabase credentials are configured.

Local-only is the default and needs no setup.

## Running it

```bash
npm install
npm run dev
```

Other scripts:

```bash
npm run build     # production bundle into dist/
npm run preview   # serve the built bundle locally
```

## Setting up sync (Supabase)

Both phones need to read and write the same board, which needs a database.
This is the whole setup:

1. **Create a project** at [supabase.com](https://supabase.com) (free tier is
   fine). Pick a region near you.
2. **Run the schema.** Open the project's SQL Editor, paste all of
   `supabase/schema.sql`, and run it. It creates the tables, the row-level
   security policies, and the functions the app calls. Then run
   `supabase/002-catalog-and-coupons.sql` (custom catalog entries and the
   used-coupon flag) and `supabase/003-zero-seed-balance.sql` (start a season
   with an empty bank).
3. **Turn on anonymous sign-ins.** Authentication -> Sign In / Providers ->
   enable *Anonymous sign-ins*. Devices never make an account; they get an
   anonymous identity that is tied to your household.
4. **Copy the credentials.** Project Settings -> Data API for the project URL,
   and Project Settings -> API Keys for the publishable (anon) key.
5. **Add them locally.** Copy `.env.example` to `.env.local` and fill both in:

   ```
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-publishable-key
   ```

6. **Restart the dev server** so Vite picks up the new env file.
7. **Start the board on one phone** - enter both names, and the app shows a
   six-character household code.
8. **Join from the other phone** - "Join with a code", enter it, then pick
   which player you are.

## Deploying (GitHub Pages)

Pushing to `main` builds and publishes the app to GitHub Pages via
`.github/workflows/deploy.yml`. Two one-time settings on the repo:

1. **Settings -> Pages -> Build and deployment -> Source: GitHub Actions.**
2. **Settings -> Secrets and variables -> Actions -> New repository secret**,
   twice: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Without them the
   deployed app still works, just in local-only mode with no sync.

The site lands at `https://<user>.github.io/TouchGrassBattlepass/`. That
sub-path is why `vite.config.js` sets `base`; set `BASE_PATH=/` when building
for a host that serves the app at the root instead.

Vite inlines those two variables into the bundle, so the anon key is visible to
anyone who views source. That is what the publishable key is for - row-level
security is what actually protects the data. Never put a `service_role` key in
the workflow.

### How the data model avoids losing points

Nothing stores a balance. Every point is derived from rows:

```
balance = seed_balance + habit points + claimed tier bonuses - redemptions
```

`seed_balance` is zero for new households: a season starts empty, so every
point in the bank was earned by someone.

A check-off is one row, so two phones checking things off at the same moment
insert two rows instead of overwriting each other's totals. Spending goes
through `redeem_reward` / `claim_tier`, which re-check the balance server-side
inside the transaction, so a double redemption can't overdraw.

Row-level security limits every table to households the signed-in device has
joined, and the household code is only usable through the `join_household`
function.

## Stack

- React 18 + Vite
- Plain CSS driven by a design-token layer (`src/theme/themes.js`)
- Supabase (Postgres, anonymous auth, realtime) for the synced mode

## Project layout

```
src/
  App.jsx                  shell, tab routing, setup gating
  index.css                tokens, components, motion, breakpoints
  game/
    useGame.js             picks the backend at build time
    localBackend.js        device-only state (localStorage)
    cloudBackend.js        Supabase reads, writes and realtime
  lib/
    supabase.js            client + hasCloud flag
    day.js                 local-date keys, streak math
    storage.js             local persistence
    useCountUp.js          rolling number animation
  theme/                   token definitions + provider
  data/                    rewards, habits, season track
  components/              UI
supabase/schema.sql        tables, RLS policies, functions
```

## Theming

Five themes ship in `src/theme/themes.js`: Sticker Club, Notepad, Blueprint,
Matcha and Night Light. Every color, radius and font in the app resolves to a
token, so adding a theme is one entry in that file and no CSS changes.

## Editing the catalogs

Most of the time you don't need to touch the code. **Add** in the Daily Grind
or the Store opens a small form - name, a line of detail, what it's worth, and
an icon - and the entry is saved to the household, so both phones see it. The
same toggle puts a remove button on every card: custom entries are deleted,
built-ins are switched off (they live in code, so they can only be hidden).

To change the defaults themselves:

- `src/data/rewards.js` - the store. Each entry needs `id`, `title`,
  `description`, `cost`, `tier`, `icon` and `hue`.
- `src/data/habits.js` - daily and bonus habits and their point values.
- `src/data/season.js` - the twelve season tiers.
- `src/data/catalog.js` - merges the shipped lists with a household's own.

Icons come from the stroke set in `src/components/Icon.jsx`; add a path there
to use a new one.

## Developer mode

Hidden testing surface, available in the deployed app as well as locally.
Three ways in:

- **Phone** - tap the leaf logo seven times within three seconds
- **Laptop** - type `dev`, or press ctrl/cmd + shift + D
- **Either** - load the app with `#dev` on the end of the URL

Once unlocked it stays on for that browser until you press *off* in the panel.

What it gives you:

| Tool | Why |
| --- | --- |
| Time travel (±1 day) | Shifts what the app calls today, so daily resets and streaks are testable without waiting overnight |
| Grant points | Lands as a habit check, so the bank and season XP move together |
| Clear daily list | Fills every daily habit for the active player in one tap |
| Seed 6-day streak | Backfills cleared days so the streak strip has history |
| Clear today / refetch | Undo a test run, or force a re-read in synced mode |
| Clear all points | Wipes points, receipts and claimed tiers back to a fresh bank. Asks twice, since in synced mode it hits both players |
| Leave board / wipe local | Returns this device to setup without touching shared data |

Everything writes through the normal data path, so in synced mode a seeded day
shows up on the other phone exactly like a real check-off.

In synced mode, "clear all points" always removes habit checks, but receipts
and claimed tiers need the optional delete policies in
`supabase/dev-reset.sql` - normal play only ever inserts those through the
spending functions, so the base schema gives them no delete policy. Without it
the panel says what it could not remove rather than failing quietly. The day offset lives
in `localStorage` under `tgbp.dev.offset` and only affects `today()` - stored
dates are never rewritten.

## Still to do

- Editing an existing habit or reward, rather than removing and re-adding it
- Offline queueing, so a check-off made with no signal syncs when it returns
- Season end and rollover into Season 2
