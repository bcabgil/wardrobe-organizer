# Wardrobe Organizer & AI Fashion Stylist — Walkthrough & Documentation

## Overview

**Atelier (Wardrobe Organizer & AI Fashion Stylist)** is a **100% Browser-Native, Offline-First Progressive Web App (PWA)** designed for both **iPhone (iOS Safari)** and **Android (Chrome)** that runs autonomously on your phone **without needing your PC turned on**.

---

## Key Features & Architecture

### 1. Storage & Cross-Platform Media Layer (Milestone 1)
- **[`src/db/wardrobeDb.js`](./src/db/wardrobeDb.js)**:
  - `IndexedDB` database (`WardrobeDB`) with 4 object stores (`garments`, `media`, `settings`, `outfitHistory`) and compound indices (`status_season`, `laundry_load`).
  - Tracks garment attributes: `name`, `category` (`top`, `bottom`, `outerwear`, `one-piece`, `shoes`, `accessory`), `season` (`winter`, `summer`, `all-season`), `colorGroup` (`coloured`, `whites`), `delicate` (`true`/`false`), `status` (`clean`, `to_wash`), `type` (`everyday`, `gym`, `dress-up`), `visualDescription`, `photoMediaId`, and `videoMediaId`.
- **[`src/utils/mediaUtils.js`](./src/utils/mediaUtils.js)**:
  - **iOS WebKit-Safe Storage**: Converts photos and fit videos into `ArrayBuffer` + MIME metadata before storing in `IndexedDB`, reconstructing `Blob` instances on read so iPhone Safari never drops media across sessions.
  - **Inline Fit Video Playback**: Creates `<video>` elements with `playsinline` and `webkit-playsinline` attributes so `.mov` (iPhone) and `.mp4` (Android) fit videos play smoothly inline.
  - **Memory Management**: `MediaUrlManager` tracks and revokes ephemeral `blob:` URLs on view/modal unmount.
- **[`src/utils/eventBus.js`](./src/utils/eventBus.js)**:
  - Reactive pub/sub event bus (`wardrobe:changed`, `laundry:updated`, `season:changed`, `backup:completed`, `backup:restored`) keeping navigation badges and views in sync.

### 2. Pluggable Backup & Restore Engine (Milestone 2)
- **[`src/services/backup/BackupProvider.js`](./src/services/backup/BackupProvider.js)** & **[`src/services/backup/BackupManager.js`](./src/services/backup/BackupManager.js)**:
  - Pluggable backup contract with native mobile **Web Share API (`navigator.share`)** delivery (letting you save backups directly to your **Google Drive** app, **iOS Files**, or **AirDrop** in one tap) and automatic `<a download>` fallback.
- **[`src/services/backup/LocalArchiveBackupProvider.js`](./src/services/backup/LocalArchiveBackupProvider.js)**:
  - **Full `.zip` Backup**: Packages `manifest.json`, `wardrobe.json`, `/photos/*`, and `/videos/*` into a single `.zip` archive using offline-vendored [`src/vendor/jszip.min.js`](./src/vendor/jszip.min.js).
  - **Quick `.json` Status Snapshot**: Exports/imports lightweight metadata and `clean`/`to_wash` statuses.
  - **Smart Restore (`Merge` & `Replace` Modes)**: Restores full `.zip` or `.json` backups while protecting your saved Gemini API key.
- **[`src/services/backup/GoogleDriveBackupProvider.js`](./src/services/backup/GoogleDriveBackupProvider.js)**:
  - Pre-wired adapter conforming to `BackupProvider` for future direct Google Drive OAuth sync.

### 3. Gemini 2.5 Flash AI Vision, Offline Stylist & Weather (Milestone 3)
- **[`src/services/ai/imageOptimizer.js`](./src/services/ai/imageOptimizer.js)**:
  - Client-side `<canvas>` optimizer scaling garment photos to max `1024px` (`0.82` JPEG quality) for fast mobile uploads.
