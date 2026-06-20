// In-memory rate limiter: 5 failures per IP → 15-minute lockout
const _failures = new Map()

function checkRateLimit(ip) {
  const now    = Date.now()
  const entry  = _failures.get(ip) || { count: 0, lockedUntil: 0 }
  if (entry.lockedUntil > now) return false
  return true
}

function recordFailure(ip) {
  const now   = Date.now()
  const entry = _failures.get(ip) || { count: 0, lockedUntil: 0 }
  entry.count++
  if (entry.count >= 5) {
    entry.lockedUntil = now + 15 * 60 * 1000
    entry.count       = 0
  }
  _failures.set(ip, entry)
}

function clearFailures(ip) {
  _failures.delete(ip)
}

export default function handler(req, res) {
  const origin = req.headers.origin || ""
  const allowedOrigin = process.env.APP_ORIGIN || "http://localhost:5173"
  if (origin === allowedOrigin || origin.startsWith("http://localhost:")) {
    res.setHeader("Access-Control-Allow-Origin", origin)
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type")

  if (req.method === "OPTIONS") return res.status(200).end()
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" })

  const adminPass = process.env.ADMIN_PASS
  if (!adminPass) return res.status(503).json({ error: "Admin access not configured" })

  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim()
    || req.headers["x-real-ip"]
    || "unknown"

  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: "Too many attempts — try again in 15 minutes" })
  }

  let body
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body
  } catch {
    return res.status(400).json({ error: "Invalid JSON" })
  }

  const { password } = body || {}
  if (!password || password !== adminPass) {
    recordFailure(ip)
    return res.status(401).json({ error: "Incorrect password" })
  }

  clearFailures(ip)
  return res.status(200).json({ ok: true })
}
