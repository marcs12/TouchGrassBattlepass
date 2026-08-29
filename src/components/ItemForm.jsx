import { useState } from 'react'
import Icon from './Icon'

const HABIT_ICONS = ['walk', 'dumbbell', 'moon', 'droplet', 'pot', 'broom', 'book', 'phoneoff', 'mountain', 'heart', 'basket', 'spark']
const REWARD_ICONS = ['coffee', 'icecream', 'wrap', 'moped', 'film', 'sushi', 'spa', 'serum', 'shirt', 'shoe', 'bag', 'ticket', 'car', 'hotel', 'gamepad', 'plane']

const BLANK = { title: '', note: '', points: '', icon: '', kind: 'daily', tier: 'low' }

// An existing entry becomes a draft: same form, prefilled, saving in place.
const draftFrom = (item, isHabit, icons) =>
  item
    ? {
        title: item.title ?? '',
        note: (isHabit ? item.note : item.description) ?? '',
        points: String(isHabit ? item.points : item.cost),
        icon: item.icon ?? icons[0],
        kind: item.kind ?? 'daily',
        tier: item.tier ?? 'low',
      }
    : { ...BLANK, icon: icons[0] }

/**
 * Adds a habit or a reward without touching the code. Kept deliberately small:
 * a name, a line of detail, what it's worth, and a picture.
 */
export default function ItemForm({ kind, editing, onAdd, onCancel }) {
  const isHabit = kind === 'habit'
  const icons = isHabit ? HABIT_ICONS : REWARD_ICONS
  const [draft, setDraft] = useState(() => draftFrom(editing, isHabit, icons))

  const points = Number(draft.points)
  const ready = draft.title.trim().length > 0 && points > 0

  const set = (patch) => setDraft((prev) => ({ ...prev, ...patch }))

  const submit = (e) => {
    e.preventDefault()
    if (!ready) return

    onAdd(
      isHabit
        ? {
            title: draft.title.trim(),
            note: draft.note.trim() || 'Added by you.',
            points,
            kind: draft.kind,
            icon: draft.icon,
          }
        : {
            title: draft.title.trim(),
            description: draft.note.trim() || 'Added by you.',
            cost: points,
            tier: draft.tier,
            icon: draft.icon,
          }
    )
    if (!editing) setDraft({ ...BLANK, icon: icons[0] })
  }

  return (
    <form className="itemform" onSubmit={submit}>
      <p className="field">
        <label className="label" htmlFor="item-title">
          {editing ? `Editing ${editing.title}` : isHabit ? 'Habit' : 'Reward'}
        </label>
        <input
          id="item-title"
          className="input"
          value={draft.title}
          maxLength={48}
          placeholder={isHabit ? 'Walk the dog' : 'Bubble tea run'}
          onChange={(e) => set({ title: e.target.value })}
        />
      </p>

      <p className="field">
        <label className="label" htmlFor="item-note">
          Detail
        </label>
        <input
          id="item-note"
          className="input"
          value={draft.note}
          maxLength={90}
          placeholder="One line of detail"
          onChange={(e) => set({ note: e.target.value })}
        />
      </p>

      <div className="itemform__row">
        <p className="field">
          <label className="label" htmlFor="item-points">
            {isHabit ? 'Points earned' : 'Cost'}
          </label>
          <input
            id="item-points"
            className="input"
            type="number"
            min="1"
            max="100000"
            value={draft.points}
            placeholder="50"
            onChange={(e) => set({ points: e.target.value })}
          />
        </p>

        <p className="field">
          <label className="label" htmlFor="item-kind">
            {isHabit ? 'List' : 'Tier'}
          </label>
          <select
            id="item-kind"
            className="input"
            value={isHabit ? draft.kind : draft.tier}
            onChange={(e) =>
              set(isHabit ? { kind: e.target.value } : { tier: e.target.value })
            }
          >
            {isHabit ? (
              <>
                <option value="daily">Daily</option>
                <option value="bonus">Bonus</option>
              </>
            ) : (
              <>
                <option value="low">Common</option>
                <option value="medium">Rare</option>
                <option value="high">Legendary</option>
              </>
            )}
          </select>
        </p>
      </div>

      <fieldset className="itemform__icons">
        <legend className="label">Icon</legend>
        {icons.map((name) => (
          <button
            key={name}
            type="button"
            className={`itemform__icon ${draft.icon === name ? 'itemform__icon--on' : ''}`}
            aria-label={name}
            aria-pressed={draft.icon === name}
            onClick={() => set({ icon: name })}
          >
            <Icon name={name} size={20} strokeWidth="1.9" />
          </button>
        ))}
      </fieldset>

      <div className="itemform__actions">
        <button type="submit" className="btn" disabled={!ready}>
          <Icon name={editing ? 'check' : 'plus'} size={14} strokeWidth="2.2" />
          {editing ? 'Save changes' : `Add ${isHabit ? 'habit' : 'reward'}`}
        </button>
        <button type="button" className="chip" onClick={onCancel}>
          {editing ? 'Cancel' : 'Done'}
        </button>
      </div>
    </form>
  )
}
