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

async function runBot(cid) {
  let conv = await store.getConv(cid);
  if (conv.mode !== 'auto') return;                       // (3) có nhân viên -> bot im
  const lastUser = [...conv.messages].reverse().find(m => m.role === 'user');
  const text = lastUser ? lastUser.text : '';

  sendCustomer(cid, { type: 'typing', who: 'bot', on: true }); // (5)

  let answer;
  try {
    const preset = presets.match(text);                    // (1)
    if (preset) { await delay(500 + Math.random() * 400); answer = preset; }
    else {                                                  // (2)
      const g = await gemini.ask(conv.messages);
      answer = (g === null)
        ? 'Câu này mình chưa có sẵn câu trả lời 🤔 Bạn nhắn Zalo để được hỗ trợ trực tiếp nhé. (Máy chủ chưa cấu hình GEMINI_API_KEY.)'
        : g;
    }
  } catch (err) { answer = 'Xin lỗi, trợ lý AI đang bận 🙏 Bạn vui lòng nhắn Zalo giúp mình nhé.'; console.error('[gemini]', err.message); }

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
        ws.role = 'agent'; ws.agentName = payload.name || payload.sub; ws.agentUser = payload.sub; ws.perm = payload.role || 'agent';
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
  try {
    info = await store.init();
  } catch (e) {
    if (store.usePg) {
      console.error('⚠ Không kết nối được Postgres: ' + e.message);
      console.error('  → Tạm dùng JSON (data/store.json). Hãy tạo DB/role rồi khởi động lại để dùng Postgres.');
      store = require('./lib/store-json');
      info = await store.init();
    } else throw e;
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
  server.listen(PORT, () => {
    console.log('Thịnh Thế Vinh Hoa chat backend — http://localhost:' + PORT);
    console.log('  • Trang khách:    http://localhost:' + PORT + '/');
    console.log('  • Bảng nhân viên:  http://localhost:' + PORT + '/agent.html');
    console.log('  • Store: ' + (info.backend) + ' | Gemini: ' + (gemini.hasKey() ? 'ON (' + gemini.MODEL + ')' : 'OFF'));
  });
}
start().catch(e => { console.error('Không khởi động được:', e); process.exit(1); });
