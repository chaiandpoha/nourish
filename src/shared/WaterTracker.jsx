import { useState, useEffect } from 'react'
import { useAuth } from '../auth/useAuth.jsx'
import { getWaterLog, logWater } from '../db/db.js'
import { localDate } from '../log/DayLog.jsx'

const GOAL_KEY     = 'nourish_water_goal'
const DEFAULT_GOAL = 2500
const INCREMENT    = 250

export default function WaterTracker() {
  const { user } = useAuth()
  const [amount,    setAmount]    = useState(0)
  const [goal,      setGoal]      = useState(() => parseInt(localStorage.getItem(GOAL_KEY) || DEFAULT_GOAL, 10))
  const [editing,   setEditing]   = useState(false)
  const [goalInput, setGoalInput] = useState('')
  const today = localDate()

  useEffect(() => {
    if (!user) return
    getWaterLog(user.id, today).then(entry => {
      if (entry) setAmount(entry.amountMl)
    })
  }, [user?.id, today])

  async function handleAdd() {
    if (!user) return
    const next = amount + INCREMENT
    setAmount(next)
    await logWater(user.id, today, next)
  }

  async function handleRemove() {
    if (!user || amount === 0) return
    const next = Math.max(0, amount - INCREMENT)
    setAmount(next)
    await logWater(user.id, today, next)
  }

  function saveGoal() {
    const parsed = parseInt(goalInput, 10)
    if (!isNaN(parsed) && parsed >= 250) {
      localStorage.setItem(GOAL_KEY, String(parsed))
      setGoal(parsed)
    }
    setEditing(false)
  }

  const pct   = Math.min(1, amount / goal)
  const done  = amount >= goal
  const litre = (amount / 1000).toFixed(1)

  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <span style={styles.icon}>💧</span>
        <span style={styles.title}>Water</span>
        <button
          style={styles.goalBtn}
          onClick={() => { setGoalInput(String(goal)); setEditing(e => !e) }}
        >
          Goal: {(goal / 1000).toFixed(1)}L
        </button>
      </div>

      {editing && (
        <div style={styles.goalRow}>
          <input
            style={styles.goalInput}
            type="number"
            value={goalInput}
            onChange={e => setGoalInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') saveGoal() }}
            placeholder="ml"
            autoFocus
          />
          <button style={styles.saveBtn} onClick={saveGoal}>Save</button>
          <button style={styles.cancelBtn} onClick={() => setEditing(false)}>✕</button>
        </div>
      )}

      <div style={styles.progressTrack}>
        <div style={{
          ...styles.progressFill,
          width:      `${pct * 100}%`,
          background: done ? 'var(--accent)' : 'var(--accent)',
          opacity:    done ? 1 : 0.7,
        }} />
      </div>

      <div style={styles.controls}>
        <button style={styles.minusBtn} onClick={handleRemove} disabled={amount === 0}>−</button>
        <div style={styles.amountBlock}>
          <span style={{ ...styles.amountNum, color: done ? 'var(--accent)' : 'var(--text-primary)' }}>
            {litre}L
          </span>
          <span style={styles.amountSub}>of {(goal / 1000).toFixed(1)}L</span>
        </div>
        <button style={styles.addBtn} onClick={handleAdd}>+250ml</button>
      </div>
    </div>
  )
}

const styles = {
  card: {
    background:    'var(--bg-surface)',
    border:        '0.5px solid var(--border-subtle)',
    borderRadius:  'var(--r-xl)',
    padding:       '14px 16px',
    display:       'flex',
    flexDirection: 'column',
    gap:           '10px',
  },
  header: {
    display:    'flex',
    alignItems: 'center',
    gap:        '6px',
  },
  icon: {
    fontSize:   '16px',
    flexShrink: 0,
  },
  title: {
    fontSize:      '14px',
    fontWeight:    '600',
    color:         'var(--text-primary)',
    letterSpacing: '-0.01em',
    flex:          1,
  },
  goalBtn: {
    background:   'none',
    border:       'none',
    color:        'var(--text-tertiary)',
    fontSize:     '12px',
    fontWeight:   '500',
    cursor:       'pointer',
    padding:      0,
    flexShrink:   0,
  },
  goalRow: {
    display:    'flex',
    alignItems: 'center',
    gap:        '8px',
  },
  goalInput: {
    flex:          1,
    padding:       '6px 10px',
    fontSize:      '13px',
    borderRadius:  'var(--r-md)',
    border:        '1px solid var(--border-subtle)',
    background:    'var(--bg-elevated)',
    color:         'var(--text-primary)',
    outline:       'none',
  },
  saveBtn: {
    padding:       '6px 12px',
    background:    'var(--accent)',
    border:        'none',
    borderRadius:  'var(--r-md)',
    color:         '#fff',
    fontSize:      '12px',
    fontWeight:    '600',
    cursor:        'pointer',
  },
  cancelBtn: {
    padding:       '6px 8px',
    background:    'none',
    border:        'none',
    color:         'var(--text-tertiary)',
    fontSize:      '13px',
    cursor:        'pointer',
  },
  progressTrack: {
    height:        '4px',
    borderRadius:  '2px',
    background:    'var(--bg-elevated)',
    overflow:      'hidden',
  },
  progressFill: {
    height:        '100%',
    borderRadius:  '2px',
    transition:    'width 0.4s ease',
  },
  controls: {
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'space-between',
  },
  minusBtn: {
    width:         '36px',
    height:        '36px',
    borderRadius:  '50%',
    background:    'var(--bg-elevated)',
    border:        'none',
    fontSize:      '20px',
    lineHeight:    1,
    color:         'var(--text-secondary)',
    cursor:        'pointer',
    display:       'flex',
    alignItems:    'center',
    justifyContent:'center',
    flexShrink:    0,
    opacity:       1,
  },
  amountBlock: {
    display:        'flex',
    flexDirection:  'column',
    alignItems:     'center',
    gap:            '1px',
  },
  amountNum: {
    fontSize:      '22px',
    fontWeight:    '700',
    fontFamily:    'var(--font-mono)',
    letterSpacing: '-0.03em',
    lineHeight:    1,
  },
  amountSub: {
    fontSize:      '11px',
    color:         'var(--text-tertiary)',
    fontWeight:    '500',
  },
  addBtn: {
    padding:       '8px 14px',
    background:    'var(--accent-dim)',
    border:        'none',
    borderRadius:  'var(--r-md)',
    color:         'var(--accent)',
    fontSize:      '13px',
    fontWeight:    '600',
    cursor:        'pointer',
    flexShrink:    0,
  },
}
