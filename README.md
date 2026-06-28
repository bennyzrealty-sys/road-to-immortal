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

## Increment 2 — Ascension + on-device photo measurement

**Part 1 · Ascension / Energy Bank** (`engine.js`, `util.js`, `app.js` `screenAscension`)
- `totalChiAccumulated` — a **monotonic** lifetime number (sum of each day's earned
  Chi *before* relapse dampening). A relapse dims today's *level* (the meter); it
  never reduces the banked total. Reached from **Today → Ascension**.
- 4 dual-line charts (Chi vs signal-rate / mood / urges / adherence), daily/banked toggle.
- **Correlation lock** — no number until Day ≥ 60 **and** ≥ 15 opportunity-days **and**
  ≥ 10 signal-days (`config.ascension.correlationLock`). Then **Spearman**, labelled
  *"association, not proof,"* with the confound flag + high-confidence filter.

**Part 2 · Photo module** (`photos.js`, `app.js` `screenPhotos`, `vendor/mediapipe/`)
- MediaPipe Tasks Vision is **vendored** in `vendor/mediapipe/` (face + pose-lite +
  segmenter models, ESM bundle, SIMD/no-SIMD WASM) and loaded locally — **no runtime CDN**.
- Capture (`getUserMedia`) with an **alignment ghost** of the last shot + framing guide,
  a **frame-quality gate** (near-frontal + neutral via blendshapes + eyes open),
  downscale to ≤1080px JPEG, stored in **IndexedDB** (`rti_photos_db`, separate from the
  main `localStorage` export — photos have their **own** Export/Import).
- **Validity:** every tracked metric is a **ratio** (face: jaw ratio, fWHR, gonial angle,
  cheek fullness; body: shoulder/hip, shoulder/waist) so a closer photo gives the same
  numbers (regression-tested for scale **and** aspect-ratio invariance). Waist (from
  segmentation) is marked **lower-confidence**.
- On each capture it **auto-compares** against the previous + baseline, cross-checks the
  interval's training / fat%, and gives a **plain-language, rules-based** read — never a
  prescription. A **weekly-cadence gate** labels sub-7-day shots as noise.
- **Module B (cloud interpreter): OFF** — a disabled placeholder. No network call; nothing
  leaves the device.

### Testing the photo flow locally
1. `python -m http.server 8123` → open `http://localhost:8123/` (camera needs a secure
   context; `localhost` counts, plain-HTTP LAN does **not**).
2. Today → **Photos** → pick a type → **Open camera** → allow permission → Capture. A face
   shot is rejected unless near-frontal/neutral; on accept it measures and shows the read.
3. `node tools/selftest.js` → **69 passed** (incl. metric scale/aspect invariance + cadence gate).

### Storage notes
- ~80–200 KB per stored JPEG (≤1080px @ q0.8). 100 photos ≈ 10–20 MB in IndexedDB.
- **Photos are NOT in the main backup** — use Photos → *Export photo journey* (one JSON with
  base64 images) separately; the main *Export JSON* stays light.
- First online load caches ~19 MB of MediaPipe (SW v5); after that the photo module works offline.

### Validity caveats to keep visible
- Metrics are **normalized ratios** — trust them over raw pixels.
- **Weekly cadence:** faces shift daily with sleep/water; a real trend needs ~7-day gaps.
- **"Association, not proof"** — the Ascension correlation is Spearman with a confound flag.
- **Body metrics are lower-confidence** than face metrics (pose/framing move them); the waist
  estimate (segmentation) is the least certain.

## Increment 3 — The Ascendant (proactive coach · power · stages · signals)

The earlier increments were **passive logbooks**: the owner had to remember what to
fill, where, and when. Increment 3 makes the app **ask first** and **show the charge**.

**Proactive coach (Today, top card)** — `engine.js` `dailyAgenda`/`coachPhase`, `app.js`
`coachCard`/`wireCoach`
- Reads the **local clock** and greets by phase (morning / midday / afternoon / evening /
  late). The night phase wraps midnight and names the danger hour.
- Surfaces the single most relevant unfilled thing **right now** with one-tap inline
  actions — *“Is today a shift day or rest day?”* → sets it and jumps to the plan;
  *“Had your lunch yet?”*, *“Did you hold the line today?”* (Held / Slipped), *Breathe +5*,
  *Meditate +5*, *+1,000 steps*. Meal nudges follow `config.coach.mealWindows`.
