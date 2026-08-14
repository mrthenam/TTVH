'use strict';
/* Đọc file "Job List.xlsx" (3 sheet) -> dữ liệu tuyển dụng + tìm cửa hàng gần + mô tả công việc. */
const Excel = require('exceljs');
const presets = require('./presets');
const geocode = require('./geocode');

const norm = presets.norm;

/* ---------- hằng số vị trí ---------- */
const POS_ORDER = ['SM', 'SL', 'ASF', 'SE', 'CSS', 'SECD'];
const POS_NAME = {
  SM: 'Cửa hàng trưởng (SM)',
  SL: 'Trưởng ca (SL)',
  ASF: 'Nhân viên Fulltime (ASF)',
  SE: 'Nhân viên Part-time (SE)',
  CSS: 'Part-time kiêm Hoạt náo viên (CSS)',
  SECD: 'Part-time ca đêm (SECD)'
};
const BRAND_NAME = { MC: 'MAYCHA', TH: 'Hồng Trà Sữa Tam Hảo', GA: 'Gà Giòn Sốt Ba Cô Gái' };

/* từ khoá -> mã vị trí (kiểm tra theo thứ tự, cụ thể trước) */
const POS_KEYWORDS = [
  ['SM', ['cua hang truong', 'quan ly cua hang', 'store manager', 'quan ly', ' sm ']],
  ['SL', ['truong ca', 'shift leader', ' sl ']],
  ['SECD', ['ca dem', 'dem', 'secd', 'overnight']],
  ['CSS', ['hoat nao', 'css', 'mc cua hang']],
  ['ASF', ['fulltime', 'full time', 'toan thoi gian', 'asf', 'nhan vien full']],
  ['SE', ['part time', 'parttime', 'ban thoi gian', 'phuc vu', 'pha che', 'thu ngan', 'nhan vien', 'staff', 'phục vụ', ' se ']]
];

function detectPosition(text) {
  const n = ' ' + norm(text) + ' ';
  for (const [code, kws] of POS_KEYWORDS) {
    for (const k of kws) { if (n.indexOf(norm(k)) > -1) return code; }
  }
  return null;
}

/* ---------- tiện ích đọc cell ---------- */
function cellText(v) {
  if (v == null) return '';
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map(t => t.text).join('');
    if (v.text != null) return String(v.text);
    if (v.result != null) return String(v.result);
    return '';
  }
  return String(v);
}
function cellNum(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'object') { const t = cellText(v); const n = parseFloat(t); return isNaN(n) ? 0 : n; }
  const n = parseFloat(v); return isNaN(n) ? 0 : n;
}
function findColInRow(rowVals, predicate) {
  for (let c = 1; c < rowVals.length; c++) { if (predicate(cellText(rowVals[c]).trim())) return c; }
  return -1;
}

function extractStreet(address, name) {
  let seg = '';
  if (address) seg = address.split(',')[0];
  else if (name) { const i = name.indexOf('-'); seg = i >= 0 ? name.slice(i + 1) : name; }
  seg = seg.replace(/^[\s\d\/\.\-]+[a-zA-Z]?\s+/, '').trim(); // bỏ số nhà đầu (117, 30/18, 27A...)
  return seg;
}
function cleanName(name) { // bỏ tiền tố mã: "MC011-33 Thạch Lam" -> "33 Thạch Lam"
  const i = (name || '').indexOf('-');
  return i >= 0 ? name.slice(i + 1).trim() : (name || '').trim();
}
function isHCMregion(text) {
  const n = norm(text);
  return /ho chi minh|hcm|sai gon|binh duong|thu duc/.test(n);
}

const NEED_KEYS = ['SM', 'SL', 'ASF', 'Staff', 'StaffFT', 'CSS'];

/* Chuẩn hoá 1 cửa hàng: tính openPositions, toạ độ, tên đường, tổng cần tuyển từ need{}. */
function finalizeStore(s) {
  // Số âm trong "Yêu cầu tuyển dụng" = dư/đủ nhân sự -> quy về 0 (không tuyển vị trí đó)
  const need = {};
  NEED_KEYS.forEach(k => { need[k] = Math.max(0, Math.round(Number((s.need || {})[k]) || 0)); });
  const open = [];
  if (need.SM > 0) open.push('SM');
  if (need.SL > 0) open.push('SL');
  if (need.ASF > 0 || need.StaffFT > 0) open.push('ASF');
  if (need.Staff > 0) open.push('SE');
  if (need.CSS > 0) open.push('CSS');
  const address = String(s.address || '').trim();
  const name = String(s.name || '').trim();
  const coord = (address && geocode.getCached(address)) || s.coord || null;
  const street = extractStreet(address, name);
  return {
    code: String(s.code || '').trim(), brand: String(s.brand || '').trim() || 'MC',
    name, address, coord, need,
    street, streetNorm: norm(street),
    needTotal: NEED_KEYS.reduce((a, k) => a + Math.max(need[k], 0), 0),
    openPositions: open
  };
}

