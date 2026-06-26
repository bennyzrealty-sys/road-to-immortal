/* =====================================================================
   Road to Immortal — PHOTOS (increment 2, Module A)
   On-device, offline photo measurement. MediaPipe Tasks Vision is loaded
   from VENDORED assets (./vendor/mediapipe) — never a CDN. Nothing leaves
   the device: photos live in IndexedDB, separate from the main export.

   VALIDITY RULE (the thing that makes this real): every tracked metric is
   a RATIO (or normalized by inter-ocular distance), so distance-to-camera
   and image size cancel out. A closer photo of the same face must produce
   the same numbers. Absolute pixel widths are never tracked.
   ===================================================================== */
(function (global) {
  'use strict';
  var CFG = global.RTI_CONFIG;

  /* ---------------- IndexedDB store (separate from localStorage) ------- */
  var DB = 'rti_photos_db', STORE = 'photos', VER = 1, _db = null;
  function open() {
    return new Promise(function (res, rej) {
      if (_db) return res(_db);
      var rq = indexedDB.open(DB, VER);
      rq.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains(STORE)) {
          var os = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
          os.createIndex('date', 'date', { unique: false });
          os.createIndex('type', 'type', { unique: false });
        }
      };
      rq.onsuccess = function () { _db = rq.result; res(_db); };
      rq.onerror = function () { rej(rq.error); };
    });
  }
  function tx(mode) { return open().then(function (db) { return db.transaction(STORE, mode).objectStore(STORE); }); }
  function addPhoto(rec) { return tx('readwrite').then(function (os) { return new Promise(function (r, j) { var q = os.add(rec); q.onsuccess = function () { r(q.result); }; q.onerror = function () { j(q.error); }; }); }); }
  function allPhotos() { return tx('readonly').then(function (os) { return new Promise(function (r, j) { var q = os.getAll(); q.onsuccess = function () { r((q.result || []).sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id; })); }; q.onerror = function () { j(q.error); }; }); }); }
  function removePhoto(id) { return tx('readwrite').then(function (os) { return new Promise(function (r, j) { var q = os.delete(id); q.onsuccess = function () { r(true); }; q.onerror = function () { j(q.error); }; }); }); }
  function clearPhotos() { return tx('readwrite').then(function (os) { return new Promise(function (r, j) { var q = os.clear(); q.onsuccess = function () { r(true); }; q.onerror = function () { j(q.error); }; }); }); }

  /* ---------------- geometry helpers (pure) ---------------------------- */
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function angleDeg(a, b, c) { // angle at b, in degrees
    var v1 = { x: a.x - b.x, y: a.y - b.y }, v2 = { x: c.x - b.x, y: c.y - b.y };
    var dot = v1.x * v2.x + v1.y * v2.y;
    var m = Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y) || 1;
    return Math.acos(Math.max(-1, Math.min(1, dot / m))) * 180 / Math.PI;
  }
  function bs(blend, name) {
    if (!blend || !blend.categories) return 0;
    for (var i = 0; i < blend.categories.length; i++) if (blend.categories[i].categoryName === name) return blend.categories[i].score;
    return 0;
  }

  /* ---------------- FACE metrics (all ratios → scale-invariant) -------- */
  // lm = array of {x,y} in a single consistent unit (pixels). FaceMesh 478.
  function faceMetrics(lm) {
    var io = dist(lm[468], lm[473]);          // inter-ocular (iris centres)
    var bizygomatic = dist(lm[234], lm[454]); // cheekbone width
    var bigonial = dist(lm[172], lm[397]);    // jaw-angle width
    // fWHR uses true pixel width over true pixel height. Landmarks arrive in
    // real pixels (x*imgW, y*imgH), so width(px)/height(px) is the face's real
    // proportion — invariant to camera distance AND image aspect ratio (the
    // per-axis scale is the correct normalized->pixel conversion, not a leak).
    var faceHeight = Math.abs(lm[0].y - lm[168].y); // upper lip -> glabella
    var cheek = dist(lm[50], lm[280]);        // mid-cheek width
    return {
      interOcular: io,
      jawRatio: bigonial / bizygomatic,       // jaw definition (lower = tapered)
      fWHR: bizygomatic / (faceHeight || 1),  // facial width-to-height
      gonialAngleDeg: angleDeg(lm[152], lm[172], lm[234]), // jaw-corner sharpness
      cheekFullness: cheek / bizygomatic,     // proxy (lower ~ hollower) — approximate
      jawWidthNorm: bigonial / (io || 1),     // also normalized by inter-ocular
      faceWidthNorm: bizygomatic / (io || 1)
    };
  }
  // Frame quality gate — near-frontal, neutral, eyes open. Heuristic yaw/pitch
  // (approximate) + blendshape smile/blink (reliable).
  function frameQuality(lm, blend, gate) {
    gate = gate || CFG.photos.frameGate;
    var biz = dist(lm[234], lm[454]) || 1, nose = lm[1];
    var yawDeg = ((dist(lm[263], nose) - dist(lm[33], nose)) / biz) * 100;
    var faceH = Math.abs(lm[152].y - lm[10].y) || 1;
    var pitchDeg = (((nose.y - lm[168].y) / faceH) - 0.34) * 120;
    var smile = (bs(blend, 'mouthSmileLeft') + bs(blend, 'mouthSmileRight')) / 2;
    var blink = Math.max(bs(blend, 'eyeBlinkLeft'), bs(blend, 'eyeBlinkRight'));
    var eyesOpen = blink < 0.5;
    var reasons = [];
    if (Math.abs(yawDeg) > gate.maxYawDeg) reasons.push('face the camera straight on');
    if (Math.abs(pitchDeg) > gate.maxPitchDeg) reasons.push('level your chin');
    if (smile > gate.maxSmile) reasons.push('keep a neutral expression');
    if (!eyesOpen) reasons.push('eyes open');
    return { yawDeg: yawDeg, pitchDeg: pitchDeg, smile: smile, eyesOpen: eyesOpen, ok: reasons.length === 0, reasons: reasons };
  }

  /* ---------------- BODY metrics (ratios → scale-invariant) ------------ */
  // pose = array of {x,y} (pixels). waistPx optional (from segmentation).
  function bodyMetrics(pose, waistPx) {
    var sh = dist(pose[11], pose[12]); // shoulders
    var hip = dist(pose[23], pose[24]);
    return {
      shoulderHip: sh / (hip || 1),
      shoulderWaist: waistPx ? sh / waistPx : null // ratios only — no absolute px tracked
    };
  }

  /* ---------------- MediaPipe lazy init (vendored, offline) ------------ */
  var _vision = null, _face = null, _pose = null, _seg = null, _loading = null;
  function abs(p) { return new URL(p, document.baseURI).href; }
  function ensure(onProgress) {
    if (_face) return Promise.resolve(true);
    if (_loading) return _loading;
    var mp = CFG.photos.mediapipe;
    _loading = (async function () {
      if (onProgress) onProgress('loading vision runtime…');
      var mod = await import(abs(mp.bundle));
      _vision = mod;
      var fileset = await mod.FilesetResolver.forVisionTasks(abs(mp.wasmDir));
      if (onProgress) onProgress('loading face model…');
      _face = await mod.FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: abs(mp.faceModel) },
        runningMode: 'IMAGE', numFaces: 1,
        outputFaceBlendshapes: true, outputFacialTransformationMatrixes: false
      });
      if (onProgress) onProgress('loading body model…');
      _pose = await mod.PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: abs(mp.poseModel) }, runningMode: 'IMAGE', numPoses: 1
      });
      try {
        _seg = await mod.ImageSegmenter.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: abs(mp.segModel) }, runningMode: 'IMAGE', outputCategoryMask: true, outputConfidenceMasks: false
        });
      } catch (e) { _seg = null; } // segmentation is optional (waist is low-confidence anyway)
      return true;
    })();
    return _loading;
  }

  // measure a face from a canvas/image. returns {ok, metrics, quality} or {error}
  function measureFace(source, w, h) {
    return ensure().then(function () {
      var res = _face.detect(source);
      if (!res.faceLandmarks || !res.faceLandmarks.length) return { error: 'No face detected — fill the frame and use even light.' };
      var lmN = res.faceLandmarks[0];
      var lm = lmN.map(function (p) { return { x: p.x * w, y: p.y * h }; }); // -> pixels
      var blend = res.faceBlendshapes && res.faceBlendshapes[0];
      return { ok: true, metrics: faceMetrics(lm), quality: frameQuality(lm, blend, CFG.photos.frameGate) };
    });
  }
  // measure a body from a canvas/image. returns {ok, metrics} (waist low-confidence)
  function measureBody(source, w, h) {
    return ensure().then(function () {
      var res = _pose.detect(source);
      if (!res.landmarks || !res.landmarks.length) return { error: 'No body detected — step back so shoulders and hips are in frame.' };
      var poseN = res.landmarks[0];
      var pose = poseN.map(function (p) { return { x: p.x * w, y: p.y * h }; });
      var waistPx = null;
      if (_seg) {
        try {
          var sres = _seg.segment(source);
          var mask = sres.categoryMask;
          if (mask) {
            var arr = mask.getAsUint8Array(), mw = mask.width, mh = mask.height;
            var shY = Math.round((pose[11].y + pose[12].y) / 2 / h * mh);
            var hipY = Math.round((pose[23].y + pose[24].y) / 2 / h * mh);
            var y0 = Math.min(shY, hipY) + Math.round((Math.abs(hipY - shY)) * 0.25); // mid-torso band
            var y1 = Math.max(shY, hipY) - Math.round((Math.abs(hipY - shY)) * 0.1);
            var minW = Infinity;
            for (var y = y0; y <= y1; y++) {
              var left = -1, right = -1;
              for (var x = 0; x < mw; x++) { if (arr[y * mw + x] !== 0) { if (left < 0) left = x; right = x; } }
              if (left >= 0) { var wpx = (right - left) / mw * w; if (wpx < minW) minW = wpx; }
            }
            if (minW < Infinity && minW > 0) waistPx = minW;
            if (mask.close) mask.close();
          }
        } catch (e) { waistPx = null; }
      }
      return { ok: true, metrics: bodyMetrics(pose, waistPx), waistConfident: waistPx != null };
    });
  }

  /* ---------------- automatic comparison + rules-based verdict --------- */
  // pct change of a "higher is better tapered" metric. For jawRatio LOWER is
  // sharper, so we report direction in words, not signed noise.
  function pctChange(a, b) { if (a == null || b == null || a === 0) return null; return (b - a) / a * 100; }

  // intervalSummary: { workouts, cardioMin, adherencePct, fatTrend ('down'|'flat'|'up'|null), days }
  // daysApart: integer; baselineMetrics optional.
  function verdict(prev, curr, base, summary, daysApart, kind) {
    if (!curr) return { tone: 'info', text: 'Could not measure this photo — re-shoot in even light.' };
    if (!prev) return { tone: 'info', text: 'Baseline captured. From here the app compares every new ' + kind + ' photo against this and the last one — automatically.' };
    var noise = daysApart < CFG.photos.weeklyDays;
    var lines = [];
    var consistentCardio = summary && summary.cardioMin >= 90; // ~3x/wk-ish over the interval
    if (kind === 'face') {
      var dJaw = pctChange(prev.jawRatio, curr.jawRatio);     // negative = more tapered
      var dCheek = pctChange(prev.cheekFullness, curr.cheekFullness); // negative = hollower
      var sharper = dJaw != null && dJaw <= -1.5;
      var fuller = dJaw != null && dJaw >= 1.5;
      var moved = sharper || fuller || (dCheek != null && Math.abs(dCheek) >= 2);
      if (noise) {
        lines.push('Less than a week since the last shot — treat this as the noise range, not a trend point. Faces shift daily with sleep and water.');
      } else if (sharper && consistentCardio) {
        lines.push('Jaw reads sharper vs. ' + daysApart + ' days ago, tracking with your consistent cardio — green flag.');
      } else if (sharper) {
        lines.push('Jaw reads sharper, though training was light this stretch — could be real or measurement noise. Re-shoot in similar light to confirm.');
      } else if (!moved && consistentCardio && daysApart >= 21) {
        lines.push('No measurable facial change in ' + daysApart + ' days despite consistent cardio. Likely water / measurement noise — re-shoot in similar light. If it persists, see the stall rule in Nutrition.');
      } else if (fuller) {
        lines.push('Face reads a touch fuller than before — often water or light. Watch the weekly trend, not this one frame.');
      } else {
        lines.push('Possible change, but too few comparable photos to be sure yet. Keep the weekly cadence.');
      }
    } else {
      var dSH = pctChange(prev.shoulderHip, curr.shoulderHip); // higher = more V
      if (noise) lines.push('Under a week apart — informational only, not a trend point.');
      else if (dSH != null && dSH >= 1.5) lines.push('V-taper (shoulder ÷ hip) up vs. ' + daysApart + ' days ago' + (consistentCardio ? ', alongside steady training.' : '.'));
      else if (dSH != null && dSH <= -1.5) lines.push('V-taper down slightly — posture/framing can cause this; trust the weekly trend.');
      else lines.push('No clear body-ratio change yet. Keep shots framed the same and weekly.');
      lines.push('Body ratios are lower-confidence than face metrics — pose and framing move them.');
    }
    return { tone: noise ? 'info' : 'amber', text: lines.join(' '), daysApart: daysApart, noise: noise };
  }

  /* ---------------- capture helpers ------------------------------------ */
  // draw a video/image onto a downscaled canvas; returns {canvas, w, h}
  function toCanvas(source, srcW, srcH) {
    var max = CFG.photos.maxLongEdge, scale = Math.min(1, max / Math.max(srcW, srcH));
    var w = Math.round(srcW * scale), h = Math.round(srcH * scale);
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(source, 0, 0, w, h);
    return { canvas: c, w: w, h: h };
  }
  function canvasToBlob(canvas) {
    return new Promise(function (res) { canvas.toBlob(function (b) { res(b); }, 'image/jpeg', CFG.photos.jpegQuality); });
  }

  /* ---------------- separate photo export / import --------------------- */
  function blobToDataURL(b) { return new Promise(function (r) { var fr = new FileReader(); fr.onload = function () { r(fr.result); }; fr.readAsDataURL(b); }); }
  function dataURLToBlob(d) {
    if (!d || d.indexOf(',') < 0) throw new Error('missing image data');
    var p = d.split(','), mm = p[0].match(/:(.*?);/), m = mm ? mm[1] : 'image/jpeg';
    var bin = atob(p[1]), n = bin.length, u = new Uint8Array(n); while (n--) u[n] = bin.charCodeAt(n);
    return new Blob([u], { type: m });
  }
  async function exportJourney() {
    var ps = await allPhotos(), out = [];
    for (var i = 0; i < ps.length; i++) {
      var p = ps[i], copy = {}; for (var k in p) if (k !== 'blob') copy[k] = p[k];
      copy.image = await blobToDataURL(p.blob);
      out.push(copy);
    }
    return { app: 'road-to-immortal-photos', schema: 1, exportedAt: new Date().toISOString(), photos: out };
  }
  async function importJourney(obj) {
    if (!obj || obj.app !== 'road-to-immortal-photos' || !Array.isArray(obj.photos)) return { ok: false, error: 'Not a Road to Immortal photo-journey file.' };
    var added = 0;
    for (var i = 0; i < obj.photos.length; i++) {
      var p = obj.photos[i]; if (!p.image || p.image.indexOf(',') < 0) continue; // skip malformed
      var rec = {}; for (var k in p) if (k !== 'image' && k !== 'id') rec[k] = p[k];
      rec.blob = dataURLToBlob(p.image);
      await addPhoto(rec); added++;
    }
    return { ok: true, count: added };
  }

  global.RTI_PHOTO = {
    // store
    add: addPhoto, all: allPhotos, remove: removePhoto, clear: clearPhotos,
    // models / measure
    ensure: ensure, measureFace: measureFace, measureBody: measureBody, isReady: function () { return !!_face; },
    // pure (testable)
    faceMetrics: faceMetrics, bodyMetrics: bodyMetrics, frameQuality: frameQuality, verdict: verdict,
    // capture + export
    toCanvas: toCanvas, canvasToBlob: canvasToBlob,
    exportJourney: exportJourney, importJourney: importJourney,
    blobToDataURL: blobToDataURL
  };
})(typeof window !== 'undefined' ? window : this);
