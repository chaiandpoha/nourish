import { useLocation, useNavigate } from 'react-router-dom'

const TABS = [
  { path: '/',         label: 'Home',     icon: '🏠' },
  { path: '/food',     label: 'Food',     icon: '🥗' },
  { path: '/workout',  label: 'Workout',  icon: '💪' },
  { path: '/calendar', label: 'Calendar', icon: '📅' },
  { path: '/settings', label: 'Settings', icon: '⚙️' },
]

export default function BottomNav() {
  const location = useLocation()
  const navigate = useNavigate()

  function isActive(path) {
    if (path === '/') return location.pathname === '/'
    return location.pathname.startsWith(path)
  }

  return (
    <>
      {/* Spacer so content doesn't hide behind nav */}
      <div style={styles.spacer} />

      <nav style={styles.nav}>
        {TABS.map(tab => (
          <button
            key={tab.path}
            style={{
              ...styles.tab,
              ...(isActive(tab.path) ? styles.tabActive : {})
            }}
            onClick={() => navigate(tab.path)}
          >
            <span style={styles.icon}>{tab.icon}</span>
            <span style={{
              ...styles.label,
              ...(isActive(tab.path) ? styles.labelActive : {})
            }}>
              {tab.label}
            </span>
            {isActive(tab.path) && <div style={styles.activeDot} />}
          </button>
        ))}
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
    position:        'fixed',
    bottom:          0,
    left:            0,
    right:           0,
    height:          '80px',
background: 'var(--bg-surface)',
borderTop:  '1px solid var(--border-subtle)',
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'space-around',
    paddingBottom:   'env(safe-area-inset-bottom)',
    zIndex:          100,
    backdropFilter:  'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
  },
  tab: {
    display:         'flex',
    flexDirection:   'column',
    alignItems:      'center',
    justifyContent:  'center',
    flex:            1,
    height:          '100%',
    background:      'none',
    border:          'none',
    cursor:          'pointer',
    padding:         '8px 4px',
    gap:             '3px',
    position:        'relative',
    WebkitTapHighlightColor: 'transparent',
  },
  tabActive: {
    // no background change — indicated by dot + label color
  },
  icon: {
    fontSize:        '22px',
    lineHeight:      '1',
  },
  label: {
    fontSize:        '10px',
    color: 'var(--text-tertiary)',
    fontWeight:      '500',
    letterSpacing:   '0.2px',
  },
  labelActive: {
    color:           '#4ecdc4',
  },
  activeDot: {
    position:        'absolute',
    top:             '6px',
    width:           '4px',
    height:          '4px',
    borderRadius:    '50%',
    background:      '#4ecdc4',
  },
}