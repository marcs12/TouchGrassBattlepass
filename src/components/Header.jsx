import Icon from './Icon'
import ThemePicker from './ThemePicker'

// `short` keeps four tabs on one line once the labels stop fitting.
const TABS = [
  { id: 'grind', label: 'Daily Grind', short: 'Grind', icon: 'target' },
  { id: 'season', label: 'Season Pass', short: 'Pass', icon: 'trophy' },
  { id: 'store', label: 'Store', short: 'Store', icon: 'spark' },
  { id: 'redeemed', label: 'Redeemed', short: 'Receipts', icon: 'receipt' },
]

export default function Header({ balance, tab, onTab, redeemedCount }) {
  return (
    <header className="menubar">
      <div className="brand">
        <span className="brand__logo">
          <Icon name="leaf" size={20} />
        </span>
        <div className="brand__id">
          <h1 className="brand__name">Touch Grass Battlepass</h1>
          <p className="brand__season label">Season 1 · Co-op</p>
        </div>
      </div>

      <nav className="tabs" aria-label="Sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`tab ${tab === t.id ? 'tab--on' : ''}`}
            aria-current={tab === t.id ? 'page' : undefined}
            onClick={() => onTab(t.id)}
          >
            <Icon name={t.icon} size={16} />
            <span className="tab__label">{t.label}</span>
            <span className="tab__label tab__label--short">{t.short}</span>
            {t.id === 'redeemed' && redeemedCount > 0 && (
              <span className="tab__badge">{redeemedCount}</span>
            )}
          </button>
        ))}
      </nav>

      <div className="menubar__right">
        <ThemePicker />
        <div className="bank">
          <span className="bank__label label">Shared bank</span>
          <span className="bank__value">
            <Icon name="coin" size={16} />
            {balance.toLocaleString()}
          </span>
        </div>
      </div>
    </header>
  )
}
