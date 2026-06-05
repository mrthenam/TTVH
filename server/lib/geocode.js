'use strict';
/* Geocoding địa chỉ -> toạ độ (lat,lng).
   - Đọc cache đóng gói sẵn server/geocache.json (deploy kèm) để tra tức thì.
   - Miss thì gọi OpenStreetMap Nominatim (miễn phí), giới hạn <=1 req/s, cache trong RAM. */
const fs = require('fs');
const path = require('path');

const BUNDLED = path.join(__dirname, '..', 'geocache.json');
const cache = new Map(); // normAddr -> [lat,lng] | null

function normAddr(s) { return String(s || '').trim().replace(/\s+/g, ' ').toLowerCase(); }

(function loadBundled() {
  try {
    const obj = JSON.parse(fs.readFileSync(BUNDLED, 'utf8'));
    for (const k of Object.keys(obj)) cache.set(normAddr(k), obj[k]);
    console.log('  • Geocache: nạp ' + cache.size + ' địa chỉ sẵn');
  } catch (e) { /* chưa có file -> bỏ qua */ }
})();

function getCached(addr) { return cache.get(normAddr(addr)); }
function setCached(addr, coord) { cache.set(normAddr(addr), coord || null); }

let lastCall = 0;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchNominatim(addr) {
  const wait = 1100 - (Date.now() - lastCall);
  if (wait > 0) await sleep(wait);
  lastCall = Date.now();
  const url = 'https://nominatim.openstreetmap.org/search?' +
    new URLSearchParams({ q: addr, format: 'json', limit: '1', countrycodes: 'vn' }).toString();
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'TTVH-recruit/1.0 (thenam2703@gmail.com)' }, signal: ctrl.signal });
    const j = await r.json();
    if (Array.isArray(j) && j.length) return [Math.round(+j[0].lat * 1e6) / 1e6, Math.round(+j[0].lon * 1e6) / 1e6];
    return null;
  } finally { clearTimeout(t); }
}

/* Trả về [lat,lng] hoặc null. Cache cả kết quả null để khỏi gọi lại. */
async function geocode(addr) {
  if (!addr) return null;
  const key = normAddr(addr);
  if (cache.has(key)) return cache.get(key);
  let coord = null;
  try { coord = await fetchNominatim(addr); }
  catch (e) { console.error('[geocode]', e.message); coord = null; }
  cache.set(key, coord);
  return coord;
}

/* Khoảng cách Haversine (km) */
function distanceKm(a, b) {
  if (!a || !b) return Infinity;
  const R = 6371, toRad = (d) => d * Math.PI / 180;
  const dLat = toRad(b[0] - a[0]), dLng = toRad(b[1] - a[1]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

module.exports = { geocode, getCached, setCached, distanceKm, normAddr, size: () => cache.size };
