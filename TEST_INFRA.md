# E2E Test Infra: Wardrobe Organizer & AI Fashion Stylist PWA

## Test Philosophy
- Opaque-box, requirement-driven, derived directly from `ORIGINAL_REQUEST.md` and user specifications.
- Methodology: Category-Partition + Boundary Value Analysis (BVA) + Pairwise Combinatorial + Real-World Workload Testing.
- Progressive testability: Tests run progressively as milestones complete.

## Feature Inventory & Test Matrix
| # | Feature | Requirement Source | Tier 1 (Coverage) | Tier 2 (Boundary) | Tier 3 (Cross) | Tier 4 (Scenario) |
|---|---------|-------------------|:-----------------:|:-----------------:|:--------------:|:-----------------:|
| 1 | Garment Registry & Attributes | ORIGINAL_REQUEST §10-18 | 5 | 5 | ✓ | ✓ |
| 2 | IndexedDB Storage & Schemas | ORIGINAL_REQUEST §29 | 5 | 5 | ✓ | ✓ |
| 3 | WebKit-Safe Media Storage (ArrayBuffer) | ORIGINAL_REQUEST §17-18, 29 | 5 | 5 | ✓ | ✓ |
| 4 | Gallery View & Filters | ORIGINAL_REQUEST §19 | 5 | 5 | ✓ | ✓ |
| 5 | Clean / To Wash Status Toggling | ORIGINAL_REQUEST §14, 19 | 5 | 5 | ✓ | ✓ |
| 6 | Active Season Switcher | ORIGINAL_REQUEST §11, 22 | 5 | 5 | ✓ | ✓ |
| 7 | Fit Video Inline Playback (playsinline) | ORIGINAL_REQUEST §18 | 5 | 5 | ✓ | ✓ |
| 8 | 4-Basket Laundry Load Segregation | ORIGINAL_REQUEST §27 | 5 | 5 | ✓ | ✓ |
| 9 | One-Tap Laundry Mark Clean | ORIGINAL_REQUEST §27 | 5 | 5 | ✓ | ✓ |
| 10 | Pluggable BackupProvider Architecture | ORIGINAL_REQUEST §30 | 5 | 5 | ✓ | ✓ |
| 11 | Full .zip Backup Export (ZIP) | ORIGINAL_REQUEST §31 | 5 | 5 | ✓ | ✓ |
| 12 | Quick .json Snapshot Export (JSON) | ORIGINAL_REQUEST §32 | 5 | 5 | ✓ | ✓ |
| 13 | Restore Backup (Replace Mode) | ORIGINAL_REQUEST §31-32 | 5 | 5 | ✓ | ✓ |
| 14 | Restore Backup (Merge Mode) | ORIGINAL_REQUEST §31-32 | 5 | 5 | ✓ | ✓ |
| 15 | Web Share API & Download Fallback | ORIGINAL_REQUEST §31 | 5 | 5 | ✓ | ✓ |
| 16 | Google Drive Provider Stub | ORIGINAL_REQUEST §30 | 5 | 5 | ✓ | ✓ |
| 17 | Gemini 2.5 Flash Auto-Tagger | ORIGINAL_REQUEST §26 | 5 | 5 | ✓ | ✓ |
| 18 | Tomorrow Outfit Stylist (Gemini 2.5 Flash) | ORIGINAL_REQUEST §20-23 | 5 | 5 | ✓ | ✓ |
| 19 | 100% Offline Rule-Based Stylist Fallback | ORIGINAL_REQUEST §24 | 5 | 5 | ✓ | ✓ |
| 20 | Tomorrow Weather Forecast (Open-Meteo) | ORIGINAL_REQUEST §21 | 5 | 5 | ✓ | ✓ |
| 21 | Stylist Anchor Item Pinning | ORIGINAL_REQUEST §21 | 5 | 5 | ✓ | ✓ |
| 22 | "Wear Outfit" Post-Styling Laundry Logger | ORIGINAL_REQUEST §25 | 5 | 5 | ✓ | ✓ |
| 23 | HashRouter & View Lifecycle | ORIGINAL_REQUEST §8, 19-28 | 5 | 5 | ✓ | ✓ |
| 24 | Bottom Navigation & Badges | ORIGINAL_REQUEST §8, 27 | 5 | 5 | ✓ | ✓ |
| 25 | PWA Service Worker Offline Operation | ORIGINAL_REQUEST §8, 33 | 5 | 5 | ✓ | ✓ |
| 26 | Web App Manifest & Safe-Area Styles | ORIGINAL_REQUEST §8, 33 | 5 | 5 | ✓ | ✓ |

