// Vercel serverless function — proxies requests to Anthropic API
// API key never leaves this file — never sent to the browser

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'

// Per-user rate limiting — stored in memory per serverless instance
// Not persistent across cold starts — soft limit only, not security
const rateLimitMap = new Map()

const LIMITS = {
  chat:    20, // max chat calls per user per day
  vision:  10, // max vision/scan calls per user per day
}

function getRateLimitKey(userId, type) {
  const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
  return `${userId}:${type}:${today}`
}

function checkRateLimit(userId, type) {
  const key = getRateLimitKey(userId, type)
  const count = rateLimitMap.get(key) || 0
  const limit = LIMITS[type] || 20
  if (count >= limit) return false
  rateLimitMap.set(key, count + 1)
  return true
}

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // CORS — only allow requests from same origin
  const origin = req.headers.origin || ''
  const allowed = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:5173'

  if (origin && origin !== allowed && !origin.includes('localhost')) {
    return res.status(403).json({ error: 'Forbidden' })
  }

  res.setHeader('Access-Control-Allow-Origin', allowed)
  res.setHeader('Access-Control-Allow-Methods', 'POST')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  // Parse body
  let body
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' })
  }

  const { userId, type, messages, system, model, maxTokens, tools } = body

  // Validate required fields
  if (!userId || typeof userId !== 'string') {
    return res.status(400).json({ error: 'userId required' })
  }
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array required' })
  }
  if (!type || !['chat', 'vision'].includes(type)) {
    return res.status(400).json({ error: 'type must be chat or vision' })
  }

  // Rate limit check
  if (!checkRateLimit(userId, type)) {
    return res.status(429).json({
      error: 'Daily limit reached',
      type,
      limit: LIMITS[type],
    })
  }

  // Build Anthropic request
  const anthropicBody = {
    model:      model || 'claude-haiku-4-5',
    max_tokens: maxTokens || 1000,
    messages,
  }

  if (system)   anthropicBody.system = system
  if (tools)    anthropicBody.tools  = tools

  // Call Anthropic
  let anthropicRes
  try {
    anthropicRes = await fetch(ANTHROPIC_API_URL, {
      method:  'POST',
      headers: {
        'Content-Type':         'application/json',
        'x-api-key':            process.env.ANTHROPIC_API_KEY,
        'anthropic-version':    ANTHROPIC_VERSION,
      },
      body: JSON.stringify(anthropicBody),
    })
  } catch (err) {
    console.error('Anthropic fetch error:', err)
    return res.status(502).json({ error: 'Failed to reach Anthropic API' })
  }

  // Forward Anthropic response
  const data = await anthropicRes.json()

  if (!anthropicRes.ok) {
    console.error('Anthropic error response:', data)
    return res.status(anthropicRes.status).json({
      error: data?.error?.message || 'Anthropic API error',
    })
  }

  return res.status(200).json(data)
}