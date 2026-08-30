import { useEffect, useRef, useState } from 'react'
import { SEASON, seasonName } from '../data/season'
import { useCountUp } from '../lib/useCountUp'
import Icon from './Icon'
import ThemePicker from './ThemePicker'
import ProfileSwitcher from './ProfileSwitcher'
import SyncDot from './SyncDot'

// `short` keeps four tabs on one line once the labels stop fitting.
const TABS = [
  { id: 'grind', label: 'Daily Grind', short: 'Grind', icon: 'target' },
  { id: 'season', label: 'Season Pass', short: 'Pass', icon: 'trophy' },
  { id: 'store', label: 'Store', short: 'Store', icon: 'spark' },
  { id: 'redeemed', label: 'Redeemed', short: 'Receipts', icon: 'receipt' },
]

export default function Header({
  balance,
  wish,
  season,
  tab,
  onTab,
  redeemedCount,
  members,
  activeId,
  earned,
  code,
  onSwitch,
  onLogoTap,
  status,
  pending,
}) {
  const shown = useCountUp(balance)
  const [pop, setPop] = useState(null)
  const previous = useRef(balance)

  // Float the change off the bank chip so a check-off is visible from any tab.
  useEffect(() => {
    const delta = balance - previous.current
    previous.current = balance
    if (delta === 0) return

    const id = `${Date.now()}-${delta}`
    setPop({ id, delta })
    const timer = setTimeout(
      () => setPop((current) => (current?.id === id ? null : current)),
      900
    )
    return () => clearTimeout(timer)
  }, [balance])

  return (
    <header className="menubar">
      <div className="brand">
        {/* Also the way into developer mode: seven taps inside three seconds. */}
        <button
          type="button"
          className="brand__logo"
          onClick={onLogoTap}
          aria-label="Touch Grass Battlepass"
        >
          <Icon name="leaf" size={20} />
        </button>
        <div className="brand__id">
          <h1 className="brand__name">Touch Grass Battlepass</h1>
          <p className="brand__season label">
            {seasonName(season?.n ?? 1)} · {SEASON.subtitle}
          </p>
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
              <span className="tab__badge" key={redeemedCount}>
                {redeemedCount}
              </span>
            )}
          </button>
        ))}
      </nav>

      <div className="menubar__right">
        <ProfileSwitcher
          members={members}
          activeId={activeId}
          earned={earned}
          code={code}
          onSwitch={onSwitch}
        />
        <ThemePicker />
        <div className="bank">
          <span className="bank__label label">
            {/* The chip says what the bank is for when there is something to
                save for. Just the name: "Saving for " would eat the whole box
                and truncate away the only part worth reading. The rail below
                and the tooltip carry the rest. */}
            <span className="bank__for" title={wish ? `Saving for ${wish.title}` : undefined}>
              {wish ? wish.title : 'Shared bank'}
            </span>
            <SyncDot status={status} pending={pending} />
          </span>
          <span className="bank__value">
            <Icon name="coin" size={16} />
            {shown.toLocaleString()}
          </span>
          {pop && (
            <span
              key={pop.id}
              className={`bank__pop ${pop.delta < 0 ? 'bank__pop--down' : ''}`}
              aria-hidden="true"
            >
              {pop.delta > 0 ? '+' : ''}
              {pop.delta.toLocaleString()}
            </span>
          )}

          {/* Progress rides the bottom edge of the chip, out of the layout
              entirely, so pinning something never moves the bar around it. */}
          {wish && (
            <span
              className={`bank__rail ${wish.ready ? 'bank__rail--ready' : ''}`}
              role="progressbar"
              aria-valuenow={wish.progress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={
                wish.ready
                  ? `${wish.title} is affordable`
                  : `Saving for ${wish.title}, ${wish.progress}% of the way`
              }
            >
              <span style={{ width: `${wish.progress}%` }} />
            </span>
          )}
        </div>
      </div>
    </header>
  )
}
