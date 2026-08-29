import { useEffect } from 'react'
import Icon from './Icon'

// Cut-paper confetti: flat shapes with ink outlines, same as everything else.
const PIECES = Array.from({ length: 18 }, (_, i) => ({
  id: i,
  x: (i / 17) * 100,
  delay: (i % 6) * 60,
  spin: i % 2 ? 1 : -1,
  tone: ['var(--accent)', 'var(--tier-low)', 'var(--tier-medium)', 'var(--tier-high)'][i % 4],
}))

export default function Celebrate({ celebration, onDone }) {
  useEffect(() => {
    const timer = setTimeout(onDone, 3200)
    return () => clearTimeout(timer)
  }, [celebration.id, onDone])

  return (
    <div className="party" role="status" onClick={onDone}>
      <div className="party__confetti" aria-hidden="true">
        {PIECES.map((p) => (
          <i
            key={p.id}
            style={{
              left: `${p.x}%`,
              background: p.tone,
              animationDelay: `${p.delay}ms`,
              '--spin': p.spin,
            }}
          />
        ))}
      </div>

      <div className="party__card">
        <span className="party__art" aria-hidden="true">
          <Icon name={celebration.icon} size={30} strokeWidth="1.9" />
        </span>
        <p className="label">{celebration.eyebrow}</p>
        <h2 className="party__title">{celebration.title}</h2>
        <p className="party__note">{celebration.note}</p>
      </div>
    </div>
  )
}