- **[`src/services/ai/geminiService.js`](./src/services/ai/geminiService.js)**:
  - `analyzeGarmentPhoto`: Uses Gemini 2.5 Flash Vision with structured JSON schema (`AUTO_TAG_SCHEMA`) to auto-fill garment name, category, season, laundry color group, delicate status, occasion type, and visual styling description from a photo.
  - `suggestTomorrowOutfits`: Sends your **clean** and **in-season** wardrobe inventory, tomorrow's weather forecast, and optional **anchor garment** to Gemini 2.5 Flash to curate 2–3 outfit combinations with styling rationale and layering tips.
- **[`src/services/ai/offlineStylist.js`](./src/services/ai/offlineStylist.js)**:
  - Deterministic, 100% offline rule-based fashion stylist fallback that scores color harmony, occasion matching, anchor garment pinning, and weather layering when offline or when no API key is set.
- **[`src/services/weather/weatherService.js`](./src/services/weather/weatherService.js)**:
  - Fetches tomorrow's temperature & rain probability from Open-Meteo and synthesizes natural-language dressing advice.

### 4. Mobile UI Views, Components & Offline PWA Shell (Milestones 4 & 5)
- **App Shell & Offline Service Worker**: [`index.html`](./index.html), [`manifest.json`](./manifest.json), [`sw.js`](./sw.js), [`src/app.js`](./src/app.js), and [`src/router.js`](./src/router.js).
- **5 Mobile Views**:
  1. [`src/views/GalleryView.js`](./src/views/GalleryView.js) — Wardrobe catalog with 1-tap Active Season switcher (`❄️ Winter` / `☀️ Summer`), search bar, filter chips, and [`src/components/GarmentModal.js`](./src/components/GarmentModal.js) for watching your fit videos.
  2. [`src/views/AddGarmentView.js`](./src/views/AddGarmentView.js) — Camera/library photo & fit video capture, **✨ Auto-Fill Attributes with AI**, and pill selectors.
  3. [`src/views/TomorrowStylistView.js`](./src/views/TomorrowStylistView.js) — **"What Should I Wear Tomorrow?"** studio with weather banner, occasion picker, anchor item selector, inline fit video previewer, and [`src/components/WearOutfitModal.js`](./src/components/WearOutfitModal.js).
  4. [`src/views/LaundryView.js`](./src/views/LaundryView.js) — 4 segregated laundry baskets (`Whites Regular`, `Whites Delicate`, `Coloured Regular`, `Coloured Delicate`) with 1-tap **"Mark Load as Clean"**.
  5. [`src/views/BackupSettingsView.js`](./src/views/BackupSettingsView.js) — Full `.zip` and Quick `.json` Export/Restore, storage metrics, Active Season switcher, and Gemini API key setup.

---

## Verification & Automated Test Suite

Run the full 12-suite browser test runner in headless Microsoft Edge:
```powershell
python run_tests.py
```
- **Total Suites**: 12 (`wardrobeDb`, `mediaUtils`, `eventBus`, `jszip`, `backup`, `offlineStylist`, `weatherService`, `router`, `laundryGrouping`, `uiComponents`, `geminiService`, `e2e_scenarios`)
- **Total Tests**: 97 passed, 0 failed, 0 skipped (424 assertions)
- You can also open [`tests/index.html`](./tests/index.html) directly in any browser to inspect interactive test results.

---

## How to Use It on Your Phone (iPhone & Android)

### Option A: Host Free on GitHub Pages / Netlify Drop (Recommended for 24/7 Access Anywhere)
Because the app is a zero-backend static PWA, you can drag-and-drop the `wardrobe_organizer` folder onto [Netlify Drop](https://app.netlify.com/drop) or push it to **GitHub Pages**:
1. Open the hosted HTTPS URL in **Safari (iPhone)** or **Chrome (Android)**.
2. Tap **Share → Add to Home Screen** (iPhone) or **Install App** (Android).
3. The Service Worker (`sw.js`) caches the entire app on your phone so it works **100% offline** with your PC turned off.

### Option B: Run Locally on Your PC or Home Wi-Fi
Run a quick static server from `c:\Users\bcabg\Documents\Projects\wardrobe_organizer`:
```powershell
python -m http.server 8080 --bind 0.0.0.0
```
- On your PC: Open `http://localhost:8080`
- On your phone (connected to the same Wi-Fi): Open `http://<your-pc-ip>:8080`
