import { useEffect } from 'react'
import Icon from './Icon'

const initial = (name) => name.trim().charAt(0).toUpperCase()

/**
 * The other phone doing something. Without this, realtime updates just make
 * numbers change on their own, which reads as a glitch rather than a partner.
 */
export default function Toast({ notice, onDone }) {
  useEffect(() => {
    const timer = setTimeout(onDone, 4200)
    return () => clearTimeout(timer)
  }, [notice.id, onDone])

  return (
    <button type="button" className="toast" onClick={onDone}>
      <span className="profile__avatar" aria-hidden="true">
        {initial(notice.name)}
      </span>
      <span className="toast__meta">
        <strong>{notice.name}</strong>
        <span>{notice.text}</span>
      </span>
      <Icon name="spark" size={15} strokeWidth="1.9" className="toast__spark" />
    </button>
  )
}
