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
- `src/db/db.js` — **The single gateway all feature code imports from.** Never import `indexedDB.js` or `supabase.js` directly in feature code (static or dynamic). `db.js` re-exports the Dexie `db` instance, all CRUD helpers, and all Supabase functions needed by features.
- `src/db/supabase.js` — Raw Supabase client and calls. **Only `db.js` imports this file** — never import it directly in feature code.
- `src/db/migrations.js` — App-level data migrations (separate from Dexie schema versions). Runs on every startup via `runMigrations()` in `App.jsx`. This is a db-layer file and may import from `indexedDB.js` directly.
- `src/food/FoodDB.js` — Food-specific storage helpers (search, save, delete, household sync). Feature code imports food operations from here. This file imports `db` from `db.js` (not `indexedDB.js` directly).

**Import rule**: feature code (components, hooks, utilities outside `src/db/`) imports from `db.js` or `FoodDB.js` — never from `indexedDB.js` or `supabase.js` directly, including dynamic `import()` calls.

Dirty records are flushed every 30 seconds and on tab hide. On first login on a new device, `restoreFromSupabase` pulls all cloud data down before enabling writes.

### Auth

Google OAuth only. `src/auth/useAuth.jsx` is the `AuthProvider` / `useAuth` hook — the single source of truth for the logged-in `user` object. The `user` object is read from IndexedDB and includes `macroGoals`, `supplements`, `householdId`, `aiInstructions`, `healthSyncToken`, etc.

Auth flow: Google OAuth → `api/ai.js` is not involved → `src/db/authApi.js` parses the OAuth callback → `loginWithGoogle` in `useAuth` upserts the user in IndexedDB and calls `initStorage`.

Optional PIN lock: stored as `pinHash` (PBKDF2, 200k iterations) in the user record. Legacy SHA-256 hashes are auto-upgraded on next login. Auto-locks after inactivity or backgrounding (configurable via `AUTH` constants in `src/config.js`).

### Routing

HashRouter (`/#/path`). All protected routes require `householdId` — users without one are held at `HouseholdScreen` until they create or join a household. The five main screens (Home, Chat, Food, Workout, Settings) are rendered by `ProtectedApp` in `App.jsx`. The floating `MealEntry` sheet is mounted at the app shell level and is visible on all screens except `/calendar`, `/chat`, and `/workout`.

### Household model

Users belong to a household (`householdId`). Food batches and recipes are shared within a household. Personal data (food logs, workouts, weight, etc.) is per-user. The `shared` flag on batches controls household-wide visibility.

### AI chat

`src/chat/MealChat.jsx` → `src/chat/chatApi.js` → `POST /api/ai` (Vercel function). The serverless function in `api/ai.js` proxies to Anthropic, enforces rate limits (20 chat / 10 vision per user per day), and validates all inputs. The client sends the full conversation history + a system prompt that includes today's macro totals, macro goals, recent food history, and user AI instructions. AI responses embed a `\`\`\`foods\`\`\`` JSON block that the UI parses to render one-tap log buttons.

Vision (food label scanning) uses `claude-sonnet-4-6`; chat uses `claude-haiku-4-5-20251001`.

Rate limits are enforced server-side by IP (not userId) using an in-memory `Map` that resets on cold starts — intentionally simple for a personal app.

### Workout module

`src/workout/` contains the full workout feature:

- `ExerciseDB.js` — static array of ~182 exercises, each with `id`, `name`, `muscle`, `movement`, `equipment`, `feel`, `cues[]`, and `yt` (YouTube search string). This is the authoritative exercise catalogue; it is never written to IndexedDB.
- `WorkoutLog.jsx` — active session UI: exercise search, set logging with weight/reps/RPE, rest timer, swap exercises.
- `WorkoutHistory.jsx` — past session browser with edit/delete.
- `WorkoutCharts.jsx` — per-exercise progress charts (estimated 1RM, volume).
- `MuscleVolume.jsx` — weekly volume tracking by muscle group.
- `ProgramManager.jsx` — create/edit named workout programmes (ordered exercise lists stored as `programmes` in IndexedDB, one programme can be marked `active: 1`).
- `DeltabolicCard.jsx` — summary card displayed on the Home screen showing last workout.
- `ExerciseVideo.jsx` / `MovementGif.jsx` — fetch and display exercise demonstration media.

