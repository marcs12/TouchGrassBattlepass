# Touch Grass Battlepass

A co-op habit tracker and reward storefront for two people. Daily routines earn
points into one shared bank, and that bank gets spent on real life rewards you
both agreed on ahead of time.

## How it works

1. **Daily Grind** - You each keep your own checklist, in three lists: daily
   habits that reset every night, weekly ones ticked once per calendar week on
   whichever day you get to them, and bonus efforts with no reset at all. If
   you both did it, you both check it and you both get paid. Any three
   check-offs in a day keeps your streak alive.
2. **Shared bank** - Everything either of you earns lands in one pooled
   balance. Personal totals are a record of who contributed, not a wallet.
3. **Season Pass** - Points earned are season XP. Twelve tiers hand out bonus
   points or agreed-on real-world perks. Spending never costs track progress.
   Finishing the track opens the next season; the bank comes with you.
4. **Store** - Shop the reward catalog: fill a cart, then check out.
5. **Coupons** - Every redeemed reward is a coupon until someone cashes it in.
   Used ones grey out instead of disappearing.
6. **Sunday Night** - The week is its own thing: you each put something up,
   whoever banks more points over the seven days takes it, and on Sunday
   evening the recap hands the winner what the other one wagered.

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
   used-coupon flag), `supabase/003-zero-seed-balance.sql` (start a season
   with an empty bank), `supabase/004-weeks-and-proof.sql` (Sunday Night:
   weeks, stamps and the private bucket proof photos go in),
   `supabase/005-seasons.sql` (seasons end and roll over into the next one),
   `supabase/006-week-on-points.sql` (the week is won on points banked) and
   `supabase/007-handicap-and-wish.sql` (per-player handicap, and a reward to
   save toward).
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

`seed_balance` is zero for new households: a board starts empty, so every
point in the bank was earned by someone.

That sum is over *every* check-off ever, while the app only reads the last
forty-five days of them. The points banked before that window come back as one
number from `points_before()`, so the bank on screen is the whole board's and
not the last six weeks of it. Season XP is the same total measured from where
the season started - see **Seasons** below.

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
    queue.js               offline board cache and write queue
    storage.js             local persistence
    photo.js               shrink and re-encode a proof photo
    proofStore.js          IndexedDB blobs for photos
    useCountUp.js          rolling number animation
  theme/                   token definitions + provider
  data/                    rewards, habits, season track, week scoring,
                           photo thinning
  components/              UI
