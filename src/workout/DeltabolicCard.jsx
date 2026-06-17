// Links to a Deltabolic YouTube Short for the exercise.
// Shows a clickable thumbnail when a video ID is known; falls back to channel search.

const VIDEOS = {
  'dumbbell bench press':  'tdYLpdsY3Lw',
  'incline dumbbell press':'tdYLpdsY3Lw',
  'flat dumbbell press':   'tdYLpdsY3Lw',
  'front squat':           '_qv0m3tPd3s',
  'dip':                   'eicOUO9WaJc',
  'chest dip':             'eicOUO9WaJc',
  'shoulder press':        'GQdCsU91uws',
  'overhead press':        'GQdCsU91uws',
  'bicep curl':            'E-Ru1nwKiQ4',
  'biceps curl':           'E-Ru1nwKiQ4',
  'dumbbell curl':         'E-Ru1nwKiQ4',
  'cable row':             '7iXk2Eylbv4',
  'seated cable row':      '7iXk2Eylbv4',
  'face pull':             '7iXk2Eylbv4',
  'hack squat':            'cFGgMO-ENiQ',
  'dumbbell leg':          '-uLayMl4lfo',
}

function findVideoId(name) {
  const lower = (name || '').toLowerCase()
  for (const [keyword, id] of Object.entries(VIDEOS)) {
    if (lower.includes(keyword)) return id
  }
  return null
}

export default function DeltabolicCard({ exerciseName }) {
  const videoId   = findVideoId(exerciseName)
  const videoUrl  = videoId
    ? `https://www.youtube.com/shorts/${videoId}`
    : `https://www.youtube.com/@DeltaBolic/search?query=${encodeURIComponent(exerciseName)}`
  const thumbUrl  = videoId
    ? `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`
    : null

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <span style={s.label}>Deltabolic</span>
        <span style={s.sub}>{videoId ? 'exact match' : 'channel search'}</span>
      </div>

      <a href={videoUrl} target="_blank" rel="noopener noreferrer" style={s.link}>
        {thumbUrl ? (
          <div style={s.thumbWrap}>
            <img src={thumbUrl} alt={exerciseName} style={s.thumb} />
            <div style={s.play}>▶</div>
          </div>
        ) : (
          <div style={s.searchBtn}>
            🔍 &nbsp;Search "{exerciseName}" on Deltabolic
          </div>
        )}
      </a>
    </div>
  )
}

const s = {
  wrap: {
    background: '#0d0d0d',
    borderRadius: 'var(--r-lg)',
    padding: '14px 14px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  header: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '8px',
  },
  label: {
    fontSize: '10px',
    fontWeight: '700',
    color: 'var(--accent)',
    textTransform: 'uppercase',
    letterSpacing: '0.12em',
  },
  sub: {
    fontSize: '10px',
    color: '#555',
    fontWeight: '500',
  },
  link: {
    display: 'block',
    textDecoration: 'none',
    borderRadius: '8px',
    overflow: 'hidden',
  },
  thumbWrap: {
    position: 'relative',
    width: '100%',
    aspectRatio: '16/9',
    borderRadius: '8px',
    overflow: 'hidden',
    background: '#111',
  },
  thumb: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
  },
  play: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(0,0,0,0.45)',
    color: '#fff',
    fontSize: '28px',
    letterSpacing: 0,
  },
  searchBtn: {
    padding: '12px 14px',
    background: '#1a1a1a',
    borderRadius: '8px',
    color: 'var(--accent)',
    fontSize: '13px',
    fontWeight: '500',
    textAlign: 'center',
  },
}
