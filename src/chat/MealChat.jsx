import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../auth/useAuth.jsx'
import { sendChatMessage } from './chatApi.js'
import { getDayMacros, addFoodLogEntry } from '../db/db.js'
import { MACRO_COLORS } from '../config.js'

// ─── Parse AI message — strip ```foods block, return {text, foods} ─────────────
function parseMessage(content) {
  const FOODS_RE = /```foods\s*([\s\S]*?)```/
  const m = content.match(FOODS_RE)
  if (!m) return { text: content, foods: [] }
  const text = content.replace(FOODS_RE, '').trim()
  let foods = []
  try { foods = JSON.parse(m[1].trim()) } catch {}
  return { text, foods: Array.isArray(foods) ? foods : [] }
}

export default function MealChat({ onClose }) {
  const [messages,  setMessages]  = useState([])
  const [input,     setInput]     = useState('')
  const [loading,   setLoading]   = useState(false)
  const [totals,    setTotals]    = useState({})
  const [error,     setError]     = useState('')
  const [logged,    setLogged]    = useState({})   // key: `${msgIdx}-${foodIdx}` → true
  const bottomRef  = useRef(null)
  const inputRef   = useRef(null)
  const { user }   = useAuth()

  const today  = new Date().toISOString().slice(0, 10)
  const goals  = user?.macroGoals || {}

  useEffect(() => {
    loadTotals()
  }, [user])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function loadTotals() {
    if (!user) return
    const t = await getDayMacros(user.id, today)
    setTotals(t)
  }

  async function handleSend() {
    const text = input.trim()
    if (!text || loading) return

    const userMsg = { role: 'user', content: text }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setLoading(true)
    setError('')

    try {
      const reply = await sendChatMessage({
        messages:  newMessages,
        user,
        totals,
        goals,
        meal:      detectMeal(),
        settings:  user?.settings,
        userId:    user?.id,
      })

      setMessages(m => [...m, { role: 'assistant', content: reply }])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  async function handleLogFood(food, key) {
    if (!user || logged[key]) return
    const today = new Date().toISOString().slice(0, 10)
    const h = new Date().getHours()
    const meal = h < 10 ? 'breakfast' : h < 15 ? 'lunch' : h < 19 ? 'dinner' : 'snack'
    await addFoodLogEntry(user.id, {
      foodId:   null,
      batchId:  null,
      name:     food.name,
      grams:    food.grams || 100,
      source:   'manual',
      calories: Math.round(food.cal    || 0),
      protein:  Math.round((food.protein || 0) * 10) / 10,
      carbs:    Math.round((food.carbs   || 0) * 10) / 10,
      fat:      Math.round((food.fat     || 0) * 10) / 10,
      fibre:    Math.round((food.fibre   || 0) * 10) / 10,
      date:     today,
      meal,
    })
    setLogged(prev => ({ ...prev, [key]: true }))
    loadTotals()
  }

  function detectMeal() {
    const h = new Date().getHours()
    if (h < 10) return 'breakfast'
    if (h < 15) return 'lunch'
    if (h < 19) return 'dinner'
    return 'snack'
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const remaining = {
    calories: Math.max(0, (goals.calories || 2000) - (totals.calories || 0)),
    protein:  Math.max(0, (goals.protein  || 150)  - (totals.protein  || 0)),
    carbs:    Math.max(0, (goals.carbs    || 200)   - (totals.carbs    || 0)),
    fat:      Math.max(0, (goals.fat      || 65)    - (totals.fat      || 0)),
    fibre:    Math.max(0, (goals.fibre    || 30)    - (totals.fibre    || 0)),
  }

  const quickPrompts = [
    'What should I eat for dinner?',
    'High protein snack ideas',
    'I need more fibre today',
    'What can I eat under 400 kcal?',
  ]

  return (
    <div style={s.container}>

      {/* Header */}
      <div style={s.header}>
        <button style={s.backBtn} onClick={onClose}>← Back</button>
        <div style={s.headerCenter}>
          <span style={s.headerTitle}>Meal Assistant</span>
          <span style={s.headerSub}>Powered by Claude</span>
        </div>
        <div style={{ width: 60 }} />
      </div>

      {/* Macro summary strip */}
      <div style={s.macroStrip}>
        {[
          { label: 'kcal left', val: Math.round(remaining.calories), color: 'var(--text-primary)' },
          { label: 'Protein',   val: `${Math.round(remaining.protein)}g`,  color: MACRO_COLORS.protein },
          { label: 'Carbs',     val: `${Math.round(remaining.carbs)}g`,    color: MACRO_COLORS.carbs   },
          { label: 'Fat',       val: `${Math.round(remaining.fat)}g`,      color: MACRO_COLORS.fat     },
          { label: 'Fibre',     val: `${Math.round(remaining.fibre)}g`,    color: MACRO_COLORS.fibre   },
        ].map(({ label, val, color }) => (
          <div key={label} style={s.macroCell}>
            <span style={{ ...s.macroVal, color }}>{val}</span>
            <span style={s.macroLabel}>{label}</span>
          </div>
        ))}
      </div>

      {/* Privacy notice */}
      <div style={s.privacyNote}>
        ℹ️ Your macro summary is shared with Anthropic to generate suggestions.
      </div>

      {/* Messages */}
      <div style={s.messages}>
        {messages.length === 0 && (
          <div style={s.emptyState}>
            <div style={s.emptyIcon}>🥗</div>
            <p style={s.emptyTitle}>What would you like to eat?</p>
            <p style={s.emptySub}>I can see your remaining macros and suggest meals to help you hit your goals.</p>

            {/* Quick prompts */}
            <div style={s.quickPrompts}>
              {quickPrompts.map(prompt => (
                <button
                  key={prompt}
                  style={s.quickPrompt}
                  onClick={() => {
                    setInput(prompt)
                    setTimeout(() => handleSend(), 50)
                  }}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => {
          const isUser = msg.role === 'user'
          const { text, foods } = isUser ? { text: msg.content, foods: [] } : parseMessage(msg.content)
          return (
            <div key={i} style={s.messageGroup}>
              <div style={{ ...s.bubble, ...(isUser ? s.bubbleUser : s.bubbleAssistant) }}>
                <div style={{ ...s.bubbleText, ...(isUser ? s.bubbleTextUser : s.bubbleTextAssistant) }}>
                  {text}
                </div>
              </div>
              {foods.length > 0 && (
                <div style={s.foodCards}>
                  {foods.map((food, fi) => {
                    const key = `${i}-${fi}`
                    const done = logged[key]
                    return (
                      <div key={fi} style={s.foodCard}>
                        <div style={s.foodCardLeft}>
                          <div style={s.foodCardName}>{food.name}</div>
                          <div style={s.foodCardMeta}>
                            {food.grams}g · {Math.round(food.cal || 0)} kcal · {food.protein || 0}g P · {food.carbs || 0}g C · {food.fat || 0}g F
                          </div>
                        </div>
                        <button
                          style={{ ...s.logBtn, ...(done ? s.logBtnDone : {}) }}
                          onClick={() => handleLogFood(food, key)}
                          disabled={done}
                        >
                          {done ? '✓' : 'Log'}
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}

        {loading && (
          <div style={{ ...s.bubble, ...s.bubbleAssistant }}>
            <div style={{ ...s.bubbleText, ...s.bubbleTextAssistant }}>
              <span style={s.typing}>●●●</span>
            </div>
          </div>
        )}

        {error && (
          <div style={s.errorBubble}>
            ⚠️ {error}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={s.inputArea}>
        <textarea
          ref={inputRef}
          style={s.input}
          placeholder="Ask about meals, macros, or food ideas…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
        />
        <button
          style={{
            ...s.sendBtn,
            opacity: (!input.trim() || loading) ? 0.4 : 1
          }}
          onClick={handleSend}
          disabled={!input.trim() || loading}
        >
          ↑
        </button>
      </div>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = {
 container: { display:'flex', flexDirection:'column', height:'calc(100dvh - 80px)', background:'var(--bg-base)' },
  header:       { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 16px 12px', borderBottom:'0.5px solid var(--border-subtle)', background:'var(--bg-surface)', flexShrink:0 },
  backBtn:      { background:'none', border:'none', color:'var(--accent)', fontSize:'15px', cursor:'pointer', padding:0, width:60 },
  headerCenter: { display:'flex', flexDirection:'column', alignItems:'center', gap:'2px' },
  headerTitle:  { fontSize:'16px', fontWeight:'600', color:'var(--text-primary)', letterSpacing:'-0.02em' },
  headerSub:    { fontSize:'11px', color:'var(--text-tertiary)' },
  macroStrip:   { display:'grid', gridTemplateColumns:'repeat(5,1fr)', background:'var(--bg-surface)', borderBottom:'0.5px solid var(--border-subtle)', padding:'10px 8px', flexShrink:0 },
  macroCell:    { display:'flex', flexDirection:'column', alignItems:'center', gap:'2px' },
  macroVal:     { fontSize:'14px', fontWeight:'700', fontFamily:'var(--font-mono)', letterSpacing:'-0.02em' },
  macroLabel:   { fontSize:'10px', color:'var(--text-tertiary)', fontWeight:'500', textTransform:'uppercase', letterSpacing:'0.04em' },
  privacyNote:  { padding:'8px 16px', fontSize:'11px', color:'var(--text-tertiary)', background:'var(--bg-elevated)', borderBottom:'0.5px solid var(--border-subtle)', flexShrink:0 },
  messages:     { flex:1, overflowY:'auto', padding:'16px', display:'flex', flexDirection:'column', gap:'12px' },
  emptyState:   { display:'flex', flexDirection:'column', alignItems:'center', gap:'8px', padding:'32px 0' },
  emptyIcon:    { fontSize:'48px', marginBottom:'8px' },
  emptyTitle:   { fontSize:'18px', fontWeight:'600', color:'var(--text-primary)', margin:0, letterSpacing:'-0.02em' },
  emptySub:     { fontSize:'14px', color:'var(--text-secondary)', textAlign:'center', margin:0, lineHeight:'1.5' },
  quickPrompts: { display:'flex', flexDirection:'column', gap:'8px', width:'100%', marginTop:'8px' },
  quickPrompt:  { padding:'12px 16px', background:'var(--bg-surface)', border:'0.5px solid var(--border-subtle)', borderRadius:'var(--r-lg)', color:'var(--text-primary)', fontSize:'14px', fontWeight:'500', cursor:'pointer', textAlign:'left' },
  bubble:       { display:'flex', maxWidth:'85%' },
  bubbleUser:   { alignSelf:'flex-end' },
  bubbleAssistant: { alignSelf:'flex-start' },
  bubbleText:   { padding:'12px 14px', borderRadius:'var(--r-xl)', fontSize:'15px', lineHeight:'1.5', whiteSpace:'pre-wrap' },
  bubbleTextUser:      { background:'var(--text-primary)', color:'var(--text-inverse)', borderBottomRightRadius:'4px' },
  bubbleTextAssistant: { background:'var(--bg-surface)', color:'var(--text-primary)', border:'0.5px solid var(--border-subtle)', borderBottomLeftRadius:'4px' },
  typing:         { letterSpacing:'4px', color:'var(--text-tertiary)' },
  errorBubble:    { padding:'10px 14px', background:'rgba(200,80,64,0.08)', borderRadius:'var(--r-md)', color:'var(--red)', fontSize:'13px' },
  messageGroup:   { display:'flex', flexDirection:'column', gap:'6px' },
  foodCards:      { display:'flex', flexDirection:'column', gap:'6px', marginLeft:'4px' },
  foodCard:       { display:'flex', alignItems:'center', justifyContent:'space-between', gap:'10px', padding:'10px 12px', background:'var(--bg-surface)', border:'0.5px solid var(--border-subtle)', borderRadius:'var(--r-lg)' },
  foodCardLeft:   { display:'flex', flexDirection:'column', gap:'2px', flex:1, minWidth:0 },
  foodCardName:   { fontSize:'13px', fontWeight:'600', color:'var(--text-primary)', letterSpacing:'-0.01em' },
  foodCardMeta:   { fontSize:'11px', color:'var(--text-tertiary)' },
  logBtn:         { padding:'6px 14px', background:'var(--accent)', border:'none', borderRadius:'var(--r-md)', color:'#fff', fontSize:'12px', fontWeight:'600', cursor:'pointer', flexShrink:0 },
  logBtnDone:     { background:'var(--bg-elevated)', color:'var(--accent)', cursor:'default' },
  inputArea:    { display:'flex', alignItems:'flex-end', gap:'8px', padding:'12px 16px calc(12px + env(safe-area-inset-bottom))', background:'var(--bg-surface)', borderTop:'0.5px solid var(--border-subtle)', flexShrink:0 },
  input:        { flex:1, padding:'11px 14px', background:'var(--bg-elevated)', border:'1px solid var(--border-default)', borderRadius:'var(--r-xl)', fontSize:'15px', color:'var(--text-primary)', outline:'none', resize:'none', fontFamily:'var(--font-sans)', lineHeight:'1.4', maxHeight:'120px', overflowY:'auto' },
  sendBtn:      { width:'40px', height:'40px', borderRadius:'50%', background:'var(--text-primary)', border:'none', color:'var(--text-inverse)', fontSize:'18px', fontWeight:'700', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 },
}