// The app's one piece of chrome: a titled window frame borrowed from the
// retro-desktop reference art. Everything in a tab renders inside one.
export default function Window({ title, children }) {
  return (
    <section className="win">
      <div className="win__bar">
        <span className="win__title label">{title}</span>
        <span className="win__dots" aria-hidden="true">
          <i style={{ background: 'var(--tier-high)' }} />
          <i style={{ background: 'var(--tier-low)' }} />
          <i style={{ background: 'var(--accent)' }} />
        </span>
      </div>
      <div className="win__body">{children}</div>
    </section>
  )
}