supabase/schema.sql        tables, RLS policies, functions
```

## Theming

Five themes ship in `src/theme/themes.js`: Sticker Club, Milk & Lilac,
Blueprint, Matcha and Night Light. Every color, radius and font in the app
resolves to a token, so adding a theme is one entry in that file and no CSS
changes.

The look is a pastel retro desktop: a ruled desk under a three-stop wash, and
every section is a little titled window with its own pastel titlebar, a bitmap
face (Silkscreen) on the chrome, thick tinted-ink outlines and hard offset
shadows. `tone-a` through `tone-e` are those titlebar colours, cycled so no two
stacked panes match; `Pane` is the component that draws one. The theme picker
is the paint-palette chip row from the same world.

## Editing the catalogs

Most of the time you don't need to touch the code. **Add** in the Daily Grind
or the Store opens a small form - name, a line of detail, what it's worth, and
an icon - and the entry is saved to the household, so both phones see it. The
same toggle puts edit and remove buttons on every card.

Editing works on anything, including the entries that ship in code: the change
is stored as an override row rather than a code change, so a typo in a title
or the wrong point value is a ten-second fix. Removing deletes a custom entry;
a built-in is switched off instead, since it would come back on the next load.

To change the defaults themselves:

- `src/data/rewards.js` - the store. Each entry needs `id`, `title`,
  `description`, `cost`, `tier`, `icon` and `hue`.
- `src/data/habits.js` - daily, weekly and bonus habits and their point values.
- `src/data/streak.js` - what keeps a streak alive: how many check-offs a day
  needs, and how many misses a month is forgiven.
- `src/data/season.js` - the twelve season tiers, run every season.
- `src/data/week.js` - week boundaries, scoring, what a good week is worth,
  the handicap range, and the starting stakes.
- `src/data/proof.js` - how long photo reels are kept, and how much of one an
  old week keeps.
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
| Time travel (±1 day, ±1 week) | Shifts what the app calls today, so daily resets, streaks and whole weeks are testable without waiting |
| Jump past the recap | Closes the current week and clears the 8pm gate, so the recap opens itself on the reload |
| Settle last week | Scores it on the spot instead. The server still refuses a week that hasn't ended |
| Grant points | Lands as a habit check, so the bank and season XP move together |
| Clear daily list | Fills every daily habit for the active player in one tap |
| Seed 6-day streak | Backfills counted days so the streak strip has history |
| Clear today / refetch | Undo a test run, or force a re-read in synced mode |
| Grant or take back points | +10 through +2,500, and -10 through -100. Taking points back can't overdraw the bank |
| End season | Rolls the track over without waiting for all twelve tiers |
| Thin old photos | Runs the photo thinning pass on the spot and says how many went |
| Clear all points | Wipes points, receipts, claimed tiers, weeks, stamps and seasons back to a fresh bank. Asks twice, since in synced mode it hits both players |
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

## Installing it on a phone

It is a PWA, so it installs from the browser - no store, no Apple developer
account, nothing to re-sign every week.

- **iPhone** - open the site in Safari, Share, *Add to Home Screen*
- **Android** - open in Chrome, menu, *Install app* (or *Add to home screen*)

It then launches fullscreen with its own icon, and the status bar picks up the
current theme's colour. A service worker caches the shell so it opens without
a connection, and prunes itself: build output is content-hashed, so on every
launch the freshly fetched page doubles as the keep-list and anything left
over from an older deploy is deleted.

Updates need no reinstall - the page is fetched network-first, so the next
launch with a connection is already on the newest build.

### Offline

The last board you saw is cached, so opening the app with no signal shows your
grind rather than the setup screen. Check-offs, coupon uses and catalog edits
are queued locally, applied to the screen straight away, and replayed in order
when the connection returns - the sync dot shows how many are waiting.

Spending is the exception. Redeeming a reward and claiming a tier are checked
against the bank inside a server transaction, so queuing them would let two
phones overdraw the same balance while both were offline. Those stay
online-only, and the checkout button says so.

## Progress

The Season Pass tab opens with a chart of points per day, stacked by player,
over the last week or month, plus days with points, full lists cleared, the
daily average and the best current streak. Hovering or focusing a bar reads
out that day, and *See the numbers* opens the same data as a table.

Chart colours are their own tokens rather than the app's pastels. As a
categorical pair the pastels failed separation checks - too light, too close
to tell apart even with full colour vision - so the series use a rose/blue pair
validated for the lightness band, chroma, colour-blind separation and contrast
in both light and dark themes. Identity never rests on colour alone: there is
a legend, a hover readout and the table.

## Sunday Night

The bank and the pass are the long game. The week is the short one, and it is
the part that gives the app a moment rather than a running total.

**Proof.** Any check-off can carry a photo. It is never required and it never
gates a point: the point is banked the instant you tick the box, and the photo
is queued separately. If the upload fails it retries behind everything else in
the queue rather than holding up a single check-off. Photos are shrunk to about
80KB on the device before they go anywhere, and re-encoding through a canvas
drops the EXIF - the location tag included - on the way out.

Reels are thinned as they age. The last eight weeks keep every photo; older
weeks keep their newest three and let the rest go, which is what stops a bucket
that only ever grows. The check-off itself is untouched - the points stay, the
log entry stays, only the picture goes - and the cutoff sits further back than
the window the app reads, so nothing is ever taken out from under a reel on
screen. It runs once per launch, in the background, and the rule lives in
`src/data/proof.js` if eight weeks and three photos are the wrong numbers for
you.

**Stamps.** The other one's check-offs can be stamped from the contribution
log. A stamp is worth **no points at all**, deliberately: the balance is
derived from check-offs, tier claims and redemptions, so a second source of
points would mean rewriting that invariant to earn nothing but inflation. It is
worth being seen, and it feeds the recap.

**The week.** Sunday to Saturday - the calendar week you already read on a
wall, which is also what the streak strip shows, so the two never disagree
about which week you are in. It is a straight race: **whoever banks more points
over the seven days takes the week.** A lead under 5% of the leader's own total
is a dead heat, and a week where neither of you banked anything is one too.

It used to score each of you against the median of your own last four weeks.
That read well and played badly - the target moved every time you had a good
week, so a strong run quietly raised the bar on the person having it, and a
week where somebody simply did more could still go to the other one. Two people
who live together already know whose week was harder; they do not need the
database to model it.

The bar on each player is progress toward a good week - five full daily lists
plus the weekly list - and it decides nothing. Five rather than seven on
purpose: a target you only reach by never missing a day is a target that gets
missed, and missing things is what happens. Both of you put a stake up; the
winner claims what the other one wagered. Nobody owes a forfeit. Clear the
combined target and you both get the shared prize on top.

**The handicap.** A race on raw points quietly favours whoever has the lighter
week at work. Rather than have the database guess at that - which is what the
old median target was doing - each player carries a multiplier you both agree
on out loud, from ×0.50 to ×2.00, changed with the − and + under their stake.
Both of you can move either one; the app is not the referee. At ×1.00 on both
sides, which is the default and the case everything is tuned for, nothing about
the week changes and the banner shows only points banked.

**The nudge.** On the last two days of a week that is still in play, the banner
says where you stand: how far behind you are, that it is dead level, or that
your lead is thin enough not to coast on. Friday and Saturday are when a week
is actually won, and a running total that never says anything is easy to stop
reading.

**The recap.** The week closes at Saturday midnight and the recap is due the
following evening, so Sunday Night is the look back rather than the deadline.
From 8pm that Sunday, the first launch scores the week and opens the recap: the week's photos as a reel, its chart, the numbers, and the result. The
stake stays face down until you have *both* opened yours - that shared beat is
the point of the ritual - and flips on its own after a day so nobody is
stranded when their partner is away. Past weeks stack up on a shelf under the
Season Pass chart.

Opening one from that shelf works however far back it is. The board itself only
reads the last forty-five days of check-offs, so an older Sunday goes and
fetches its own week - chart, reel and all - rather than every launch paying for
a wider window.

Prizes are minted as zero-cost coupons in the Redeemed tab, so a stake can be
won without a second economy to keep track of, and the bank never moves.

Stakes are edited in the app like habits and rewards are - the six that ship in
code are just the starting point.

## Seasons

Twelve tiers is a few months of ordinary weeks. When the last one is claimed
the pass is finished, and the Season Pass tab offers the next one.

Rolling over resets exactly one thing: the track. Season XP goes back to zero
and all twelve tiers unlock again. **The bank, every coupon, your streaks, the
catalogs and every Sunday on the shelf stay where they are** - points are money
and the pass is a track, and spending has never pulled the track backwards, so
finishing a season must not empty the wallet either. Finished seasons keep
their final XP on a shelf of their own under the chart.

The button won't roll over while a tier you have earned is still unclaimed: the
claims reset with the season, and walking away from a bonus you earned is not
something to do by accident. Claim them, then start the next one.

Under the hood a season is a row holding the lifetime XP it opened at, so a
season's XP is simply what has been earned since. The boundary is an instant
rather than a day - points banked later the same afternoon belong to the new
season - and no check row is rewritten or double-counted at the seam. Ending is
one server function, idempotent the same way `settle_week` is, so both phones
pressing it at once rolls over exactly once.

The same twelve tiers run every season. If you want season 2 to look different,
`src/data/season.js` is the whole track.

## Streaks

A day counts toward your streak once you have checked off **three** of
anything - daily, weekly or bonus. It used to take the whole daily list, which
made the streak a record of perfect days and therefore, mostly, a record of
broken ones. Three is a day you showed up, and showing up is what the streak is
there to measure.

**Two misses a month are forgiven.** A streak that dies to one flight, one
illness or one bad Tuesday stops being something you protect and starts being
something you resent. A missed day spends a skip from that day's own month; run
out in a month and the streak ends there. The strip shows a forgiven day as a
dashed ring rather than a tick, and the streak line says how many skips are
left.

Both numbers live in `src/data/streak.js` as `STREAK_MIN_CHECKS` and
`STREAK_SKIPS_PER_MONTH`. Streaks are per player and derived from the days
themselves rather than a running counter, so un-ticking a habit correctly walks
the streak back.

## Living with it

A few things exist because two people share this on two phones:

- **Partner toasts** - when the other phone checks something off, a toast says
  who and what. Without it, realtime updates just make numbers change on their
  own, which reads as a glitch.
- **Sync dot** - next to the shared bank: saving, saved, or offline, so a tap
  on a patchy connection doesn't leave you guessing.
- **Haptics** - a short buzz on check-off and checkout. Android only; Safari on
  iOS has no vibration API, so it degrades to nothing.
- **Celebrations** - streaks at 3, 7, 14 and 30 days, every claimed tier, and
  the end of a season. Milestones already passed are backfilled silently the
  first time, so nothing throws a party for something you did last week.
- **Undo** - a check-off puts its own way back out on screen for six seconds. A
  mis-tap is the easiest mistake to make here, and hunting for the row you just
  touched is a silly way to fix it.
- **Something to save for** - pin any reward in the store and the shared bank
  is shown against it instead of as a bare number. It is pinned for both of
  you, because it is one bank.

## Still to do

Nothing outstanding.
