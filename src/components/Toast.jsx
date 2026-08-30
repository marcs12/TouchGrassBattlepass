import { useEffect } from 'react'
import Icon from './Icon'

const initial = (name) => name.trim().charAt(0).toUpperCase()

/**
 * Two jobs, one strip along the bottom.
 *
 * The other phone doing something - without this, realtime updates just make
 * numbers change on their own, which reads as a glitch rather than a partner.
 *
 * And your own last check-off, with a way back out of it. A mis-tap is the one
 * mistake this app makes easy to make, and hunting for the row you just
 * touched is a silly way to fix it.
 */
export default function Toast({ notice, onDone }) {
  useEffect(() => {
    const timer = setTimeout(onDone, notice.action ? 6000 : 4200)
    return () => clearTimeout(timer)
  }, [notice.id, notice.action, onDone])

  return (
    <div className="toast" role="status">
      <span className="profile__avatar" aria-hidden="true">
        {notice.name ? (
          initial(notice.name)
        ) : (
          <Icon name="check" size={14} strokeWidth="2.6" />
        )}
      </span>

      <span className="toast__meta">
        <strong>{notice.name ?? notice.title}</strong>
        <span>{notice.text}</span>
      </span>

      {notice.action ? (
        <button
          type="button"
          className="toast__action"
          onClick={() => {
            notice.action.run()
            onDone()
          }}
        >
          {notice.action.label}
        </button>
      ) : (
        <button
          type="button"
          className="toast__dismiss"
          aria-label="Dismiss"
          onClick={onDone}
        >
          <Icon name="spark" size={15} strokeWidth="1.9" className="toast__spark" />
        </button>
      )}
    </div>
  )
}
