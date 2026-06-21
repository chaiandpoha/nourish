import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { HomeIcon, FoodIcon, WorkoutIcon, CalendarIcon, SettingsIcon } from './Icons.jsx'

const TABS = [
  { path: '/',         label: 'Home',     Icon: HomeIcon,     color: '#4a7c6a', dim: 'rgba(74,124,106,0.13)'   },
  { path: '/food',     label: 'Food',     Icon: FoodIcon,     color: '#f59e0b', dim: 'rgba(245,158,11,0.13)'   },
  { path: '/workout',  label: 'Workout',  Icon: WorkoutIcon,  color: '#f97316', dim: 'rgba(249,115,22,0.13)'   },
  { path: '/calendar', label: 'Calendar', Icon: CalendarIcon, color: '#6366f1', dim: 'rgba(99,102,241,0.13)'   },
  { path: '/settings', label: 'Settings', Icon: SettingsIcon, color: '#64748b', dim: 'rgba(100,116,139,0.11)'  },
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

  const navBg       = isKnicks ? '#006BB6' : 'var(--bg-surface)'
  const navShadow   = isKnicks
    ? '0 -1px 0 rgba(0,0,0,0.15), 0 -8px 24px rgba(0,60,120,0.25)'
    : '0 -1px 0 var(--border-subtle), 0 -8px 24px rgba(0,0,0,0.07)'
  const inactiveColor = isKnicks ? 'rgba(255,255,255,0.55)' : 'var(--text-secondary)'

  function activeColor(tab) { return isKnicks ? '#F58426' : tab.color }
  function activeDim(tab)   { return isKnicks ? 'rgba(245,132,38,0.18)' : tab.dim }

  return (
    <>
      <div style={styles.spacer} />

      <nav style={{ ...styles.nav, background: navBg, boxShadow: navShadow }}>
        {TABS.map(tab => {
          const active = isActive(tab.path)
          const aColor = activeColor(tab)
          const aDim   = activeDim(tab)
          return (
            <button
              key={tab.path}
              style={styles.tab}
              onClick={() => navigate(tab.path, active ? { state: { _reset: Date.now() } } : undefined)}
            >
              <div style={{
                ...styles.iconWrap,
                background:  active ? aDim   : 'transparent',
                color:       active ? aColor : inactiveColor,
              }}>
                <tab.Icon size={20} />
              </div>
              <span style={{
                ...styles.label,
                color:      active ? aColor : inactiveColor,
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
