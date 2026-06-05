'use strict';
/* Backend Postgres (dùng khi có DATABASE_URL). Giao diện async giống store-json. */
const { Pool } = require('pg');

let pool = null;

function genId() { return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

const SCHEMA = `
CREATE TABLE IF NOT EXISTS agents (
  username TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'agent',
  created_at BIGINT NOT NULL
);
ALTER TABLE agents ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'agent';
CREATE TABLE IF NOT EXISTS conversations (
  cid TEXT PRIMARY KEY,
  mode TEXT NOT NULL DEFAULT 'auto',
  assigned_to TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (
  id BIGSERIAL PRIMARY KEY,
  cid TEXT NOT NULL REFERENCES conversations(cid) ON DELETE CASCADE,
  role TEXT NOT NULL,
  text TEXT NOT NULL,
  agent_name TEXT,
  ts BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_cid_ts ON messages(cid, ts);
CREATE INDEX IF NOT EXISTS idx_conversations_updated ON conversations(updated_at DESC);
CREATE TABLE IF NOT EXISTS carousel (
  id TEXT PRIMARY KEY,
  src TEXT NOT NULL,
  caption TEXT DEFAULT '',
  position SERIAL
);
CREATE TABLE IF NOT EXISTS gallery (
  id TEXT PRIMARY KEY,
  src TEXT NOT NULL,
  caption TEXT DEFAULT '',
  position SERIAL
);
CREATE TABLE IF NOT EXISTS jobdata (
  id TEXT PRIMARY KEY,
  doc JSONB NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS jobposts (
  id TEXT PRIMARY KEY,
  doc JSONB NOT NULL,
  published BOOLEAN NOT NULL DEFAULT true,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  image TEXT DEFAULT '',
  published BOOLEAN NOT NULL DEFAULT true,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
`;

function getPool() {
  if (!pool) pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined
  });
  return pool;
}
async function ensureSchema() { await getPool().query(SCHEMA); }

async function init() {
  await ensureSchema();
  // seed carousel mặc định nếu trống
  const c = await pool.query('SELECT COUNT(*)::int AS n FROM carousel');
  if (Number(c.rows[0].n) === 0) {
    for (const src of ['images/1.jpg', 'images/2.jpg', 'images/3.jpg', 'images/4.jpg']) {
      await pool.query('INSERT INTO carousel (id, src, caption) VALUES ($1,$2,$3)', [genId('cs'), src, '']);
    }
  }
  const g = await pool.query('SELECT COUNT(*)::int AS n FROM gallery');
  if (Number(g.rows[0].n) === 0) {
    for (const src of ['images/1.jpg', 'images/2.jpg', 'images/3.jpg', 'images/4.jpg']) {
      await pool.query('INSERT INTO gallery (id, src, caption) VALUES ($1,$2,$3)', [genId('gl'), src, '']);
    }
  }
  return { backend: 'postgres' };
}

/* Nhập dữ liệu từ store JSON (idempotent — chạy lại không nhân đôi). */
async function importData(d) {
  const p = getPool();
  const counts = { agents: 0, conversations: 0, messages: 0, posts: 0, carousel: 0 };
  for (const a of Object.values((d && d.agents) || {})) {
    const r = await p.query('INSERT INTO agents (username,password_hash,name,role,created_at) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (username) DO NOTHING',
      [a.username, a.passwordHash, a.name || a.username, a.role || 'agent', a.createdAt || Date.now()]);
    counts.agents += r.rowCount;
  }
  for (const c of Object.values((d && d.conversations) || {})) {
    const r = await p.query('INSERT INTO conversations (cid,mode,assigned_to,created_at,updated_at) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (cid) DO NOTHING',
      [c.cid, c.mode || 'auto', c.assignedTo || null, c.createdAt || Date.now(), c.updatedAt || Date.now()]);
    counts.conversations += r.rowCount;
    if (r.rowCount > 0) for (const m of (c.messages || [])) {
      await p.query('INSERT INTO messages (cid,role,text,agent_name,ts) VALUES ($1,$2,$3,$4,$5)', [c.cid, m.role, m.text, m.agentName || null, m.ts || Date.now()]);
      counts.messages++;
    }
  }
  for (const post of ((d && d.posts) || [])) {
    const r = await p.query('INSERT INTO posts (id,title,body,image,published,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING',
      [post.id, post.title, post.body, post.image || '', post.published !== false, post.createdAt || Date.now(), post.updatedAt || Date.now()]);
    counts.posts += r.rowCount;
  }
  for (const x of ((d && d.carousel) || [])) {
    const r = await p.query('INSERT INTO carousel (id,src,caption) VALUES ($1,$2,$3) ON CONFLICT (id) DO NOTHING', [x.id, x.src, x.caption || '']);
    counts.carousel += r.rowCount;
  }
  return counts;
}

