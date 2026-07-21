# Road to Immortal

A personal, **offline-first** monk-mode discipline tracker — a single-user PWA.
No backend, no accounts, no analytics. All data lives on the device in
`localStorage`; the **only** runtime network call is the **opt-in cloud sync**
(Settings → Cloud sync, one endpoint: `api.github.com`) — with sync unconfigured the
app makes zero network calls, exactly as before. Built with vanilla HTML/CSS/JS —
no framework, no bundler, **no build step**.

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
2. DevTools → Application → Service Workers shows it **activated**; Cache Storage shows the current `rti-shell-v12`.
3. DevTools → Network → tick **Offline**, then reload. The app still loads fully.
4. (Mobile) open the same URL on your phone on the same network, "Add to Home Screen".

**Re-run the engine self-test** after any change to `engine.js`/`config.js`:
```sh
node tools/selftest.js     # expect: 270 passed, 0 failed
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

## Increment 4 — The Awakened Engine (rota · oracle · foresight · sanctum)

The earlier increments made the app *proactive*; Increment 4 makes it **agentic** — it
reads your world (your rota, your ledger, the sky), reasons over it on-device, and acts
with one-tap confirmations. Still 100% offline: the "AI" is local, explainable and yours.
Three new modules (`rota.js` → `RTI_ROTA`, `sanctum.js` → `RTI_SANCTUM`, `oracle.js` →
`RTI_ORACLE`), five new engine functions, three new screens. SW cache → **v11**.

**🗓 The Rota — upload your shifts once, the app plans your days** (`rota.js`,
`app.js` `screenRota`, `config.rota`)
- **Import wizard**: paste or pick your rota as **CSV**, **calendar (.ics)** — e.g. an NHS
  e-roster export — or **plain text**. Auto-detects the format; robust UK **day-first** date
  parsing (`06/07/2026`, `6 Jul 2026`, `Mon 14th July`, 2-digit years, ICS all-day spans).
- **Job-role presets** (NHS nursing/HCA, NHS doctor, police, factory, office, custom) pre-map
  shift codes (`E L N LD OFF AL SB…`) onto nine shift kinds (Day/Early/Late/Night/Long day/
  On-call/Rest/Leave/Sick); unknown codes get a manual mapping step, remembered for next time.
  Built deliberately generic so it can one day be published for anyone with a rota.
- **Month calendar** (tap a day to set/clear a shift), **“Repeat a pattern”** generator
  (`4D 4OFF`, `Nx3 2E R`…), *Next up* list with typical shift times, month totals.
- **“Apply to day plans”** writes each day’s shift/rest **nutrition day-type** from the rota —
  and **never overwrites a day you already answered** (same honesty rule as streak backfill).
- **Rota-aware coach**: when today is unplanned, the Today card asks first — *“Your rota says
  **Night shift** today. Confirm?”* — one tap sets the plan. Rota is included in Export/Import.

**🔮 The Oracle — an on-device agentic coach** (`oracle.js`, `app.js` `screenOracle`)
- A conversation screen with **zero network**: a local intent engine reads what you type
  (or say — mic input via Web Speech where available, spoken replies behind a Settings toggle)
  and answers **from your own ledger**: status, streak, risk tonight, what’s left to eat,
  next shift, rank horizon, the moon, wisdom.
- It **acts, with consent**: “I walked 12,000 steps” → the Oracle proposes *Log 12,000 steps*;
  nothing is written until you tap. Same for meditation/breath/sleep/mood/clean, opening the
  urge flow, or starting a breath session. The Oracle proposes — the owner confirms.
- A daily **whisper** (one data-grounded line) now sits under the coach card on Today.

**👁 Foresight — the prophecy engine** (`engine.js` `riskForecast` / `streakHistory` /
`survivalOutlook` / `rankETA` / `weeklyProphecy`, `config.foresight`, Oracle → *Sight* tab)
- **Tonight’s risk**: an additive, fully **explainable** 0–100 forecast — every factor is
  named and signed (*Early in the streak +20 · The danger hour +14 · Night shift tonight +8 ·
  Streak protection −25*). Weights are config tunables; the UI carries the standing caveat
  *association, not fate*.
- **Survival outlook** (how many past streaks made it beyond this point), **rank horizon**
  (projected dates at your real clean-rate), and an auto-written **Weekly Prophecy**
  (clean days, adherence, mood/sleep averages, chi earned, finest day, one focus line).

**🕉 The Sanctum — breath · mala · cosmos** (`sanctum.js`, `app.js` `screenSanctum`,
`config.sanctum`)
- **Pranayama studio**: Box, 4·7·8 Descent, Coherent 5.5, Inner-Fire rounds (tummo-style,
  with the safety note), Nadi Shodhana — an orb that breathes with you, per-phase countdown,
  haptic phase ticks, reduced-motion safe; finishing **banks the minutes into `breathingMin`**
  (so it feeds Chi and the coach automatically).
- **Japa mala**: 108-bead tap counter with quarter-mark glows, malas held, and an honest
  bank-as-meditation confirm at the end.
- **Cosmic clock**: moon phase + illumination, and — once a *sacred location* is set in
  Settings (device-only; a one-tap geolocation fill) — sunrise, sunset and the
  **Brahma Muhurta** window (sunrise −96 → −48 min). All **pure astronomy math computed
  on-device** (NOAA solar + synodic moon), zero network.

All new logic is pure and covered: **73 new self-test assertions** (rota parsing incl. ICS
expansion + never-overwrite, foresight determinism + bands, moon/sun/brahma math incl. polar
edges, oracle intent + number extraction) — `node tools/selftest.js` → **207 passed, 0 failed**.

## Increment 5 — The Forge (hardening the ledger)

A full adversarial review of the app found the soft spots; this increment closes them
before the record grows. No new features — durability, correctness, speed. SW → **v12**.

**Durability**
- `navigator.storage.persist()` is requested at boot — asks the browser to shield
  localStorage + IndexedDB from storage eviction (honoured on Android/desktop Chrome).
- A **failed localStorage write is now surfaced** (`store.js` `onWriteError` → a
  throttled warning toast) instead of being silently swallowed; the in-memory copy
  stays live so the session keeps working while you export.
- **Photo-backup nag**: photos are *not* in the main JSON export, and nothing ever
  reminded you to export them. Today now shows a "Back up your photos" banner
  (own `lastPhotoExportISO` meta, same weekly cadence as the JSON nag).
- **Safe import**: `importBundle` rejects `logs:null`/`settings:null` (the
  `typeof null === 'object'` trap), rejects backups from a **newer schema**, snapshots
  the current state to `rti_pre_import_backup` first, and **restores everything** if a
  write fails part-way — a bad backup can never leave a half-replaced store.
- **Render guard**: if any screen builder throws, a recovery card (with a working
  *Export backup* button) renders instead of a blank app.

**Correctness**
- **Oracle number↔intent pairing**: "slept 7 hours and walked 12000 steps" used to
  propose *Log 7 steps* (first number in the string won). The winning log intent now
  takes the number **nearest its own unit vocab** — 12000 pairs with steps, 7 with sleep.
- **Oracle proposals are dated**: a chip spoken at 23:59 and confirmed at 00:01 writes
  to the day it was spoken, not the new day.
- **`rankETA` is day-anchored**: ranks arrive by calendar day everywhere (`rankFor`), so
  the Rank horizon now lists exact arrival dates instead of streak-based projections
  that could "project" ranks already held after a relapse.
- **A recorded relapse always wins**: `dayStatus` puts the relapse check first, so
  toggling *Held* on a relapse day can no longer make the streak count it clean.
- **`dailyTargets` editing is era-safe**: each day's log stamps `targetsTotal`, and all
  "all targets done" checks (`engine.allTargetsDone`) judge a day against the target
  list that existed when it was logged — editing the list never rewrites history.
- **ICS RRULE warning**: recurring calendar events are not expanded by the rota
  importer; it now says so loudly in the import warnings instead of silently keeping
  only the first occurrence.

**Speed (the day-60 wall)**
- `store.js` now keeps an **in-memory cache** of the parsed blobs; every write goes
  through it, so cache and storage can't drift. Engine history replays
  (`streakAsOf`, `chiSeries`, `correlationStatus`…) no longer re-`JSON.parse` the whole
  logs object per day — the O(day²)/O(day³) blow-up that would have janked the
  Ascension/Sight screens from day 60 onward is gone.

26 new self-test assertions (cache invalidation + zero-storage reads, write-failure
surfacing, import rejection/rollback, relapse-wins, era-safe targets, day-anchored
rankETA, oracle pairing incl. ties and `12k`, RRULE warning) —
`node tools/selftest.js` → **233 passed, 0 failed**.

## Increment 6 — The Bridge (opt-in GitHub sync: the ledger leaves the phone)

The owner chose to end the phone-only era: the full export bundle now syncs to a
**private** GitHub repo (`rti-data` — separate from this app repo, which stays free of
personal data), readable by the owner's PC and by the Mentor agent. New `sync.js`
(`RTI_SYNC`), a Settings card, SW → **v13**.

**Honest boundaries (the design, in one breath)**
- **Opt-in**: zero network until a token is pasted in Settings. Unconfigured = the old
  fully-offline app, byte for byte.
- **One endpoint**: `api.github.com` (GitHub Contents API), nothing else, ever.
- **The phone is the only writer of `backup.json`.** If the cloud copy carries a sha
  this device never wrote (fresh install, another device), sync **stops and asks** —
  *Use cloud copy here* / *Overwrite cloud* — it never guesses. Restore runs through
  increment 5's safe import (snapshot + rollback).
- **The token stays on the device**: sync config lives in its own `rti_sync_v1` key,
  deliberately **excluded from the export bundle**, so shared backups can't leak it.
- **Auto-sync is change-driven**: a `bundleHash` (exportedAt excluded) is compared on
  app open / network-return / app-hide / a 5-min tick, throttled to once a minute;
  pushes only when the ledger actually changed. Failures degrade to a status line.
- **Photos are pushed manually** (Settings button → `photos-journey.json`) — they're
  big, and the tap also stamps the photo-backup nag.
- The Mentor (increment 8) writes only under `mentor/`; the app only **reads**
  `mentor/insights.json` (pulled quietly into `rti_mentor_v1`).

**Setup (once, on the phone)**: github.com → Settings → Developer settings →
**Fine-grained tokens** → access to the ONE private repo (`rti-data`), permission
**Contents: Read and write** → paste into Settings → Cloud sync → *Sync now*.
Enable 2FA on the GitHub account — it is now the ledger's privacy boundary.

10 new self-test assertions (unicode-safe base64 round-trip incl. API line-wraps,
stable/change-detecting hashes, `bundleHash` ignoring `exportedAt` churn while seeing
real changes, unconfigured-by-default, token never in the export bundle, single-origin
`apiUrl`) — `node tools/selftest.js` → **243 passed, 0 failed**.

## Increment 7 — Ambitions (career goals · roadmap · daily tasks)

**The Ascent** — a new screen for career/life ambitions, built on the same honesty rules
as everything else. New `goals.js` (`RTI_GOALS`), store key `rti_goals_v1` (IN the
export bundle + sync), SW → **v14**.

- **Goal model**: ambition (title · why · horizon date) → **milestones** (the roadmap,
  each with an optional target date) → **recurring tasks** (daily / 5× / 3× / weekly —
  the walking). Everything is created and edited **in-app** (overlay forms); four
  fully-editable **seed templates** (career / treasury / vessel / citadel) in
  `config.goals.seeds` for a one-tap start.
- **Progress is derived, never typed**: milestones fallen (70%) + real 14-day task
  adherence (30%). The **ETA projects only from milestones actually completed** — no
  projection exists until the first stone falls, and the caption says "projection, not
  promise".
- **Task completions live in the day's log** (`log.goalTasks`) — so they ride
  export/backup/sync, join the **coach agenda** (capped at `config.goals.agendaCap`,
  one-tap *Done ✓* from the coach card, counted in the completion ring), and power a
  new auto **Daily Trial** ("The Ascent Step" — advance any ambition today).
- **Reminders, in-app** (this increment's honest scope): an **overdue-milestone banner**
  on Today, a quiet "milestone due in N days" line on the coach card (≤7 days), and
  due-task surfacing in the agenda. Background push stays out of scope (needs a push
  server); the Mentor's cadence (increment 8) is the out-of-app nudge.
- **Fix that fell out of verifying this**: the service worker precache now fetches with
  `cache: 'reload'` — before, a new SW version could install **stale files straight from
  the browser's HTTP cache** (observed live: a v14 cache holding an old config.js).
  Install runs once per release, so the cost is one clean fetch per bump.

19 new self-test assertions (cadence math, due logic across daily/weekly/N-per-week,
adherence + combined progress, no-ETA-until-a-milestone-falls, overdue detection and
clearing, agenda integration incl. done-state, the goalStep trial, export/import
round-trip incl. legacy backups without goals) — `node tools/selftest.js` →
**262 passed, 0 failed**.

## Increment 8 — The Mentor (agentic monitoring · scheduled counsel)

The journey now has a watcher. A scheduled agent reads the synced ledger, computes
honest metrics, reasons over them, and leaves counsel the app renders. SW → **v15**.

- **`tools/mentor-analyze.js`** — the deterministic layer (no personal data in this
  public repo; it only computes). Loads a `backup.json`, reuses the real engine the
  same way `selftest.js` does, and emits metrics JSON: full record (clean/broken/
  unlogged, clean rate, streak, shields), **real danger hours from urge timestamps**,
  7-vs-7-day trends (mood/sleep/steps/breath), nutrition adherence + protein rate,
  **meter calibration notes** (pegged/starved counts → `maxPerWindow` suggestions),
  per-ambition progress + ETA, tonight's risk forecast, the weekly prophecy.
  CLI: `node tools/mentor-analyze.js backup.json [asOf]` · also `require()`-able.
- **Scheduled routine `rti-mentor`** (Claude scheduled task, daily 07:34): pulls
  `rti-data`, runs the analyzer, writes `mentor/insights.json` (strict schema:
  headline · weeklyFocus · wins · warnings · suggestions · goalNudges) + a
  `mentor/journey-report.md` (brief daily; **Sunday deep-dive**), commits.
  Writes ONLY under `mentor/`; exits quietly while no backup has been pushed yet.
  Runs while the Claude desktop app is open (missed runs fire on next launch).
- **The Mentor screen** (app): renders the pulled counsel with a freshness stamp
  ("counsel from N days ago", stale warning at 8+), every section optional, and the
  standing caveat — *association, not fate; the Mentor proposes, you decide*. A
  **Today teaser** appears when unseen counsel arrives (sha-tracked) and clears on
  reading. Reached from Today (🧙) — explains the sync prerequisite when unconfigured.

8 new self-test assertions (analyzer rejects non-backups; full-record read; clean
rate; urge counting; the real danger hour surfacing; flat-trend detection; foresight
and calibration presence) — `node tools/selftest.js` → **270 passed, 0 failed**.

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
