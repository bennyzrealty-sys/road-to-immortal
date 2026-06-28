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

    /* =====================================================================
       INCREMENT 3 — THE ASCENDANT
       Proactive coaching, the Immortal-Power / attraction visualisation,
       the stage ladder and the body-language field codex. All tunable;
       the engine reads these, it never hard-codes them.
       ===================================================================== */

    /* ---- Coach: time-aware proactive prompts ----
       Boundaries are LOCAL hours [from, to). The night phase wraps midnight.
       mealWindows say which meal the app should nudge for around a given hour. */
    coach: {
      phases: [
        { id: 'morning',   from: 5,  to: 11, greet: 'Good morning',  line: 'Set the shape of the day before it sets you.' },
        { id: 'midday',    from: 11, to: 15, greet: 'Midday',        line: 'Halfway. Fuel it, move it, keep the line.' },
        { id: 'afternoon', from: 15, to: 18, greet: 'Afternoon',     line: 'The dip hour. A short walk and the breath reset it.' },
        { id: 'evening',   from: 18, to: 22, greet: 'Evening',       line: 'Close the day clean. Log it honestly while it’s fresh.' },
        { id: 'night',     from: 22, to: 5,  greet: 'Late',          line: 'The danger hour. Alone + screen + tired is the old trap.' }
      ],
      // hour windows [from,to) used to decide which meal to nudge for
      mealWindows: { B: [5, 10], L: [11, 15], S: [15, 17], T: [16, 20], D: [18, 23] }
    },

    /* ---- Aura: how the headline "power" + "magnetism" numbers are built ----
       Both are 0-100. Power leans on the PERMANENCE of the streak (it grows
       slowly, stage after stage, and a relapse genuinely discharges it).
       Magnetism leans on Presence. Neither is a promise about other people —
       both are read as your own charge, derived from your own data. */
    aura: {
      powerStreakRefDays: 120,   // clean streak that maxes the "permanence" half
      chiBankRef: 9000,          // banked lifetime Chi that reads as "full"
      powerWeights:  { streak: 0.50, index: 0.30, bank: 0.20 },
      magnetWeights: { presence: 0.40, streak: 0.25, chi: 0.20, willpower: 0.15 }
    },

    /* ---- Stages: keyed by current CLEAN STREAK (reach = min streak days) ----
       "body" = what tends to shift INSIDE you at this stage.
       "cues" = the attraction signals you MAY begin to notice — tendencies,
       not promises, and heavily confounded by your own rising initiative. */
    stages: [
      { reach: 0,   name: 'The Fog',              power: '0–8%',
        body: 'The old wiring is still loud. Restlessness, scattered focus, the reflex to reach for the screen. Nothing external yet — this stage is entirely inward.',
        cues: [ 'Expect no signals from others — that is normal, not failure.',
                'Your only job is the first clean 72 hours. Watch the inside, not the room.' ] },
      { reach: 3,   name: 'First Spark',          power: '8–18%',
        body: 'Sleep deepens. Mornings come a little sharper. Brief surges of restless energy you don’t yet know where to put.',
        cues: [ 'You hold eye contact half a second longer without deciding to.',
                'You start noticing more than you feel noticed — that order flips later.' ] },
      { reach: 7,   name: 'The Clearing',         power: '18–32%',
        body: 'A week held. Mental fog lifts, the voice steadies, the reflexive phone-reach quietens.',
        cues: [ 'The occasional unprompted second glance.',
                'People finish their sentence while still looking at you.',
                'You stop performing nervousness — stillness starts to feel available.' ] },
      { reach: 14,  name: 'Rising Charge',        power: '32–48%',
        body: 'Posture opens on its own. Resting tension drops. Eyes read brighter in the mirror.',
        cues: [ 'Brief held glances become more common.',
                'Someone re-enters your path without an obvious errand.',
                'Group laughter angles a little toward you. (Noticing ≠ proof — keep it honest.)' ] },
      { reach: 30,  name: 'Magnetic Field',       power: '48–66%',
        body: 'A steadier baseline energy. Calmer under pressure. Slower speech starts to feel natural rather than forced.',
        cues: [ 'Double-takes — the look, the look away, the look back.',
                'Proximity: someone drifts nearer with no task to do there.',
                'Preening near you — a hand to the hair, a collar straightened, posture adjusted.' ] },
      { reach: 60,  name: 'The Presence',         power: '66–80%',
        body: 'Stillness reads as depth. The hunger for validation quietens — you stop auditioning.',
        cues: [ 'Sustained eye contact held across a room.',
                'The look back after passing — head and half-turn, into your line of sight.',
                'Conversations soften and slow in your orbit.' ] },
      { reach: 90,  name: 'Gravity',              power: '80–92%',
        body: 'Rooted. Largely unbothered. The conserved energy feels like a current you simply carry.',
        cues: [ 'People orient toward you unprompted — feet and torso turn your way.',
                'You are approached rather than always approaching.',
                'Silences feel comfortable instead of needing to be filled.' ] },
      { reach: 180, name: 'The Immortal Current', power: '92–100%',
        body: 'The self you were building is now just your face. Calm precedes you into a room.',
        cues: [ 'Presence registers before you speak.',
                'You read a situation early and respond instead of reacting.',
                'Attention arrives quietly and you no longer chase it — that is the whole point.' ] }
    ],

    /* ---- Signals: the body-language field codex ----
       Framed as AWARENESS and calibration, never as tactics. Signals are
       probabilistic, context-bound, and easy to misread. Politeness is not
       attraction; avoidance is not a challenge. Respect and consent first. */
    signals: {
      intro: 'A normal glance is brief and incidental — eyes pass over you the way they pass over a lamp or a doorway, then move on, with no second visit and no change in what the person was doing. Most looks mean nothing. What follows are patterns that, repeated and in context, sometimes mean more. Read them to calibrate — never to corner.',
      // each: title, look (what it looks like), mean (what it can mean, with the ambiguity), carry (how to respond)
      entries: [
        { title: 'The baseline glance',
          look: 'A short look that lands and leaves. No return, no shift in posture, no change in their activity.',
          mean: 'Almost always nothing — ambient awareness of another person in the space. Logging these stops you over-reading the rare real signal.',
          carry: 'Notice it, file it as neutral, carry on. Over-reading a baseline glance is the most common mistake.' },
        { title: 'The held glance',
          look: 'Eye contact that lasts a beat longer than the room’s rhythm — half a second past comfortable.',
          mean: 'Interest, curiosity, or simply that you stood out somehow. One held glance is weak evidence; a pattern of them is stronger.',
          carry: 'A calm, brief smile and then look away first. Don’t escalate a single glance into a story.' },
        { title: 'The double-take',
          look: 'A look, then away, then a second look back — the head (and often half the upper body) turning to bring you back into view after you’ve entered their field.',
          mean: 'The second look is the informative one. The eyes returning of their own accord, especially with a half-turn of the torso, suggests genuine attention rather than reflex. Still: it can be recognition, or you reminded them of someone.',
          carry: 'Meet it once, warmly and briefly. If it repeats and the setting allows, a light, low-pressure opening is reasonable. One returned glance is not an invitation to pursue.' },
        { title: 'The look back after passing',
          look: 'After you’ve already walked past, a glance back over the shoulder.',
          mean: 'Looking back once you’re no longer in their natural sightline takes a small deliberate act — it weakly suggests you held some interest. It is still just one data point.',
          carry: 'If you catch it, a brief acknowledging look is plenty. Don’t turn it into a chase down the street — that reads as pressure, not confidence.' },
        { title: 'Proximity without an errand',
          look: 'Someone drifts into your area and lingers with no clear reason to be exactly there.',
          mean: 'Choosing to be near you can signal openness to contact. Or the coffee really is over there. Context decides.',
          carry: 'Stay relaxed and open in posture. Let them close the last of the distance sometimes; presence is patient.' },
        { title: 'Preening and self-grooming',
          look: 'A hand smoothing hair, a collar or sleeve adjusted, posture straightening — clustered around when you appear or look over.',
          mean: 'Often an unconscious tidy-up in the presence of someone they’re aware of. Reliable only as a cluster, near a trigger — not a lone gesture.',
          carry: 'Read it as warmth, not a green light by itself. Combine it with eye contact and orientation before you read much into it.' },
        { title: 'Feet and torso orientation',
          look: 'Where the toes and chest point. In a group, a subtle turn of the whole front toward you.',
          mean: 'We point our bodies at what holds our attention. It’s harder to fake than a face, which makes it one of the more honest tells.',
          carry: 'If the body turns toward you over time, attention is real. If it stays angled away while the face is polite, take the body’s answer.' },
        { title: 'Mirroring',
          look: 'They unconsciously echo your posture, pace, or gestures — you lean, they lean; you slow down, they slow.',
          mean: 'Mirroring tends to track rapport and comfort. It builds over a conversation rather than appearing instantly.',
          carry: 'A good sign the exchange is landing. Keep your own pace calm and grounded — they’re calibrating to you.' },
        { title: 'Self-soothing touch',
          look: 'Light touches to the neck, collarbone, wrist, or playing with a necklace — around you or while talking to you.',
          mean: 'Can mark interest and a little nervous energy. Can equally just be nerves, habit, or a cold room. Ambiguous on its own.',
          carry: 'Lower the pressure: warmth, ease, no intensity. If it’s nervous-interest, calm is what lets it open; if it’s discomfort, calm respects it.' },
        { title: 'The watcher at the edge',
          look: 'Someone keeps to the periphery of your view — half-hidden behind a group, a shelf, a phone — and looks over when they think you can’t see, then breaks away if you turn.',
          mean: 'This one is genuinely two-sided. It can be shy interest that hasn’t found its courage — OR someone keeping distance on purpose because they want space. Both look almost identical from outside.',
          carry: 'Do NOT seek them out, follow, or try to “catch” them watching. Stay open and easy where you are and let them choose to come into the open. If they keep withdrawing, that is an answer — respect it completely. Wanting to observe from a distance is not consent to be approached.' },
        { title: 'The too-studied ignore',
          look: 'A pointed, almost effortful not-looking — aware of exactly where you are while making a show of not noticing.',
          mean: 'Sometimes self-consciousness around someone they’ve clocked. Sometimes simply someone who wants to be left alone and is signalling it. Don’t flatter yourself into the first reading.',
          carry: 'Give space. If there’s real interest it will show in a softer, clearer signal later. Manufactured “tension” is not your job to resolve.' },
        { title: 'Reappearing in your orbit',
          look: 'You cross paths more than chance would explain — the same aisle, the same corner of the room, again.',
          mean: 'Repeated proximity can be a quiet way of creating chances to interact. It can also be a small shared space and pure coincidence.',
          carry: 'If it’s mutual and easy, a relaxed hello is fine. Never engineer the reverse — designing “coincidences” around someone is exactly the line not to cross.' },
        { title: 'Eye contact, smile, look down',
          look: 'Eyes meet, a small genuine smile, then the gaze drops downward (not away to the side).',
          mean: 'The downward break in particular is often read as warm and a little shy rather than dismissive. One of the more encouraging single clusters — still context-bound.',
          carry: 'Return the smile, hold your calm, and let a natural opening arrive. Warmth answered with warmth, no rush.' },
        { title: 'Voice and laughter in a group',
          look: 'In a group their voice brightens, they laugh a touch more, or angle their best lines toward you.',
          mean: 'Bidding for your attention within the safety of the group. Or they’re just an animated person. Watch whether it’s aimed or ambient.',
          carry: 'Acknowledge it without making them the centre of a spotlight they didn’t ask for. Easy, inclusive, unhurried.' }
      ],
      ethics: 'These are tendencies, not certainties — and your own rising confidence makes you initiate more, which manufactures “signals” all by itself (a confound, the same one this app flags everywhere). Read people to be considerate and well-calibrated, never to pressure, follow, surveil, or manufacture situations. A “no”, a turn away, or a withdrawal is a complete answer. The aim of every stage in this app is to become someone worth meeting — not to extract a reaction from anyone.'
    },

    /* ---- Daily Trial: one rotating challenge per local day ----
       `auto` trials are detected from the daily log via `metric` (+ optional
       `need`); `manual` trials are self-attested and stored in log.trial.
       The deterministic day-pick indexes into this array, so DO NOT reorder
       casually — it reshuffles which trial falls on which day. `hint` uses a
       {have} placeholder filled live by the UI for auto-trial progress. */
    trials: [
      // ---- auto-detected from the existing daily log ----
      { id: 'steps10k',   title: 'Ten Thousand',     auto: true, metric: 'steps',         need: 10000, desc: 'Walk 10,000 steps today.', hint: '{have} / 10,000 steps' },
      { id: 'breath30',   title: 'The Long Breath',  auto: true, metric: 'breathingMin',  need: 30,    desc: '30 minutes of energy / testicle breathing.', hint: '{have} / 30 min breathing' },
      { id: 'meditate20', title: 'Still Water',      auto: true, metric: 'meditationMin', need: 20,    desc: 'Meditate 20 minutes.', hint: '{have} / 20 min meditation' },
      { id: 'cardio20',   title: 'Move the Engine',  auto: true, metric: 'cardioMin',     need: 20,    desc: '20 minutes of cardio — get the blood moving.', hint: '{have} / 20 cardio min' },
      { id: 'protein',    title: 'Build the Temple', auto: true, metric: 'proteinHit',                 desc: 'Hit your protein target for the day.', hint: 'Log meals until the protein band is reached' },
      { id: 'allTargets', title: 'Full Slate',       auto: true, metric: 'allTargets',                 desc: 'Complete every one of today’s targets.', hint: 'Finish all targets on Today' },
      { id: 'sleep7',     title: 'The Deep Well',    auto: true, metric: 'sleepHrs',      need: 7,     desc: 'Log 7+ hours of sleep.', hint: 'Log sleep hours in the full log' },
      // ---- manual / self-attested ----
      { id: 'coldShower', title: 'The Cold Forge',   auto: false, desc: 'Take a cold shower — 30s minimum at the end.' },
      { id: 'sunlight',   title: 'First Light',      auto: false, desc: 'Get daylight on your face within 30 minutes of waking.' },
      { id: 'noPhone60',  title: 'The Quiet Hour',   auto: false, desc: '60 minutes with no phone — fully present.' },
      { id: 'read3',      title: 'Read the Codex',   auto: false, desc: 'Read three lines from the Codex and sit with one.' },
      { id: 'posture',    title: 'The Open Frame',   auto: false, desc: 'Hold open, grounded posture through one full conversation.' }
    ],

    /* ---- Movement: steps → distance → weight-aware calories ----
       A website can't read the phone's step sensor in the background (only a
       native app can), so the day's total is entered from the owner's own step
       counter; an in-app accelerometer "live walk" measures a session while
       open. Distance uses a height-derived stride; calories are weight-aware
       (cadence→MET for a timed session, distance-based for a daily total). */
    movement: {
      strideFactor: 0.414,        // stride(m) = heightCm * strideFactor / 100
      stepGoal: 10000,
      defaultHeightCm: 175,       // fallbacks only (with a "set it" nudge in the UI)
      defaultWeightKg: 75,
      kcalPerKgKm: 0.53,          // walking, weight-aware distance estimate
      // [upTo cadence (steps/min), MET]; first band whose upTo exceeds cadence wins
      metByCadence: [
        { upTo: 80, met: 2.8 }, { upTo: 100, met: 3.0 }, { upTo: 120, met: 4.3 },
        { upTo: 140, met: 5.0 }, { upTo: 999, met: 7.0 }
      ],
      // live-walk accelerometer peak-detector tunables (magnitude in m/s²)
      sensor: { threshold: 11.2, reArmFactor: 0.93, minStepMs: 270, smoothing: 0.4 }
    },

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
      // Dark codex — power OVER THE SELF, not over others. Original lines,
      // dark-academia flavour: non-neediness, frame, restraint, the quiet
      // edge of a man who wants nothing from the room. Never deception.
      dark: [
        'The man who needs nothing from the room is the one who ends up owning it.',
        'Silence is the loudest frame. Say less, mean more, and let them lean in.',
        'They feel your restraint before they can explain it — and restraint reads as power.',
        'Do not perform your value. Withhold it, and watch them come looking for what you hid.',
        'The one who can wait has already won. Urgency is the tell of the weaker hand.',
        'A want you can keep unspoken is a want you still control.',
        'Be unreadable, not cold. Mystery is a door left ajar — never a wall.',
        'Reaction is a leash. Master the pause and no one else gets to hold it.',
        'Real scarcity is not a trick you play; it is a life so full you are genuinely hard to reach.',
        'The calm man is assumed to know something. Let them keep assuming.',
        'Never chase. Become the thing that is chased, then forget you wanted it.',
        'Your attention is currency. Spend it like a king, not a beggar.',
        'What you have stopped needing can no longer be used against you.',
        'Composure under provocation is the rarest flex. Show only what you choose to show.',
        'Let them wonder. Certainty handed out for free is value thrown in the gutter.',
        'Detach from the outcome and the outcome stops being able to move you.',
        'The deepest power move is to be genuinely fine if it goes nowhere.',
        'Hold your standard quietly and the room re-calibrates to you, not you to it.'
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
