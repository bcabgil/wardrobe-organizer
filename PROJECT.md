# Project: Wardrobe Organizer & AI Fashion Stylist (100% Browser-Native PWA)

## Core Pillars
1. **Optimization of AI Calls**: Minimize and strictly control Gemini API requests across the entire app lifecycle:
   - **Single-Call Garment Onboarding**: AI metadata description and garment attributes are generated only when saving a garment to the wardrobe (never repeatedly while selecting or replacing photos/videos), and cached if previewed beforehand.
   - **Persistent & In-Memory Outfit Caching**: Generated outfit combinations are cached in `IndexedDB` (`outfitSuggestionsCache` & `lastActiveOutfitSuggestions`) and in memory (`OUTFIT_SUGGESTION_CACHE`). Navigating to the outfit tab or toggling filter options (like Outerwear) reuses and filters cached outfits without triggering redundant AI calls; new AI calls only happen when the user explicitly requests fresh combinations.
   - **Client-Side Media Compression & Keyframe Extraction**: Photos are scaled on-device (`max 1024px @ 0.82 JPEG`) and fit videos are sampled into lightweight keyframes before calling Gemini Vision.
   - **100% Autonomous Offline Fallback**: Deterministic rule-based styling and metadata synthesis ensure zero-latency operation when offline or when conserving API quota.
2. **100% Browser-Native & Offline-First PWA**: Zero backend server; all garments, binary media (`ArrayBuffer`), and settings live locally on the user's phone (`iOS Safari` & `Android Chrome`).
3. **Independent Wardrobes & Multi-Layer Seasonal Styling**: Strict separation of occasion wardrobes (`Everyday`, `Dress-up`, `Gym`, or custom occasions) with multi-select temperature suitability and multi-layer outfit composition.

## Architecture
- **Paradigm**: 100% Browser-Native, Offline-First Progressive Web App (PWA). Zero backend server.
- **Client Storage**: IndexedDB (`WardrobeDB`) with 4 object stores (`garments`, `media`, `settings`, `outfitHistory`) and WebKit-safe `ArrayBuffer` media storage.
- **Service Layer**:
  - `src/db/wardrobeDb.js`: IndexedDB wrapper with compound indices (`status_season`, `laundry_load`).
  - `src/services/backup/`: Pluggable `BackupProvider` architecture (`LocalArchiveBackupProvider` with full `.zip` and quick `.json` snapshots; `GoogleDriveBackupProvider` stub; `BackupManager` with Web Share API and download fallback).
  - `src/services/ai/`: Gemini 2.5 Flash REST integration (`geminiService.js`) with client-side canvas optimizer (`imageOptimizer.js`) and 100% offline rule-based fashion stylist fallback (`offlineStylist.js`).
  - `src/services/weather/`: Open-Meteo REST integration (`weatherService.js`) with WMO code interpretation and natural language synthesizer.
- **UI & Presentation Layer**:
  - Pure Vanilla ES Modules with client-side `HashRouter` (`#gallery`, `#add`, `#tomorrow`, `#laundry`, `#settings`).
  - Global reactive pub-sub `EventBus` (`eventBus.js`) for badge counts and dirty-state indicators.
  - WebKit and Blink safeguards: `playsinline`, `webkit-playsinline`, `MediaUrlManager` URL revocation, and iPhone safe-area insets (`env(safe-area-inset-top/bottom)`).
  - Components: `BottomNav`, `GarmentCard`, `GarmentModal`, `WearOutfitModal`, `Toast`, `LoadingOverlay`.
  - Views: `GalleryView`, `AddGarmentView`, `TomorrowStylistView`, `LaundryView`, `BackupSettingsView`.
- **PWA & Offline Infrastructure**:
  - `index.html`: Entry shell with Apple web app meta tags and viewport-fit cover.
  - `manifest.json`: Standalone PWA manifest.
  - `sw.js`: Cache-First strategy for static assets and App Shell; Network-First with timeout and graceful fallback for Gemini and Open-Meteo APIs.
- **Test Infrastructure**:
  - `tests/test-framework.js`: Zero-dependency browser-native micro-runner (`describe`, `it`, `expect`).
  - `tests/index.html`: Browser and headless test runner.
  - `run_tests.py`: Python headless test runner driving Microsoft Edge.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | IndexedDB Storage & Schemas | 4 stores (`garments`, `media`, `settings`, `outfitHistory`) with transactional CRUD | M1 | Survey |