async function ensureConv(cid, client) {
  const q = client || pool;
  const now = Date.now();
  await q.query(
    'INSERT INTO conversations (cid, mode, created_at, updated_at) VALUES ($1, $2, $3, $3) ON CONFLICT (cid) DO NOTHING',
    [cid, 'auto', now]
  );
}

function mapMsg(r) { return { id: 'm' + r.id, role: r.role, text: r.text, agentName: r.agent_name, ts: Number(r.ts) }; }

async function getConv(cid) {
  if (!cid) cid = genId();
  await ensureConv(cid);
  const conv = (await pool.query('SELECT cid, mode, assigned_to, created_at, updated_at FROM conversations WHERE cid=$1', [cid])).rows[0];
  const msgs = (await pool.query('SELECT id, role, text, agent_name, ts FROM messages WHERE cid=$1 ORDER BY ts ASC, id ASC LIMIT 200', [cid])).rows.map(mapMsg);
  return { cid: conv.cid, mode: conv.mode, assignedTo: conv.assigned_to, createdAt: Number(conv.created_at), updatedAt: Number(conv.updated_at), messages: msgs };
}

async function addMessage(cid, role, text, agentName) {
  await ensureConv(cid);
  const ts = Date.now();
  const r = (await pool.query(
    'INSERT INTO messages (cid, role, text, agent_name, ts) VALUES ($1,$2,$3,$4,$5) RETURNING id',
    [cid, role, text, agentName || null, ts]
  )).rows[0];
  await pool.query('UPDATE conversations SET updated_at=$2 WHERE cid=$1', [cid, ts]);
  return { id: 'm' + r.id, role, text, agentName: agentName || null, ts };
}

async function setMode(cid, mode, assignedTo) {
  await ensureConv(cid);
  const m = mode === 'human' ? 'human' : 'auto';
  const assigned = m === 'auto' ? null : (assignedTo !== undefined ? assignedTo : null);
  await pool.query('UPDATE conversations SET mode=$2, assigned_to=$3, updated_at=$4 WHERE cid=$1', [cid, m, assigned, Date.now()]);
  return { mode: m, assignedTo: assigned };
}

async function listConversations() {
  const convs = (await pool.query(
    `SELECT c.cid, c.mode, c.assigned_to, c.created_at, c.updated_at
       FROM conversations c
      WHERE EXISTS (SELECT 1 FROM messages m WHERE m.cid = c.cid)
      ORDER BY c.updated_at DESC LIMIT 200`
  )).rows;
  const out = [];
  for (const c of convs) {
    const msgs = (await pool.query('SELECT id, role, text, agent_name, ts FROM messages WHERE cid=$1 ORDER BY ts ASC, id ASC LIMIT 60', [c.cid])).rows.map(mapMsg);
    out.push({ cid: c.cid, mode: c.mode, assignedTo: c.assigned_to, createdAt: Number(c.created_at), updatedAt: Number(c.updated_at), messages: msgs });
  }
  return out;
}

