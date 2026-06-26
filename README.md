# Road to Immortal

A personal, **offline-first** monk-mode discipline tracker — a single-user PWA.
No backend, no accounts, no analytics, **no runtime network calls**. All data lives
only on the device in `localStorage`. Built with vanilla HTML/CSS/JS — no framework,
no bundler, **no build step**.

> Anchors confirmed: `startDate = 2026-06-08` (day 1) · `targetDate = 2027-10-20`
> ("The Immortal", which lands exactly on day 500). Both editable in **Settings**.

---

## What was built (file structure)

| File | Role |
|---|---|
| `index.html` | App shell. Loads the scripts in order and hosts the aurora/fx canvases, nav, and Urge button. |
| `styles.css` | Dark obsidian/indigo theme, glassmorphism, glowing meters, animations. Respects `prefers-reduced-motion`. |
| `config.js` | **The single editable source of truth.** Rank ladder, meter constants, the 7-day nutrition plan + rules, quotes/codex, default dates. |
| `util.js` | Pure helpers — local-time date math (day rolls at local midnight), Pearson correlation, linear regression, HTML escaping. |
| `store.js` | Local persistence (settings, daily logs, relapse events, urge timestamps, meta) + JSON export/import. |
| `engine.js` | **Derived-values engine.** Day, rank, streak + shields (history replay), the four meters + Immortal Index over a rolling window, nutrition adherence + the rule-checker. Nothing here is hand-entered. |
| `app.js` | UI: 7 screens, routing, the Urge intervention, milestone/relapse/shield flows, study + nutrition analysis, export/import, aurora background, service-worker registration. |
| `sw.js` | Service worker — caches the full app shell for offline use. |
| `manifest.json` | PWA manifest (installable, standalone, maskable icons). |
| `icons/` | Generated PNG icons (192/512 + maskable + apple-touch + favicon). |
| `tools/gen-icons.js` | Regenerates the icons (zero-dependency PNG encoder). Dev-only. |
| `tools/selftest.js` | Node sanity-check for the derived engine (30 assertions). Dev-only. |

### The screens
**Today** (day/rank/shields, Immortal Index dial, four meters, targets, quick-log) ·
**Log** (full daily entry, auto-rolls at midnight) · **The Road** (rank ladder) ·
**Stats** (clean heat-map, weekly charts, fat% trend, urge danger-window) ·
**Study** (the n=1 attraction self-experiment + analysis) ·
**Nutrition** (the owner's own 7-day cut plan, what's-left, rule-checker, effect analysis) ·
**Codex** (original mystical + presence/self-mastery wisdom).

The floating **Urge** button is always reachable: one tap → full-screen ride-it-out
breathing flow that banks a resisted urge (timestamped → powers the danger-window view).

---

## How to run locally (test the service worker + offline)

Service workers require `http://localhost` — they do **not** run from `file://`.
Serve the folder with any static server:

```sh
# from the project root:
python -m http.server 8123
#   → open http://localhost:8123/

# or with Node:
npx --yes serve -l 8123 .
```

**Verify offline:**
1. Open `http://localhost:8123/` and load it once (the SW caches the shell).
2. DevTools → Application → Service Workers shows it **activated**; Cache Storage shows `rti-shell-v1`.
3. DevTools → Network → tick **Offline**, then reload. The app still loads fully.
4. (Mobile) open the same URL on your phone on the same network, "Add to Home Screen".

**Re-run the engine self-test** after any change to `engine.js`/`config.js`:
```sh
node tools/selftest.js     # expect: 30 passed, 0 failed
```

**Regenerate icons** (only if you change the art):
```sh
node tools/gen-icons.js
```

---

## How to deploy (Vercel, static, zero-config)

The app is pure static files — Vercel needs no build settings.

```sh
npm i -g vercel       # if not installed
cd road-to-immortal
vercel                # first run: links/creates the project, deploys a preview
vercel --prod         # promote to production (HTTPS → installable on phone)
```

`vercel.json` sets `Cache-Control: no-store` on `sw.js` (so updates roll out) and the
correct `manifest.json` content type. Data still lives **only on the device** — Vercel
serves the shell, nothing else. (Alternatively: GitHub Pages, Netlify, Cloudflare Pages —
any static host over HTTPS works.)

---

## Config knobs (edit `config.js`)

- **Rank ladder** → `RANKS` (rename / re-space freely; logic reads this array).
- **Meter formulas** → `meters` (per-unit weights, rolling `windowDays`, `maxPerWindow`
  scales, Chi streak-bonus cap + relapse dampen, Immortal Index weights).
- **Streak shields** → `shields` (`perPerfectWeekDays`, `maxStored`).
- **Start / target dates** → in-app **Settings**, or `defaultStartDate` / `defaultTargetDate`.
- **Nutrition plan** → `nutrition.templates` (7 day-templates with editable per-meal
  estimates + plan day-totals), `nutrition.dayTypes`, `nutrition.limits` (nuts/coconut/walk).
- **Daily targets checklist** → `dailyTargets`.
- **Quotes / Codex** → `quotes.{daily,recovery,dangerWindow,miss,codex}` (all original text).

The **butter rule** (6C #4) is implemented as confirmed: butter is allowed only on days
**without a fatty dinner** (fatty = pork curry or salmon). The rule-checker flags butter
on Shift B / Shift D or any day with a pork-curry/salmon dinner.

---

## Open risks / TODOs

- **iOS Safari PWA quirks:** installs work, but iOS evicts `localStorage` for unused web
  apps after ~7 days of no use and caps storage. **Export regularly** (the app nags weekly).
- **Storage model:** logs live in `localStorage` (simple, plenty for ~500 days). If you ever
  log very large free-text notes for years, consider migrating to IndexedDB.
- **Background animation battery:** the aurora canvas pauses when the tab is hidden and is
  disabled under reduced-motion; still, leave the *Reduce animations* toggle on if you notice
  heat/drain on an old phone.
- **Per-meal kcal/protein are estimates**, deliberately marked as such — the plan day-totals
  are the source of truth. Tune them in `config.js` to taste; they never drive a prescription.
- Meter constants are *starting values*. Watch the bars over your first weeks and adjust
  `maxPerWindow` so a strong day reads near full.

---

## Backup reminder (important)

There is no cloud. **500 days of progress lives only on this device.** The day a browser
is cleared or a phone is reset, it is gone — unless you exported. Use **Settings → Export
JSON** often (the app reminds you weekly). Import restores everything from that one file.
