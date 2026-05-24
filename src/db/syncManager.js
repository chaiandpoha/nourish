// Background sync manager
// Handles daily Drive backup and restore on new device

const BACKUP_KEY = 'nourish_last_backup'
const BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000 // 24 hours

export async function shouldBackup() {
  const last = localStorage.getItem(BACKUP_KEY)
  if (!last) return true
  return Date.now() - parseInt(last) > BACKUP_INTERVAL_MS
}

export function markBackupDone() {
  localStorage.setItem(BACKUP_KEY, String(Date.now()))
}

export function getLastBackupTime() {
  const last = localStorage.getItem(BACKUP_KEY)
  if (!last) return null
  return new Date(parseInt(last))
}
