import Icon from './Icon'

const LABELS = {
  idle: 'Saved',
  saving: 'Saving',
  error: 'Not saved',
  offline: 'Offline',
}

/** Quiet reassurance that a tap actually reached the other phone. */
export default function SyncDot({ status }) {
  if (!status || status === 'local') return null

  return (
    <span className={`sync sync--${status}`} title={LABELS[status]}>
      {status === 'offline' ? (
        <Icon name="wifioff" size={13} strokeWidth="1.9" />
      ) : (
        <i aria-hidden="true" />
      )}
      <span className="sync__text">{LABELS[status]}</span>
    </span>
  )
}
