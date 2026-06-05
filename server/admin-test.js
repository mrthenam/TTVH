'use strict';
const BASE = 'http://127.0.0.1:8787';
const log = [], rec = (t, x) => log.push(t + ': ' + JSON.stringify(x));
async function login(u, p) { const r = await fetch(BASE + '/api/agent/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) }); return { status: r.status, body: await r.json() }; }
function H(t) { return { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + t }; }

(async () => {
  const admin = await login('admin', 'admin123');
  rec('admin_login', admin.status === 200 && admin.body.role === 'admin');
  const t = admin.body.token;

  // list agents
  let r = await fetch(BASE + '/api/agents', { headers: H(t) });
  rec('admin_list_agents', r.status === 200);

  // create a normal agent
  const uname = 'nv_' + Date.now().toString(36).slice(-4);
  r = await fetch(BASE + '/api/agents', { method: 'POST', headers: H(t), body: JSON.stringify({ username: uname, name: 'NV Test', password: 'pass123', role: 'agent' }) });
  rec('create_agent', r.status === 200);

  // new agent can login
  const nv = await login(uname, 'pass123');
  rec('new_agent_login', nv.status === 200 && nv.body.role === 'agent');

  // non-admin cannot manage
  r = await fetch(BASE + '/api/agents', { headers: H(nv.body.token) });
  rec('nonadmin_blocked_403', r.status === 403);

  // new agent changes own password
  r = await fetch(BASE + '/api/agent/change-password', { method: 'POST', headers: H(nv.body.token), body: JSON.stringify({ currentPassword: 'pass123', newPassword: 'newpass123' }) });
  rec('change_password_ok', r.status === 200);
  const nv2 = await login(uname, 'newpass123');
  rec('login_with_new_password', nv2.status === 200);
  const nvOld = await login(uname, 'pass123');
  rec('old_password_rejected', nvOld.status === 401);

  // wrong current password rejected
  r = await fetch(BASE + '/api/agent/change-password', { method: 'POST', headers: H(nv2.body.token), body: JSON.stringify({ currentPassword: 'WRONG', newPassword: 'whatever1' }) });
  rec('wrong_current_rejected', r.status === 401);

  // admin resets that agent's password
  r = await fetch(BASE + '/api/agents/' + uname + '/reset-password', { method: 'POST', headers: H(t), body: JSON.stringify({ password: 'reset123' }) });
  rec('admin_reset_pw', r.status === 200);

  // admin deletes the agent
  r = await fetch(BASE + '/api/agents/' + uname, { method: 'DELETE', headers: H(t) });
  rec('admin_delete', r.status === 200);

  // admin cannot delete self
  r = await fetch(BASE + '/api/agents/admin', { method: 'DELETE', headers: H(t) });
  rec('cannot_delete_self', r.status === 400);

  console.log(log.join('\n'));
  process.exit(0);
})().catch(e => { console.error('ERR', e); process.exit(1); });
