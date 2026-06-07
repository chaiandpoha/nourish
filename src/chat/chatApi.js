// AI meal chat — builds context from user's day and calls Claude Haiku

import { FIBRE_LOW_THRESHOLD, EVENING_HOUR, AI } from '../config.js'

// ─── System prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(user) {
  return `You are a knowledgeable nutrition assistant built into Nourish, a personal health tracking app.

Your role:
- Help the user hit their daily macro targets with practical meal suggestions
- Suggest Indian and international foods based on what they have remaining
- Be concise and direct — this is a mobile app, not a blog
- When suggesting foods, include approximate macros in brackets e.g. "Paneer (100g) — 18g protein, 265 kcal"
- When you recommend specific foods for the user to eat, append a structured block at the END of your message in this EXACT format (no extra text after it):
\`\`\`foods
[{"name":"Food Name","grams":100,"cal":265,"protein":18,"carbs":3.4,"fat":20,"fibre":0}]
\`\`\`
  Include one object per recommended food with a realistic quantity. Omit this block for general advice, questions, or when listing comparisons without a specific recommendation.

User profile:
- Name: ${user?.name || 'User'}
- Daily goals: ${user?.macroGoals?.calories || 2000} kcal, ${user?.macroGoals?.protein || 150}g protein, ${user?.macroGoals?.carbs || 200}g carbs, ${user?.macroGoals?.fat || 65}g fat, ${user?.macroGoals?.fibre || 30}g fibre
- Height: ${user?.height ? Math.round(user.height) + 'cm' : 'not set'}
${user?.aiInstructions ? `\nDietary preferences (IMPORTANT — always follow these):\n${user.aiInstructions}` : ''}
Keep responses under 200 words unless asked for more detail. Be warm but efficient.`
}

// ─── Dynamic context ──────────────────────────────────────────────────────────

function buildContext(totals, goals, meal, settings) {
  const remaining = {
    calories: Math.max(0, (goals?.calories || 2000) - (totals?.calories || 0)),
    protein:  Math.max(0, (goals?.protein  || 150)  - (totals?.protein  || 0)),
    carbs:    Math.max(0, (goals?.carbs    || 200)   - (totals?.carbs    || 0)),
    fat:      Math.max(0, (goals?.fat      || 65)    - (totals?.fat      || 0)),
    fibre:    Math.max(0, (goals?.fibre    || 30)    - (totals?.fibre    || 0)),
  }

  const hour = new Date().getHours()
  const timeOfDay = hour < 10 ? 'morning' : hour < 15 ? 'afternoon' : hour < 19 ? 'evening' : 'night'
  const fibreLow  = hour >= EVENING_HOUR && (totals?.fibre || 0) < (goals?.fibre || 30) * FIBRE_LOW_THRESHOLD

  return `Current time: ${timeOfDay} (${hour}:00)
Current meal context: ${meal || 'general'}

Macros logged today:
- Calories: ${Math.round(totals?.calories || 0)} / ${goals?.calories || 2000} kcal
- Protein:  ${Math.round(totals?.protein  || 0)} / ${goals?.protein  || 150}g
- Carbs:    ${Math.round(totals?.carbs    || 0)} / ${goals?.carbs    || 200}g
- Fat:      ${Math.round(totals?.fat      || 0)} / ${goals?.fat      || 65}g
- Fibre:    ${Math.round(totals?.fibre    || 0)} / ${goals?.fibre    || 30}g

Remaining:
- Calories: ${Math.round(remaining.calories)} kcal
- Protein:  ${Math.round(remaining.protein)}g
- Carbs:    ${Math.round(remaining.carbs)}g
- Fat:      ${Math.round(remaining.fat)}g
- Fibre:    ${Math.round(remaining.fibre)}g
${fibreLow ? '\n⚠️ Fibre intake is low for this time of day — suggest high-fibre options.' : ''}

Privacy: ${settings?.shareFoodNamesWithAI !== false ? 'Food names may be shared' : 'Do not reference specific food names'}`
}

// ─── Send message ─────────────────────────────────────────────────────────────

function checkClientRateLimit(userId, type) {
  const date  = new Date().toISOString().slice(0, 10)
  const key   = `nourish_rate_${userId}_${type}_${date}`
  const limit = type === 'vision' ? AI.dailyScanLimit : AI.dailyChatLimit
  const count = parseInt(localStorage.getItem(key) || '0', 10)
  if (count >= limit) return false
  localStorage.setItem(key, String(count + 1))
  return true
}

export async function sendChatMessage({
  messages,
  user,
  totals,
  goals,
  meal,
  settings,
  userId,
}) {
  if (!checkClientRateLimit(userId || 'anon', 'chat')) {
    throw new Error(`Daily limit of ${AI.dailyChatLimit} messages reached`)
  }

  // Load fresh user data to get latest aiInstructions
  try {
    const { db } = await import('../db/indexedDB.js')
    const freshUser = await db.users.get(userId)
    if (freshUser) user = { ...user, ...freshUser }
  } catch {}
  const system  = buildSystemPrompt(user)
  const context = buildContext(totals, goals, meal, settings)

  // Prepend context as first user message if this is the start of conversation
  const contextMessage = {
    role:    'user',
    content: `[Context — not shown to user]\n${context}`,
  }

  const contextReply = {
    role:    'assistant',
    content: 'Got it — I can see your macro progress for today. How can I help?',
  }

  const fullMessages = messages.length === 1
    ? [contextMessage, contextReply, ...messages]
    : messages

  let res
  try {
    res = await fetch('/api/ai', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId:    userId || 'anonymous',
        type:      'chat',
        model:     AI.chatModel,
        maxTokens: AI.maxTokens,
        system,
        messages:  fullMessages,
      }),
    })
  } catch (fetchErr) {
    throw new Error('Network error: ' + fetchErr.message)
  }

  if (!res.ok) {
    let errMsg = 'HTTP ' + res.status
    try { const err = await res.json(); errMsg = err.error || errMsg } catch {}
    throw new Error(errMsg)
  }

  let data
  try {
    data = await res.json()
  } catch (parseErr) {
    throw new Error('Response parse error: ' + parseErr.message)
  }

  return data.content?.[0]?.text || ''
}