| 2 | WebKit-Safe Media Pipeline | `ArrayBuffer` + MIME storage in DB, ephemeral Blob reconstruction, `MediaUrlManager` revocation | M1 | Survey |
| 3 | Reactive EventBus | Cross-view pub-sub event emitter for state synchronization | M1 | Survey |
| 4 | Vendored JSZip Archive Engine | Local offline JSZip distribution for ZIP archive packaging | M1 | Survey |
| 5 | Pluggable BackupProvider Interface | Abstract base contract for backup providers | M2 | Survey |
| 6 | Full .zip Archive Export & Import | Bundles `manifest.json` + `wardrobe.json` + `photos/` + `videos/` with replace & merge restore | M2 | Survey |
| 7 | Quick .json Snapshot Export & Import | Lightweight status and metadata snapshot export and import | M2 | Survey |
| 8 | Mobile Web Share API Delivery | Native iOS/Android Share sheet (`navigator.share` / `canShare`) with `<a download>` fallback | M2 | Survey |
| 9 | Google Drive Provider Stub | Pre-wired adapter conforming to BackupProvider for v2 cloud sync | M2 | Survey |
| 10 | Gemini 2.5 Flash Auto-Tagger | Direct browser HTTPS vision call with structured JSON schema for garment attributes | M3 | Survey |
| 11 | Canvas Image Optimization | Scales photo uploads to max 1024px @ 0.82 JPEG to keep Base64 payload under 250KB | M3 | Survey |
| 12 | Gemini 2.5 Flash Tomorrow Stylist | 2-3 outfit recommendations with titles, explanations, layering tips, and weather suitability | M3 | Survey |
| 13 | 100% Offline Rule-Based Stylist Fallback | Autonomous client-side algorithm with color harmony scoring, occasion matching & anchor piece | M3 | Survey |
| 14 | Open-Meteo Weather Integration | Tomorrow forecast extraction, WMO code interpretation, and natural-language weather summary | M3 | Survey |
| 15 | HashRouter Navigation | Client-side routing (`#gallery`, `#add`, `#tomorrow`, `#laundry`, `#settings`) with back gestures | M4 | Survey |
| 16 | Bottom Navigation with Badges | 5-item mobile nav with live laundry count and unsaved backup reminder badges | M4 | Survey |
| 17 | Gallery View & Filtering | Interactive grid with Active Season switch, Clean/Wash toggle, Type & Category filters | M4 | Survey |
| 18 | Garment Detail & Fit Video Modal | Inline video player (`playsinline`), photo/video tabs, metadata editor, and style anchor jump | M4 | Survey |
| 19 | Add Garment View & Media Picker | Camera capture vs gallery picker, pill attribute selectors, and Gemini Auto-Tag trigger | M4 | Survey |
| 20 | Tomorrow Stylist View & Wear Modal | Occasion selector, optional anchor piece, outfit cards, and post-wear laundry logger | M4 | Survey |
| 21 | 4-Basket Laundry Load View | Segregation into Whites/Coloured x Regular/Delicate with 1-tap "Mark Load as Clean" | M4 | Survey |
| 22 | Backup & Settings View | Storage metrics, ZIP/JSON export/import triggers, active season, Gemini API key & city settings | M4 | Survey |
| 23 | PWA App Shell & Styling | Mobile-first editorial theme, iPhone safe-area insets, notch & Dynamic Island avoidance | M5 | Survey |
| 24 | Service Worker Offline Cache | Cache-First for static assets; Network-First with timeout fallback for external APIs | M5 | Survey |
| 25 | Web App Manifest | Standalone display configuration and responsive icons | M5 | Survey |
| 26 | Automated E2E Test Suite | 4-tier test suite covering 100% of features and headless runner execution | M6 / Test Track | Survey |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Storage Layer & Schemas | `src/db/wardrobeDb.js`, `src/utils/mediaUtils.js`, `src/utils/eventBus.js`, `src/vendor/jszip.min.js` | none | PLANNED |
| M2 | Pluggable Backup & Restore Engine | `src/services/backup/` (`BackupProvider.js`, `BackupManager.js`, `LocalArchiveBackupProvider.js`, `GoogleDriveBackupProvider.js`) | M1 | PLANNED |
| M3 | AI Vision, Weather & Styling Services | `src/services/ai/` (`geminiService.js`, `imageOptimizer.js`, `offlineStylist.js`), `src/services/weather/weatherService.js` | M1 | PLANNED |
| M4 | Mobile UI Components & Views | `src/components/`, `src/views/` (Gallery, Add, Tomorrow, Laundry, Settings, Modals) | M1, M2, M3 | PLANNED |
| M5 | PWA App Shell, Service Worker & Styles | `index.html`, `manifest.json`, `sw.js`, `src/app.js`, `src/router.js`, `src/styles/`, `assets/` | M1, M2, M3, M4 | PLANNED |
| M6 | E2E Integration & Verification | Pass 100% of E2E test suite (Tiers 1-4) + Adversarial Coverage Hardening (Tier 5) + Forensic Audit | M1, M2, M3, M4, M5, TEST_READY | PLANNED |

