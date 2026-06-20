# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start dev server at http://localhost:5173
npm run build      # Production build → dist/
npm run preview    # Serve dist/ locally
npm run test       # Run tests once (Vitest + happy-dom)
npm run test:watch # Watch mode
npm run lint       # ESLint (0 warnings allowed)
```

Run a single test file:
```bash
npx vitest run src/db/__tests__/db.test.js
```

## Architecture

**Nourish** is a mobile-first PWA for nutrition and workout tracking. It is deployed on Vercel. The frontend is React + Vite. There is no separate backend — AI calls go through a single Vercel serverless function at `api/ai.js`.

### Data layer (offline-first, dual-store)

All app data lives in **IndexedDB via Dexie** (`src/db/indexedDB.js`). **Supabase** is the cloud backup/sync layer. The golden rule: features read/write IndexedDB, and a background sync layer pushes dirty records to Supabase.

- `src/db/indexedDB.js` — Dexie schema (all tables, versioned migrations). Each record has a `dirty: 0|1` flag and `updatedAt` timestamp.
- `src/db/db.js` — The storage adapter all features import from. Never import `indexedDB.js` or `supabase.js` directly in feature code. Exports `initStorage`, `flushDirtyToSupabase`, CRUD helpers for each domain.
- `src/db/supabase.js` — Raw Supabase calls. Only `db.js` calls these.
- `src/db/migrations.js` — App-level data migrations (separate from Dexie schema versions). Runs on every startup via `runMigrations()` in `App.jsx`.

Dirty records are flushed every 30 seconds and on tab hide. On first login on a new device, `restoreFromSupabase` pulls all cloud data down before enabling writes.

### Auth

Google OAuth only. `src/auth/useAuth.jsx` is the `AuthProvider` / `useAuth` hook — the single source of truth for the logged-in `user` object. The `user` object is read from IndexedDB and includes `macroGoals`, `supplements`, `householdId`, `aiInstructions`, `healthSyncToken`, etc.

Auth flow: Google OAuth → `api/ai.js` is not involved → `src/db/authApi.js` parses the OAuth callback → `loginWithGoogle` in `useAuth` upserts the user in IndexedDB and calls `initStorage`.

Optional PIN lock: stored as `pinHash` (SHA-256) in the user record. Auto-locks after inactivity or backgrounding (configurable via `AUTH` constants in `src/config.js`).

### Routing

HashRouter (`/#/path`). All protected routes require `householdId` — users without one are held at `HouseholdScreen` until they create or join a household. The five main screens (Home, Chat, Food, Workout, Settings) are rendered by `ProtectedApp` in `App.jsx`. The floating `MealEntry` sheet is mounted at the app shell level and is visible on all screens except `/calendar`, `/chat`, and `/workout`.

### Household model

Users belong to a household (`householdId`). Food batches and recipes are shared within a household. Personal data (food logs, workouts, weight, etc.) is per-user. The `shared` flag on batches controls household-wide visibility.

### AI chat

`src/chat/MealChat.jsx` → `src/chat/chatApi.js` → `POST /api/ai` (Vercel function). The serverless function in `api/ai.js` proxies to Anthropic, enforces rate limits (20 chat / 10 vision per user per day), and validates all inputs. The client sends the full conversation history + a system prompt that includes today's macro totals, macro goals, recent food history, and user AI instructions. AI responses embed a `\`\`\`foods\`\`\`` JSON block that the UI parses to render one-tap log buttons.

Vision (food label scanning) uses `claude-sonnet-4-6`; chat uses `claude-haiku-4-5-20251001`.

### Health sync (steps)

iOS Shortcut POSTs steps/calories to Supabase `health_sync` table using a per-user `healthSyncToken`. `HealthClipboardSync` in `App.jsx` polls Supabase every 5 minutes and on focus to pull new data into the local `stepsLog` table.

### Key config

`src/config.js` — all constants: macro keys, meal slots, AI model names, PIN/auth settings, DB name/version, feature flags. Import from here rather than hardcoding strings.

### Styling

Inline styles throughout — no CSS modules or Tailwind. CSS custom properties for theming (`--bg-base`, `--text-primary`, `--accent`, `--r-lg`, etc.) defined in `src/index.css`. Dark/light mode via `data-theme` on `<html>`. Border radii and spacing follow the custom property system; avoid hardcoding pixel values that have a CSS var equivalent.

### PWA / Service Worker

Custom service worker at `src/sw.js`, injected by `vite-plugin-pwa` with `injectManifest` strategy. PWA manifest is managed manually at `public/manifest.json`. SW update prompt is shown via `InstallPrompt` component.

### Tests

Tests use Vitest + happy-dom + `fake-indexeddb`. Test setup is in `src/__tests__/setup.js`. The only test directory is `src/db/__tests__/`. There is also a Playwright UAT script (`uat.mjs`) with screenshots saved to `uat-screenshots/`.
