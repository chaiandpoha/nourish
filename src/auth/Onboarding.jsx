import { useState } from 'react'
import { useAuth } from './useAuth.jsx'
import { saveUser } from '../db/db.js'

const TOTAL_STEPS = 3

export default function Onboarding({ onComplete }) {
  const { user } = useAuth()
  const [step, setStep] = useState(1)
  const [data, setData] = useState({
    heightFt:    '',
    heightIn:    '',
    height:      '',
    startWeight: '',
    macroGoals: { calories: 2000, protein: 150, carbs: 200, fat: 65, fibre: 30 },
  })
  const [error,   setError]   = useState('')
  const [loading, setLoading] = useState(false)

  function update(fields) { setData(d => ({ ...d, ...fields })); setError('') }
  function next() { setStep(s => Math.min(s + 1, TOTAL_STEPS)) }
  function back() { setStep(s => Math.max(s - 1, 1)); setError('') }

  async function handleFinish() {
    if (!user) return
    setLoading(true)
    setError('')
    try {
      const updates = {
        height:      parseFloat(data.height) || null,
        startWeight: parseFloat(data.startWeight) || null,
        macroGoals:  data.macroGoals,
        dirty:       1,
        updatedAt:   new Date().toISOString(),
      }
      await saveUser({ ...user, ...updates })
      onComplete()
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const props = { data, update, next, back, error, setError, loading }

  return (
    <div style={s.container}>
      <div style={s.progressBar}>
        <div style={{ ...s.progressFill, width: `${(step / TOTAL_STEPS) * 100}%` }} />
      </div>
      {step === 1 && <StepBodyStats    {...props} userName={user?.name} />}
      {step === 2 && <StepMacroGoals   {...props} />}
      {step === 3 && <StepFinish       {...props} onFinish={handleFinish} userName={user?.name} />}
    </div>
  )
}

function StepBodyStats({ data, update, next, _back, error, _setError, userName }) {
  function validate() {
    // Both fields optional — skip validation, allow continue
    next()
  }
  return (
    <div style={s.step}>
      <div style={s.emoji}>📏</div>
      <h2 style={s.title}>Body Stats{userName ? `, ${userName.split(' ')[0]}` : ''}</h2>
      <p style={s.body}>Used to calibrate your macro recommendations. You can skip these and add them later in Settings.</p>

      <div style={{ display:'flex', gap:'8px', width:'100%' }}>
        <div style={{ flex:1 }}>
          <label style={s.label}>Height (ft)</label>
          <input
            style={s.input}
            type="number"
            inputMode="decimal"
            placeholder="5"
            value={data.heightFt}
            onChange={e => {
              const ft = e.target.value
              update({ heightFt: ft, height: (parseFloat(ft)||0) * 30.48 + (parseFloat(data.heightIn)||0) * 2.54 })
            }}
          />
        </div>
        <div style={{ flex:1 }}>
          <label style={s.label}>Height (in)</label>
          <input
            style={s.input}
            type="number"
            inputMode="decimal"
            placeholder="10"
            value={data.heightIn}
            onChange={e => {
              const inches = e.target.value
              update({ heightIn: inches, height: (parseFloat(data.heightFt)||0) * 30.48 + (parseFloat(inches)||0) * 2.54 })
            }}
          />
        </div>
      </div>

      <label style={s.label}>Starting weight (kg)</label>
      <input
        style={s.input}
        type="number"
        inputMode="decimal"
        placeholder="e.g. 80"
        value={data.startWeight}
        onChange={e => update({ startWeight: e.target.value })}
      />

      {error && <p style={s.error}>{error}</p>}
      <button style={s.primaryBtn} onClick={validate}>Continue</button>
      <button style={s.skipBtn} onClick={next}>Skip for now</button>
    </div>
  )
}

function StepMacroGoals({ data, update, next, back }) {
  const { macroGoals } = data
  function setGoal(key, val) {
    update({ macroGoals: { ...macroGoals, [key]: parseInt(val) || 0 } })
  }
  const fields = [
    { key: 'calories', label: 'Calories', unit: 'kcal', placeholder: '2000' },
    { key: 'protein',  label: 'Protein',  unit: 'g',    placeholder: '150'  },
    { key: 'carbs',    label: 'Carbs',    unit: 'g',    placeholder: '200'  },
    { key: 'fat',      label: 'Fat',      unit: 'g',    placeholder: '65'   },
    { key: 'fibre',    label: 'Fibre',    unit: 'g',    placeholder: '30'   },
  ]
  return (
    <div style={s.step}>
      <div style={s.emoji}>🎯</div>
      <h2 style={s.title}>Daily Goals</h2>
      <p style={s.body}>Set your targets. You can adjust these anytime in Settings.</p>

      <div style={s.macroCard}>
        {fields.map(({ key, label, unit, placeholder }) => (
          <div key={key} style={s.macroRow}>
            <span style={s.macroLabel}>{label}</span>
            <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
              <input
                type="number"
                inputMode="numeric"
                placeholder={placeholder}
                value={macroGoals[key] || ''}
                onChange={e => setGoal(key, e.target.value)}
                style={s.macroInput}
              />
              <span style={s.macroUnit}>{unit}</span>
            </div>
          </div>
        ))}
      </div>

      <button style={s.primaryBtn} onClick={next}>Continue</button>
      <button style={s.ghostBtn} onClick={back}>Back</button>
    </div>
  )
}

function StepFinish({ data, onFinish, back, error, loading, userName }) {
  return (
    <div style={s.step}>
      <div style={s.emoji}>🎉</div>
      <h2 style={s.title}>You're all set{userName ? `, ${userName.split(' ')[0]}` : ''}!</h2>
      <p style={s.body}>Your profile is ready. Start logging food, workouts, and progress.</p>

      <div style={s.summaryCard}>
        <p style={s.summaryRow}>🎯 {data.macroGoals.calories} kcal · {data.macroGoals.protein}g protein</p>
        {data.startWeight && <p style={s.summaryRow}>⚖️ Starting at {data.startWeight} kg</p>}
        <p style={s.summaryRow}>📱 Add to Home Screen for the best experience</p>
      </div>

      {error && <p style={s.error}>{error}</p>}

      <button
        style={{ ...s.primaryBtn, opacity: loading ? 0.6 : 1 }}
        onClick={onFinish}
        disabled={loading}
      >
        {loading ? 'Saving…' : 'Start Nourish'}
      </button>
      <button style={s.ghostBtn} onClick={back}>Back</button>
    </div>
  )
}

const s = {
  container:   { minHeight:'100dvh', background:'var(--bg-base)', color:'var(--text-primary)', display:'flex', flexDirection:'column', alignItems:'center', boxSizing:'border-box' },
  progressBar: { width:'100%', height:'3px', background:'var(--border-subtle)', flexShrink:0 },
  progressFill:{ height:'100%', background:'var(--accent)', transition:'width 0.3s ease' },
  step:        { display:'flex', flexDirection:'column', alignItems:'center', width:'100%', maxWidth:'400px', padding:'32px 24px', boxSizing:'border-box', gap:'6px' },
  emoji:       { fontSize:'52px', marginBottom:'8px' },
  title:       { fontSize:'26px', fontWeight:'700', textAlign:'center', margin:'0 0 8px', letterSpacing:'-0.02em', color:'var(--text-primary)' },
  body:        { fontSize:'15px', color:'var(--text-secondary)', textAlign:'center', lineHeight:'1.5', margin:'0 0 16px' },
  label:       { fontSize:'13px', color:'var(--text-secondary)', alignSelf:'flex-start', marginBottom:'4px', marginTop:'8px' },
  input:       { width:'100%', padding:'13px 14px', background:'var(--bg-surface)', border:'1px solid var(--border-default)', borderRadius:'var(--r-lg)', color:'var(--text-primary)', fontSize:'16px', outline:'none', boxSizing:'border-box' },
  primaryBtn:  { width:'100%', padding:'15px', background:'var(--accent)', border:'none', borderRadius:'var(--r-lg)', color:'var(--text-inverse)', fontSize:'16px', fontWeight:'600', cursor:'pointer', marginTop:'12px' },
  ghostBtn:    { width:'100%', padding:'13px', background:'transparent', border:'1px solid var(--border-default)', borderRadius:'var(--r-lg)', color:'var(--text-secondary)', fontSize:'15px', cursor:'pointer', marginTop:'8px' },
  skipBtn:     { background:'none', border:'none', color:'var(--text-tertiary)', fontSize:'13px', cursor:'pointer', padding:'8px', marginTop:'4px' },
  error:       { color:'var(--red)', fontSize:'14px', textAlign:'center', margin:'4px 0' },
  macroCard:   { width:'100%', background:'var(--bg-surface)', border:'0.5px solid var(--border-subtle)', borderRadius:'var(--r-xl)', padding:'0 16px', overflow:'hidden' },
  macroRow:    { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 0', borderBottom:'0.5px solid var(--border-subtle)' },
  macroLabel:  { fontSize:'14px', fontWeight:'500', color:'var(--text-primary)' },
  macroInput:  { width:'72px', padding:'7px 10px', background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:'var(--r-md)', fontSize:'15px', fontWeight:'600', color:'var(--text-primary)', outline:'none', textAlign:'right', fontFamily:'var(--font-mono)' },
  macroUnit:   { fontSize:'13px', color:'var(--text-tertiary)', width:'32px' },
  summaryCard: { width:'100%', padding:'16px 20px', background:'var(--bg-surface)', border:'0.5px solid var(--border-subtle)', borderRadius:'var(--r-xl)', margin:'8px 0 16px', boxSizing:'border-box' },
  summaryRow:  { margin:'4px 0', fontSize:'14px', color:'var(--text-secondary)' },
}
