// Muscle anatomy diagram — dark card with glowing highlighted target muscle groups.
// Body silhouette: front view, rounded shapes. Highlighted muscles pulse in accent colour.

const DUR = '1.8s'
const KS  = '0.4 0 0.6 1;0.4 0 0.6 1'
const KT  = '0;0.5;1'

// Glowing highlighted muscle group with opacity pulse
function Hi({ secondary = false, children }) {
  const hi = secondary ? 0.5 : 0.92
  const lo = secondary ? 0.18 : 0.38
  return (
    <g
      fill="var(--accent)"
      opacity={hi}
      style={{ filter: 'drop-shadow(0 0 4px var(--accent))' }}
    >
      <animate
        attributeName="opacity"
        values={`${hi};${lo};${hi}`}
        dur={DUR} repeatCount="indefinite"
        calcMode="spline" keySplines={KS} keyTimes={KT}
      />
      {children}
    </g>
  )
}

// Neutral body silhouette — front view, all parts in dark gray
function Body() {
  return (
    <g fill="#2a2a2a">
      <ellipse cx="40" cy="12" rx="9" ry="10" />
      <rect x="36" y="21" width="8" height="6" rx="2" />
      <ellipse cx="21" cy="31" rx="10" ry="7" />
      <ellipse cx="59" cy="31" rx="10" ry="7" />
      <path d="M25,27 Q40,34 55,27 L53,51 Q40,55 27,51 Z" />
      <rect x="27" y="51" width="26" height="16" rx="3" />
      <path d="M23,66 Q40,73 57,66 L56,80 Q40,84 24,80 Z" />
      <rect x="10" y="26" width="12" height="27" rx="5" />
      <rect x="58" y="26" width="12" height="27" rx="5" />
      <rect x="8"  y="52" width="10" height="20" rx="4" />
      <rect x="62" y="52" width="10" height="20" rx="4" />
      <rect x="23" y="78" width="15" height="26" rx="5" />
      <rect x="42" y="78" width="15" height="26" rx="5" />
      <rect x="24" y="102" width="13" height="19" rx="4" />
      <rect x="43" y="102" width="13" height="19" rx="4" />
    </g>
  )
}

function Squat() {
  return <>
    <Body />
    <Hi>
      <rect x="23" y="78" width="15" height="26" rx="5" />
      <rect x="42" y="78" width="15" height="26" rx="5" />
    </Hi>
    <Hi secondary>
      <path d="M23,66 Q40,73 57,66 L56,80 Q40,84 24,80 Z" />
    </Hi>
  </>
}

function Hinge() {
  return <>
    <Body />
    <Hi>
      <path d="M23,66 Q40,73 57,66 L56,80 Q40,84 24,80 Z" />
    </Hi>
    <Hi secondary>
      <rect x="23" y="90" width="15" height="14" rx="4" />
      <rect x="42" y="90" width="15" height="14" rx="4" />
    </Hi>
  </>
}

function Push() {
  return <>
    <Body />
    <Hi>
      <path d="M25,27 Q40,34 55,27 L53,51 Q40,55 27,51 Z" />
    </Hi>
    <Hi secondary>
      <ellipse cx="21" cy="31" rx="10" ry="7" />
      <ellipse cx="59" cy="31" rx="10" ry="7" />
    </Hi>
  </>
}

function Pull() {
  return <>
    <Body />
    <Hi>
      <path d="M25,27 L27,51 L23,66 Q20,56 17,42 Q19,30 25,27 Z" />
      <path d="M55,27 L53,51 L57,66 Q60,56 63,42 Q61,30 55,27 Z" />
    </Hi>
    <Hi secondary>
      <rect x="10" y="26" width="12" height="14" rx="5" />
      <rect x="58" y="26" width="12" height="14" rx="5" />
    </Hi>
  </>
}

function Core() {
  return <>
    <Body />
    <Hi>
      <rect x="27" y="51" width="26" height="29" rx="3" />
    </Hi>
  </>
}

function Cardio() {
  return <>
    <Body />
    <Hi secondary>
      <path d="M25,27 Q40,34 55,27 L53,51 Q40,55 27,51 Z" />
      <rect x="27" y="51" width="26" height="16" rx="3" />
      <rect x="23" y="78" width="15" height="26" rx="5" />
      <rect x="42" y="78" width="15" height="26" rx="5" />
      <rect x="24" y="102" width="13" height="19" rx="4" />
      <rect x="43" y="102" width="13" height="19" rx="4" />
    </Hi>
  </>
}

function Carry() {
  return <>
    <Body />
    <Hi>
      <ellipse cx="21" cy="31" rx="10" ry="7" />
      <ellipse cx="59" cy="31" rx="10" ry="7" />
    </Hi>
    <Hi secondary>
      <rect x="8"  y="52" width="10" height="20" rx="4" />
      <rect x="62" y="52" width="10" height="20" rx="4" />
      <rect x="27" y="51" width="26" height="16" rx="3" />
    </Hi>
  </>
}

const ANIMS = { squat: Squat, hinge: Hinge, push: Push, pull: Pull, core: Core, cardio: Cardio, carry: Carry }

const LABELS = {
  squat:  'Quads · Glutes',
  hinge:  'Glutes · Hamstrings',
  push:   'Chest · Shoulders',
  pull:   'Lats · Biceps',
  core:   'Core',
  cardio: 'Full Body',
  carry:  'Traps · Forearms',
}

export default function MovementGif({ movement }) {
  const key  = movement?.toLowerCase()
  const Anim = ANIMS[key]
  if (!Anim) return null

  return (
    <div style={s.wrap}>
      <span style={s.label}>{LABELS[key]}</span>
      <svg viewBox="0 0 80 125" width="90" height="90" style={{ overflow: 'visible' }}>
        <Anim />
      </svg>
    </div>
  )
}

const s = {
  wrap:  {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '10px',
    padding: '16px',
    background: '#0d0d0d',
    borderRadius: 'var(--r-lg)',
  },
  label: {
    fontSize: '10px',
    fontWeight: '700',
    color: 'var(--accent)',
    textTransform: 'uppercase',
    letterSpacing: '0.12em',
  },
}
