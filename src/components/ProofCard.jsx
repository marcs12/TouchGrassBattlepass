import { createPortal } from 'react-dom'
import Icon from './Icon'
import ProofImage from './ProofImage'

const when = (at) =>
  new Date(at).toLocaleString(undefined, {
    weekday: 'long',
    hour: 'numeric',
    minute: '2-digit',
  })

/**
 * Opening someone's proof.
 *
 * A thumbnail in the log is too small to be evidence of anything, so tapping
 * one opens the photo at full width in its own little window - titlebar, dots
 * and all - with what it was for, who did it, when, and what it paid. The
 * stamp lives here too, because this is the moment you actually looked.
 *
 * Portalled for the same reason the proof sheet is: the tab wrapper keeps a
 * transform after its animation, which would otherwise capture a fixed child.
 */
export default function ProofCard({
  entry,
  habit,
  member,
  activeId,
  proofUrl,
  onCosign,
  onUncosign,
  onClose,
}) {
  const stamps = entry.cosigns ?? []
  const mine = stamps.some((s) => s.memberId === activeId)
  const theirs = entry.memberId !== activeId

  return createPortal(
    <div
      className="viewer"
      role="dialog"
      aria-label={`Proof for ${entry.label}`}
      onClick={onClose}
    >
      <div className="viewer__win" onClick={(e) => e.stopPropagation()}>
        <header className="pane__bar">
          <span className="pane__title">{entry.label}</span>
          <span className="pane__dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        </header>

        <div className="viewer__body">
          <ProofImage
            path={entry.proof.path}
            w={entry.proof.w}
            h={entry.proof.h}
            alt={`Proof for ${entry.label}, by ${member?.name ?? 'someone'}`}
            proofUrl={proofUrl}
            className="proof--big"
          />

          {/* What the photo is meant to be evidence of. A dev grant has no
              habit behind it, so this simply goes away. */}
          {habit?.note && <p className="viewer__note-text">{habit.note}</p>}

          <p className="viewer__meta">
            <span className="profile__avatar" aria-hidden="true">
              {member ? member.name.trim().charAt(0).toUpperCase() : '?'}
            </span>
            <span className="viewer__who">
              <strong>{member?.name ?? 'Someone'}</strong>
              <span className="label">{when(entry.at)}</span>
            </span>
            <span className="viewer__points">+{entry.points.toLocaleString()}</span>
          </p>

          <div className="viewer__actions">
            {theirs && onCosign ? (
              <button
                type="button"
                className={mine ? 'btn btn--quiet' : 'btn'}
                onClick={() => (mine ? onUncosign(entry.id) : onCosign(entry.id))}
              >
                <Icon name="stamp" size={16} strokeWidth="1.9" />
                {mine ? 'Take the stamp back' : 'Stamp it'}
              </button>
            ) : (
              <p className="label viewer__note">
                {stamps.length > 0 ? 'Stamped by your partner' : 'Not stamped yet'}
              </p>
            )}

            <button type="button" className="chip" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
