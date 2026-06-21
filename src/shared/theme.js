const KEY       = 'nourish_theme'
const COLOR_KEY = 'nourish_color_theme'

export function getThemePref() {
  return localStorage.getItem(KEY) || 'system'
}

export function applyTheme(pref) {
  const root = document.documentElement
  if (pref === 'dark')       root.setAttribute('data-theme', 'dark')
  else if (pref === 'light') root.setAttribute('data-theme', 'light')
  else                       root.removeAttribute('data-theme')
}

export function setThemePref(pref) {
  localStorage.setItem(KEY, pref)
  applyTheme(pref)
}

export function initTheme() {
  applyTheme(getThemePref())
}

export function getColorTheme() {
  return localStorage.getItem(COLOR_KEY) || 'default'
}

export function applyColorTheme(theme) {
  const root = document.documentElement
  if (theme && theme !== 'default') {
    root.setAttribute('data-color', theme)
  } else {
    root.removeAttribute('data-color')
  }
}

export function setColorTheme(theme) {
  localStorage.setItem(COLOR_KEY, theme)
  applyColorTheme(theme)
  window.dispatchEvent(new CustomEvent('nourish:color-theme', { detail: theme }))
}

export function initColorTheme() {
  applyColorTheme(getColorTheme())
}
