// Parses the nourish-steps: clipboard format written by the iOS shortcut.
// Handles locale formatting: commas (8,432), decimals (8432.0), spaces.
export function parseHealthClipboard(text) {
  if (!text?.includes('nourish-steps:')) return null
  const raw = text.slice(text.indexOf('nourish-steps:'))
  const m = raw.match(/nourish-steps:([\d,.]+)(?:,cal:([\d,.]+))?(?:,date:([\d-]+))?/)
  if (!m) return null
  const steps = parseInt(m[1].replace(/[^\d]/g, ''))
  const cal   = m[2] ? parseInt(m[2].replace(/[^\d]/g, '')) : 0
  const date  = m[3] || null
  if (!steps) return null
  return { steps, cal, date }
}