- A **completion ring** (`% logged today`) plus a tappable **“what’s left”** list so the
  owner never has to hunt for what’s missing. Meal items stay locked until a day-type +
  plan are chosen (with a hint).

**Immortal Power** (`app.js` `screenPower`, reached from Today / Codex) — `engine.js`
`auraScores` / `stageFor` / `performanceSummary`
- A **pictorial human body that charges** feet→head; the fill % is the **Immortal Power**,
  a 0–100 blend weighted toward the *permanence of the clean streak* (a relapse genuinely
  discharges it; a kept streak rebuilds it). Energy nodes light as it rises.
- A semicircular **Magnetism / attraction-field gauge** (presence-led) — framed as *your
  own charge, never a promise about anyone else.*
- **Energy & attractiveness acquired**: the four meters + lifetime banked Chi, streak
  permanence, current/longest streak, shields, Immortal Index.
- **Stages, stage after stage**: a ladder keyed to the clean streak (The Fog → … → The
  Immortal Current). Each stage lists *what shifts inside you* and *the cues you may begin
  to notice* — explicitly labelled **tendencies, not promises**, with the same
  initiative-confound caveat used elsewhere.
- **Overall standing**: clean rate, current/longest streak, 7-day Immortal-Index average +
  trend arrow, adherence, relapses.

**Signals — the body-language field codex** (`app.js` `screenSignals`, `config.signals`)
- An educational guide to reading interest **honestly and respectfully**: what a *normal
  glance* is, the *held glance*, the *double-take*, the *look-back after passing*,
  *proximity*, *preening*, *feet/torso orientation*, *mirroring*, the *watcher at the edge*
  (shy interest **or** wanting space — both respected), and more.
- Every entry is **Looks like / Can mean / Carry yourself**, wrapped in a hard **respect &
  consent** frame: signals are probabilistic, politeness ≠ attraction, a turn-away or
  withdrawal is a complete answer, and the aim is to become *worth meeting* — never to
  pressure, follow, or surveil anyone.

**Dark Codex** — a new **Dark** tab in the Codex with original, dark-academia one-liners on
non-neediness, frame and restraint (*power over the self, not over others*).

All Increment-3 numbers are **derived** (nothing new is hand-entered) and the engine
gained five pure functions (`coachPhase`, `dailyAgenda`, `auraScores`, `stageFor`,
`performanceSummary`) covered by **16 new self-test assertions** (`node tools/selftest.js`
→ **85 passed**). Service-worker cache bumped to **v7**.

## Increment 3.1 — Daily Trial + shareable sigil card

**Daily Trial** (`config.trials`, `engine.js` `dailyTrial`/`trialStanding`, `app.js` `trialCard`)
- One rotating challenge per local day, picked **deterministically** (same seeding as the
  daily quote). Some are **auto-detected** from the day's log (10k steps, 30 min breathing,
  20 min meditation/cardio, 7h sleep, protein hit, all targets); some are **self-attested**
  (cold shower, morning sunlight, 60-min no-phone, read the Codex, open posture).
- A "Today's Trial" card sits under the coach on **Today**. Auto trials flip to **✓ Met**
  live from your log (with a `have / need` hint); manual trials get a **Mark done** toggle that
  celebrates on completion. The card shows a **trials-won tally + 🔥 trial-streak**.
- Manual completion stores `{ id, done }` in the day's log; the engine only counts it when the
  stored id matches that day's deterministic trial, so a stale tick can't carry across midnight.
- The Trial has its **own** tally — it never touches the derived meters (derivation stays pure).

**Shareable sigil card** (`engine.js` `shareCardData`, `app.js` `renderShareCard`/`openShareCard`)
- A **"Share your charge"** button on Immortal Power renders a 1080×1350 **canvas** card —
  the charging-body silhouette + Day / rank / clean-streak / Immortal-Power % / stage / Index —
  in the app's obsidian-and-gold theme, then lets you **Download** a PNG (or **Share** via the
  native share sheet where `navigator.canShare` supports files; it auto-hides otherwise).
