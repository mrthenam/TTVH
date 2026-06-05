'use strict';
/* Tạo / cập nhật tài khoản nhân viên.
   Dùng: node create-agent.js <username> <password> "<Tên hiển thị>" */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const store = require('./lib/store');
const auth = require('./lib/auth');

(async () => {
  const [, , username, password, ...nameParts] = process.argv;
  if (!username || !password) {
    console.log('Dùng: node create-agent.js <username> <password> "<Tên hiển thị>"');
    process.exit(1);
  }
  await store.init();
  const name = nameParts.join(' ') || username;
  await store.createAgent(username, auth.hash(password), name);
  console.log('✓ Đã tạo/cập nhật nhân viên: ' + username + ' (' + name + ')  [backend: ' + (store.usePg ? 'postgres' : 'json') + ']');
  process.exit(0);
})().catch(e => { console.error('Lỗi:', e.message); process.exit(1); });