Exercise thumbnails are loaded from musclewiki.com CDN at runtime; failures fall back to a coloured initials badge.

### Batches & Recipes

`src/batches/` — A "batch" is a cooked meal made from multiple raw ingredients. `BatchBuilder.jsx` lets users add ingredients by weight, set a yield (e.g. total cooked grams), and `batchCalc.js` calculates the macros per 100g of the finished batch. Batches saved to IndexedDB (`batches` table) can be shared across the household (`shared` flag). `BatchList.jsx` shows all available batches.

`src/food/RecipeBuilder.jsx` and `RecipeList.jsx` handle fixed-ratio recipes (ingredients + serving sizes).

### Food databases

`src/data/nin_foods.json` and `src/data/usda_foods.json` are bundled static food databases seeded into IndexedDB on first use via `seedFoodDatabase()` in `FoodDB.js`. They are imported at build time and included in the bundle — do not make them larger than necessary.

### Calendar & Progress

`src/calendar/CalendarView.jsx` — monthly calendar showing logged data per day. `DaySummary.jsx` shows the macro and workout summary for a tapped day.

`src/progress/WeightLog.jsx` — body weight trend chart. `src/progress/Measurements.jsx` — body measurement tracking (waist, hips, etc.).

### Dev server API proxy

`vite.config.js` includes a custom `apiDevServer` plugin that intercepts `/api/*` requests during `npm run dev` and routes them to the corresponding `api/*.js` handler. This means `npm run dev` is all you need for local development — there is no need for `vercel dev`. All `.env` variables (not just `VITE_*` prefixed ones) are loaded into `process.env` so serverless handlers can access secrets like `ANTHROPIC_API_KEY`.

### Health sync (steps)

iOS Shortcut POSTs steps/calories to Supabase `health_sync` table using a per-user `healthSyncToken`. `HealthClipboardSync` in `App.jsx` polls Supabase every 5 minutes and on focus to pull new data into the local `stepsLog` table.

### Key config

`src/config.js` — all constants: macro keys, meal slots, AI model names, PIN/auth settings, DB name, feature flags. Import from here rather than hardcoding strings.

`DB_VERSION` in `config.js` is the **base schema version (1)** used for the initial `db.version(1).stores({})` call. The actual current IndexedDB version is defined by the highest `db.version(N)` call in `indexedDB.js` (currently 11). Do not change `DB_VERSION` — add a new `db.version(N+1).stores({...})` block in `indexedDB.js` instead.

### Styling

Inline styles throughout — no CSS modules or Tailwind. CSS custom properties for theming (`--bg-base`, `--text-primary`, `--accent`, `--r-lg`, etc.) defined in `src/index.css`. Dark/light mode via `data-theme` on `<html>`. Border radii and spacing follow the custom property system; avoid hardcoding pixel values that have a CSS var equivalent.

### PWA / Service Worker

Custom service worker at `src/sw.js`, injected by `vite-plugin-pwa` with `injectManifest` strategy. PWA manifest is managed manually at `public/manifest.json`. SW update prompt is shown via `InstallPrompt` component.

### Tests

Tests use Vitest + happy-dom + `fake-indexeddb`. Test setup is in `src/__tests__/setup.js`. Test directories: `src/db/__tests__/` (sync/restore logic) and `src/food/__tests__/` (FoodDB helpers). There is also a Playwright UAT script (`uat.mjs`) with screenshots saved to `uat-screenshots/`.