/* agents */
async function getAgentByUsername(username) {
  const r = (await pool.query('SELECT username, password_hash, name, role FROM agents WHERE username=$1', [username])).rows[0];
  return r ? { username: r.username, passwordHash: r.password_hash, name: r.name, role: r.role || 'agent' } : null;
}
async function createAgent(username, passwordHash, name, role) {
  await pool.query(
    `INSERT INTO agents (username, password_hash, name, role, created_at) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (username) DO UPDATE SET password_hash=EXCLUDED.password_hash, name=EXCLUDED.name, role=EXCLUDED.role`,
    [username, passwordHash, name || username, role || 'agent', Date.now()]
  );
  return { username, name: name || username, role: role || 'agent' };
}
async function updatePassword(username, passwordHash) {
  const r = await pool.query('UPDATE agents SET password_hash=$2 WHERE username=$1', [username, passwordHash]);
  return r.rowCount > 0;
}
async function deleteAgent(username) {
  const r = await pool.query('DELETE FROM agents WHERE username=$1', [username]);
  return r.rowCount > 0;
}
async function listAgents() {
  return (await pool.query('SELECT username, name, role, created_at FROM agents ORDER BY username ASC')).rows
    .map(r => ({ username: r.username, name: r.name, role: r.role || 'agent', createdAt: Number(r.created_at) }));
}
async function countAgents() { return Number((await pool.query('SELECT COUNT(*)::int AS n FROM agents')).rows[0].n); }

/* ---------- carousel ---------- */
async function getCarousel() {
  return (await pool.query('SELECT id, src, caption FROM carousel ORDER BY position ASC')).rows
    .map(r => ({ id: r.id, src: r.src, caption: r.caption || '' }));
}
async function addCarouselItem(item) {
  const id = genId('cs');
  await pool.query('INSERT INTO carousel (id, src, caption) VALUES ($1,$2,$3)', [id, item.src, item.caption || '']);
  return { id, src: item.src, caption: item.caption || '' };
}
async function deleteCarouselItem(id) { return (await pool.query('DELETE FROM carousel WHERE id=$1', [id])).rowCount > 0; }
async function reorderItems(table, ids) {
  if (!Array.isArray(ids) || !ids.length) return false;
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    for (let i = 0; i < ids.length; i++) {
      await client.query('UPDATE ' + table + ' SET position=$2 WHERE id=$1', [ids[i], i + 1]);
    }
    await client.query('COMMIT');
    return true;
  } catch (e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
}
async function reorderCarousel(ids) { return reorderItems('carousel', ids); }

/* ---------- gallery (Khoảnh khắc) ---------- */
async function getGallery() {
  return (await pool.query('SELECT id, src, caption FROM gallery ORDER BY position ASC')).rows
    .map(r => ({ id: r.id, src: r.src, caption: r.caption || '' }));
}
async function addGalleryItem(item) {
  const id = genId('gl');
  await pool.query('INSERT INTO gallery (id, src, caption) VALUES ($1,$2,$3)', [id, item.src, item.caption || '']);
  return { id, src: item.src, caption: item.caption || '' };
}
async function deleteGalleryItem(id) { return (await pool.query('DELETE FROM gallery WHERE id=$1', [id])).rowCount > 0; }
async function reorderGallery(ids) { return reorderItems('gallery', ids); }

/* ---------- jobdata (tuyển dụng) ---------- */
async function getJobData() {
  const r = await pool.query("SELECT doc FROM jobdata WHERE id='current'");
  return r.rows[0] ? r.rows[0].doc : null;
}
async function setJobData(doc) {
  await pool.query(
    "INSERT INTO jobdata (id, doc, updated_at) VALUES ('current', $1, $2) ON CONFLICT (id) DO UPDATE SET doc=EXCLUDED.doc, updated_at=EXCLUDED.updated_at",
    [doc, Date.now()]
  );
  return true;
}

