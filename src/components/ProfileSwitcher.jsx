import { useEffect, useRef, useState } from 'react'
import Icon from './Icon'

const initial = (name) => name.trim().charAt(0).toUpperCase()

// Both people share one screen, so switching who is checking things off has
// to be one tap away.
export default function ProfileSwitcher({ members, activeId, earned, onSwitch }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)
  const buttonRef = useRef(null)
  const active = members.find((m) => m.id === activeId) ?? members[0]

  useEffect(() => {
    if (!open) return

    const onPointer = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      buttonRef.current?.focus()
    }

    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="themer" ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        className="themer__btn profile__btn"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="profile__avatar" aria-hidden="true">
          {initial(active.name)}
        </span>
        <span className="themer__btn-text">{active.name}</span>
        <Icon
          name="chevron"
          size={14}
          className={open ? 'themer__caret themer__caret--up' : 'themer__caret'}
        />
      </button>

      {open && (
        <div className="themer__menu" role="menu" aria-label="Who is checking off">
          <p className="themer__heading label">Playing as</p>
          {members.map((m) => {
            const on = m.id === active.id
            return (
              <button
                key={m.id}
                type="button"
                role="menuitemradio"
                aria-checked={on}
                className={`themer__opt ${on ? 'themer__opt--on' : ''}`}
                onClick={() => {
                  onSwitch(m.id)
                  setOpen(false)
                  buttonRef.current?.focus()
                }}
              >
                <span className="profile__avatar" aria-hidden="true">
                  {initial(m.name)}
                </span>
                <span className="themer__meta">
                  <strong>{m.name}</strong>
                  <small>{(earned[m.id] ?? 0).toLocaleString()} pts earned</small>
                </span>
                {on && <Icon name="check" size={16} className="themer__check" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
