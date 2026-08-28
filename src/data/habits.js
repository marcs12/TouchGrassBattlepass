// Mock habit catalog. Swap for real data source later.
// `daily` habits reset every night and drive the streak; `bonus` habits are
// the occasional big-ticket efforts worth grinding for.
// `hue` feeds the same flat art plate the reward cards use.
export const HABITS = [
  {
    id: 'touch-grass',
    title: 'Touch Grass',
    note: '30 minutes outside. Phone stays in the pocket.',
    points: 40,
    kind: 'daily',
    icon: 'walk',
    hue: 138,
  },
  {
    id: 'move',
    title: 'Move Your Body',
    note: 'Gym, run, swim, whatever gets the heart going.',
    points: 60,
    kind: 'daily',
    icon: 'dumbbell',
    hue: 8,
  },
  {
    id: 'lights-out',
    title: 'Lights Out by 11',
    note: 'In bed, screens off, actually asleep.',
    points: 40,
    kind: 'daily',
    icon: 'moon',
    hue: 248,
  },
  {
    id: 'water',
    title: 'Two Litres of Water',
    note: 'Coffee does not count. Sorry.',
    points: 20,
    kind: 'daily',
    icon: 'droplet',
    hue: 198,
  },
  {
    id: 'cook',
    title: 'Cook Instead of Order',
    note: 'Anything made at home beats the delivery app.',
    points: 45,
    kind: 'daily',
    icon: 'pot',
    hue: 28,
  },
  {
    id: 'tidy',
    title: 'Fifteen-Minute Tidy',
    note: 'Set a timer, reset one room, stop when it rings.',
    points: 25,
    kind: 'daily',
    icon: 'broom',
    hue: 172,
  },
  {
    id: 'read',
    title: 'Read Twenty Pages',
    note: 'Paper, e-reader, audiobook. All fine.',
    points: 30,
    kind: 'daily',
    icon: 'book',
    hue: 268,
  },
  {
    id: 'no-scroll',
    title: 'No Doomscroll After 10',
    note: 'Feeds closed for the night.',
    points: 35,
    kind: 'daily',
    icon: 'phoneoff',
    hue: 318,
  },
  {
    id: 'hike',
    title: 'Go on a Real Hike',
    note: 'Trailhead, boots, at least a couple of hours.',
    points: 180,
    kind: 'bonus',
    icon: 'mountain',
    hue: 152,
  },
  {
    id: 'date-night',
    title: 'Phone-Free Date Night',
    note: 'Both phones face down for the whole evening.',
    points: 150,
    kind: 'bonus',
    icon: 'heart',
    hue: 342,
  },
  {
    id: 'deep-clean',
    title: 'Deep Clean Sprint',
    note: 'The job that keeps getting pushed to next weekend.',
    points: 120,
    kind: 'bonus',
    icon: 'basket',
    hue: 42,
  },
]

export const DAILY_HABITS = HABITS.filter((h) => h.kind === 'daily')
export const BONUS_HABITS = HABITS.filter((h) => h.kind === 'bonus')

// Clearing every daily habit is what keeps a streak alive.
export const DAILY_GOAL = DAILY_HABITS.reduce((sum, h) => sum + h.points, 0)