/* Gói toàn bộ thành document + số liệu tổng hợp. */
function buildDoc(stores, jobs) {
  const fin = (stores || []).filter(s => (s.code || '').toString().trim()).map(finalizeStore);
  const brands = {};
  fin.forEach(s => { brands[s.brand] = (brands[s.brand] || 0) + 1; });
  return {
    updatedAt: Date.now(),
    storeCount: fin.length,
    geocodedCount: fin.filter(s => s.coord).length,
    openCount: fin.filter(s => s.openPositions.length).length,
    brands, stores: fin, jobs: jobs || {}
  };
}

/* ---------- parse workbook ---------- */
async function parse(buffer) {
  const wb = new Excel.Workbook();
  await wb.xlsx.load(buffer);

  const wsAddr = wb.getWorksheet('Địa chỉ cửa hàng') || wb.worksheets[0];
  const wsNeed = wb.getWorksheet('Số lượng tuyển từng cửa hàng');
  const wsJob = wb.getWorksheet('Mô tả công việc');
  if (!wsNeed || !wsJob) throw new Error('File thiếu sheet "Số lượng tuyển từng cửa hàng" hoặc "Mô tả công việc".');

  /* sheet địa chỉ */
  const addrById = {};
  if (wsAddr) {
    const hv = wsAddr.getRow(1).values;
    const cCode = findColInRow(hv, t => /store code/i.test(t));
    const cShort = findColInRow(hv, t => /viết tắt/i.test(t));
    const cAddr = findColInRow(hv, t => /địa\s*chỉ/i.test(t));
    wsAddr.eachRow((row, idx) => {
      if (idx === 1) return;
      const v = row.values;
      const code = cellText(v[cCode]).trim();
      const addr = cAddr > 0 ? cellText(v[cAddr]).trim() : '';
      if (code && addr) addrById[code] = { short: cShort > 0 ? cellText(v[cShort]).trim() : '', address: addr };
    });
  }

  /* sheet số lượng tuyển: tìm dòng header + cột "Yêu cầu tuyển dụng - HR" */
  const needRows = wsNeed.getSheetValues(); // 1-based [row][col]
  let headerRowIdx = -1, hrCol = -1;
  for (let r = 1; r < needRows.length; r++) {
    const rv = needRows[r]; if (!rv) continue;
    if (headerRowIdx < 0 && findColInRow(rv, t => t === 'Mã cửa hàng') > -1) headerRowIdx = r;
    if (hrCol < 0) { const c = findColInRow(rv, t => /^Yêu cầu tuyển dụng\s*-\s*HR$/i.test(t)); if (c > -1) hrCol = c; }
  }
  if (headerRowIdx < 0) throw new Error('Không tìm thấy dòng tiêu đề (cột "Mã cửa hàng") trong sheet số lượng tuyển.');
  const hRow = needRows[headerRowIdx];
  const cCode2 = findColInRow(hRow, t => t === 'Mã cửa hàng');
  const cBrand = findColInRow(hRow, t => t === 'Brand');
  const cName2 = findColInRow(hRow, t => t === 'Tên Cửa hàng');
  // cột nhu cầu: bắt đầu tại hrCol = SM, SL, ASF, Staff, Staff-Fulltime, CSS
  if (hrCol < 0) hrCol = findColInRow(hRow, t => t === 'Mã HCs') + 1; // dự phòng
  const nCol = { SM: hrCol, SL: hrCol + 1, ASF: hrCol + 2, Staff: hrCol + 3, StaffFT: hrCol + 4, CSS: hrCol + 5 };

  const storeMap = {};
  for (let r = headerRowIdx + 1; r < needRows.length; r++) {
    const rv = needRows[r]; if (!rv) continue;
    const code = cellText(rv[cCode2]).trim();
    if (!code) continue;
    const brand = (cBrand > 0 ? cellText(rv[cBrand]).trim() : '') || code.replace(/[0-9].*$/, '');
    const name = cName2 > 0 ? cellText(rv[cName2]).trim() : code;
    const need = {
      SM: cellNum(rv[nCol.SM]), SL: cellNum(rv[nCol.SL]), ASF: cellNum(rv[nCol.ASF]),
      Staff: cellNum(rv[nCol.Staff]), StaffFT: cellNum(rv[nCol.StaffFT]), CSS: cellNum(rv[nCol.CSS])
    };
    const a = addrById[code] || {};
    storeMap[code] = { code, brand, name: cleanName(name) || name, address: a.address || '', need };
  }
  const stores = Object.values(storeMap);

  /* sheet mô tả công việc */
  const jobRows = wsJob.getSheetValues();
  let posHeaderRow = -1;
  for (let r = 1; r < jobRows.length; r++) {
    const rv = jobRows[r]; if (!rv) continue;
    if (findColInRow(rv, t => t === 'SM') > -1 && findColInRow(rv, t => t === 'SECD') > -1) { posHeaderRow = r; break; }
  }
  const jobs = {};
  if (posHeaderRow > -1) {
    const hv = jobRows[posHeaderRow];
    const posCol = {};
    POS_ORDER.forEach(p => { const c = findColInRow(hv, t => t === p); if (c > -1) posCol[p] = c; });
    POS_ORDER.forEach(p => { if (posCol[p]) jobs[p] = { caLam: '', luongHCM: '', luongTinh: '', phucLoi: '', moTa: '', doTuoi: '', yeuCau: '' }; });
    for (let r = posHeaderRow + 1; r < jobRows.length; r++) {
      const rv = jobRows[r]; if (!rv) continue;
      const label = norm(cellText(rv[1]));
      let field = null;
      if (label.startsWith('ca lam')) field = 'caLam';
      else if (label.indexOf('luong co ban') > -1 && label.indexOf('ho chi minh') > -1) field = 'luongHCM';
      else if (label.indexOf('luong co ban') > -1) field = 'luongTinh';
      else if (label.indexOf('phuc loi') > -1) field = 'phucLoi';
      else if (label.indexOf('mo ta cong viec') > -1) field = 'moTa';
      else if (label.indexOf('do tuoi') > -1) field = 'doTuoi';
      else if (label.indexOf('yeu cau kinh nghiem') > -1) field = 'yeuCau';
      if (!field) continue;
      for (const p of Object.keys(posCol)) {
        const val = cellText(rv[posCol[p]]).trim();
        if (val && jobs[p]) jobs[p][field] = val;
      }
    }
  }

  return buildDoc(stores, jobs);
}

