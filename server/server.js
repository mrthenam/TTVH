'use strict';
/* ============================================================
   Thịnh Thế Vinh Hoa — Realtime chat backend
   Express (static + REST + đăng nhập) + WebSocket + Gemini + store (Postgres/JSON)
   ============================================================ */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const fs = require('fs');
const http = require('http');
const express = require('express');
const { WebSocketServer } = require('ws');

let store = require('./lib/store');
const presets = require('./lib/presets');
const gemini = require('./lib/gemini');
const auth = require('./lib/auth');
const recruit = require('./lib/jobdata');
const geocode = require('./lib/geocode');

let jobData = null;                 // dữ liệu tuyển dụng (nạp lúc khởi động / sau khi upload)
const recruitStates = new Map();    // cid -> trạng thái luồng tuyển dụng

const PORT = process.env.PORT || 8787;
const SITE_ROOT = path.join(__dirname, '..');

const UPLOAD_DIR = path.join(SITE_ROOT, 'images', 'uploads');
const app = express();
app.use(express.json({ limit: '12mb' }));
app.use(express.static(SITE_ROOT, { extensions: ['html'] }));

app.get('/api/health', async (req, res) => {
  res.json({ ok: true, gemini: gemini.hasKey(), model: gemini.MODEL, backend: store.usePg ? 'postgres' : 'json' });
});

/* ---- đăng nhập nhân viên ---- */
app.post('/api/agent/login', async (req, res) => {
  try {
    const username = String((req.body && req.body.username) || '').trim();
    const password = String((req.body && req.body.password) || '');
    const a = await store.getAgentByUsername(username);
    if (!a || !auth.verifyPw(password, a.passwordHash)) return res.status(401).json({ error: 'Sai tài khoản hoặc mật khẩu' });
    res.json({ token: auth.sign({ username: a.username, name: a.name, role: a.role }), name: a.name, username: a.username, role: a.role });
  } catch (e) { res.status(500).json({ error: 'Lỗi máy chủ' }); }
});

/* ---- middleware xác thực REST ---- */
function authREST(req, res, next) {
  const h = req.headers.authorization || '';
  const t = h.indexOf('Bearer ') === 0 ? h.slice(7) : '';
  const p = auth.verifyToken(t);
  if (!p) return res.status(401).json({ error: 'Chưa đăng nhập hoặc phiên hết hạn' });
  req.agent = p; next();
}
function requireAdmin(req, res, next) {
  if (!req.agent || req.agent.role !== 'admin') return res.status(403).json({ error: 'Chỉ quản trị viên mới được thao tác' });
  next();
}

