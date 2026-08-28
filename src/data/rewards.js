// Mock catalog. Swap for real data source later.
// tier drives the badge color + rough cost band:
//   low: everyday treats | medium: real outings | high: big-ticket trips
// `hue` is a raw HSL hue only - saturation/lightness come from the active
// theme (--art-s / --art-l*), so card art restyles with the rest of the app.
export const TIERS = {
  low: { label: 'Common', color: 'var(--tier-low)' },
  medium: { label: 'Rare', color: 'var(--tier-medium)' },
  high: { label: 'Legendary', color: 'var(--tier-high)' },
}

export const TIER_ORDER = ['low', 'medium', 'high']

export const REWARDS = [
  {
    id: 'tims',
    title: 'Tim Hortons Coffee Run',
    description: 'Double-double delivered to your desk. Timbits optional.',
    cost: 80,
    tier: 'low',
    icon: 'coffee',
    hue: 8,
  },
  {
    id: 'dq-blizzard',
    title: 'Dairy Queen Blizzards',
    description: 'Two Blizzards, flipped upside down, no questions asked.',
    cost: 150,
    tier: 'low',
    icon: 'icecream',
    hue: 340,
  },
  {
    id: 'osmows',
    title: "Osmow's Shawarma Run",
    description: 'Two Sultan bowls. Extra garlic sauce is non-negotiable.',
    cost: 220,
    tier: 'low',
    icon: 'wrap',
    hue: 34,
  },
  {
    id: 'movie-night',
    title: 'Movie Night: Your Pick',
    description: 'Full veto power over the queue. Snacks included.',
    cost: 260,
    tier: 'low',
    icon: 'film',
    hue: 268,
  },
  {
    id: 'chore-pass',
    title: 'Skip Chores Pass',
    description: 'One full day off the rotation. Partner covers it.',
    cost: 500,
    tier: 'medium',
    icon: 'basket',
    hue: 176,
  },
  {
    id: 'sushi-9-nine',
    title: 'Sushi 9 Nine Takeout',
    description: 'The big platter. Eaten on the couch like royalty.',
    cost: 600,
    tier: 'medium',
    icon: 'sushi',
    hue: 158,
  },
  {
    id: 'massage',
    title: 'Full Body Massage',
    description: '60 minutes, booked and paid from the shared bank.',
    cost: 750,
    tier: 'medium',
    icon: 'spa',
    hue: 322,
  },
  {
    id: 'concert',
    title: 'Concert / Event Tickets',
    description: 'Two tickets to whatever is playing that month.',
    cost: 1400,
    tier: 'medium',
    icon: 'ticket',
    hue: 222,
  },
  {
    id: 'turo-weekend',
    title: 'Turo Weekend Car Rental',
    description: 'Something fast, something loud. Friday to Sunday.',
    cost: 2500,
    tier: 'high',
    icon: 'car',
    hue: 200,
  },
  {
    id: 'staycation',
    title: 'Downtown Hotel Staycation',
    description: 'One night, late checkout, zero dishes to wash.',
    cost: 3200,
    tier: 'high',
    icon: 'hotel',
    hue: 242,
  },
  {
    id: 'setup-upgrade',
    title: 'Home Setup Upgrade',
    description: 'Monitor, chair, whatever the battlestation is missing.',
    cost: 4000,
    tier: 'high',
    icon: 'gamepad',
    hue: 286,
  },
  {
    id: 'flair-flight',
    title: 'Flair Airlines Flight Fund',
    description: 'Two seats anywhere Flair flies. Carry-on is on you.',
    cost: 5000,
    tier: 'high',
    icon: 'plane',
    hue: 154,
  },
]