/* ---------- tìm cửa hàng gần nhất còn tuyển ---------- */
async function findStores(jobData, customerText, limit) {
  limit = limit || 10;
  const open = (jobData.stores || []).filter(s => s.openPositions && s.openPositions.length);
  const nText = ' ' + norm(customerText) + ' ';
  // khớp tên đường: tên đường cửa hàng xuất hiện trong câu của khách
  open.forEach(s => { s._street = !!(s.streetNorm && s.streetNorm.length >= 4 && nText.indexOf(s.streetNorm) > -1); });

  // chọn toạ độ mốc của khách
  let cust = null;
  const matched = open.filter(s => s._street && s.coord);
  if (matched.length) cust = matched[0].coord;            // dùng cửa hàng trùng đường làm mốc
  if (!cust) {
    cust = await geocode.geocode(customerText);
    if (!cust) cust = await geocode.geocode(customerText + ', Thành phố Hồ Chí Minh');
  }
  open.forEach(s => { s._dist = (cust && s.coord) ? geocode.distanceKm(cust, s.coord) : Infinity; });

  const sorted = open.slice().sort((a, b) => {
    if (a._street !== b._street) return a._street ? -1 : 1;       // trùng đường lên đầu
    if (a._dist !== b._dist) return a._dist - b._dist;           // gần -> xa
    return (a.code > b.code ? 1 : -1);
  });
  const meaningful = sorted.some(s => s._street) || !!cust;
  return { meaningful, customerCoord: cust, stores: sorted.slice(0, limit) };
}

/* các vị trí đang tuyển trong danh sách cửa hàng */
function positionsOf(stores) {
  const set = [];
  POS_ORDER.forEach(p => { if (stores.some(s => s.openPositions.indexOf(p) > -1)) set.push(p); });
  return set;
}

/* ---------- định dạng ---------- */
function formatStoreList(stores) {
  return stores.map((s, i) => {
    const brand = BRAND_NAME[s.brand] || s.brand;
    const dist = (s._dist != null && isFinite(s._dist)) ? ` · ~${s._dist.toFixed(1)}km` : '';
    const tag = s._street ? ' 🎯(ngay trên đường bạn ở)' : '';
    const pos = s.openPositions.map(p => POS_NAME[p].replace(/\s*\(.*\)/, '')).join(', ');
    const addr = s.address ? '\n   📍 ' + s.address : '';
    return `${i + 1}. ${brand} – ${s.name}${dist}${tag}${addr}\n   👉 Đang tuyển: ${pos}`;
  }).join('\n');
}

function formatJobDetail(jobData, posCode, region) {
  const j = (jobData.jobs || {})[posCode];
  if (!j) return null;
  const luong = region === 'tinh'
    ? (j.luongTinh || j.luongHCM)
    : (j.luongHCM || j.luongTinh);
  const parts = [];
  parts.push('📋 ' + POS_NAME[posCode]);
  if (j.moTa) parts.push('\n📝 MÔ TẢ CÔNG VIỆC:\n' + j.moTa);
  if (j.caLam) parts.push('\n⏰ CA LÀM:\n' + j.caLam);
  if (luong) parts.push('\n💰 LƯƠNG CƠ BẢN' + (region === 'tinh' ? ' (các tỉnh):' : ' (HCM/Bình Dương):') + '\n' + luong);
  if (j.phucLoi) parts.push('\n🎁 PHÚC LỢI:\n' + j.phucLoi);
  if (j.doTuoi) parts.push('\n🎂 ĐỘ TUỔI: ' + j.doTuoi);
  if (j.yeuCau) parts.push('\n✅ YÊU CẦU KINH NGHIỆM:\n' + j.yeuCau);
  return parts.join('\n');
}

module.exports = {
  parse, buildDoc, finalizeStore, findStores, positionsOf, detectPosition,
  formatStoreList, formatJobDetail, isHCMregion,
  POS_ORDER, POS_NAME, BRAND_NAME, NEED_KEYS
};
