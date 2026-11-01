# Original User Request

## Approved Task Prompt — 2026-11-01 10:40:25 UTC

proceed with implemenation plan

### Core Requirements & User Specification:
- App: Wardrobe Organizer & AI Fashion Stylist
- Platform: Mobile-first Web App / PWA installable on phone home screen (iOS Safari and Android Chrome), offline-first so it runs autonomously without PC on.
- Garment Registry & Attributes:
  - Season: winter, summer, all-season (with active season switcher)
  - Color group: coloured, whites
  - Delicate: yes / no (boolean)
  - Status: clean, to wash
  - Type: everyday, gym, dress-up
  - Category: top, bottom, outerwear, one-piece, shoes, accessory
  - Picture of the garment
  - Video of the garment fit in me (playsinline, WebKit & Blink safe)
- Gallery view of registered clothes with filters and clean/wash toggle.
- "What should I wear tomorrow":
  - Occasion picker, optional anchor item, weather forecast context
  - Suggests outfits from clean, in-season garments
  - Google Gemini API (`gemini-2.5-flash`) fashion stylist suggestions with styling explanations & fit video previews
  - Offline smart rule-based fallback
  - Worn items can be marked as 'to wash'
- AI Vision Auto-Tagger: on photo upload, auto-fills visual style/color description and suggests attributes.
- Laundry basket view: grouped by Whites/Coloured & Delicate (4 laundry loads) with one-tap mark clean.
- Pluggable Backup & Restore:
  - IndexedDB storage for offline data and media ArrayBuffer/Blobs
  - Pluggable BackupProvider architecture (BackupManager, LocalArchiveBackupProvider, GoogleDriveBackupProvider stub)
  - Full .zip backup (wardrobe.json + photos/ + videos/) with mobile native Share sheet (`navigator.share` / `Save to Files` / Google Drive) and download fallback
  - Quick .json status/metadata backup & restore (merge or replace modes)
- Service Worker (`sw.js`) and `manifest.json` for full PWA offline operation.
- Implementation Plan Reference: `C:\Users\bcabg\.gemini\antigravity\brain\d29037be-b553-4619-b408-b2c1321fa47e\implementation_plan.md`