## Test Architecture
- **In-Browser Test Framework**: `tests/test-framework.js` (micro-runner with `describe`, `it`, `expect`, `beforeEach`, `afterEach`).
- **Test Runner Page**: `tests/index.html` (executes all test suites in DOM, visual reporting and exposes `window.__TEST_RESULTS__`).
- **Headless Test Runner**: `run_tests.py` (executes tests headlessly via Microsoft Edge, outputs TAP/console summary).
- **Directory Layout**:
  - `tests/unit/`:
    - `wardrobeDb.test.js`: DB CRUD, transactions, ArrayBuffer media storage, compound indices.
    - `backup.test.js`: ZIP bundling, JSON snapshots, replace and merge restoration.
    - `offlineStylist.test.js`: 100% offline rule-based stylist, occasion filtering, color harmony.
    - `weatherService.test.js`: Open-Meteo parsing, WMO code interpretation, caching, fallback.
  - `tests/integration/`:
    - `router.test.js`: Hash routing, view lifecycle, back gestures, query parameters.
    - `laundryGrouping.test.js`: 4-basket partitioning, batch clean updates, reactive badge decrement.
    - `uiComponents.test.js`: GarmentCard toggles, modal open/close, video playsinline attributes.
    - `geminiService.test.js`: Image optimizer, auto-tag schema validation, prompt generation.
  - `tests/e2e/`:
    - `e2e_scenarios.test.js`: End-to-end user workflows (Tiers 1-4).

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Expected Outcome |
|---|----------|--------------------|------------------|
| S1 | Greenfield Wardrobe Onboarding | Add garments (tops, bottoms, outerwear, shoes) with photos and fit videos, auto-tag attributes | Wardrobe populated, media stored in ArrayBuffer, cards rendered in Gallery |
| S2 | Daily Tomorrow Outfit Planning | Request tomorrow outfit for "Everyday" with anchor jeans and rainy cold weather | Cohesive outfit composed including warm outerwear, anchor jeans pinned |
| S3 | Wearing an Outfit & Doing Laundry | Confirm wearing Outfit 1, select worn items to wash, open Laundry view, 4 baskets populated, tap "Mark Load Clean" on whites | Dirty items segregated into loads, nav badge decrements, items status reverts to clean |
| S4 | Full Disaster Recovery Backup & Restore | Export full .zip backup, delete entire database, restore from .zip in 'replace' mode | All garments, photos, and fit videos restored 100% with identical IDs and attributes |
| S5 | Multi-Device Status Sync | Export .json snapshot from Device A, import into Device B with 'merge' mode | Newer status updates applied, unedited garments preserved, no duplicate records |
| S6 | 100% Offline Airplane Mode Operation | Disconnect network, navigate between views, filter gallery, request tomorrow outfit | App operates seamlessly via Service Worker and Offline Stylist Engine without crashing |
| S7 | Season Transition | User switches active season from 'summer' to 'winter' in settings | Gallery updates to show winter & all-season items; stylist suggestions adapt immediately |

## Minimum Coverage Thresholds
- 26 Features Identified:
  - Tier 1: ≥130 test assertions (≥5 per feature)
  - Tier 2: ≥130 boundary & edge assertions (≥5 per feature)
  - Tier 3: ≥26 cross-feature interaction assertions
  - Tier 4: ≥7 realistic application scenarios
  - **Total Minimum Target: ≥293 tests/assertions**
