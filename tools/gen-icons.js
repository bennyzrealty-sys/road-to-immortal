/* Generates the PWA icons (no dependencies — built-in zlib only).
   Dark obsidian/indigo full-bleed (maskable-safe) with a gold sigil.
   Run: node tools/gen-icons.js   Output -> icons/*.png  */
'use strict';
var zlib = require('zlib'), fs = require('fs'), path = require('path');

// CRC32
var CRC = (function () {
  var t = new Uint32Array(256);
  for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c >>> 0; }
  return function (buf) { var c = 0xFFFFFFFF; for (var i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
})();

function chunk(type, data) {
  var len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  var t = Buffer.from(type, 'ascii');
  var crcBuf = Buffer.concat([t, data]);
  var crc = Buffer.alloc(4); crc.writeUInt32BE(CRC(crcBuf), 0);
  return Buffer.concat([len, t, data, crc]);
}

function png(size, raw) {
  var sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  var ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  var idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

function mix(a, b, t) { return a + (b - a) * t; }
function clamp(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }

function render(size) {
  var raw = Buffer.alloc(size * (size * 4 + 1));
  var cx = size / 2, cy = size / 2, maxR = size * 0.5;
  var gold = [214, 175, 78], cyan = [120, 220, 255];
  for (var y = 0; y < size; y++) {
    var rowStart = y * (size * 4 + 1);
    raw[rowStart] = 0; // filter: none
    for (var x = 0; x < size; x++) {
      var dx = x - cx, dy = y - cy, d = Math.sqrt(dx * dx + dy * dy), nd = d / maxR;
      // background: deep indigo center -> near-black obsidian edge
      var r = mix(26, 7, nd), g = mix(18, 7, nd), b = mix(54, 16, nd);
      // soft inner aura
      var aura = Math.exp(-(nd * nd) / 0.18);
      r += 22 * aura; g += 14 * aura; b += 40 * aura;
      // outer ring (gold)
      var ringR = size * 0.30, sigma = size * 0.018;
      var dr = d - ringR, ring = Math.exp(-(dr * dr) / (2 * sigma * sigma));
      // inner ring (thinner)
      var ring2R = size * 0.17, dr2 = d - ring2R, ring2 = Math.exp(-(dr2 * dr2) / (2 * (sigma * 0.8) * (sigma * 0.8)));
      // central flame: tall narrow gold glow tapering upward
      var fx = dx / (size * 0.045), fyTop = (y - size * 0.30) / (size * 0.20);
      var flame = Math.exp(-(fx * fx)) * Math.exp(-(fyTop * fyTop)) * (y < cy + size * 0.12 ? 1 : 0.2);
      var gAmt = Math.min(1, ring + ring2 * 0.9 + flame * 0.9);
      r = mix(r, gold[0], gAmt); g = mix(g, gold[1], gAmt); b = mix(b, gold[2], gAmt);
      // cyan rim accent on the very outer ring
      var rim = Math.exp(-((d - size * 0.33) * (d - size * 0.33)) / (2 * (sigma * 1.4) * (sigma * 1.4))) * 0.35;
      r = mix(r, cyan[0], rim); g = mix(g, cyan[1], rim); b = mix(b, cyan[2], rim);

      var o = rowStart + 1 + x * 4;
      raw[o] = clamp(r); raw[o + 1] = clamp(g); raw[o + 2] = clamp(b); raw[o + 3] = 255;
    }
  }
  return png(size, raw);
}

var outDir = path.join(__dirname, '..', 'icons');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
var jobs = [
  ['icon-192.png', 192], ['icon-512.png', 512],
  ['icon-maskable-192.png', 192], ['icon-maskable-512.png', 512],
  ['apple-touch-icon.png', 180], ['favicon-32.png', 32]
];
jobs.forEach(function (j) {
  fs.writeFileSync(path.join(outDir, j[0]), render(j[1]));
  console.log('wrote icons/' + j[0] + ' (' + j[1] + 'px)');
});
console.log('done');