## Interface Contracts
### `wardrobeDb` ↔ UI / Backup / AI
- `getGarment(id)`: returns garment record
- `getAllGarments()`: returns Array<Garment>
- `saveGarment(garment, photoBlob, videoBlob)`: saves metadata and saves blobs to `media` store
- `updateGarment(garment)`: updates metadata and updates `updatedAt`
- `deleteGarment(id)`: deletes garment and associated media records
- `getMediaBlob(mediaId)`: returns `Promise<Blob|null>` reconstructed from ArrayBuffer
- `getLaundryCount()`: returns number of items in `to_wash`
- `getLaundryLoads()`: returns `{ whitesRegular: [], whitesDelicate: [], colouredRegular: [], colouredDelicate: [] }`
- `markLoadClean(garmentIds)`: updates all specified garments to `clean`
- `hasChangesSinceBackup()`: returns boolean comparing `garments.updatedAt` vs `settings.lastBackupAt`
- `getSettings()` / `updateSettings(settings)`: settings persistence

### `BackupProvider` ↔ `BackupManager`
- `exportFullBackup(onProgress)`: returns `Promise<Blob>` (.zip)
- `exportMetadataJson()`: returns `Promise<Blob>` (.json)
- `importBackup(fileOrPayload, mode, onProgress)`: `mode` in `['replace', 'merge']`, returns `Promise<{ success: boolean, count: number }>`
- `getStatus()`: returns `Promise<{ lastBackupAt: string|null, providerName: string }>`

### `geminiService` & `offlineStylist` ↔ `TomorrowStylistView`
- `analyzeGarmentPhoto(imageBlob, apiKey)`: returns `Promise<AutoTagResult>`
- `suggestTomorrowOutfits({ garments, occasion, activeSeason, anchorGarmentId, weatherNote, apiKey })`: returns `Promise<{ outfits: StylistOutfit[], engine: 'gemini'|'offline' }>`
- `generateOfflineOutfits({ garments, occasion, activeSeason, anchorGarmentId, weatherData })`: returns `{ outfits: StylistOutfit[], engine: 'offline' }`

## Code Layout
```
c:\Users\bcabg\Documents\Projects\wardrobe_organizer\
├── index.html
├── manifest.json
├── sw.js
├── assets/
│   ├── icons/
│   └── placeholder.svg
├── src/
│   ├── app.js
│   ├── router.js
│   ├── styles/
│   │   ├── main.css
│   │   ├── safe-areas.css
│   │   ├── components.css
│   │   └── views.css
│   ├── db/
│   │   └── wardrobeDb.js
│   ├── services/
│   │   ├── ai/
│   │   │   ├── geminiService.js
│   │   │   ├── imageOptimizer.js
│   │   │   └── offlineStylist.js
│   │   ├── backup/
│   │   │   ├── BackupProvider.js
│   │   │   ├── BackupManager.js
│   │   │   ├── LocalArchiveBackupProvider.js
│   │   │   └── GoogleDriveBackupProvider.js
│   │   └── weather/
│   │       └── weatherService.js
│   ├── components/
│   │   ├── BottomNav.js
│   │   ├── GarmentCard.js
│   │   ├── GarmentModal.js
│   │   ├── WearOutfitModal.js
│   │   ├── Toast.js
│   │   └── LoadingOverlay.js
│   ├── views/
│   │   ├── GalleryView.js
│   │   ├── AddGarmentView.js
│   │   ├── TomorrowStylistView.js
│   │   ├── LaundryView.js
│   │   └── BackupSettingsView.js
│   ├── utils/
│   │   ├── eventBus.js
│   │   ├── mediaUtils.js
│   │   └── domUtils.js
│   └── vendor/
│       └── jszip.min.js
└── tests/
    ├── index.html
    ├── test-framework.js
    ├── unit/
    ├── integration/
    └── run_tests.py
```
