# Touch Grass Battlepass

A co-op habit tracker and reward storefront for two people. Daily routines earn
points into one shared bank, and that bank gets spent on real life rewards you
both agreed on ahead of time.

## How it works

1. **Daily Grind** - Both of us see the same habit list (workouts, meal prep,
   laundry). Checking a task off credits points.
2. **Shared Bank** - Every completed task feeds a single pooled balance. There
   is no "my points" and "your points."
3. **Store** - Browse rewards like a storefront and spend pooled points instead
   of dollars.
4. **Redeemed** - Purchased rewards land here as a running list of things we
   still owe ourselves.

## Stack

- React 18
- Vite
- Plain CSS with CSS Grid for the responsive layouts

No UI framework and no external image assets. Product art is generated from CSS
gradients so the app works fully offline.

## Running it

```bash
npm install
npm run dev
```

Then open the URL Vite prints (default `http://localhost:5173`).

Other scripts:

```bash
npm run build     # production bundle into dist/
npm run preview   # serve the built bundle locally
```

## Project layout

```
src/
  main.jsx                 entry point
  App.jsx                  tab routing, shared balance, redeem handler
  index.css                global styles and grid breakpoints
  data/rewards.js          reward catalog (mock data)
  components/
    Header.jsx             brand, tab nav, live bank counter
    Storefront.jsx         tier filters and the product grid
    RewardCard.jsx         single product card
    Redeemed.jsx           purchase history
    DailyGrind.jsx         habit list (not built yet)
```

## Responsive grid

The storefront grid steps up with viewport width:

| Width    | Columns |
| -------- | ------- |
| < 640px  | 1       |
| >= 640px | 2       |
| >= 900px | 3       |
| >= 1280px| 4       |

The top bar reflows from a stacked layout on phones to a single row at 900px.

## Rewards

Rewards are grouped into three tiers that drive the badge color and the rough
cost band:

- **Common** - everyday treats (80 to 260 points)
- **Rare** - real outings (500 to 1400 points)
- **Legendary** - big ticket trips (2500 to 5000 points)

Edit `src/data/rewards.js` to change the catalog. Each entry needs an `id`,
`title`, `description`, `cost`, `tier`, `emoji`, and an `art` gradient string.

## Current state

The storefront, the reward catalog, the redeem flow, and the redeemed list all
work. The balance starts seeded in `src/App.jsx` so the store is explorable
before habits exist.

Still to do:

- Build the habit checklist so points are actually earned
- Persist state so both phones read and write the same bank
- Streaks and season resets
