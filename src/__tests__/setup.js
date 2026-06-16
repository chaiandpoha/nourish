// Run fake-indexeddb before any test file — overrides happy-dom's stub
// so Dexie gets a working in-memory IndexedDB in Node/happy-dom.
import 'fake-indexeddb/auto'
