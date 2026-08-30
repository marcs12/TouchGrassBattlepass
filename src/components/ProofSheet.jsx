import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Icon from './Icon'
import ProofImage from './ProofImage'

/**
 * Attaching a photo to something already ticked off.
 *
 * The point was banked the moment the box was ticked and nothing here can
 * take it back: a photo that never uploads just leaves a check-off without a
 * picture. `capture` is what opens the camera straight away on a phone, and
 * it is the only camera an iOS home-screen PWA has.
 *
 * Rendered into the body: the tab wrapper animates with `both`, so it keeps a
 * transform after the animation ends and a fixed child would be positioned
 * against that box instead of the viewport.
 */
export default function ProofSheet({ habit, proof, proofUrl, onAttach, onClear, onClose }) {
  const input = useRef(null)
  const [busy, setBusy] = useState(false)

  const pick = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setBusy(true)
    try {
      await onAttach(habit, file)
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <div className="sheet" role="dialog" aria-label={`Proof for ${habit.title}`}>
      <div className="sheet__scrim" onClick={onClose} />

      <div className="sheet__body">
        <header className="sheet__head">
          <span className="habit__art" aria-hidden="true" style={{ '--h': habit.hue }}>
            <Icon name={habit.icon} size={22} strokeWidth="1.9" />
          </span>
          <span className="sheet__meta">
            <strong>{habit.title}</strong>
            <span className="label">
              {proof ? 'Photo attached' : 'Show your work if you feel like it'}
            </span>
          </span>
          <button type="button" className="sheet__close" aria-label="Close" onClick={onClose}>
            <Icon name="plus" size={16} strokeWidth="2.2" />
          </button>
        </header>

        {proof && (
          <ProofImage
            path={proof.path}
            w={proof.w}
            h={proof.h}
            alt={`Proof for ${habit.title}`}
            proofUrl={proofUrl}
            className="proof--big"
          />
        )}

        <input
          ref={input}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={pick}
        />

        <div className="sheet__actions">
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            <Icon name="camera" size={16} strokeWidth="1.9" />
            {busy ? 'Shrinking…' : proof ? 'Replace photo' : 'Add a photo'}
          </button>

          {proof && (
            <button
              type="button"
              className="btn btn--quiet card__danger"
              onClick={() => {
                onClear(habit, proof.path)
                onClose()
              }}
            >
              <Icon name="trash" size={16} strokeWidth="1.9" />
              Remove
            </button>
          )}
        </div>

        <p className="sheet__note label">
          Photos get shrunk on your phone before they go anywhere, and the
          location tag comes off on the way out.
        </p>
      </div>
    </div>,
    document.body
  )
}
