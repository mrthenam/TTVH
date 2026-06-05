'use strict';
/* Chuyển dữ liệu từ data/store.json sang Postgres.
   Dùng: node migrate-json-to-pg.js   (sau khi đã đặt DATABASE_URL trong .env)
   An toàn chạy lại nhiều lần (không nhân đôi). */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

if (!process.env.DATABASE_URL || !process.env.DATABASE_URL.trim()) {
  console.error('❌ Chưa đặt DATABASE_URL trong .env — không biết kết nối Postgres nào.');
  process.exit(1);
}
const fs = require('fs');
const db = require('./lib/db-pg');

(async () => {
  const file = path.join(__dirname, 'data', 'store.json');
  let data;
  try { data = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { console.error('❌ Không đọc được', file, '-', e.message); process.exit(1); }

  await db.ensureSchema();
  const c = await db.importData(data);
  console.log('✓ Đã nhập vào Postgres:');
  console.log('   • Nhân viên/Quản trị :', c.agents);
  console.log('   • Khách (hội thoại)  :', c.conversations);
  console.log('   • Tin nhắn           :', c.messages);
  console.log('   • Bài đăng           :', c.posts);
  console.log('   • Ảnh carousel       :', c.carousel);
  console.log('Xong. Giờ chạy server (npm run dev) sẽ dùng Postgres.');
  process.exit(0);
})().catch(e => { console.error('Lỗi:', e.message); process.exit(1); });
