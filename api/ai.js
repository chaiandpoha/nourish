const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"
const ANTHROPIC_VERSION = "2023-06-01"

const ALLOWED_MODELS = new Set([
  "claude-haiku-4-5-20251001",
  "claude-sonnet-4-6",       // vision scans only
])
const MAX_TOKENS_CAP   = 2000
const MAX_MESSAGES     = 40
const MAX_MSG_LENGTH   = 8000
const DAILY_CHAT_LIMIT = 20
const DAILY_SCAN_LIMIT = 10

// In-memory rate limit store — resets on cold start, good enough for a personal app.
// Key: `${userId}:${type}:${date}` → count
const _rateLimits = new Map()

function checkRateLimit(userId, type) {
  const date  = new Date().toISOString().slice(0, 10)
  const key   = `${userId}:${type}:${date}`
  const limit = type === "vision" ? DAILY_SCAN_LIMIT : DAILY_CHAT_LIMIT
  const count = _rateLimits.get(key) || 0
  if (count >= limit) return false
  _rateLimits.set(key, count + 1)
  return true
}

function validateMessages(messages) {
  if (!Array.isArray(messages))            return "messages must be an array"
  if (messages.length > MAX_MESSAGES)      return `too many messages (max ${MAX_MESSAGES})`
  for (const m of messages) {
    if (!m || typeof m !== "object")                        return "invalid message"
    if (!["user","assistant"].includes(m.role))             return "invalid message role"
    if (typeof m.content !== "string" && !Array.isArray(m.content)) return "invalid message content"
    if (typeof m.content === "string" && m.content.length > MAX_MSG_LENGTH)
      return "message too long"
    if (Array.isArray(m.content)) {
      if (m.content.length > 20) return "too many content blocks"
      const textLen = m.content.reduce((s, b) => s + (typeof b?.text === "string" ? b.text.length : 0), 0)
      if (textLen > MAX_MSG_LENGTH) return "message too long"
    }
  }
  return null
}

export default async function handler(req, res) {
  const origin = req.headers.origin || ""
  const allowedOrigins = [
    process.env.APP_ORIGIN,
    "http://localhost:5173",
    "http://localhost:4173",
  ].filter(Boolean)

  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin)
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type")
  res.setHeader("Vary", "Origin")

  if (req.method === "OPTIONS") return res.status(200).end()
  if (req.method !== "POST")    return res.status(405).json({ error: "Method not allowed" })

  let body
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body
  } catch {
    return res.status(400).json({ error: "Invalid JSON" })
  }

  const { userId, type, messages, system, model, maxTokens, tools } = body

  if (!userId)                                          return res.status(400).json({ error: "userId required" })
  if (!type || !["chat","vision"].includes(type))       return res.status(400).json({ error: "invalid type" })

  const msgError = validateMessages(messages)
  if (msgError) return res.status(400).json({ error: msgError })

  // Model — whitelist only; ignore client value if not in allowed set
  const safeModel = ALLOWED_MODELS.has(model) ? model : "claude-haiku-4-5-20251001"

  // Cap tokens regardless of what client sends
  const safeTokens = Math.min(parseInt(maxTokens) || 1000, MAX_TOKENS_CAP)

  // Server-side rate limit — key on IP so client-supplied userId can't be spoofed
  const clientIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
    || req.headers['x-real-ip']
    || 'unknown'
  if (!checkRateLimit(clientIp, type)) {
    const limit = type === "vision" ? DAILY_SCAN_LIMIT : DAILY_CHAT_LIMIT
    return res.status(429).json({ error: `Daily limit of ${limit} ${type} requests reached` })
  }

  const anthropicBody = {
    model:      safeModel,
    max_tokens: safeTokens,
    messages,
  }
  if (system) anthropicBody.system = system
  if (tools)  anthropicBody.tools  = tools

  try {
    const anthropicRes = await fetch(ANTHROPIC_API_URL, {
      method:  "POST",
      headers: {
        "Content-Type":      "application/json",
        "x-api-key":         process.env.ANTHROPIC_API_KEY,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify(anthropicBody),
    })

    const data = await anthropicRes.json()

    if (!anthropicRes.ok) {
      return res.status(anthropicRes.status).json({
        error: data?.error?.message || "Anthropic API error"
      })
    }

    return res.status(200).json(data)
  } catch (err) {
    return res.status(502).json({ error: "Failed to reach Anthropic: " + err.message })
  }
}