/* ---------- jobposts (tin tuyển dụng) ---------- */
const JP_FIELDS = ['title', 'brand', 'position', 'salary', 'location', 'quantity', 'deadline', 'workingTime', 'description', 'requirements', 'benefits', 'image', 'published'];
function mapJobPost(r) { return Object.assign({ id: r.id, createdAt: Number(r.created_at), updatedAt: Number(r.updated_at) }, r.doc, { id: r.id, published: r.published }); }
async function listJobPosts(opts) {
  opts = opts || {};
  const q = opts.publishedOnly
    ? 'SELECT * FROM jobposts WHERE published=true ORDER BY created_at DESC'
    : 'SELECT * FROM jobposts ORDER BY created_at DESC';
  return (await pool.query(q)).rows.map(mapJobPost);
}
async function getJobPost(id) {
  const r = (await pool.query('SELECT * FROM jobposts WHERE id=$1', [id])).rows[0];
  return r ? mapJobPost(r) : null;
}
async function createJobPost(d) {
  const id = genId('jp'); const now = Date.now();
  const doc = {}; JP_FIELDS.forEach(k => { doc[k] = d[k] !== undefined ? d[k] : (k === 'published' ? true : ''); });
  const published = doc.published !== false; delete doc.published;
  await pool.query('INSERT INTO jobposts (id, doc, published, created_at, updated_at) VALUES ($1,$2,$3,$4,$4)', [id, doc, published, now]);
  return getJobPost(id);
}
async function updateJobPost(id, fields) {
  const cur = (await pool.query('SELECT * FROM jobposts WHERE id=$1', [id])).rows[0];
  if (!cur) return null;
  const doc = Object.assign({}, cur.doc);
  let published = cur.published;
  JP_FIELDS.forEach(k => { if (fields[k] !== undefined) { if (k === 'published') published = fields[k] !== false; else doc[k] = fields[k]; } });
  await pool.query('UPDATE jobposts SET doc=$2, published=$3, updated_at=$4 WHERE id=$1', [id, doc, published, Date.now()]);
  return getJobPost(id);
}
async function deleteJobPost(id) { return (await pool.query('DELETE FROM jobposts WHERE id=$1', [id])).rowCount > 0; }

/* ---------- posts ---------- */
function mapPost(r) { return { id: r.id, title: r.title, body: r.body, image: r.image || '', published: r.published, createdAt: Number(r.created_at), updatedAt: Number(r.updated_at) }; }
async function listPosts(opts) {
  opts = opts || {};
  const q = opts.publishedOnly
    ? 'SELECT * FROM posts WHERE published=true ORDER BY created_at DESC'
    : 'SELECT * FROM posts ORDER BY created_at DESC';
  return (await pool.query(q)).rows.map(mapPost);
}
async function createPost(d) {
  const id = genId('p'); const now = Date.now();
  const r = await pool.query(
    'INSERT INTO posts (id,title,body,image,published,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$6) RETURNING *',
    [id, d.title || '', d.body || '', d.image || '', d.published !== false, now]
  );
  return mapPost(r.rows[0]);
}
async function updatePost(id, f) {
  const cur = (await pool.query('SELECT * FROM posts WHERE id=$1', [id])).rows[0];
  if (!cur) return null;
  const v = {
    title: f.title !== undefined ? f.title : cur.title,
    body: f.body !== undefined ? f.body : cur.body,
    image: f.image !== undefined ? f.image : cur.image,
    published: f.published !== undefined ? f.published : cur.published
  };
  const r = await pool.query('UPDATE posts SET title=$2,body=$3,image=$4,published=$5,updated_at=$6 WHERE id=$1 RETURNING *',
    [id, v.title, v.body, v.image, v.published, Date.now()]);
  return mapPost(r.rows[0]);
}
async function deletePost(id) { return (await pool.query('DELETE FROM posts WHERE id=$1', [id])).rowCount > 0; }

module.exports = {
  init, ensureSchema, importData, getPool, genId, getConv, addMessage, setMode, listConversations,
  getAgentByUsername, createAgent, updatePassword, deleteAgent, listAgents, countAgents,
  getCarousel, addCarouselItem, deleteCarouselItem, reorderCarousel,
  getGallery, addGalleryItem, deleteGalleryItem, reorderGallery,
  getJobData, setJobData,
  listJobPosts, getJobPost, createJobPost, updateJobPost, deleteJobPost,
  listPosts, createPost, updatePost, deletePost
};
