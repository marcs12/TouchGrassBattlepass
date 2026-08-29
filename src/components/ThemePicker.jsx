import { useEffect, useRef, useState } from 'react'
import { usePopover } from '../lib/usePopover'
import { useTheme } from '../theme/ThemeProvider'
import Icon from './Icon'

export default function ThemePicker() {
  const { theme, themeId, setThemeId, themes } = useTheme()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)
  const buttonRef = useRef(null)
  const menuRef = useRef(null)
  const menuStyle = usePopover(buttonRef, menuRef, open)

  useEffect(() => {
    if (!open) return

    const onPointer = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      buttonRef.current?.focus()
    }

    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="themer" ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        className="themer__btn"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="palette" size={18} />
        <span className="themer__btn-text">{theme.name}</span>
        <Icon name="chevron" size={14} className={open ? 'themer__caret themer__caret--up' : 'themer__caret'} />
      </button>

      {open && (
        <div ref={menuRef} style={menuStyle} className="themer__menu" role="menu" aria-label="App theme">
          <p className="themer__heading label">App theme</p>
          {themes.map((t) => {
            const active = t.id === themeId
            return (
              <button
                key={t.id}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                className={`themer__opt ${active ? 'themer__opt--on' : ''}`}
                onClick={() => {
                  setThemeId(t.id)
                  setOpen(false)
                  buttonRef.current?.focus()
                }}
              >
                <span className="themer__swatch" aria-hidden="true">
                  {t.swatch.map((c) => (
                    <i key={c} style={{ background: c }} />
                  ))}
                </span>
                <span className="themer__meta">
                  <strong>{t.name}</strong>
                  <small>{t.blurb}</small>
                </span>
                {active && <Icon name="check" size={16} className="themer__check" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
