const KEY = 'nourish_theme'

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
