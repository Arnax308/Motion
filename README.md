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

Tasks more than 72 hours overdue are marked missed automatically.

## ⌨️ Shortcuts

| Key | Action |
| --- | --- |
| `N` | New task |
| `/` | Search history |
| `1`–`5` | Today, All tasks, History, Stats, Categories |
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

## 🧪 Tests

```bash
npm test
```

These cover the points rules, streaks, repeat catch-up, and the data file's save, backup and recovery logic.

## 🗂️ Project layout

- `main.js` and `preload.js`: the Electron window, single-instance lock and the bridge to the page
- `data-file.js`: safe loading and saving of `data.json`, with daily backups and corrupt-file recovery
- `index.html`: the app shell
- `css/`: design tokens (dark and light), shared components, and page styles
- `js/engine.js`: the rules for PP, levels, streaks and task lifecycle
- `js/store.js`: loading, saving, data migrations and undo
- `js/ui.js`: popovers, dialogs, toasts and the date and time picker
- `js/views/`: the Tasks, History, Stats and Categories pages
- `js/app.js`: navigation, sidebar, the right-hand summary panel and shortcuts
- `test/`: Node test suites (`npm test`)

The original Python/Flet version (`main.py`, `ui.py`, `analytics.py`, `data_manager.py`) is still in the repo. Its `data.json` format is compatible.

## 🤝 Contributing

Found a bug or want to make the UI look even more premium? Drop a pull request.

---
Stop procrastinating, lock in, and let's get those points! 🏆🔥
