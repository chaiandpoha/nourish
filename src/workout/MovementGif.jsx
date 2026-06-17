// Inline SVG stick-figure animations — one per movement type.
// Uses SMIL animate elements: no JS timers, no CSS injection, loops forever.

const D  = '1.8s'
const KS = '0.42 0 0.58 1;0.42 0 0.58 1'
const KT = '0;0.5;1'

function an(attr, a, b) {
  return (
    <animate
      attributeName={attr}
      values={`${a};${b};${a}`}
      dur={D}
      repeatCount="indefinite"
      calcMode="spline"
      keySplines={KS}
      keyTimes={KT}
    />
  )
}

// Animated line. Lowercase = pose A (initial), Uppercase = pose B. Omit uppercase to keep static.
function L({ x1, y1, x2, y2, X1, Y1, X2, Y2, w = 2.5 }) {
  return (
    <line x1={x1} y1={y1} x2={x2} y2={y2} strokeWidth={w} strokeLinecap="round">
      {X1 != null && an('x1', x1, X1)}
      {Y1 != null && an('y1', y1, Y1)}
      {X2 != null && an('x2', x2, X2)}
      {Y2 != null && an('y2', y2, Y2)}
    </line>
  )
}

// Animated circle (head)
function Hd({ cx = 40, cy, CX, CY, r = 7 }) {
  return (
    <circle cx={cx} cy={cy} r={r}>
      {CX != null && an('cx', cx, CX)}
      {CY != null && an('cy', cy, CY)}
    </circle>
  )
}

// ── Movement animations ────────────────────────────────────────────────────────

// SQUAT — body descends, knees track wide, arms extend forward for balance
function Squat() {
  return <>
    <Hd cy={10} CY={30} />
    {/* torso */}
    <L x1={40} y1={18} x2={40} y2={50} Y1={38} Y2={62} />
    {/* left upper arm → extends forward */}
    <L x1={40} y1={26} x2={28} y2={38} Y1={44} X2={20} Y2={50} />
    {/* left forearm */}
    <L x1={28} y1={38} x2={22} y2={50} X1={20} Y1={50} X2={10} Y2={54} />
    {/* right upper arm */}
    <L x1={40} y1={26} x2={52} y2={38} Y1={44} X2={60} Y2={50} />
    {/* right forearm */}
    <L x1={52} y1={38} x2={58} y2={50} X1={60} Y1={50} X2={70} Y2={54} />
    {/* left thigh — knee tracks wide */}
    <L x1={38} y1={50} x2={32} y2={70} Y1={62} X2={16} Y2={72} />
    {/* left shin */}
    <L x1={32} y1={70} x2={28} y2={88} X1={16} Y1={72} X2={22} />
    {/* right thigh */}
    <L x1={42} y1={50} x2={48} y2={70} Y1={62} X2={64} Y2={72} />
    {/* right shin */}
    <L x1={48} y1={70} x2={52} y2={88} X1={64} Y1={72} X2={58} />
  </>
}

// HINGE — torso tips forward from hips, arms hang near shins
function Hinge() {
  return <>
    <Hd cy={10} CX={22} CY={36} />
    {/* torso: neck slides forward, hip stays */}
    <L x1={40} y1={18} x2={40} y2={52} X1={26} Y1={44} />
    {/* left upper arm */}
    <L x1={40} y1={26} x2={28} y2={38} X1={28} Y1={48} X2={26} Y2={64} />
    {/* left forearm */}
    <L x1={28} y1={38} x2={22} y2={50} X1={26} Y1={64} X2={24} Y2={78} />
    {/* right upper arm */}
    <L x1={40} y1={26} x2={52} y2={38} X1={34} Y1={48} X2={36} Y2={64} />
    {/* right forearm */}
    <L x1={52} y1={38} x2={58} y2={50} X1={36} Y1={64} X2={38} Y2={78} />
    {/* legs mostly static with tiny bend */}
    <L x1={38} y1={52} x2={34} y2={72} />
    <L x1={34} y1={72} x2={30} y2={90} />
    <L x1={42} y1={52} x2={46} y2={72} />
    <L x1={46} y1={72} x2={50} y2={90} />
  </>
}

// PUSH — arms drive from chest height diagonally outward/upward (press pattern)
function Push() {
  return <>
    <Hd cy={10} />
    <L x1={40} y1={18} x2={40} y2={50} />
    {/* left upper arm: extends outward-up */}
    <L x1={40} y1={26} x2={28} y2={30} X2={20} Y2={20} />
    {/* left forearm */}
    <L x1={28} y1={30} x2={24} y2={18} X1={20} Y1={20} X2={10} Y2={10} />
    {/* right upper arm */}
    <L x1={40} y1={26} x2={52} y2={30} X2={60} Y2={20} />
    {/* right forearm */}
    <L x1={52} y1={30} x2={56} y2={18} X1={60} Y1={20} X2={70} Y2={10} />
    {/* legs static */}
    <L x1={38} y1={50} x2={34} y2={70} />
    <L x1={34} y1={70} x2={30} y2={88} />
    <L x1={42} y1={50} x2={46} y2={70} />
    <L x1={46} y1={70} x2={50} y2={88} />
  </>
}

// PULL — arms draw from overhead extension down to elbows-tucked (lat pulldown / row)
function Pull() {
  return <>
    <Hd cy={10} />
    <L x1={40} y1={18} x2={40} y2={50} />
    {/* left upper arm: from up-out to elbow pulled down */}
    <L x1={40} y1={26} x2={26} y2={16} Y2={34} />
    {/* left forearm */}
    <L x1={26} y1={16} x2={20} y2={6} X1={26} Y1={34} X2={22} Y2={48} />
    {/* right upper arm */}
    <L x1={40} y1={26} x2={54} y2={16} Y2={34} />
    {/* right forearm */}
    <L x1={54} y1={16} x2={60} y2={6} X1={54} Y1={34} X2={58} Y2={48} />
    {/* legs static */}
    <L x1={38} y1={50} x2={34} y2={70} />
    <L x1={34} y1={70} x2={30} y2={88} />
    <L x1={42} y1={50} x2={46} y2={70} />
    <L x1={46} y1={70} x2={50} y2={88} />
  </>
}

