import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { DEFAULT_THEME, THEMES, getTheme } from './themes'

const STORAGE_KEY = 'tgbp.theme'
const ThemeContext = createContext(null)

const readStored = () => {
  try {
    const id = localStorage.getItem(STORAGE_KEY)
    return THEMES.some((t) => t.id === id) ? id : DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}

export function ThemeProvider({ children }) {
  const [themeId, setThemeId] = useState(readStored)
  const theme = useMemo(() => getTheme(themeId), [themeId])

  // Tokens live on :root so plain CSS (no styled-components) can read them.
  useEffect(() => {
    const root = document.documentElement
    for (const [key, value] of Object.entries(theme.tokens)) {
      root.style.setProperty(`--${key}`, value)
    }
    root.style.colorScheme = theme.scheme
    root.dataset.theme = theme.id

    // Installed on a phone, this paints the status bar around the app.
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme.tokens.bar)
  }, [theme])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, themeId)
    } catch {
      /* private mode - theme just won't persist */
    }
  }, [themeId])

  const value = useMemo(
    () => ({ theme, themeId, setThemeId, themes: THEMES }),
    [theme, themeId]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>')
  return ctx
}
