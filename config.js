/* =====================================================================
   Road to Immortal — CONFIG (single editable source of truth)
   ---------------------------------------------------------------------
   Everything tunable lives here. The engine reads these constants; it
   never hard-codes them. Edit ranks, meter weights, the nutrition plan,
   start/target dates and quotes here without touching logic.

   Nothing in this file is "truth" about the owner's progress — that is
   DERIVED from startDate + the daily logs (see engine.js). These are
   only the rules of the game.
   ===================================================================== */
(function (global) {
  'use strict';

  var CONFIG = {
    /* ---- Owner-set anchors (the ONLY two numbers the owner sets) ---- */
    // day 1 = startDate. Confirmed 2026-06-08 (so 2026-06-26 == day 19).
    defaultStartDate: '2026-06-08',
    // "The Immortal" date. Confirmed 2026-06-08 + 499 days == 2027-10-20 == day 500.
    defaultTargetDate: '2027-10-20',

    /* ---- Rank ladder (rename / re-space freely; logic reads this) ----
       Early ranks are tight on purpose: relapse risk is highest in week
       1-2, so frequent early wins matter most. */
    RANKS: [
      { name: 'The Awakening',       reach: 1,   note: 'the journey begins' },
      { name: 'Initiate',            reach: 3,   note: '' },
      { name: 'Acolyte',             reach: 7,   note: 'one week held' },
      { name: 'Squire',              reach: 11,  note: '' },
      { name: 'Knight',              reach: 14,  note: 'the order recognises you' },
      { name: 'Knight-Lieutenant',   reach: 21,  note: '' },
      { name: 'Knight-Captain',      reach: 30,  note: '' },
      { name: 'Knight-Champion',     reach: 60,  note: '' },
      { name: 'Champion of the Light',reach: 90, note: '' },
      { name: 'Commander',           reach: 120, note: '' },
      { name: 'Conqueror',           reach: 150, note: '' },
      { name: 'Marshal',             reach: 180, note: '' },
      { name: 'Field Marshal',       reach: 240, note: '' },
      { name: 'Grand Marshal',       reach: 300, note: '' },
      { name: 'High Overlord',       reach: 365, note: '' },
      { name: 'The Immortal',        reach: 500, note: 'the goal' }
    ],

    /* ---- Meter constants (starting values; all tunable) ----
       Meters are 0-100 "charge today" bars derived over a rolling
       window so they stay bounded and meaningful day to day.
       window = how many recent days feed a meter. */
    meters: {
      windowDays: 7,

      // CHI — breath / energy work (the signature meter).
      // raw = sum over window of (2*breathing + 1*meditation + 10*clean),
      // then * streakBonus, then dampened by relapses in window.
      chi: {
        perBreathingMin: 2,
        perMeditationMin: 1,
        perCleanDay: 10,
        streakBonusPer: 0.01,     // +0.01 per current streak day...
        streakBonusCap: 2.0,      // ...capped at 2.0x (i.e. +100 streak)
        relapseDampen: 0.7,       // on relapse, current Chi *= 0.7 (recoverable)
        maxPerWindow: 560         // raw value that == 100 on the bar
      },

      // VITALITY — body. Rolling over the window.
      vitality: {
        perThousandSteps: 1,      // steps/1000
        workoutDone: 15,
        cardioDone: 10,
        sleep7plus: 10,
        adherence80plus: 10,      // nutrition adherence >= 80%
        proteinHit: 10,           // protein target band reached
        maxPerWindow: 420
      },

      // WILLPOWER — discipline. Rolling over the window.
      willpower: {
        perCleanDay: 10,
        perUrgeResisted: 5,
        allTargetsDone: 5,
        maxPerWindow: 280
      },

      // PRESENCE / AURA — derived only, never logged.
      // 0.5*normalized clean streak + 0.5*normalized Chi.
      presence: {
        streakRefDays: 30         // streak that == 100 on the normalized half
      },

      // IMMORTAL INDEX — headline weighted average of the four meters.
      immortalIndex: { chi: 0.35, willpower: 0.25, vitality: 0.20, presence: 0.20 }
    },

    /* ---- Streak shield (section 8) ---- */
    shields: {
      perPerfectWeekDays: 7,      // 7 clean days in a row earns a shield
      maxStored: 2                // hold at most this many
    },

    /* ---- Today's default target checklist (editable in Settings) ----
       todayTargetsDone is an array of booleans matching this list. */
    dailyTargets: [
      'Stay clean (monk mode held)',
      'Energy / testicle breathing',
      'Meditate',
      'Move (steps / cardio)',
      'Hit protein',
      'Read one Codex line'
    ],

    /* ---- Sleep threshold for the Vitality bonus ---- */
    sleepGoalHrs: 7,

    /* ================= NUTRITION (6C) =================
       The owner's OWN 7-day cut plan. The app tracks ADHERENCE only.
       Never generate calorie targets/deficits or "eat less" prompts.

       planKcal / planProtein* are the SOURCE OF TRUTH (the plan's own
       day totals). Per-meal kcal/protein are EDITABLE ESTIMATES used so
       running "what's left" totals work — they are never exact.
       Meal tags drive the rule-checker. */
    nutrition: {
      dayTypes: {
        shift: { label: 'Shift Day', hint: '12hr, 10-15k steps',
                 planKcal: 2500, proteinLow: 175, proteinHigh: 185 },
        rest:  { label: 'Rest Day',  hint: 'recovery',
                 planKcal: 2150, proteinLow: 180, proteinHigh: 184 }
      },

      // meal keys are fixed: B Breakfast, L Lunch, S Snack, T Training, D Dinner
      mealOrder: [
        { key: 'B', label: 'Breakfast' },
        { key: 'L', label: 'Lunch' },
        { key: 'S', label: 'Snack' },
        { key: 'T', label: 'Training' },
        { key: 'D', label: 'Dinner' }
      ],

      // planKcal + planProtein are the authored day-totals (source of truth).
      // proteinLow/High = the day-type target band used for the protein-hit
      // check. Per-meal kcal/protein are editable estimates (owner can override
      // them per template in Settings) and are reconciled to sum to planProtein.
      templates: [
        { id: 'shiftA', dayType: 'shift', name: 'Shift A — Chicken',
          planKcal: 2500, planProtein: 185, proteinLow: 175, proteinHigh: 185,
          fattyDinner: false,
          meals: {
            B: { items: '3 eggs + 3 whites · 2 wholemeal · 10g butter · coffee', kcal: 500, protein: 37, tags: ['butter','eggs','bread'] },
            L: { items: '200g chicken (skin off) · 80g brown rice · veg', kcal: 650, protein: 58, tags: ['chicken','rice'] },
            S: { items: '200g 0% Greek yogurt · 80g berries · 25g almonds/walnuts', kcal: 320, protein: 24, tags: ['yogurt','berries','nuts'], nutsGrams: 25 },
            T: { items: '1 scoop whey · 1 banana', kcal: 230, protein: 25, tags: ['whey','banana'] },
            D: { items: '180g chicken (skin off) · 200g sweet potato · veg', kcal: 600, protein: 41, tags: ['chicken'] }
          } },
        { id: 'shiftB', dayType: 'shift', name: 'Shift B — Pork Curry',
          planKcal: 2520, planProtein: 178, proteinLow: 175, proteinHigh: 185,
          fattyDinner: true,
          meals: {
            B: { items: '3 eggs + 3 whites · 50g oats · coffee (no butter)', kcal: 460, protein: 36, tags: ['eggs','oats'] },
            L: { items: '200g chicken (skin off) · 80g brown rice · veg', kcal: 660, protein: 57, tags: ['chicken','rice'] },
            S: { items: '200g yogurt · 80g berries', kcal: 150, protein: 20, tags: ['yogurt','berries'] },
            T: { items: '1 scoop whey · 1 banana', kcal: 230, protein: 25, tags: ['whey','banana'] },
            D: { items: '180g pork (cap trimmed) · 1 tbsp olive oil (whole pot) · skim curry · 80g brown rice or 2 chapati · veg', kcal: 850, protein: 40, tags: ['pork-curry','olive-oil','fatty'] }
          } },
        { id: 'shiftC', dayType: 'shift', name: 'Shift C — Beef',
          planKcal: 2490, planProtein: 180, proteinLow: 175, proteinHigh: 185,
          fattyDinner: false,
          meals: {
            B: { items: '3 eggs + 3 whites · 2 wholemeal · 10g butter · coffee', kcal: 500, protein: 37, tags: ['butter','eggs','bread'] },
            L: { items: '200g beef (browned + drained) · 80g brown rice · veg', kcal: 700, protein: 56, tags: ['beef','rice'] },
            S: { items: '200g yogurt · 80g berries · 25g walnuts', kcal: 310, protein: 24, tags: ['yogurt','berries','nuts'], nutsGrams: 25 },
            T: { items: '1 scoop whey · 1 banana', kcal: 230, protein: 25, tags: ['whey','banana'] },
            D: { items: '100g dry lentils/dal · 150g chickpeas (cooked) · 1 chapati · veg', kcal: 750, protein: 38, tags: ['legumes'] }
          } },
        { id: 'shiftD', dayType: 'shift', name: 'Shift D — Salmon',
          planKcal: 2510, planProtein: 176, proteinLow: 175, proteinHigh: 185,
          fattyDinner: true,
          meals: {
            B: { items: '2 eggs + 4 whites · 50g oats · coffee (no butter)', kcal: 470, protein: 33, tags: ['eggs','oats'] },
            L: { items: '200g chicken (skin off) · 80g brown rice · veg', kcal: 700, protein: 60, tags: ['chicken','rice'] },
            S: { items: '200g yogurt · 80g berries', kcal: 150, protein: 20, tags: ['yogurt','berries'] },
            T: { items: '1 scoop whey · 1 banana', kcal: 230, protein: 25, tags: ['whey','banana'] },
            D: { items: '180g salmon grilled/baked · 200g sweet potato · veg', kcal: 760, protein: 38, tags: ['salmon','fatty'] }
          } },
        { id: 'restA', dayType: 'rest', name: 'Rest A — Bream Coconut Stew',
          planKcal: 2150, planProtein: 182, proteinLow: 180, proteinHigh: 184,
          fattyDinner: false,
          meals: {
            B: { items: '2 eggs + 4 whites · 50g oats · coffee', kcal: 450, protein: 34, tags: ['eggs','oats'] },
            L: { items: '200g silver bream · 80g brown rice · veg', kcal: 600, protein: 50, tags: ['fish','lean-fish','rice'] },
            S: { items: '200g yogurt · 80g berries', kcal: 170, protein: 22, tags: ['yogurt','berries'] },
            T: { items: '1 scoop whey', kcal: 130, protein: 24, tags: ['whey'] },
            D: { items: '200g bream · 100ml light coconut milk (measured) · 60g brown rice · veg', kcal: 800, protein: 52, tags: ['fish','lean-fish','coconut'], coconutMl: 100 }
          } },
        { id: 'restB', dayType: 'rest', name: 'Rest B — Chicken',
          planKcal: 2130, planProtein: 184, proteinLow: 180, proteinHigh: 184,
          fattyDinner: false,
          meals: {
            B: { items: '3 eggs + 3 whites · 50g oats · 80g berries · coffee', kcal: 520, protein: 37, tags: ['eggs','oats','berries'] },
            L: { items: '200g chicken (skin off) · 1 wholemeal · veg', kcal: 560, protein: 60, tags: ['chicken','bread'] },
            S: { items: '200g yogurt · 1 apple', kcal: 230, protein: 20, tags: ['yogurt'] },
            T: { items: '1 scoop whey', kcal: 130, protein: 24, tags: ['whey'] },
            D: { items: '180g chicken (skin off) · 150g sweet potato · veg', kcal: 600, protein: 43, tags: ['chicken'] }
          } },
        { id: 'restC', dayType: 'rest', name: 'Rest C — Bream + Beef',
          planKcal: 2160, planProtein: 183, proteinLow: 180, proteinHigh: 184,
          fattyDinner: false,
          meals: {
            B: { items: '2 eggs + 4 whites · 50g oats · coffee', kcal: 460, protein: 34, tags: ['eggs','oats'] },
            L: { items: '180g beef (browned + drained) · 80g brown rice · veg', kcal: 700, protein: 56, tags: ['beef','rice'] },
            S: { items: '200g yogurt · 80g berries · 25g walnuts', kcal: 320, protein: 25, tags: ['yogurt','berries','nuts'], nutsGrams: 25 },
            T: { items: '1 scoop whey', kcal: 130, protein: 24, tags: ['whey'] },
            D: { items: '200g bream grilled · 1 wholemeal · veg', kcal: 450, protein: 44, tags: ['fish','lean-fish','bread'] }
          } }
      ],

      supplements: [
        { id: 'creatine', label: 'Creatine 5g' },
        { id: 'd3', label: 'Vitamin D3 (2,000-4,000 IU)' },
        { id: 'whey', label: 'Whey (in plan)' }
      ],

      // limits used by the rule-checker
      limits: { nutsGramsMax: 25, coconutMlMax: 100, walkOffsetKcal: 250 },

      // optional two-tier shopping list
      shopping: {
        monthly: ['Frozen berries', 'Oats', 'Brown rice', 'Almonds + walnuts',
                  'Wholemeal bread', 'Tinned lentils + chickpeas', 'Light coconut milk', 'Olive oil'],
        weekly: ['Eggs', '0% Greek yogurt', "Week's meat & fish (chicken, beef, pork, salmon, bream)",
                 'Green veg', 'Bananas', 'Apples']
      }
    },

    /* ---- Backup reminder cadence ---- */
    backup: { remindEveryDays: 7 },

    /* ---- Ascension / Energy Bank (increment 2) ----
       Correlation between Chi and outcomes stays LOCKED until there is
       enough real data to mean anything. All thresholds tunable. */
    ascension: {
      correlationLock: { minDay: 60, minOppDays: 15, minSignalDays: 10 }
    },

    /* ---- Photo measurement module (increment 2, Module A) ---- */
    photos: {
      maxLongEdge: 1080,          // downscale captures to this before storing
      jpegQuality: 0.8,
      weeklyDays: 7,              // a real "trend" read needs photos >= this many days apart
      frameGate: { maxYawDeg: 10, maxPitchDeg: 10, maxSmile: 0.25 }, // near-frontal, neutral
      // vendored MediaPipe assets (offline; see /vendor/mediapipe)
      mediapipe: {
        wasmDir: './vendor/mediapipe/wasm',
        bundle: './vendor/mediapipe/vision_bundle.mjs',
        faceModel: './vendor/mediapipe/face_landmarker.task',
        poseModel: './vendor/mediapipe/pose_landmarker_lite.task',
        segModel: './vendor/mediapipe/selfie_segmenter.tflite'
      }
    },

    /* ---- Module B (cloud AI interpreter) — OFF, spec-only placeholder ---- */
    cloudInterpreter: { enabled: false },

    /* ================= QUOTES & CODEX =================
       ALL original / paraphrased. No copyrighted passages.
       {day},{streak},{rank},{next},{toNext},{index} are filled from
       live stats at render time. */
    quotes: {
      daily: [
        'The body kept is a temple lit from within.',
        'Stillness is not weakness; it is the bow drawn before the arrow.',
        'Every urge refused is a coin minted in the treasury of the self.',
        'You are not resisting pleasure. You are choosing a larger one.',
        'Day {day}. The man you are becoming is watching how you spend tonight.',
        'Discipline is freedom wearing armour.',
        'The flame you do not spend becomes the light others feel.',
        'Hold the line and the line becomes a wall; hold the wall and it becomes a fortress.',
        'What you guard quietly, the world meets loudly.',
        'A {streak}-day streak is not a number. It is a new nervous system.',
        'Master the small hour and the great years take care of themselves.',
        'The river that keeps its banks carves canyons.',
        'Silence the craving and you will hear your own power humming.',
        'You do not rise to the moment; you fall to your training. Train.',
        'The {rank} does not bargain with the wave. He breathes and lets it break.',
        'Energy hoarded is destiny funded.',
        'Comfort is a small god. Do not kneel.',
        'The strongest spell is a kept promise to yourself.',
        'Tonight is one page. Write it so tomorrow can be proud.',
        'Become so rooted that storms feel like weather, not war.'
      ],
      recovery: [
        'A fall is data, not a verdict. Read it, then rise.',
        'The streak broke; the man did not. Begin again, wiser.',
        'Shame is the relapse after the relapse. Skip it. Just continue.',
        'You kept the history. That is proof you are still in the fight.',
        'The wave took one night. It does not get the morning.',
        'Compassion now, discipline next. In that order, both grow.',
        'Even the river floods. It does not abandon its course.',
        'One slip does not unspend the days you banked. Walk on.',
        'The Chi dimmed; it did not die. Breathe it back.',
        'Forgive the hand, hold the vow. Tomorrow is still yours.'
      ],
      dangerWindow: [
        'It is the hour the wave likes. You already know its name.',
        'Late and alone is the old trap. Stand up. Breathe. Move the body.',
        'The craving is loudest right before it leaves. Outlast it 90 seconds.',
        'This is the window. Win here and the whole day was won.',
        'Put the screen down. The hour will pass; the pride will stay.',
        'You have beaten this exact moment before. Be the man who does it again.'
      ],
      // shown as "what you'd miss" — uses live stats
      miss: [
        'Day {day}, a {streak}-day streak, and {toNext} from {next}. Do not hand it back.',
        'You are {index}% charged today. One night does not get to spend all of it.',
        'You climbed to {rank}. The fall from here is longer than it feels.',
        '{toNext} days to {next}. That close. Breathe and keep it.'
      ],
      // Codex: presence & self-mastery — original, dark-academia.
      // Framed as becoming magnetic THROUGH self-mastery, never tactics.
      codex: [
        { title: 'Abundance', body: 'Neediness is a leak. Seal it by building a life so full that no single person can flood or drain it. Magnetism is overflow, never thirst.' },
        { title: 'Non-Attachment', body: 'Want everything; cling to nothing. The one who can walk away calmly is the one rooms turn toward. Outcome-blindness is a kind of power.' },
        { title: 'The Slow Voice', body: 'Hurry signals fear. Speak slower than the room, move slower than the wave. Calm is read as depth, and depth is read as worth.' },
        { title: 'Eyes That Hold', body: 'A gaze that does not flinch says "I am at home in myself." Presence is mostly the refusal to perform discomfort.' },
        { title: 'Stillness Under Pressure', body: 'The stoic does not feel less; he is moved less. Let the urge, the insult, the temptation arrive — and answer none of them on reflex.' },
        { title: 'Self-Sourced Worth', body: 'Borrow your value from no one and it can be taken by no one. Validation sought is a loan at ruinous interest.' },
        { title: 'The Closed Circuit', body: 'Energy you do not discharge does not vanish — it accumulates as charge. Conserve it and people will feel a current they cannot name.' },
        { title: 'Frame', body: 'You do not enter other people\'s weather; you bring your own. Hold your standard quietly and the room calibrates to you.' },
        { title: 'Less, Said Better', body: 'The over-explainer begs to be believed. State once, clearly, then let silence do the convincing.' },
        { title: 'Discipline as Identity', body: 'Do not chase motivation; build a self for whom the right thing is simply what you do. Repetition is how a vow becomes a face.' },
        { title: 'The Long Game', body: 'Charisma is not a trick performed tonight; it is the residue of a thousand kept promises. Become magnetic by becoming trustworthy to yourself.' },
        { title: 'Rooted, Not Rigid', body: 'Be so anchored that you can bend with grace. Flexibility from strength reads as confidence; flexibility from fear reads as collapse.' }
      ]
    }
  };

  global.RTI_CONFIG = CONFIG;
})(typeof window !== 'undefined' ? window : this);
