// Deltabolic YouTube Short embedded inline for each exercise.
// Falls back to YouTube channel search embed when no specific video is mapped.

// Confirmed Deltabolic video IDs, mapped by exercise ID
const DELTABOLIC = {
  ex001: 'PTzUJkPrrDw',  // Barbell Bench Press
  ex002: 'PTzUJkPrrDw',  // Incline Barbell Press
  ex003: 'tdYLpdsY3Lw',  // Dumbbell Bench Press
  ex005: 'tdYLpdsY3Lw',  // Incline Dumbbell Press
  ex006: 'PTzUJkPrrDw',  // Decline Barbell Press
  ex007: 'tdYLpdsY3Lw',  // Decline Dumbbell Press
  ex008: 'I-Ue34qLxc4',  // Cable Fly
  ex009: 'I-Ue34qLxc4',  // Dumbbell Fly
  ex013: 'c44hwGS-peY',  // Cable Crossover
  ex014: 'eicOUO9WaJc',  // Chest Dips
  ex015: 'c44hwGS-peY',  // Low Cable Fly
  ex016: 'c44hwGS-peY',  // High Cable Fly
  ex022: 'hu3jRvTc_po',  // Romanian Deadlift
  ex025: 'RFgiCDJs8Nk',  // Pull Up
  ex026: 'RFgiCDJs8Nk',  // Chin Up
  ex027: 'RFgiCDJs8Nk',  // Lat Pulldown
  ex028: 'RFgiCDJs8Nk',  // Wide Grip Lat Pulldown
  ex029: 'RFgiCDJs8Nk',  // Close Grip Lat Pulldown
  ex030: 'HRo7m_Dfpxw',  // Seated Cable Row
  ex031: 'HRo7m_Dfpxw',  // Barbell Row
  ex032: 'HRo7m_Dfpxw',  // Dumbbell Row
  ex033: 'HRo7m_Dfpxw',  // T-Bar Row
  ex036: 'HRo7m_Dfpxw',  // Single Arm Cable Row
  ex037: '7iXk2Eylbv4',  // Face Pull
  ex051: '4LBVP2Oe7fg',  // Overhead Press
  ex052: 'GQdCsU91uws',  // Dumbbell Shoulder Press
  ex053: 'GQdCsU91uws',  // Arnold Press
  ex056: 'yuR2ma8f_-k',  // Lateral Raise
  ex057: 'yuR2ma8f_-k',  // Cable Lateral Raise
  ex068: 'E-Ru1nwKiQ4',  // Barbell Curl
  ex069: 'E-Ru1nwKiQ4',  // Dumbbell Curl
  ex070: 'E-Ru1nwKiQ4',  // Cable Curl
  ex071: 'E-Ru1nwKiQ4',  // Hammer Curl
  ex082: 'f59wGKbXZ0w',  // Tricep Pushdown
  ex083: 'f59wGKbXZ0w',  // Rope Pushdown
  ex085: 'f59wGKbXZ0w',  // Overhead Tricep Extension
  ex088: 'eicOUO9WaJc',  // Tricep Dips
  ex089: 'f59wGKbXZ0w',  // Overhead Cable Extension
  ex094: '_qv0m3tPd3s',  // Front Squat
  ex097: 'cFGgMO-ENiQ',  // Hack Squat
  ex099: '-uLayMl4lfo',  // Lunge
  ex100: '-uLayMl4lfo',  // Bulgarian Split Squat
  ex115: '-uLayMl4lfo',  // Walking Lunge
  ex142: 'ByZJuk85YuE',  // Cable Crunch
  ex182: '7iXk2Eylbv4',  // Farmers Walk
}

export default function ExerciseVideo({ exerciseId, exerciseName }) {
  const videoId = DELTABOLIC[exerciseId]

  const src = videoId
    ? `https://www.youtube.com/embed/${videoId}?rel=0&playsinline=1&modestbranding=1`
    : `https://www.youtube.com/embed?listType=search&list=${encodeURIComponent('deltabolic ' + (exerciseName || ''))}&rel=0`

  return (
    <div style={s.wrap}>
      <div style={s.badge}>
        {videoId ? 'Deltabolic' : 'Deltabolic search'}
      </div>
      <div style={s.frame}>
        <iframe
          src={src}
          style={s.iframe}
          allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          title={exerciseName}
          loading="lazy"
        />
      </div>
    </div>
  )
}

const s = {
  wrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  badge: {
    fontSize: '10px',
    fontWeight: '700',
    color: 'var(--accent)',
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
  },
  frame: {
    width: '100%',
    aspectRatio: '9/16',
    maxHeight: '340px',
    borderRadius: '10px',
    overflow: 'hidden',
    background: '#000',
  },
  iframe: {
    width: '100%',
    height: '100%',
    border: 'none',
    display: 'block',
  },
}
