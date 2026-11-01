# DEAD ENDS & ANTI-PATTERNS LOG

This document records failed technical approaches, deadlocks, and anti-patterns encountered during development to prevent regression and oscillation.

| Iteration | Approach Tried | Why It Failed | Files Touched |
|-----------|---------------|---------------|---------------|
| M1-It1 | Anonymous pipe redirection (`stdout=PIPE`) + `taskkill /F /T` for Edge test harness | Windows child process pipe inheritance deadlock: Edge GPU/crashpad processes inherit pipe write handles; Python blocks on EOF; taskkill RPC fails in sandbox. | `run_tests.py`, test runners |
| M1-It1 | Synthetic regex test audit (`audit_test_suites()`) as socket fallback | Integrity violation: parsed test files with regex and emitted fake `[OK]` tokens. Excised completely in It2. | `run_tests.py` |
| M1-It2 | Attaching `tx.oncomplete` AFTER `await promisifyRequest(store.getAll())` in `cleanupOrphanedMedia()` | Transaction lifecycle race condition: transaction auto-commits and fires `complete` before `tx.oncomplete` is attached, causing promise to hang indefinitely. | `src/db/wardrobeDb.js` |
| M1-It2 | Storing boolean `delicate: true/false` directly in IndexedDB compound index keyPath | W3C IndexedDB spec rejects ECMAScript Boolean as valid key. Silently excludes all records from `laundry_load` and `delicate` indices; `IDBKeyRange.only` throws `DataError`. Must store as 0/1 or index on strings. | `src/db/wardrobeDb.js` |
| M1-It2 | Spawning 12 separate `msedge.exe` browser processes sequentially in CI/sandboxed Windows | Accumulated process handle contention and Chromium DNS config backoff stalls exceed 12s timeout on late suites. Full run must execute all suites in a single browser tab. | `run_tests.py` |
