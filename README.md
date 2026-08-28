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
4. **Store** - Spend the shared bank on the reward catalog.
5. **Receipts** - What was redeemed, when, and by whom.

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
   security policies, and the functions the app calls.
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

To put it on both actual phones you also need to deploy it (Vercel, Netlify,
and Cloudflare Pages all build this repo as-is). Set the same two environment
variables in the host's dashboard.

### How the data model avoids losing points

Nothing stores a balance. Every point is derived from rows:

```
balance = seed_balance + habit points + claimed tier bonuses - redemptions
```

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

- `src/data/rewards.js` - the store. Each entry needs `id`, `title`,
  `description`, `cost`, `tier`, `icon` and `hue`.
- `src/data/habits.js` - daily and bonus habits and their point values.
- `src/data/season.js` - the twelve season tiers.

Icons come from the stroke set in `src/components/Icon.jsx`; add a path there
to use a new one.

## Still to do

- Offline queueing, so a check-off made with no signal syncs when it returns
- Editing habits and rewards in the app instead of in code
- Season end and rollover into Season 2
