import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { HomeIcon, FoodIcon, WorkoutIcon, CalendarIcon, SettingsIcon } from './Icons.jsx'

const TABS = [
  { path: '/',         label: 'Home',     Icon: HomeIcon     },
  { path: '/food',     label: 'Food',     Icon: FoodIcon     },
  { path: '/workout',  label: 'Workout',  Icon: WorkoutIcon  },
  { path: '/calendar', label: 'Calendar', Icon: CalendarIcon },
  { path: '/settings', label: 'Settings', Icon: SettingsIcon },
]

export default function BottomNav() {
  const location = useLocation()
  const navigate = useNavigate()
  const [colorTheme, setColorTheme] = useState(() => document.documentElement.dataset.color || 'default')

  useEffect(() => {
    function onThemeChange(e) { setColorTheme(e.detail || 'default') }
    window.addEventListener('nourish:color-theme', onThemeChange)
    return () => window.removeEventListener('nourish:color-theme', onThemeChange)
  }, [])

  const isKnicks = colorTheme === 'knicks'

  function isActive(path) {
    if (path === '/') return location.pathname === '/'
    return location.pathname.startsWith(path)
  }

  const navBg        = isKnicks ? '#006BB6' : 'var(--bg-surface)'
  const navShadow    = isKnicks
    ? '0 -1px 0 rgba(0,0,0,0.15), 0 -8px 24px rgba(0,60,120,0.25)'
    : '0 -1px 0 var(--border-subtle), 0 -8px 24px rgba(0,0,0,0.07)'
  const activeColor  = isKnicks ? '#F58426' : 'var(--accent)'
  const activeDim    = isKnicks ? 'rgba(245,132,38,0.18)' : 'var(--accent-dim)'
  const inactiveColor = isKnicks ? 'rgba(255,255,255,0.55)' : 'var(--text-secondary)'

  return (
    <>
      <div style={styles.spacer} />

      <nav style={{ ...styles.nav, background: navBg, boxShadow: navShadow }}>
        {TABS.map(tab => {
          const active = isActive(tab.path)
          return (
            <button
              key={tab.path}
              style={styles.tab}
              onClick={() => navigate(tab.path, active ? { state: { _reset: Date.now() } } : undefined)}
            >
              <div style={{
                ...styles.iconWrap,
                background: active ? activeDim  : 'transparent',
                color:      active ? activeColor : inactiveColor,
              }}>
                <tab.Icon size={20} />
              </div>
              <span style={{
                ...styles.label,
                color:      active ? activeColor : inactiveColor,
                fontWeight: active ? '600' : '500',
              }}>
                {tab.label}
              </span>
            </button>
          )
        })}
      </nav>
    </>
  )
}

const styles = {
  spacer: {
    height:   '80px',
    flexShrink: 0,
  },
  nav: {
    position:             'fixed',
    bottom:               0,
    left:                 0,
    right:                0,
    height:               '80px',
    background:           'var(--bg-surface)',
    boxShadow:            '0 -1px 0 var(--border-subtle), 0 -8px 24px rgba(0,0,0,0.07)',
    backdropFilter:       'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    display:              'flex',
    alignItems:           'center',
    justifyContent:       'space-around',
    paddingBottom:        'env(safe-area-inset-bottom)',
    zIndex:               100,
  },
  tab: {
    display:                'flex',
    flexDirection:          'column',
    alignItems:             'center',
    justifyContent:         'center',
    flex:                   1,
    height:                 '100%',
    background:             'none',
    border:                 'none',
    cursor:                 'pointer',
    padding:                '6px 4px',
    gap:                    '3px',
    WebkitTapHighlightColor: 'transparent',
  },
  iconWrap: {
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
    width:          '48px',
    height:         '28px',
    borderRadius:   '14px',
    transition:     'background 0.2s, color 0.2s',
  },
  label: {
    fontSize:      '10px',
    letterSpacing: '0.2px',
    transition:    'color 0.2s',
  },
}
