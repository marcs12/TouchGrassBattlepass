import Icon from './Icon'
import Window from './Window'

const initial = (name) => name.trim().charAt(0).toUpperCase()

// Second step of joining: the board already knows both names, so pick yours.
export default function PickPlayer({ members, onPick }) {
  return (
    <Window title="who-are-you">
      <header className="store__head">
        <div>
          <h2 className="store__title">Which one are you?</h2>
          <p className="store__sub">
            This is the list you'll be checking off. You can switch later from
            the menu bar.
          </p>
        </div>
      </header>

      <div className="setup">
        {members.map((m) => (
          <button
            key={m.id}
            type="button"
            className="pick"
            onClick={() => onPick(m.id)}
          >
            <span className="profile__avatar" aria-hidden="true">
              {initial(m.name)}
            </span>
            <strong>{m.name}</strong>
            <Icon name="chevron" size={16} className="pick__go" />
          </button>
        ))}
      </div>
    </Window>
  )
}
