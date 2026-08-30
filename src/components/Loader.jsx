import Icon from './Icon'

/**
 * The wait before the board arrives.
 *
 * Two of these run. This one is React's, once the bundle is up and the app is
 * asking the server which household this device belongs to. The other lives in
 * index.html and covers the wait before any of this exists - see there.
 *
 * `note` says what is actually being waited on, because "loading" on its own
 * is the least useful thing a screen can say.
 */
export default function Loader({ note = 'Finding your board…' }) {
  return (
    <div className="loader" role="status" aria-live="polite">
      <span className="loader__art" aria-hidden="true">
        <Icon name="leaf" size={28} strokeWidth="1.9" />
      </span>
      <p className="loader__note">{note}</p>
      <span className="loader__track" aria-hidden="true">
        <i />
      </span>
    </div>
  )
}
