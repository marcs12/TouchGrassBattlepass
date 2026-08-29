import { useState } from 'react'
import { recentDays, streakFrom } from '../lib/day'
import Icon from './Icon'
import ItemForm from './ItemForm'
import ContributionLog from './ContributionLog'
import Scoreboard from './Scoreboard'
import Window from './Window'

const STRIP_DAYS = 7
const WEEKDAY = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

function HabitRow({ habit, done, blocked, editing, onToggle, onEdit, onRemove }) {
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

      {editing && (
        <span className="habit__tools">
          <button
            type="button"
            aria-label={`Edit ${habit.title}`}
            onClick={() => onEdit(habit)}
          >
            <Icon name="pencil" size={14} strokeWidth="1.9" />
          </button>
          <button
            type="button"
            className="card__danger"
            aria-label={`Remove ${habit.title}`}
            onClick={() => onRemove(habit.id, Boolean(habit.custom))}
          >
            <Icon name="trash" size={14} strokeWidth="1.9" />
          </button>
        </span>
      )}
    </li>
  )
}

// What each member has banked today, from their own checklist.
const bankedToday = (members, done, allHabits) =>
  Object.fromEntries(
    members.map((m) => {
      const checked = new Set(done[m.id] ?? [])
      return [
        m.id,
        allHabits.filter((h) => checked.has(h.id)).reduce(
          (sum, h) => sum + h.points,
          0
        ),
      ]
    })
  )

export default function DailyGrind({
  grind,
  members,
  activeId,
  earned,
  balance,
  log,
  dailyHabits,
  bonusHabits,
  dailyGoal,
  onToggleHabit,
  onAddHabit,
  onEditHabit,
  onRemoveHabit,
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(null)
  const active = members.find((m) => m.id === activeId) ?? members[0]
  const partner = members.find((m) => m.id !== active.id)

  const done = new Set(grind.done[active.id] ?? [])
  const partnerDone = new Set((partner && grind.done[partner.id]) ?? [])

  const today = bankedToday(members, grind.done, [...dailyHabits, ...bonusHabits])
  const banked = today[active.id] ?? 0

  const dailyDone = dailyHabits.filter((h) => done.has(h.id)).length
  const dailyEarned = dailyHabits.filter((h) => done.has(h.id)).reduce(
    (sum, h) => sum + h.points,
    0
  )
  const goalProgress = dailyGoal
    ? Math.min(100, Math.round((dailyEarned / dailyGoal) * 100))
    : 0

  const goalDates = grind.goalDates[active.id] ?? []
  const streak = streakFrom(goalDates, grind.date)
  const hit = new Set(goalDates)

  // Unchecking refunds points, which the shared bank has to be able to cover.
  const canUndo = (habit) => !done.has(habit.id) || balance >= habit.points

  const rowProps = (habit) => ({
    habit,
    done: done.has(habit.id),
    blocked: !canUndo(habit),
    editing,
    onToggle: onToggleHabit,
    onEdit: setDraft,
    onRemove: onRemoveHabit,
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
              {dailyDone}/{dailyHabits.length}
            </strong>{' '}
            daily done
            {partner && (
              <>
                {' · '}
                {partner.name}{' '}
                <strong>
                  {dailyHabits.filter((h) => partnerDone.has(h.id)).length}/
                  {dailyHabits.length}
                </strong>
              </>
            )}
          </p>
        </div>
      </header>

      {balance === 0 && banked === 0 && streak === 0 && (
        <p className="firstrun">
          <Icon name="spark" size={16} strokeWidth="1.9" />
          Tick anything below to open the store. Clearing the whole daily list
          starts your streak.
        </p>
      )}

      <Scoreboard
        members={members}
        activeId={active.id}
        earned={earned}
        today={today}
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

      <div className="controls controls--tight">
        <p className="label">Your lists</p>
        <button
          type="button"
          className={`chip ${editing ? 'chip--on' : ''}`}
          aria-pressed={editing}
          onClick={() => setEditing((e) => !e)}
        >
          <Icon name={editing ? 'check' : 'plus'} size={14} strokeWidth="2.2" />
          {editing ? 'Done' : 'Add habit'}
        </button>
      </div>

      {draft ? (
        <ItemForm
          // Keyed so switching between adding and editing remounts the form
          // rather than reusing the previous draft's state.
          key={`edit-${draft.id}`}
          kind="habit"
          editing={draft}
          onAdd={(payload) => {
            onEditHabit(draft.id, payload)
            setDraft(null)
          }}
          onCancel={() => setDraft(null)}
        />
      ) : (
        editing && (
          <ItemForm
            key="add"
            kind="habit"
            onAdd={onAddHabit}
            onCancel={() => setEditing(false)}
          />
        )
      )}

      <section className="habits">
        <h3 className="habits__title label">Daily · resets at midnight</h3>
        <ul className="habits__list">
          {dailyHabits.map((habit) => (
            <HabitRow key={habit.id} {...rowProps(habit)} />
          ))}
        </ul>
      </section>

      <section className="habits">
        <h3 className="habits__title label">Bonus · bigger jobs, bigger payout</h3>
        <ul className="habits__list">
          {bonusHabits.map((habit) => (
            <HabitRow key={habit.id} {...rowProps(habit)} />
          ))}
        </ul>
      </section>

      <ContributionLog log={log} members={members} />
    </Window>
  )
}