/* ---- đổi mật khẩu của chính mình ---- */
app.post('/api/agent/change-password', authREST, async (req, res) => {
  try {
    const cur = String((req.body && req.body.currentPassword) || '');
    const next = String((req.body && req.body.newPassword) || '');
    if (next.length < 6) return res.status(400).json({ error: 'Mật khẩu mới tối thiểu 6 ký tự' });
    const a = await store.getAgentByUsername(req.agent.sub);
    if (!a || !auth.verifyPw(cur, a.passwordHash)) return res.status(401).json({ error: 'Mật khẩu hiện tại không đúng' });
    await store.updatePassword(a.username, auth.hash(next));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Lỗi máy chủ' }); }
});

/* ---- quản lý nhân viên (chỉ admin) ---- */
app.get('/api/agents', authREST, requireAdmin, async (req, res) => {
  res.json({ agents: await store.listAgents() });
});
app.post('/api/agents', authREST, requireAdmin, async (req, res) => {
  try {
    const username = String((req.body && req.body.username) || '').trim().toLowerCase();
    const password = String((req.body && req.body.password) || '');
    const name = String((req.body && req.body.name) || '').trim() || username;
    const role = (req.body && req.body.role) === 'admin' ? 'admin' : 'agent';
    if (!/^[a-z0-9._-]{3,}$/.test(username)) return res.status(400).json({ error: 'Tên đăng nhập ≥3 ký tự (a-z, 0-9, . _ -)' });
    if (password.length < 6) return res.status(400).json({ error: 'Mật khẩu tối thiểu 6 ký tự' });
    if (await store.getAgentByUsername(username)) return res.status(409).json({ error: 'Tên đăng nhập đã tồn tại' });
    await store.createAgent(username, auth.hash(password), name, role);
    res.json({ ok: true, username, name, role });
  } catch (e) { res.status(500).json({ error: 'Lỗi máy chủ' }); }
});
app.post('/api/agents/:username/reset-password', authREST, requireAdmin, async (req, res) => {
  try {
    const password = String((req.body && req.body.password) || '');
    if (password.length < 6) return res.status(400).json({ error: 'Mật khẩu tối thiểu 6 ký tự' });
    const a = await store.getAgentByUsername(req.params.username);
    if (!a) return res.status(404).json({ error: 'Không tìm thấy nhân viên' });
    await store.updatePassword(a.username, auth.hash(password));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Lỗi máy chủ' }); }
});
app.put('/api/agents/:username/role', authREST, requireAdmin, async (req, res) => {
  try {
    const role = (req.body && req.body.role) === 'admin' ? 'admin' : 'agent';
    const a = await store.getAgentByUsername(req.params.username);
    if (!a) return res.status(404).json({ error: 'Không tìm thấy nhân viên' });
    if (req.params.username === req.agent.sub && role !== 'admin')
      return res.status(400).json({ error: 'Không thể tự hạ quyền chính mình' });
    await store.createAgent(a.username, a.passwordHash, a.name, role); // upsert giữ mật khẩu & tên
    res.json({ ok: true, username: a.username, role });
  } catch (e) { res.status(500).json({ error: 'Lỗi máy chủ' }); }
});
app.delete('/api/agents/:username', authREST, requireAdmin, async (req, res) => {
  try {
    if (req.params.username === req.agent.sub) return res.status(400).json({ error: 'Không thể xoá chính mình' });
    const ok = await store.deleteAgent(req.params.username);
    if (!ok) return res.status(404).json({ error: 'Không tìm thấy nhân viên' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Lỗi máy chủ' }); }
});

/* ---- upload ảnh (base64 -> file trong images/uploads) ---- */
app.post('/api/upload', authREST, (req, res) => {
  try {
    const dataUrl = (req.body && req.body.dataUrl) || '';
    const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl);
    if (!m) return res.status(400).json({ error: 'Ảnh không hợp lệ' });
    const ext = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' })[m[1]] || 'img';
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > 8 * 1024 * 1024) return res.status(413).json({ error: 'Ảnh quá lớn (>8MB)' });
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    const name = 'up_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + '.' + ext;
    fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);
    res.json({ url: 'images/uploads/' + name });
  } catch (e) { res.status(500).json({ error: 'Lỗi lưu ảnh' }); }
});

/* ---- carousel ---- */
app.get('/api/carousel', async (req, res) => { res.json({ items: await store.getCarousel() }); });
app.post('/api/carousel', authREST, async (req, res) => {
  const src = String((req.body && req.body.src) || '').trim();
  if (!src) return res.status(400).json({ error: 'Thiếu ảnh' });
  res.json(await store.addCarouselItem({ src, caption: (req.body && req.body.caption) || '' }));
});
app.delete('/api/carousel/:id', authREST, async (req, res) => {
  const ok = await store.deleteCarouselItem(req.params.id);
  res.status(ok ? 200 : 404).json({ ok });
});
app.put('/api/carousel/order', authREST, async (req, res) => {
  const ids = (req.body && req.body.ids) || [];
  if (!Array.isArray(ids)) return res.status(400).json({ error: 'Thiếu danh sách' });
  const ok = await store.reorderCarousel(ids.map(String));
  res.json({ ok });
});

/* ---- gallery (Khoảnh khắc) ---- */
app.get('/api/gallery', async (req, res) => { res.json({ items: await store.getGallery() }); });
app.post('/api/gallery', authREST, async (req, res) => {
  const src = String((req.body && req.body.src) || '').trim();
  if (!src) return res.status(400).json({ error: 'Thiếu ảnh' });
  res.json(await store.addGalleryItem({ src, caption: (req.body && req.body.caption) || '' }));
});
app.delete('/api/gallery/:id', authREST, async (req, res) => {
  const ok = await store.deleteGalleryItem(req.params.id);
  res.status(ok ? 200 : 404).json({ ok });
});
app.put('/api/gallery/order', authREST, async (req, res) => {
  const ids = (req.body && req.body.ids) || [];
  if (!Array.isArray(ids)) return res.status(400).json({ error: 'Thiếu danh sách' });
  const ok = await store.reorderGallery(ids.map(String));
  res.json({ ok });
});

/* ---- dữ liệu tuyển dụng (Job List) ---- */
function jobSummary(d) {
  if (!d) return { hasData: false };
  return {
    hasData: true, updatedAt: d.updatedAt || 0,
    storeCount: d.storeCount || (d.stores ? d.stores.length : 0),
    openCount: d.openCount || 0, geocodedCount: d.geocodedCount || 0,
    brands: d.brands || {}, positions: (recruit.POS_ORDER || []).filter(p => d.jobs && d.jobs[p])
      .map(p => ({ code: p, name: recruit.POS_NAME[p] }))
  };
}
// Nạp lại jobData từ DB (nguồn sự thật) — tránh trang trống do bộ nhớ RAM rỗng/cũ.
async function refreshJobData() {
  try { jobData = await store.getJobData(); } catch (e) { console.error('[jobdata] reload', e.message); }
  return jobData;
}
app.get('/api/jobdata/summary', authREST, async (req, res) => { await refreshJobData(); res.json(jobSummary(jobData)); });
app.get('/api/jobdata/full', authREST, async (req, res) => {
  await refreshJobData();
  if (!jobData) return res.json({ hasData: false });
  res.json({ hasData: true, summary: jobSummary(jobData), stores: jobData.stores, jobs: jobData.jobs });
});

/* geocode nền cho các địa chỉ mới chưa có toạ độ (không chặn request) */
async function geocodeMissing() {
  try {
    if (!jobData) return;
    const todo = jobData.stores.filter(s => s.address && !s.coord).slice(0, 60);
    if (!todo.length) return;
    let changed = false;
    for (const s of todo) {
      const c = await geocode.geocode(s.address);
      if (c) { s.coord = c; changed = true; }
    }
    if (changed) {
      jobData.geocodedCount = jobData.stores.filter(s => s.coord).length;
      try { await store.setJobData(jobData); } catch (e) {}
      console.log('[jobdata] geocode nền xong, có toạ độ: ' + jobData.geocodedCount);
    }
  } catch (e) { console.error('[geocodeMissing]', e.message); }
}

/* Lưu dữ liệu đã chỉnh sửa trực tiếp từ dashboard */
app.put('/api/jobdata', authREST, requireAdmin, async (req, res) => {
  try {
    const stores = (req.body && req.body.stores) || [];
    if (!Array.isArray(stores) || !stores.length) return res.status(400).json({ error: 'Thiếu dữ liệu cửa hàng' });
    const jobs = (req.body && req.body.jobs) || (jobData && jobData.jobs) || {};
    const doc = recruit.buildDoc(stores, jobs);
    await store.setJobData(doc);
    jobData = doc;
    res.json({ ok: true, summary: jobSummary(doc) });
    geocodeMissing(); // chạy nền sau khi đã trả lời
  } catch (e) { console.error('[jobdata:put]', e); res.status(500).json({ error: 'Lỗi lưu: ' + e.message }); }
});
app.post('/api/jobdata/upload', authREST, requireAdmin, async (req, res) => {
  try {
    const dataUrl = (req.body && req.body.dataUrl) || '';
    const m = /^data:[^;]*;base64,(.+)$/.exec(dataUrl);
    if (!m) return res.status(400).json({ error: 'File không hợp lệ' });
    const buf = Buffer.from(m[1], 'base64');
    const parsed = await recruit.parse(buf);
    if (!parsed.stores.length) return res.status(400).json({ error: 'Không đọc được cửa hàng nào trong file.' });
    await store.setJobData(parsed);
    jobData = parsed;
    res.json({ ok: true, summary: jobSummary(parsed) });
    geocodeMissing(); // bù toạ độ cho địa chỉ mới (chạy nền)
  } catch (e) {
    console.error('[jobdata]', e);
    res.status(500).json({ error: 'Lỗi đọc file: ' + e.message });
  }
});

/* ---- jobposts (tin tuyển dụng) ---- */
app.get('/api/jobposts', async (req, res) => { res.json({ posts: await store.listJobPosts({ publishedOnly: true }) }); });
app.get('/api/jobposts/all', authREST, async (req, res) => { res.json({ posts: await store.listJobPosts({}) }); });
app.get('/api/jobposts/:id', async (req, res) => {
  const p = await store.getJobPost(req.params.id);
  if (!p || !p.published) return res.status(404).json({ error: 'Không tìm thấy tin' });
  res.json(p);
});
app.post('/api/jobposts', authREST, requireAdmin, async (req, res) => {
  const title = String((req.body && req.body.title) || '').trim();
  if (!title) return res.status(400).json({ error: 'Thiếu tiêu đề' });
  res.json(await store.createJobPost(req.body || {}));
});
app.put('/api/jobposts/:id', authREST, requireAdmin, async (req, res) => {
  const p = await store.updateJobPost(req.params.id, req.body || {});
  res.status(p ? 200 : 404).json(p || { error: 'Không tìm thấy' });
});
app.delete('/api/jobposts/:id', authREST, requireAdmin, async (req, res) => {
  const ok = await store.deleteJobPost(req.params.id);
  res.status(ok ? 200 : 404).json({ ok });
});

/* ---- posts ---- */
app.get('/api/posts', async (req, res) => { res.json({ posts: await store.listPosts({ publishedOnly: true }) }); });
app.get('/api/posts/all', authREST, async (req, res) => { res.json({ posts: await store.listPosts({}) }); });
app.post('/api/posts', authREST, async (req, res) => {
  const b = req.body || {};
  if (!String(b.title || '').trim()) return res.status(400).json({ error: 'Thiếu tiêu đề' });
  res.json(await store.createPost({ title: b.title, body: b.body, image: b.image, published: b.published !== false }));
});
app.put('/api/posts/:id', authREST, async (req, res) => {
  const p = await store.updatePost(req.params.id, req.body || {});
  if (!p) return res.status(404).json({ error: 'Không tìm thấy' });
  res.json(p);
});
app.delete('/api/posts/:id', authREST, async (req, res) => {
  const ok = await store.deletePost(req.params.id);
  res.status(ok ? 200 : 404).json({ ok });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

const customers = new Map(); // cid -> Set<ws>
const agents = new Set();    // Set<ws> (đã xác thực)

function send(ws, obj) { try { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); } catch (e) {} }
function sendCustomer(cid, obj) { const s = customers.get(cid); if (s) s.forEach(ws => send(ws, obj)); }
function broadcastAgents(obj) { agents.forEach(ws => send(ws, obj)); }
async function pushConvToAgents(cid) { broadcastAgents({ type: 'update', conv: await store.getConv(cid) }); }
function broadcastPresence() { broadcastAgents({ type: 'presence', agents: [...agents].map(w => w.agentName) }); }
const delay = (ms) => new Promise(r => setTimeout(r, ms));

function isRecruitIntent(text) {
  const n = ' ' + presets.norm(text) + ' ';
  return /(tuyen dung|tuyen nhan vien|tuyen khong|con tuyen|viec lam|ung tuyen|tim viec|xin viec|di lam|part time|parttime|full time|fulltime|nop cv|tuyen)/.test(n);
}
function isExitIntent(text) {
  const n = ' ' + presets.norm(text) + ' ';
  return /(gap nhan vien|nguoi that|tu van vien|cam on|tam biet|khong can|thoi khong)/.test(n);
}

/* Luồng tuyển dụng nhiều bước. Trả về câu trả lời, hoặc null để nhường cho preset/Gemini. */
async function handleRecruit(cid, text) {
  if (!jobData) { try { jobData = await store.getJobData(); } catch (e) {} } // lazy-load từ DB
  if (!jobData || !jobData.stores || !jobData.stores.length) return null; // chưa có dữ liệu
  let state = recruitStates.get(cid);

  if (state && isExitIntent(text)) { recruitStates.delete(cid); return null; }

  // bắt đầu luồng
  if (!state) {
    if (!isRecruitIntent(text)) return null;
    recruitStates.set(cid, { step: 'ask_address' });
    return 'Dạ Thịnh Thế Vinh Hoa (MAYCHA, Hồng Trà Sữa Tâm Hảo, Gà Giòn Ba Cô Gái) đang tuyển nhiều vị trí ạ! 🎉\n'
      + 'Bạn cho mình xin **tên đường / khu vực bạn đang ở** để mình tìm cửa hàng đang tuyển gần bạn nhất nhé!\n'
      + '(vd: "Cao Thắng" hoặc "123 Lê Văn Sỹ, Quận 3") 📍';
  }

  if (state.step === 'ask_address') {
    const res = await recruit.findStores(jobData, text, 10);
    if (!res.meaningful || !res.stores.length) {
      return 'Mình chưa định vị được khu vực của bạn 😅. Bạn gõ rõ **tên đường + thành phố** giúp mình nhé '
        + '(vd: "Cao Thắng, TP.HCM" hoặc "Lê Văn Sỹ, Quận 3").';
    }
    const positions = recruit.positionsOf(res.stores);
    const region = recruit.isHCMregion(text) || (res.stores[0] && recruit.isHCMregion(res.stores[0].address)) ? 'hcm' : 'tinh';
    recruitStates.set(cid, { step: 'ask_position', positions, region });
    const posList = positions.map((p, i) => `${i + 1}. ${recruit.POS_NAME[p]}`).join('\n');
    return '📋 Các cửa hàng đang tuyển gần bạn (gần → xa):\n\n'
      + recruit.formatStoreList(res.stores)
      + '\n\n──────────\nBạn muốn ứng tuyển **vị trí nào** ạ?\n' + posList
      + '\n\n(Gõ tên hoặc số thứ tự vị trí giúp mình nhé 😊)';
  }

  if (state.step === 'ask_position') {
    let pos = null;
    const num = text.trim().match(/^\s*(\d+)\s*[.)]?\s*$/);
    if (num) { const i = +num[1] - 1; if (state.positions[i]) pos = state.positions[i]; }
    if (!pos) pos = recruit.detectPosition(text);
    if (!pos || !(jobData.jobs && jobData.jobs[pos])) {
      return 'Bạn vui lòng chọn giúp mình một trong các vị trí sau ạ:\n'
        + state.positions.map((p, i) => `${i + 1}. ${recruit.POS_NAME[p]}`).join('\n');
    }
    const detail = recruit.formatJobDetail(jobData, pos, state.region);
    const note = state.positions.indexOf(pos) === -1
      ? '\n\n⚠️ (Vị trí này các cửa hàng gần bạn hiện chưa tuyển, nhưng đây là thông tin để bạn tham khảo nhé.)' : '';
    recruitStates.delete(cid);
    return detail + note
      + '\n\n──────────\n💌 Muốn ứng tuyển? Để lại **SĐT/Zalo** hoặc gửi CV về email tuyển dụng, '
      + 'hoặc nhắn "gặp nhân viên" để được hỗ trợ trực tiếp.\nGõ "tuyển dụng" nếu bạn muốn xem khu vực/vị trí khác nhé! 😊';
  }
  return null;
}

async function runBot(cid) {
  let conv = await store.getConv(cid);
  if (conv.mode !== 'auto') return;                       // (3) có nhân viên -> bot im
  const lastUser = [...conv.messages].reverse().find(m => m.role === 'user');
  const text = lastUser ? lastUser.text : '';

  sendCustomer(cid, { type: 'typing', who: 'bot', on: true }); // (5)

  let answer;
  try {
    answer = await handleRecruit(cid, text);               // (0) luồng tuyển dụng có ngữ cảnh
    if (answer != null) { await delay(400 + Math.random() * 300); }
    else {
      const preset = presets.match(text);                  // (1)
      if (preset) { await delay(500 + Math.random() * 400); answer = preset; }
      else {                                                // (2)
        const g = await gemini.ask(conv.messages);
        answer = (g === null)
          ? 'Câu này mình chưa có sẵn câu trả lời 🤔 Bạn nhắn Zalo để được hỗ trợ trực tiếp nhé. (Máy chủ chưa cấu hình GEMINI_API_KEY.)'
          : g;
      }
    }
  } catch (err) { answer = 'Xin lỗi, trợ lý AI đang bận 🙏 Bạn vui lòng nhắn Zalo giúp mình nhé.'; console.error('[bot]', err.message); }

  conv = await store.getConv(cid);
  if (conv.mode !== 'auto') { sendCustomer(cid, { type: 'typing', who: 'bot', on: false }); return; }
  const msg = await store.addMessage(cid, 'bot', answer);
  sendCustomer(cid, { type: 'typing', who: 'bot', on: false });
  sendCustomer(cid, { type: 'message', message: msg });
  await pushConvToAgents(cid);
}

wss.on('connection', (ws) => {
  ws.role = null; ws.cid = null; ws.agentName = null;

  ws.on('message', async (raw) => {
    let m; try { m = JSON.parse(raw); } catch (e) { return; }

    if (m.type === 'hello') {
      if (m.role === 'agent') {
        const payload = auth.verifyToken(m.token || '');
        if (!payload) { send(ws, { type: 'auth_error' }); return; }
        ws.role = 'agent'; ws.agentName = payload.name || payload.sub; ws.agentUser = payload.sub;
        // Lấy quyền MỚI NHẤT từ DB (tránh token cũ giữ quyền lỗi thời)
        let dbA = null; try { dbA = await store.getAgentByUsername(payload.sub); } catch (e) {}
        ws.perm = (dbA && dbA.role) || payload.role || 'agent';
        agents.add(ws);
        send(ws, { type: 'agent_init', me: ws.agentName, role: ws.perm, conversations: await store.listConversations() });
        broadcastPresence();
      } else {
        ws.role = 'customer';
        const cid = m.cid || store.genId();
        ws.cid = cid;
        if (!customers.has(cid)) customers.set(cid, new Set());
        customers.get(cid).add(ws);
        const conv = await store.getConv(cid);
        send(ws, { type: 'welcome', cid, history: conv.messages, mode: conv.mode, agent: conv.assignedTo });
      }
      return;
    }

    if (ws.role === 'customer') {
      if (m.type === 'user_msg') {
        const text = (m.text || '').trim(); if (!text) return;
        await store.addMessage(ws.cid, 'user', text);
        await pushConvToAgents(ws.cid);
        runBot(ws.cid);
      }
      return;
    }

    if (ws.role === 'agent') {
      if (m.type === 'agent_msg') {
        const text = (m.text || '').trim(); if (!text || !m.cid) return;
        const cur = await store.getConv(m.cid);
        if (cur.mode !== 'human' || cur.assignedTo !== ws.agentName) {
          await store.setMode(m.cid, 'human', ws.agentName);
          sendCustomer(m.cid, { type: 'mode', mode: 'human', agent: ws.agentName });
        }
        const msg = await store.addMessage(m.cid, 'agent', text, ws.agentName);
        sendCustomer(m.cid, { type: 'message', message: msg });
        await pushConvToAgents(m.cid);
      } else if (m.type === 'set_mode') {
        const r = await store.setMode(m.cid, m.mode, m.mode === 'human' ? ws.agentName : null);
        sendCustomer(m.cid, { type: 'mode', mode: r.mode, agent: r.assignedTo });
        if (r.mode === 'auto') {
          const msg = await store.addMessage(m.cid, 'bot', 'Trợ lý tự động đã sẵn sàng hỗ trợ bạn tiếp ạ. 🤖');
          sendCustomer(m.cid, { type: 'message', message: msg });
        }
        await pushConvToAgents(m.cid);
      } else if (m.type === 'agent_typing') {
        sendCustomer(m.cid, { type: 'typing', who: 'agent', on: !!m.on, agent: ws.agentName });
      }
      return;
    }
  });

  ws.on('close', () => {
    if (ws.role === 'agent') { agents.delete(ws); broadcastPresence(); }
    else if (ws.cid) { const s = customers.get(ws.cid); if (s) { s.delete(ws); if (!s.size) customers.delete(ws.cid); } }
  });
});

async function start() {
  let info;
  if (store.usePg) {
    // Thử kết nối Postgres nhiều lần — tránh fallback nhầm sang JSON tạm khi DB khởi động chậm
    // (nếu lỡ chạy JSON tạm thì dữ liệu upload sẽ MẤT khi redeploy).
    let lastErr = null;
    for (let attempt = 1; attempt <= 8; attempt++) {
      try { info = await store.init(); lastErr = null; break; }
      catch (e) { lastErr = e; console.error('⚠ Postgres chưa sẵn sàng (lần ' + attempt + '/8): ' + e.message); await delay(3000); }
    }
    if (lastErr) {
      console.error('✖ KHÔNG kết nối được Postgres sau nhiều lần thử → tạm dùng JSON. ⚠ DỮ LIỆU SẼ MẤT KHI REDEPLOY!');
      store = require('./lib/store-json');
      info = await store.init();
    }
  } else {
    info = await store.init();
  }
  // tạo tài khoản nhân viên đầu tiên nếu DB trống
  const du = process.env.AGENT_DEFAULT_USER || 'admin';
  if ((await store.countAgents()) === 0) {
    const p = process.env.AGENT_DEFAULT_PASS || 'admin123';
    await store.createAgent(du, auth.hash(p), 'Quản trị', 'admin');
    console.log('  • Đã tạo tài khoản quản trị mặc định: ' + du + ' / ' + p + '  (hãy đổi mật khẩu!)');
  } else {
    const ex = await store.getAgentByUsername(du);
    if (ex && ex.role !== 'admin') { await store.createAgent(du, ex.passwordHash, ex.name, 'admin'); console.log('  • Đã nâng quyền admin cho: ' + du); }
  }
  try { jobData = await store.getJobData(); } catch (e) { jobData = null; }
  server.listen(PORT, () => {
    console.log('Thịnh Thế Vinh Hoa chat backend — http://localhost:' + PORT);
    console.log('  • Trang khách:    http://localhost:' + PORT + '/');
    console.log('  • Bảng nhân viên:  http://localhost:' + PORT + '/agent.html');
    console.log('  • Store: ' + (info.backend) + ' | Gemini: ' + (gemini.hasKey() ? 'ON (' + gemini.MODEL + ')' : 'OFF'));
    console.log('  • Tuyển dụng: ' + (jobData ? (jobData.storeCount + ' cửa hàng, ' + jobData.openCount + ' đang tuyển') : 'chưa có dữ liệu (upload trong dashboard)'));
  });
}
start().catch(e => { console.error('Không khởi động được:', e); process.exit(1); });
