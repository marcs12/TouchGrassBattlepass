import Icon from './Icon'

const LABELS = {
  idle: 'Saved',
  saving: 'Saving',
  error: 'Not saved',
  offline: 'Offline',
}

/** Quiet reassurance that a tap actually reached the other phone. */
export default function SyncDot({ status, pending = 0 }) {
  if (!status || status === 'local') return null

  const label = pending > 0 ? `${LABELS[status]} · ${pending} waiting` : LABELS[status]

  return (
    <span className={`sync sync--${status}`} title={label}>
      {status === 'offline' ? (
        <Icon name="wifioff" size={13} strokeWidth="1.9" />
      ) : (
        <i aria-hidden="true" />
      )}
      <span className="sync__text">{label}</span>
    </span>
  )
}
