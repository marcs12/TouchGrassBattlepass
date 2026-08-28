import { BONUS_HABITS, DAILY_HABITS, DAILY_GOAL } from '../data/habits'
import { recentDays, streakFrom } from '../lib/day'
import Icon from './Icon'
import Scoreboard from './Scoreboard'
import Window from './Window'

const STRIP_DAYS = 7
const WEEKDAY = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

function HabitRow({ habit, done, blocked, onToggle }) {
  return (
    <li>
      <button
        type="button"
        className={`habit ${done ? 'habit--done' : ''} ${
          blocked ? 'habit--blocked' : ''
        }`}
        style={{ '--h': habit.hue }}
        aria-pressed={done}
        onClick={() => onToggle(habit)}
        title={
          blocked
            ? 'Bank is too low to give these points back - spend less or redo the habit.'
            : undefined
        }
      >
        <span className="habit__box" aria-hidden="true">
          {done && <Icon name="check" size={16} strokeWidth="2.4" />}
        </span>

        <span className="habit__art" aria-hidden="true">
          <Icon name={habit.icon} size={22} strokeWidth="1.9" />
        </span>

        <span className="habit__meta">
          <strong>{habit.title}</strong>
          <span className="habit__note">{habit.note}</span>
        </span>

        <span className="habit__points">
          {blocked && <Icon name="lock" size={13} className="habit__lock" />}
          {done ? '+' : ''}
          {habit.points}
          <span className="habit__unit">pts</span>
        </span>
      </button>
    </li>
  )
}

export default function DailyGrind({
  grind,
  members,
  activeId,
  earned,
  balance,
  onToggleHabit,
}) {
  const active = members.find((m) => m.id === activeId) ?? members[0]
  const partner = members.find((m) => m.id !== active.id)

  const done = new Set(grind.done[active.id] ?? [])
  const partnerDone = new Set((partner && grind.done[partner.id]) ?? [])

  const banked = [...DAILY_HABITS, ...BONUS_HABITS]
    .filter((h) => done.has(h.id))
    .reduce((sum, h) => sum + h.points, 0)

  const dailyDone = DAILY_HABITS.filter((h) => done.has(h.id)).length
  const dailyEarned = DAILY_HABITS.filter((h) => done.has(h.id)).reduce(
    (sum, h) => sum + h.points,
    0
  )
  const goalProgress = Math.min(100, Math.round((dailyEarned / DAILY_GOAL) * 100))

  const goalDates = grind.goalDates[active.id] ?? []
  const streak = streakFrom(goalDates, grind.date)
  const hit = new Set(goalDates)

  // Unchecking refunds points, which the shared bank has to be able to cover.
  const canUndo = (habit) => !done.has(habit.id) || balance >= habit.points

  const rowProps = (habit) => ({
    habit,
    done: done.has(habit.id),
    blocked: !canUndo(habit),
    onToggle: onToggleHabit,
  })

  return (
    <Window title="daily-grind">
      <header className="store__head">
        <div>
          <h2 className="store__title">Daily Grind</h2>
          <p className="store__sub">
            You each keep your own list — if you both did it, you both check it
            and you both get paid. Everything lands in the shared bank.
          </p>
        </div>

        <div className="nextup">
          <p className="label">Today · {active.name}</p>
          <p className="nextup__title">{banked.toLocaleString()} pts banked</p>
          <div
            className="meter"
            role="progressbar"
            aria-valuenow={goalProgress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${active.name}'s progress toward the full daily list`}
          >
            <span style={{ width: `${goalProgress}%` }} />
          </div>
          <p className="nextup__hint">
            <strong>
              {dailyDone}/{DAILY_HABITS.length}
            </strong>{' '}
            daily done
            {partner && (
              <>
                {' · '}
                {partner.name}{' '}
                <strong>
                  {DAILY_HABITS.filter((h) => partnerDone.has(h.id)).length}/
                  {DAILY_HABITS.length}
                </strong>
              </>
            )}
          </p>
        </div>
      </header>

      <Scoreboard
        members={members}
        activeId={active.id}
        earned={earned}
        balance={balance}
      />

      <div className="streak">
        <span className="streak__count">
          <Icon name="flame" size={18} strokeWidth="1.9" />
          <strong>{streak}</strong> day streak · {active.name}
        </span>
        <ol className="streak__strip">
          {recentDays(STRIP_DAYS, grind.date).map((key) => {
            const weekday = WEEKDAY[new Date(`${key}T00:00:00`).getDay()]
            const isToday = key === grind.date
            return (
              <li
                key={key}
                className={`streak__day ${hit.has(key) ? 'streak__day--hit' : ''} ${
                  isToday ? 'streak__day--today' : ''
                }`}
              >
                <span className="streak__dot" aria-hidden="true">
                  {hit.has(key) && <Icon name="check" size={12} strokeWidth="2.6" />}
                </span>
                <span className="streak__label">{weekday}</span>
                <span className="sr-only">
                  {key}: {hit.has(key) ? 'full list cleared' : 'not cleared'}
                </span>
              </li>
            )
          })}
        </ol>
      </div>

      <section className="habits">
        <h3 className="habits__title label">Daily · resets at midnight</h3>
        <ul className="habits__list">
          {DAILY_HABITS.map((habit) => (
            <HabitRow key={habit.id} {...rowProps(habit)} />
          ))}
        </ul>
      </section>

      <section className="habits">
        <h3 className="habits__title label">Bonus · bigger jobs, bigger payout</h3>
        <ul className="habits__list">
          {BONUS_HABITS.map((habit) => (
            <HabitRow key={habit.id} {...rowProps(habit)} />
          ))}
        </ul>
      </section>
    </Window>
  )
}
