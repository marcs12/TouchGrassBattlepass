// A nested window.
//
// The reference boards are stacks of little titled windows, each wearing its
// own pastel titlebar, rather than one frame full of flat sections. `tone`
// picks from the theme's five titlebar colours so two panes sitting on top of
// each other never match.
//
// `Window` remains the outer chrome; this is what goes inside it.
export default function Pane({ title, tone = 'a', flush = false, children }) {
  return (
    <section className={`pane pane--${tone} ${flush ? 'pane--flush' : ''}`}>
      <header className="pane__bar">
        <span className="pane__title">{title}</span>
        <span className="pane__dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      </header>
      <div className="pane__body">{children}</div>
    </section>
  )
}
