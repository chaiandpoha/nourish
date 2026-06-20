// ─── App Identity ───────────────────────────────────────────────────────────
export const APP_NAME = 'Nourish'
export const APP_VERSION = '1.0.0'

// ─── Feature Flags ──────────────────────────────────────────────────────────
export const FEATURES = {
  barcodeScanner:   true,
  labelScanner:     true,
  aiMealChat:       true,
}

// ─── AI ─────────────────────────────────────────────────────────────────────
export const AI = {
  chatModel:        'claude-haiku-4-5-20251001',
  visionModel:      'claude-sonnet-4-6',
  maxTokens:        1000,
}

// ─── Auth ────────────────────────────────────────────────────────────────────
export const AUTH = {
  pinMinLength:         4,
  pinMaxLength:         8,
  maxPinAttempts:       5,
  lockoutBaseSeconds:   30,   // doubles each failure after maxPinAttempts
  autoLockMinutes:      15,   // default, user can change in Settings
  backgroundLockMinutes: 5,   // lock if app backgrounded longer than this
}

// ─── Household ───────────────────────────────────────────────────────────────
export const HOUSEHOLD = {
  maxMembers: parseInt(import.meta.env.VITE_MAX_HOUSEHOLD_MEMBERS || '4', 10),
}

// ─── Macros ──────────────────────────────────────────────────────────────────
export const MACRO_KEYS = ['calories', 'protein', 'carbs', 'fat', 'fibre']

export const MACRO_COLORS = {
  calories: '#FF6B6B',
  protein:  '#4ECDC4',
  carbs:    '#FFE66D',
  fat:      '#A8E6CF',
  fibre:    '#C3A6FF',
}

// ─── Meal Slots ──────────────────────────────────────────────────────────────
export const MEAL_SLOTS = ['breakfast', 'lunch', 'dinner', 'snack']

export const MEAL_SLOT_HOURS = {
  breakfast: { start: 0,  end: 10 },
  lunch:     { start: 10, end: 15 },
  dinner:    { start: 15, end: 19 },
  snack:     { start: 19, end: 24 },
}

// ─── Progress Photos ─────────────────────────────────────────────────────────
export const PHOTO = {
  maxSizePx:    800,
  jpegQuality:  0.70,
}

// ─── Food Label Scanning ─────────────────────────────────────────────────────
export const LABEL_SCAN = {
  jpegQuality:  0.85,
}

// ─── IndexedDB ───────────────────────────────────────────────────────────────
export const DB_NAME    = 'nourish'
export const DB_VERSION = 1

// ─── Misc ────────────────────────────────────────────────────────────────────
export const FIBRE_LOW_THRESHOLD = 0.5  // flag in AI chat if fibre < 50% of goal by evening
export const EVENING_HOUR        = 19   // 7pm — used for fibre check