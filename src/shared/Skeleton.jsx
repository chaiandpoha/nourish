export function Skeleton({ width = '100%', height = '16px', radius = '8px', style }) {
  return (
    <div style={{
      width,
      height,
      borderRadius: radius,
      background:   'var(--bg-elevated)',
      position:     'relative',
      overflow:     'hidden',
      flexShrink:   0,
      ...style,
    }}>
      <div style={{
        position:   'absolute',
        inset:      0,
        background: 'linear-gradient(90deg, transparent 0%, var(--bg-hover) 50%, transparent 100%)',
        animation:  'shimmer 1.5s ease-in-out infinite',
      }} />
    </div>
  )
}

export function SkeletonCard({ children, style }) {
  return (
    <div style={{
      background:    'var(--bg-surface)',
      border:        '0.5px solid var(--border-subtle)',
      borderRadius:  'var(--r-xl)',
      padding:       '16px',
      display:       'flex',
      flexDirection: 'column',
      gap:           '10px',
      ...style,
    }}>
      {children}
    </div>
  )
}

export function SkeletonRow({ items = 3 }) {
  return (
    <div style={{ display: 'flex', gap: '8px' }}>
      {Array.from({ length: items }, (_, i) => (
        <Skeleton key={i} height="12px" style={{ flex: 1 }} radius="6px" />
      ))}
    </div>
  )
}
