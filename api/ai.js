const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"
const ANTHROPIC_VERSION = "2023-06-01"

const rateLimitMap = new Map()
const LIMITS = { chat: 20, vision: 10 }

function checkRateLimit(userId, type) {
  const key   = `${userId}:${type}:${new Date().toISOString().slice(0,10)}`
  const count = rateLimitMap.get(key) || 0
  if (count >= (LIMITS[type] || 20)) return false
  rateLimitMap.set(key, count + 1)
  return true
}

export default async function handler(req, res) {
  // Allow all origins — API key is server side only
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type")

  if (req.method === "OPTIONS") return res.status(200).end()
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" })

  let body
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body
  } catch {
    return res.status(400).json({ error: "Invalid JSON" })
  }

  const { userId, type, messages, system, model, maxTokens, tools } = body

  if (!userId) return res.status(400).json({ error: "userId required" })
  if (!messages || !Array.isArray(messages)) return res.status(400).json({ error: "messages required" })
  if (!type || !["chat","vision"].includes(type)) return res.status(400).json({ error: "invalid type" })

  if (!checkRateLimit(userId, type)) {
    return res.status(429).json({ error: "Daily limit reached" })
  }

  const anthropicBody = {
    model:      model || "claude-haiku-4-5-20251001",
    max_tokens: maxTokens || 1000,
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
