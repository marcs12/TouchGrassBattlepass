const TABS = [
  { id: 'grind', label: 'Daily Grind' },
  { id: 'store', label: 'Store' },
  { id: 'redeemed', label: 'Redeemed' },
]

export default function Header({ balance, tab, onTab, redeemedCount }) {
  return (
    <header className="topbar">
      <div className="topbar__brand">
        <span className="topbar__logo" aria-hidden="true">🌱</span>
        <div>
          <h1 className="topbar__name">Touch Grass Battlepass</h1>
          <p className="topbar__season">Season 1 · Co-op</p>
        </div>
      </div>

      <nav className="tabs" aria-label="Sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`tab ${tab === t.id ? 'tab--on' : ''}`}
            aria-current={tab === t.id ? 'page' : undefined}
            onClick={() => onTab(t.id)}
          >
            {t.label}
            {t.id === 'redeemed' && redeemedCount > 0 && (
              <span className="tab__badge">{redeemedCount}</span>
            )}
          </button>
        ))}
      </nav>

      <div className="bank" title="Shared point bank">
        <span className="bank__label">Shared Bank</span>
        <span className="bank__value">
          <span className="bank__coin" aria-hidden="true">◆</span>
          {balance.toLocaleString()}
        </span>
      </div>
    </header>
  )
}
