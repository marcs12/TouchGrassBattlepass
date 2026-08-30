import { useState } from 'react'
import { streakFrom } from '../lib/day'
import { weekDays, weekStart } from '../data/week'
import Icon from './Icon'
import ItemForm from './ItemForm'
import ContributionLog from './ContributionLog'
import Pane from './Pane'
import ProofSheet from './ProofSheet'
import Scoreboard from './Scoreboard'
import WeekBanner from './WeekBanner'
import Window from './Window'

// The strip is the calendar week, Sunday to Saturday, so it always reads
// S M T W T F S and lines up with the week banner above it.
const WEEKDAY = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

function HabitRow({ habit, done, blocked, editing, proof, onToggle, onEdit, onRemove, onProof }) {
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

      {/* Proof is offered only once the box is ticked: the point is already
          banked, and a photo is decoration on it, never a condition of it. */}
      {done && !editing && onProof && (
        <button
          type="button"
          className={`habit__proof ${proof ? 'habit__proof--on' : ''}`}
          aria-label={proof ? `Proof for ${habit.title}` : `Add a photo to ${habit.title}`}
          onClick={() => onProof(habit)}
        >
          <Icon name="camera" size={14} strokeWidth="1.9" />
        </button>
      )}

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
  week,
  stakes,
  proofUrl,
  onToggleHabit,
  onAddHabit,
  onEditHabit,
  onRemoveHabit,
  onOpenWeek,
  onAddStake,
  onAttachProof,
  onClearProof,
  onCosign,
  onUncosign,
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(null)
  const [shooting, setShooting] = useState(null)
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

  // Today's photos come straight off the log, which already carries them.
  const proofFor = (habitId) =>
    log.find(
      (entry) =>
        entry.habitId === habitId &&
        entry.day === grind.date &&
        entry.memberId === active.id &&
        entry.proof
    )?.proof ?? null

  const rowProps = (habit) => ({
    habit,
    done: done.has(habit.id),
    blocked: !canUndo(habit),
    editing,
    proof: proofFor(habit.id),
    onToggle: onToggleHabit,
    onEdit: setDraft,
    onRemove: onRemoveHabit,
    onProof: onAttachProof ? setShooting : null,
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
        <p className="bubble">
          <Icon name="spark" size={16} strokeWidth="1.9" />
          Tick anything below to open the store. Clearing the whole daily list
          starts your streak.
        </p>
      )}

      {week && members.length > 1 && (
        <Pane title="this-week.exe" tone="d">
          <span className="decal decal--tr" aria-hidden="true">
            <Icon name="flame" size={22} strokeWidth="1.9" />
          </span>
          <WeekBanner
            week={week}
            members={members}
            activeId={active.id}
            stakes={stakes}
            onOpenWeek={onOpenWeek}
            onAddStake={onAddStake}
          />
        </Pane>
      )}

      <Pane title="shared-bank" tone="a">
        <Scoreboard
          members={members}
          activeId={active.id}
          earned={earned}
          today={today}
          balance={balance}
        />
      </Pane>

      <Pane title="streak.log" tone="b">
      <div className="streak">
        <span className="streak__count">
          <span className="streak__headline">
            <Icon name="flame" size={18} strokeWidth="1.9" />
            <strong>{streak}</strong> day streak · {active.name}
          </span>
          {/* The rule used to live only in the first-run hint, which vanishes
              as soon as you bank a point - so a day that never lit up looked
              like a bug rather than an unfinished list. */}
          {dailyHabits.length > 0 && (
            <span className="streak__rule label">
              {dailyDone === dailyHabits.length
                ? 'full list cleared today'
                : `${dailyDone} of ${dailyHabits.length} today — clear them all to keep it`}
            </span>
          )}
        </span>
        <ol className="streak__strip">
          {weekDays(weekStart(grind.date)).map((key) => {
            const weekday = WEEKDAY[new Date(`${key}T00:00:00`).getDay()]
            const isToday = key === grind.date
            // Days that haven't happened yet aren't misses, and shouldn't read
            // as one.
            const ahead = key > grind.date
            return (
              <li
                key={key}
                className={`streak__day ${hit.has(key) ? 'streak__day--hit' : ''} ${
                  isToday ? 'streak__day--today' : ''
                } ${ahead ? 'streak__day--ahead' : ''}`}
              >
                <span className="streak__dot" aria-hidden="true">
                  {hit.has(key) && <Icon name="check" size={12} strokeWidth="2.6" />}
                </span>
                <span className="streak__label">{weekday}</span>
                <span className="sr-only">
                  {key}:{' '}
                  {hit.has(key)
                    ? 'full list cleared'
                    : ahead
                    ? 'still to come'
                    : 'not cleared'}
                </span>
              </li>
            )
          })}
        </ol>
      </div>
      </Pane>

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

      <Pane title="daily.list — resets at midnight" tone="c" flush>
        <section className="habits">
          <ul className="habits__list">
            {dailyHabits.map((habit) => (
              <HabitRow key={habit.id} {...rowProps(habit)} />
            ))}
          </ul>
        </section>
      </Pane>

      <ol className="pixrule" aria-hidden="true">
        <li className="pixheart" />
        <li className="pixheart" />
        <li className="pixheart" />
      </ol>

      <Pane title="bonus.list — bigger payout" tone="e" flush>
        <section className="habits">
          <ul className="habits__list">
            {bonusHabits.map((habit) => (
              <HabitRow key={habit.id} {...rowProps(habit)} />
            ))}
          </ul>
        </section>
      </Pane>

      <Pane title="contributions" tone="a" flush>
        <ContributionLog
          log={log}
        members={members}
        activeId={active.id}
        proofUrl={proofUrl}
          onCosign={onCosign}
          onUncosign={onUncosign}
        />
      </Pane>

      {shooting && (
        <ProofSheet
          habit={shooting}
          proof={proofFor(shooting.id)}
          proofUrl={proofUrl}
          onAttach={onAttachProof}
          onClear={onClearProof}
          onClose={() => setShooting(null)}
        />
      )}
    </Window>
  )
}
