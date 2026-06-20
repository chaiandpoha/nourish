export default function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", process.env.APP_ORIGIN || "")
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type")

  if (req.method === "OPTIONS") return res.status(200).end()
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" })

  const adminPass = process.env.ADMIN_PASS
  if (!adminPass) return res.status(503).json({ error: "Admin access not configured" })

  let body
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body
  } catch {
    return res.status(400).json({ error: "Invalid JSON" })
  }

  const { password } = body || {}
  if (!password || password !== adminPass) {
    return res.status(401).json({ error: "Incorrect password" })
  }

  return res.status(200).json({ ok: true })
}