- Fully **offline**: the existing `powerBody()` SVG is serialised to a Blob and rasterised onto
  the canvas in-page (with a gold-ring fallback); only system fonts are used; nothing is
  uploaded — it's a manual, user-initiated image, matching the no-network ethos.

Engine gained four pure functions (`trialIndexFor`, `dailyTrial`, `trialStanding`,
`shareCardData`) with **22 new self-test assertions** (`node tools/selftest.js` → **107 passed**).
No new files (logic folded into existing modules); service-worker cache bumped to **v8**.

> **Parked (asked, deferred): a step / distance / calorie tracker.** A *website* can't count
> steps in the background — only a *native app* can read the phone's hardware step sensor (which
> is why a dedicated "Step Counter" app works all day). When revisited, the two paths are a pure-PWA
> "movement" view (enter the day's total from your step app → auto distance from height + calories
> from weight, plus an in-app accelerometer walk-session) **or** repackaging as a native wrapper
> (Capacitor/TWA) for true background counting. See the plan file for the full spec.

## Increment 3.2 — Catch up your streak (backfill)

The whole app is **derived**: "Day N" comes from your start date, but your **streak** (which
Immortal Power, Magnetism and Your Stage all key off) only counts days you actually marked
**clean**. If you held clean for weeks before you started tapping it in daily, the streak — and
everything built on it — reads near zero even though the calendar shows Day 21. This was a
record-keeping gap, not a reference bug (the code already uses the live streak everywhere).

- **`store.backfillClean(fromISO, toISO)`** marks every **unlogged** day in a range as clean and
  returns the count. It is honest by construction — it **never** overwrites a day you already
  answered (clean/slip) or any relapse day, so you can only record real history, not erase it.
- **Settings → "Catch up your streak"**: pick a *clean-since* date (defaults to your start date)
  and one tap records those days, so streak / rank / Power / stage immediately reflect them.
- **Today** shows a gentle **"Catch up your streak"** banner when there are ≥2 unlogged days
  between your start and today, linking straight to the tool (and disappearing once it's done).

9 new self-test assertions (the symptom, the integrity guards, idempotency, the resulting
streak) — `node tools/selftest.js` → **116 passed**. Service-worker cache bumped to **v9**.

## Increment 3.3 — Movement (steps · distance · weight-aware calories)

The parked step tracker, built the honest pure-PWA way (a website can't read the phone's step
sensor in the background — only a native app can — so the all-day total is entered from the
owner's own step counter, with an in-app accelerometer "live walk" for measuring a session).

**Pure math** (`config.movement`, `engine.js`): `strideMeters` (height→stride), `distanceKm`,
`metForCadence` (cadence→MET band), `caloriesForSteps` (distance-based, weight-aware),
`caloriesForSession` (cadence→MET when a walk is timed), `movementSummary`. Every figure scales
with `currentWeightKg` / `heightCm` from Settings (sensible fallbacks + a "set it" nudge).

**Movement screen** (`app.js` `screenMovement`, reached from Today): a step-goal ring + today's
distance / calories, a **"Set today's steps"** entry (read your native counter's total → distance
& calories recompute), and weekly steps + distance charts. Writes `log.steps`, so it feeds the
existing Vitality meter, the coach "move" item and the `steps10k` trial automatically.

**Live walk** (`openWalkSession` + `engine.createStepDetector`): a foreground session that counts
steps from `DeviceMotionEvent` (low-pass + hysteresis + debounce peak detection), keeps the screen
on via **Screen Wake Lock**, gives **haptic** feedback each 1,000 steps, and on finish adds the
measured steps + cadence-based calories + a `walk` cardio entry to the day. iOS motion permission is
requested from the Start tap; it degrades gracefully where there's no sensor (→ use manual entry).

The step-detector defaults were **tuned empirically** (alpha 0.4) so it counts cleanly across slow
and brisk cadences and ignores stillness. 18 new self-test assertions (stride/distance/MET/calorie
math, weight scaling, and the detector on synthetic walks) — `node tools/selftest.js` → **134
passed**. No new files; service-worker cache bumped to **v10**.

> The live walk only measures while the app is open (a website limitation). For all-day totals,
> read your native step counter and use *Set today's steps*. True background counting would need
> the native-wrapper path still parked in the plan.

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
