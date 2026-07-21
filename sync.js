/* =====================================================================
   Road to Immortal — SYNC (increment 6: The Bridge)
   ---------------------------------------------------------------------
   OPT-IN cloud sync of the export bundle to the owner's own PRIVATE
   GitHub repo, over the GitHub Contents API. Honest boundaries:

   - OFF until the owner pastes a token in Settings. Zero network before.
   - ONE endpoint only: api.github.com. Nothing else, ever.
   - The PHONE is the only writer of backup.json. If the cloud copy was
     written by anyone else (a foreign sha we never pushed), sync STOPS
     and asks the owner — restore it or overwrite it — never guesses.
   - The Mentor (increment 8) writes only under mentor/; we only READ it.
   - Sync config (incl. the token) is device-local: it is NOT part of the
     export bundle, so backups can be shared without leaking the token.

   All network work is behind callbacks with try/catch — a dead network
   degrades to "last synced X ago", never to a broken app.
   ===================================================================== */
(function (global) {
  'use strict';
  var S = global.RTI_STORE;

  /* ---------- pure helpers (unit-tested in tools/selftest.js) ---------- */
  // unicode-safe base64 (the Contents API speaks base64 both ways)
  function b64encode(str) {
    str = String(str == null ? '' : str);
    if (typeof btoa === 'function') return btoa(unescape(encodeURIComponent(str)));
    return Buffer.from(str, 'utf8').toString('base64'); // Node (selftest)
  }
  function b64decode(b64) {
    b64 = String(b64 == null ? '' : b64).replace(/\s+/g, ''); // API newline-wraps content
    if (typeof atob === 'function') return decodeURIComponent(escape(atob(b64)));
    return Buffer.from(b64, 'base64').toString('utf8');
  }
  // djb2 — cheap change detection so auto-sync only pushes when the ledger changed
  function hashStr(s) {
    s = String(s == null ? '' : s);
    var h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return String(h);
  }
  // hash of the bundle MINUS exportedAt (which regenerates on every call and
  // would otherwise make "did anything change?" always answer yes)
  function bundleHash(bundle) {
    var copy = {};
    for (var k in bundle) if (k !== 'exportedAt') copy[k] = bundle[k];
    return hashStr(JSON.stringify(copy));
  }
  function configured(c) {
    c = c || S.getSync();
    return !!(c.token && c.owner && c.repo);
  }
  function apiUrl(c, path) {
    return 'https://api.github.com/repos/' + encodeURIComponent(c.owner) + '/' +
           encodeURIComponent(c.repo) + '/contents/' + path;
  }

  /* ---------- thin fetch layer ---------- */
  function headers(c) {
    return {
      'Authorization': 'Bearer ' + c.token,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    };
  }
  function online() {
    return typeof navigator === 'undefined' || navigator.onLine !== false;
  }
  // GitHub's status codes, translated for the Settings status line
  function httpError(status) {
    if (status === 404) return new Error('GitHub said 404 — repo not found. Check the repo name (just the name, e.g. rti-data, no spaces) and that the token was granted access to it.');
    if (status === 401) return new Error('GitHub said 401 — the token was rejected. Paste a fresh fine-grained token.');
    if (status === 403) return new Error('GitHub said 403 — the token lacks permission. It needs Contents: Read and write on the data repo.');
    return new Error('GitHub said ' + status);
  }
  // GET path -> cb(err, null-when-absent | { sha, text })
  function getFile(path, cb) {
    var c = S.getSync();
    try {
      fetch(apiUrl(c, path) + '?ref=' + encodeURIComponent(c.branch || 'main'), { headers: headers(c) })
        .then(function (res) {
          if (res.status === 404 && path !== 'backup.json') { cb(null, null); return null; }
          if (res.status === 404) {
            // absent backup.json on a valid repo is fine (first push) — but we
            // can't tell "no file yet" from "repo name wrong" here; probe the
            // repo itself so the owner gets the real story
            fetch('https://api.github.com/repos/' + encodeURIComponent(c.owner) + '/' + encodeURIComponent(c.repo), { headers: headers(c) })
              .then(function (r2) { if (r2.ok) cb(null, null); else cb(httpError(404)); })
              .catch(function () { cb(null, null); });
            return null;
          }
          if (!res.ok) { cb(httpError(res.status)); return null; }
          return res.json().then(function (j) {
            cb(null, { sha: j.sha, text: b64decode(j.content) });
          });
        })
        .catch(function (err) { cb(err); });
    } catch (e) { cb(e); }
  }
  // PUT (create/update) path -> cb(err, { sha })
  function putFile(path, text, message, sha, cb) {
    var c = S.getSync();
    var body = { message: message, content: b64encode(text), branch: c.branch || 'main' };
    if (sha) body.sha = sha;
    try {
      fetch(apiUrl(c, path), { method: 'PUT', headers: headers(c), body: JSON.stringify(body) })
        .then(function (res) {
          if (!res.ok) { cb(httpError(res.status)); return null; }
          return res.json().then(function (j) { cb(null, { sha: j.content && j.content.sha }); });
        })
        .catch(function (err) { cb(err); });
    } catch (e) { cb(e); }
  }

  /* ---------- the sync moves ---------- */
  function fail(err) {
    S.setSync({ lastStatus: 'error: ' + ((err && err.message) || err) });
  }
  // Push the bundle. Refuses (and flags remoteForeign) if the cloud copy has a
  // sha this device never wrote — the owner decides, sync never clobbers blind.
  function pushBackup(cb) {
    var c = S.getSync();
    if (!configured(c)) { if (cb) cb(new Error('Sync is not set up yet.')); return; }
    if (!online()) { if (cb) cb(new Error('Offline — will sync when the network returns.')); return; }
    var bundle = S.exportBundle();
    var json = JSON.stringify(bundle, null, 1);
    getFile('backup.json', function (err, remote) {
      if (err) { fail(err); if (cb) cb(err); return; }
      if (remote && c.lastRemoteSha !== remote.sha) {
        S.setSync({ remoteForeign: true, lastStatus: 'cloud copy differs — choose restore or overwrite' });
        if (cb) cb(new Error('The cloud holds a backup this device did not write. Restore it or overwrite it in Settings.'));
        return;
      }
      putFile('backup.json', json, 'Sync from the phone · ' + new Date().toISOString(), remote ? remote.sha : null, function (err2, out) {
        if (err2) { fail(err2); if (cb) cb(err2); return; }
        S.setSync({
          lastSyncISO: new Date().toISOString(), lastStatus: 'ok',
          lastRemoteSha: out.sha || null, lastPushedHash: bundleHash(bundle), remoteForeign: false
        });
        if (cb) cb(null, { pushed: true });
      });
    });
  }
  // Overwrite the foreign cloud copy with THIS device's ledger (owner-confirmed).
  function overwriteCloud(cb) {
    var c = S.getSync();
    getFile('backup.json', function (err, remote) {
      if (err) { fail(err); if (cb) cb(err); return; }
      S.setSync({ lastRemoteSha: remote ? remote.sha : null, remoteForeign: false });
      pushBackup(cb);
    });
  }
  // Replace THIS device's ledger with the cloud copy (owner-confirmed; goes
  // through the safe import — snapshot + rollback — from increment 5).
  function restoreFromCloud(cb) {
    getFile('backup.json', function (err, remote) {
      if (err) { fail(err); if (cb) cb(err); return; }
      if (!remote) { if (cb) cb(new Error('No backup.json in the cloud yet.')); return; }
      var obj = null;
      try { obj = JSON.parse(remote.text); } catch (e) { if (cb) cb(new Error('The cloud backup is not valid JSON.')); return; }
      var res = S.importBundle(obj);
      if (!res.ok) { if (cb) cb(new Error(res.error)); return; }
      S.setSync({ lastRemoteSha: remote.sha, remoteForeign: false, lastPushedHash: null,
                  lastSyncISO: new Date().toISOString(), lastStatus: 'restored from cloud' });
      if (cb) cb(null, { restored: true });
    });
  }
  // Photos are big — pushed only on the owner's explicit tap in Settings.
  function pushPhotos(cb) {
    if (!configured()) { if (cb) cb(new Error('Sync is not set up yet.')); return; }
    if (!global.RTI_PHOTO || !global.RTI_PHOTO.exportJourney) { if (cb) cb(new Error('Photo module unavailable.')); return; }
    global.RTI_PHOTO.exportJourney().then(function (data) {
      var json = JSON.stringify(data);
      getFile('photos-journey.json', function (err, remote) {
        if (err) { fail(err); if (cb) cb(err); return; }
        putFile('photos-journey.json', json, 'Photo journey · ' + new Date().toISOString(), remote ? remote.sha : null, function (err2) {
          if (err2) { fail(err2); if (cb) cb(err2); return; }
          S.setMeta({ lastPhotoExportISO: (global.RTI_UTIL ? global.RTI_UTIL.todayISO() : null) });
          if (cb) cb(null, { pushed: true });
        });
      });
    }).catch(function (err) { if (cb) cb(err); });
  }
  // Read the Mentor's counsel (written under mentor/ by the scheduled agent).
  function pullMentor(cb) {
    if (!configured() || !online()) { if (cb) cb(null, null); return; }
    getFile('mentor/insights.json', function (err, remote) {
      if (err || !remote) { if (cb) cb(err || null, null); return; }
      var obj = null;
      try { obj = JSON.parse(remote.text); } catch (e) { if (cb) cb(null, null); return; }
      S.setMentor({ fetchedAt: new Date().toISOString(), sha: remote.sha, data: obj });
      if (cb) cb(null, obj);
    });
  }

  /* ---------- auto-sync: quiet, throttled, change-driven ---------- */
  var lastAttempt = 0;
  function maybeAutoSync(reason) {
    var c = S.getSync();
    if (!configured(c) || c.auto === false || !online()) return;
    if (c.remoteForeign) return;             // waiting on the owner's decision
    var now = Date.now();
    if (now - lastAttempt < 60000) return;   // at most once a minute
    lastAttempt = now;
    var changed = true;
    try { changed = bundleHash(S.exportBundle()) !== c.lastPushedHash; } catch (e) {}
    if (changed) pushBackup(null);
    pullMentor(null);
  }

  global.RTI_SYNC = {
    b64encode: b64encode, b64decode: b64decode, hashStr: hashStr, bundleHash: bundleHash,
    configured: configured, apiUrl: apiUrl,
    pushBackup: pushBackup, overwriteCloud: overwriteCloud,
    restoreFromCloud: restoreFromCloud, pushPhotos: pushPhotos,
    pullMentor: pullMentor, maybeAutoSync: maybeAutoSync
  };
})(typeof window !== 'undefined' ? window : this);
