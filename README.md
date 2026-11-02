# 🚀 Motion (The Ultimate Lock-In App)

Welcome to **Motion**, the productivity app that gamifies your entire life so you actually get stuff done. It's a desktop app built with **Electron** and plain HTML, CSS and JavaScript.

## ✨ Features

- **📈 Productivity Points (PP):** Every task has a base PP. Finish 1h+ early for ×2, on time for ×1, late for ×½. Severity (×0.5 to ×5) and category weight (×0.5 to ×3) multiply it. Rescheduling halves it. Missing a task costs PP.
- **🏆 Levels and titles:** A new level every 300 PP, and a new title every few levels, from Casual Rookie to Life Prodigy.
- **🔥 Streaks:** Complete at least one task a day to keep your streak alive. Your best streak is tracked too.
- **⚡ Quick add:** Type a task, set category, severity, due time, base PP, repeat and a note with chips, and press Enter. Motion shows the most PP you can earn before you add it.
- **📋 Today and All tasks:** Tasks grouped into Overdue, Today, Tomorrow, This week and Later, as a list or a board. Each task shows the PP you'd earn if you finished it right now.
- **🔁 Repeating tasks:** Daily and weekly tasks create their next copy automatically. If repeats go by while a task sits overdue (say the app was closed for a week), the next copy jumps to the next upcoming date and the skipped repeats cost half as many misses, rounded down: 7 ignored days cost 3 misses.
- **↩️ Undo:** Completing, missing, deferring, deleting and editing can all be undone from the toast or with Ctrl+Z.
- **📚 History:** Everything you've finished, missed or deferred, newest first, with search and filters.
- **📊 Stats:** Monthly PP, completion rate and misses compared with last month, a 26-week activity grid, PP per week, and a per-category breakdown.
- **🏷️ Categories:** Pick an icon, colour and PP weight, or hide a category from quick add.
- **🌗 Light and dark themes:** Follows your system setting, or pick one in the sidebar.
- **📱 Android app and sync:** The same app on your phone, kept in sync with the laptop through Firebase, with deadline alerts, a morning summary and a streak reminder.

Tasks more than 72 hours overdue are marked missed automatically.

## ⌨️ Shortcuts

| Key | Action |
| --- | --- |
| `N` | New task |
| `/` | Search history |
| `1`–`6` | Today, All tasks, History, Stats, Categories, Settings |
| `Ctrl+Z` | Undo |
| `Esc` | Close a menu or dialog |

## 💻 How to run this

1. **Clone the repo:**
   ```bash
   git clone https://github.com/Arnax308/Motion.git
   cd Motion
   ```

2. **Install dependencies** (Electron, plus the fonts and icons, which are bundled so the app works offline):
   ```bash
   npm install
   ```

3. **Fire it up:**
   ```bash
   npm start
   ```
   On Windows you can also double-click `Run-Motion.bat`.

Your data lives in `data.json` next to the app. It's created on first run and never leaves your machine. To try the app against a different file, set `MOTION_DATA_FILE` to its path before starting.

**Backups and recovery:**
- On the first save of each day, Motion copies `data.json` into a `backups/` folder next to it and keeps the last 14 days.
- If `data.json` ever can't be read, the unreadable file is kept as `data.corrupt-<time>.json` and the newest good backup is restored automatically.
- Saves go through a temporary file, with retries if OneDrive or antivirus briefly locks the file.

## 🔄 Sync between laptop and phone

Each device keeps its full data and works offline. Whenever a device is online, it swaps changes with the other through a Firestore database:
- on start-up, before overdue tasks are auto-missed
- a couple of seconds after any change
- every minute while the app is open
- when the app regains focus

The phone also checks about every 15 minutes in the background.

Conflicts are settled per task, history entry and category, and the newer change wins. Completing a task always beats a missed or deferred version of the same task, so a laptop that auto-missed something offline won't undo a completion from your phone. PP and streaks are recalculated from history, so both devices always show the same numbers.

**One-time setup:**
1. Create a free project at [console.firebase.google.com](https://console.firebase.google.com).
2. Under **Authentication → Sign-in method**, enable **Anonymous**.
3. Create a **Firestore Database** in production mode. On its **Rules** tab, publish:
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /spaces/{space}/records/{record} {
         allow read, write: if request.auth != null && space.size() >= 32;
       }
     }
   }
   ```
4. Register a **Web app** under Project settings, then copy `js/sync-config.example.js` to `js/sync-config.js` and fill in:
   - its `apiKey` and `projectId`
   - a random `syncKey`, which is what links your devices; keep it private
5. Restart the desktop app and rebuild the phone app. Settings shows the sync status.

`js/sync-config.js` is gitignored. Without it, sync stays off and everything works locally.

## 📱 Android app

The phone app is the same code wrapped with [Capacitor](https://capacitorjs.com).

1. **Install the build tools once.** This puts a portable JDK 21 and the Android SDK in your user folder, with no admin rights needed:
   ```bash
   npm run setup:android
   ```
2. **Build the APK:**
   ```bash
   npm run mobile:build
   ```
   This creates `dist/Motion.apk`.
3. **Install it on your phone.** Either copy `dist/Motion.apk` to the phone and open it (allow installing unknown apps when asked), or connect the phone with USB debugging on and run:
   ```bash
   npm run mobile:install
   ```
4. **Allow notifications and alarms** on first launch. Alert timing is set in **More → Settings**.

**Alerts:**
- Before a deadline (1 hour by default, or 15 minutes, 30 minutes or 2 hours)
- When it's due
- A morning summary at 8:00
- A streak reminder at 8 PM, only if you haven't finished anything that day

## 🧪 Tests

```bash
npm test
```

These cover:
- the points rules, streaks and repeat catch-up
- two-device sync against a fake server: offline edits, conflicts, undo and large uploads
- alert scheduling
- the data file's save, backup and recovery logic

## 🗂️ Project layout

- `main.js` and `preload.js`: the Electron window, single-instance lock and the bridge to the page
- `data-file.js`: safe loading and saving of `data.json`, with daily backups and corrupt-file recovery
- `index.html`: the app shell
- `css/`: design tokens (dark and light), shared components, and page styles
- `js/engine.js`: the rules for PP, levels, streaks and task lifecycle
- `js/store.js`: loading, saving, data migrations, undo and change tracking for sync
- `js/platform.js`: storage for Electron, Android and the browser preview
- `js/sync-core.js`, `js/sync.js`, `js/firestore.js`, `js/sync-client.js`: merging, the sync loop, the Firestore REST client and when to sync
- `js/alerts-core.js`, `js/alerts.js`, `js/mobile.js`: phone alerts and Android glue
- `runners/background-main.js`: the Android background sync that runs while the app is closed
- `android/`, `capacitor.config.json`, `scripts/`: the Android project and its build and setup scripts
- `js/ui.js`: popovers, dialogs, toasts and the date and time picker
- `js/views/`: the Tasks, History, Stats, Categories and Settings pages
- `js/app.js`: navigation, sidebar, the right-hand summary panel and shortcuts
- `test/`: Node test suites (`npm test`)

## 🤝 Contributing

Found a bug or want to make the UI look even more premium? Drop a pull request.

---
Stop procrastinating, lock in, and let's get those points! 🏆🔥
