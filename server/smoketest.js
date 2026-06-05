'use strict';
/* Test end-to-end: đăng nhập nhân viên (JWT) + preset + typing + tiếp nhận + bot ngưng. */
const WebSocket = require('ws');
const BASE = 'http://localhost:8787';
const URL = 'ws://localhost:8787/ws';
const CID = 'smoke_' + Date.now().toString(36);
const log = [];
const rec = (t, x) => log.push(t + ': ' + JSON.stringify(x));
const wait = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  // ---- agent login ----
  const lr = await fetch(BASE + '/api/agent/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: process.env.AGENT_DEFAULT_USER || 'admin', password: process.env.AGENT_DEFAULT_PASS || 'admin123' }) });
  const lj = await lr.json();
  rec('login_ok', lr.status === 200 && !!lj.token);
  rec('login_name', lj.name);
  const badLogin = await fetch(BASE + '/api/agent/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'wrong' }) });
  rec('bad_login_rejected', badLogin.status === 401);
  const token = lj.token;

  // ---- customer ----
  const cust = new WebSocket(URL); const cm = [];
  cust.on('message', d => cm.push(JSON.parse(d)));
  await new Promise(r => cust.on('open', r));
  cust.send(JSON.stringify({ type: 'hello', role: 'customer', cid: CID }));
  await wait(200);
  rec('welcome', cm.some(m => m.type === 'welcome'));

  cust.send(JSON.stringify({ type: 'user_msg', text: 'cho mình hỏi tuyển dụng với' }));
  await wait(1400);
  rec('typing_bot', cm.some(m => m.type === 'typing' && m.on && m.who === 'bot'));
  const bot = cm.filter(m => m.type === 'message' && m.message.role === 'bot').pop();
  rec('preset_recruitment', !!(bot && bot.message.text.indexOf('Talent Acquisition') > -1));

  // ---- agent (with JWT) ----
  const agent = new WebSocket(URL); const am = [];
  agent.on('message', d => am.push(JSON.parse(d)));
  await new Promise(r => agent.on('open', r));
  agent.send(JSON.stringify({ type: 'hello', role: 'agent', token: token }));
  await wait(250);
  const init = am.find(m => m.type === 'agent_init');
  rec('agent_init', !!init);
  rec('agent_me', init && init.me);
  rec('agent_sees_convo', !!(init && init.conversations.some(c => c.cid === CID)));

  // bad token rejected
  const badAgent = new WebSocket(URL); const bam = [];
  badAgent.on('message', d => bam.push(JSON.parse(d)));
  await new Promise(r => badAgent.on('open', r));
  badAgent.send(JSON.stringify({ type: 'hello', role: 'agent', token: 'not-a-jwt' }));
  await wait(200);
  rec('bad_token_auth_error', bam.some(m => m.type === 'auth_error'));

  // takeover + reply
  agent.send(JSON.stringify({ type: 'agent_msg', cid: CID, text: 'Chào bạn, nhân viên hỗ trợ đây ạ!' }));
  await wait(300);
  const modeMsg = cm.find(m => m.type === 'mode' && m.mode === 'human');
  rec('customer_mode_human', !!modeMsg);
  rec('mode_includes_agent_name', !!(modeMsg && modeMsg.agent));
  rec('customer_got_agent_msg', cm.some(m => m.type === 'message' && m.message.role === 'agent' && m.message.agentName));

  // customer message in human mode -> bot silent
  const before = cm.filter(m => m.type === 'message' && m.message.role === 'bot').length;
  cust.send(JSON.stringify({ type: 'user_msg', text: 'còn món nào ngon không' }));
  await wait(1300);
  const after = cm.filter(m => m.type === 'message' && m.message.role === 'bot').length;
  rec('bot_silent_in_human', after === before);

  agent.send(JSON.stringify({ type: 'set_mode', cid: CID, mode: 'auto' }));
  await wait(300);
  rec('release_to_auto', cm.some(m => m.type === 'mode' && m.mode === 'auto'));

  cust.close(); agent.close(); badAgent.close();
  console.log(log.join('\n'));
  process.exit(0);
})().catch(e => { console.error('TEST ERROR', e); process.exit(1); });
