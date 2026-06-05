'use strict';
/* Backend JSON (fallback khi chưa cấu hình DATABASE_URL). Giao diện async. */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'store.json');

let data = { conversations: {}, agents: {}, posts: [], carousel: [] };

function loadSync() {
  try { data = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) { data = {}; }
  data.conversations = data.conversations || {};
  data.agents = data.agents || {};
  data.posts = data.posts || [];
  data.carousel = data.carousel || [];
  data.gallery = data.gallery || [];
}

let timer = null;
function persist() {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const tmp = FILE + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(data));
      fs.renameSync(tmp, FILE);
    } catch (e) { console.error('[store-json] persist', e); }
  }, 250);
}

function genId(pfx) { return (pfx || 'c') + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

async function init() {
  loadSync();
  if (!data.carousel.length) {
    data.carousel = [
      { id: genId('cs'), src: 'images/1.jpg', caption: '' },
      { id: genId('cs'), src: 'images/2.jpg', caption: '' },
      { id: genId('cs'), src: 'images/3.jpg', caption: '' },
      { id: genId('cs'), src: 'images/4.jpg', caption: '' }
    ];
    persist();
  }
  if (!data.gallery.length) {
    data.gallery = [
      { id: genId('gl'), src: 'images/1.jpg', caption: '' },
      { id: genId('gl'), src: 'images/2.jpg', caption: '' },
      { id: genId('gl'), src: 'images/3.jpg', caption: '' },
      { id: genId('gl'), src: 'images/4.jpg', caption: '' }
    ];
    persist();
  }
  return { backend: 'json' };
}

/* ---------- conversations ---------- */
function _conv(cid) {
  if (!cid) cid = genId();
  let c = data.conversations[cid];
  if (!c) c = data.conversations[cid] = { cid, mode: 'auto', assignedTo: null, createdAt: Date.now(), updatedAt: Date.now(), messages: [] };
  return c;
}
async function getConv(cid) { return JSON.parse(JSON.stringify(_conv(cid))); }
async function addMessage(cid, role, text, agentName) {
  const c = _conv(cid);
  const msg = { id: genId('m'), role, text, agentName: agentName || null, ts: Date.now() };
  c.messages.push(msg);
  if (c.messages.length > 200) c.messages = c.messages.slice(-200);
  c.updatedAt = msg.ts; persist(); return msg;
}
async function setMode(cid, mode, assignedTo) {
  const c = _conv(cid);
  c.mode = mode === 'human' ? 'human' : 'auto';
  if (assignedTo !== undefined) c.assignedTo = assignedTo;
  if (c.mode === 'auto') c.assignedTo = null;
  c.updatedAt = Date.now(); persist();
  return { mode: c.mode, assignedTo: c.assignedTo };
}
async function listConversations() {
  return Object.values(data.conversations).filter(c => c.messages && c.messages.length)
    .sort((a, b) => b.updatedAt - a.updatedAt).map(c => JSON.parse(JSON.stringify(c)));
}

/* ---------- agents ---------- */
async function getAgentByUsername(username) {
  const a = data.agents[username];
  return a ? { username: a.username, passwordHash: a.passwordHash, name: a.name, role: a.role || 'agent' } : null;
}
async function createAgent(username, passwordHash, name, role) {
  const ex = data.agents[username];
  data.agents[username] = { username, passwordHash, name: name || username, role: role || (ex && ex.role) || 'agent', createdAt: (ex && ex.createdAt) || Date.now() };
  persist();
  return { username, name: data.agents[username].name, role: data.agents[username].role };
}
async function updatePassword(username, passwordHash) { const a = data.agents[username]; if (!a) return false; a.passwordHash = passwordHash; persist(); return true; }
async function deleteAgent(username) { if (!data.agents[username]) return false; delete data.agents[username]; persist(); return true; }
async function listAgents() { return Object.values(data.agents).map(a => ({ username: a.username, name: a.name, role: a.role || 'agent', createdAt: a.createdAt || 0 })).sort((a, b) => (a.username > b.username ? 1 : -1)); }
async function countAgents() { return Object.keys(data.agents).length; }

/* ---------- carousel ---------- */
async function getCarousel() { return data.carousel.map(x => ({ id: x.id, src: x.src, caption: x.caption || '' })); }
async function addCarouselItem(item) { const it = { id: genId('cs'), src: item.src, caption: item.caption || '' }; data.carousel.push(it); persist(); return it; }
async function deleteCarouselItem(id) { const n = data.carousel.length; data.carousel = data.carousel.filter(x => x.id !== id); persist(); return data.carousel.length < n; }
function reorderArr(arr, ids) {
  const byId = {}; arr.forEach(x => { byId[x.id] = x; });
  const seen = {}; const out = [];
  (ids || []).forEach(id => { if (byId[id] && !seen[id]) { out.push(byId[id]); seen[id] = true; } });
  arr.forEach(x => { if (!seen[x.id]) out.push(x); }); // giữ lại item không có trong danh sách
  return out;
}
async function reorderCarousel(ids) { data.carousel = reorderArr(data.carousel, ids); persist(); return true; }

/* ---------- gallery (Khoảnh khắc) ---------- */
async function getGallery() { return data.gallery.map(x => ({ id: x.id, src: x.src, caption: x.caption || '' })); }
async function addGalleryItem(item) { const it = { id: genId('gl'), src: item.src, caption: item.caption || '' }; data.gallery.push(it); persist(); return it; }
async function deleteGalleryItem(id) { const n = data.gallery.length; data.gallery = data.gallery.filter(x => x.id !== id); persist(); return data.gallery.length < n; }
async function reorderGallery(ids) { data.gallery = reorderArr(data.gallery, ids); persist(); return true; }

/* ---------- posts ---------- */
async function listPosts(opts) {
  opts = opts || {};
  let arr = data.posts.slice().sort((a, b) => b.createdAt - a.createdAt);
  if (opts.publishedOnly) arr = arr.filter(p => p.published);
  return arr.map(p => Object.assign({}, p));
}
async function createPost(d) {
  const p = { id: genId('p'), title: d.title || '', body: d.body || '', image: d.image || '', published: d.published !== false, createdAt: Date.now(), updatedAt: Date.now() };
  data.posts.push(p); persist(); return p;
}
async function updatePost(id, fields) {
  const p = data.posts.find(x => x.id === id); if (!p) return null;
  ['title', 'body', 'image', 'published'].forEach(k => { if (fields[k] !== undefined) p[k] = fields[k]; });
  p.updatedAt = Date.now(); persist(); return Object.assign({}, p);
}
async function deletePost(id) { const n = data.posts.length; data.posts = data.posts.filter(x => x.id !== id); persist(); return data.posts.length < n; }

module.exports = {
  init, genId, getConv, addMessage, setMode, listConversations,
  getAgentByUsername, createAgent, updatePassword, deleteAgent, listAgents, countAgents,
  getCarousel, addCarouselItem, deleteCarouselItem, reorderCarousel,
  getGallery, addGalleryItem, deleteGalleryItem, reorderGallery,
  listPosts, createPost, updatePost, deletePost
};