// CORE — lateral trunk flexion shows oblique/core engagement
function Core() {
  return <>
    <Hd cy={10} CX={33} CY={14} />
    {/* torso bends left */}
    <L x1={40} y1={18} x2={40} y2={50} X1={35} Y1={22} X2={38} Y2={52} />
    {/* left arm falls with body */}
    <L x1={40} y1={26} x2={28} y2={38} X1={35} Y1={26} X2={18} Y2={40} />
    <L x1={28} y1={38} x2={22} y2={52} X1={18} Y1={40} X2={10} Y2={56} />
    {/* right arm rises slightly (passive) */}
    <L x1={40} y1={26} x2={52} y2={38} X1={35} Y1={26} X2={50} Y2={33} />
    <L x1={52} y1={38} x2={58} y2={52} X1={50} Y1={33} X2={58} Y2={43} />
    {/* legs static */}
    <L x1={38} y1={50} x2={34} y2={70} />
    <L x1={34} y1={70} x2={30} y2={88} />
    <L x1={42} y1={50} x2={46} y2={70} />
    <L x1={46} y1={70} x2={50} y2={88} />
  </>
}

// CARDIO — high-knee running: one knee drives up, arms counter-swing
function Cardio() {
  return <>
    {/* slight body bounce */}
    <Hd cy={10} CY={8} />
    <L x1={40} y1={18} x2={40} y2={50} Y1={16} Y2={48} />
    {/* left arm swings back in A, forward in B */}
    <L x1={40} y1={26} x2={52} y2={36} X2={28} Y2={36} />
    <L x1={52} y1={36} x2={58} y2={28} X1={28} Y1={36} X2={22} Y2={28} />
    {/* right arm — mirror */}
    <L x1={40} y1={26} x2={28} y2={36} X2={52} Y2={36} />
    <L x1={28} y1={36} x2={22} y2={28} X1={52} Y1={36} X2={58} Y2={28} />
    {/* left leg: knee drives up in B */}
    <L x1={38} y1={50} x2={32} y2={70} Y1={48} X2={32} Y2={36} />
    <L x1={32} y1={70} x2={28} y2={88} X1={32} Y1={36} X2={36} Y2={24} />
    {/* right leg stays down in B */}
    <L x1={42} y1={50} x2={48} y2={70} Y1={48} />
    <L x1={48} y1={70} x2={50} y2={88} />
  </>
}

// CARRY — walking stride, arms hang long (farmer's carry weight)
function Carry() {
  return <>
    <Hd cy={10} CY={9} />
    <L x1={40} y1={18} x2={40} y2={50} />
    {/* arms hang long with slight sway */}
    <L x1={40} y1={26} x2={28} y2={40} X2={30} Y2={42} />
    <L x1={28} y1={40} x2={24} y2={60} X1={30} Y1={42} X2={26} Y2={62} />
    <L x1={40} y1={26} x2={52} y2={40} X2={50} Y2={42} />
    <L x1={52} y1={40} x2={56} y2={60} X1={50} Y1={42} X2={54} Y2={62} />
    {/* weight blobs at hands */}
    <L x1={22} y1={60} x2={22} y2={66} X1={24} Y1={62} X2={24} Y2={68} w={4} />
    <L x1={58} y1={60} x2={58} y2={66} X1={56} Y1={62} X2={56} Y2={68} w={4} />
    {/* alternating stride */}
    <L x1={38} y1={50} x2={30} y2={68} X2={36} Y2={70} />
    <L x1={30} y1={68} x2={26} y2={86} X1={36} Y1={70} X2={34} Y2={88} />
    <L x1={42} y1={50} x2={50} y2={68} X2={44} Y2={70} />
    <L x1={50} y1={68} x2={54} y2={86} X1={44} Y1={70} X2={46} Y2={88} />
  </>
}

// ── Map & labels ───────────────────────────────────────────────────────────────

const ANIMS = { squat: Squat, hinge: Hinge, push: Push, pull: Pull, core: Core, cardio: Cardio, carry: Carry }
const LABELS = {
  squat:  'Squat pattern',
  hinge:  'Hip hinge',
  push:   'Press pattern',
  pull:   'Pull pattern',
  core:   'Core bracing',
  cardio: 'Cardio',
  carry:  'Loaded carry',
}

// ── Main export ────────────────────────────────────────────────────────────────

export default function MovementGif({ movement }) {
  const Anim = ANIMS[movement?.toLowerCase()]
  if (!Anim) return null

  return (
    <div style={s.wrap}>
      <svg
        viewBox="0 0 80 100"
        width="80"
        height="80"
        style={{ color: 'var(--accent)', overflow: 'visible', stroke: 'var(--accent)', fill: 'var(--accent)' }}
      >
        <Anim />
      </svg>
      <div style={s.label}>{LABELS[movement?.toLowerCase()] || movement}</div>
    </div>
  )
}

const s = {
  wrap:  { display:'flex', flexDirection:'column', alignItems:'center', gap:'6px', padding:'14px 16px', background:'var(--bg-elevated)', borderRadius:'var(--r-lg)' },
  label: { fontSize:'10px', fontWeight:'700', color:'var(--text-tertiary)', textTransform:'uppercase', letterSpacing:'0.08em' },
}
