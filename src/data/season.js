// Season track. XP is lifetime points *earned* - spending in the store never
// pulls the track backwards, so the two currencies can't fight each other.
//
// Tier rewards come in two shapes:
//   bonus - credits the shared bank when claimed
//   perk  - an agreed-on real-world payoff; claiming just marks it owed
export const SEASON = {
  id: 's1',
  name: 'Season 1',
  subtitle: 'Co-op',
}

export const TIERS_TRACK = [
  {
    n: 1,
    xp: 250,
    type: 'bonus',
    value: 100,
    title: 'Starter Boost',
    note: '100 pts straight into the bank.',
    icon: 'coin',
  },
  {
    n: 2,
    xp: 600,
    type: 'perk',
    title: 'Dish Duty Pass',
    note: 'The other one does the dishes tonight.',
    icon: 'broom',
  },
  {
    n: 3,
    xp: 1000,
    type: 'bonus',
    value: 150,
    title: 'Momentum Bonus',
    note: '150 pts for keeping it going.',
    icon: 'coin',
  },
  {
    n: 4,
    xp: 1500,
    type: 'perk',
    title: 'Takeout Veto',
    note: 'You pick the next takeout. No debate.',
    icon: 'wrap',
  },
  {
    n: 5,
    xp: 2100,
    type: 'bonus',
    value: 200,
    title: 'Halfway Haul',
    note: '200 pts.',
    icon: 'coin',
  },
  {
    n: 6,
    xp: 2800,
    type: 'perk',
    title: 'Queue Control',
    note: 'A full week of picking what you watch.',
    icon: 'film',
  },
  {
    n: 7,
    xp: 3600,
    type: 'bonus',
    value: 300,
    title: 'Deep Cut Bonus',
    note: '300 pts.',
    icon: 'coin',
  },
  {
    n: 8,
    xp: 4500,
    type: 'perk',
    title: 'Breakfast in Bed',
    note: 'Made by the other one. Tray and everything.',
    icon: 'pot',
  },
  {
    n: 9,
    xp: 5500,
    type: 'bonus',
    value: 400,
    title: 'Home Stretch Bonus',
    note: '400 pts.',
    icon: 'coin',
  },
  {
    n: 10,
    xp: 6600,
    type: 'perk',
    title: 'Day Trip, Planned For You',
    note: 'They plan it, you just show up.',
    icon: 'mountain',
  },
  {
    n: 11,
    xp: 7800,
    type: 'bonus',
    value: 500,
    title: 'Final Stretch Bonus',
    note: '500 pts.',
    icon: 'coin',
  },
  {
    n: 12,
    xp: 9000,
    type: 'perk',
    title: 'Season 1 Champion',
    note: 'Bragging rights, and the trophy stays on your shelf.',
    icon: 'trophy',
  },
]

export const SEASON_XP_TOTAL = TIERS_TRACK[TIERS_TRACK.length - 1].xp

/** Highest tier number reached at this XP (0 before the first one). */
export const tierAt = (xp) =>
  TIERS_TRACK.reduce((tier, t) => (xp >= t.xp ? t.n : tier), 0)

/** The next tier still to unlock, or null once the track is finished. */
export const nextTier = (xp) => TIERS_TRACK.find((t) => xp < t.xp) ?? null
