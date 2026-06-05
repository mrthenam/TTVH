'use strict';
/* Tạo VIEW xem hội thoại gom theo từng khách hàng (đọc trong pgAdmin). */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
if (!process.env.DATABASE_URL) { console.error('Chưa đặt DATABASE_URL'); process.exit(1); }
const { Client } = require('pg');

const SQL = `
CREATE OR REPLACE VIEW v_hoi_thoai AS
SELECT
  c.cid                                   AS ma_khach,
  c.mode                                  AS che_do,
  c.assigned_to                           AS phu_trach,
  COUNT(m.id)                             AS so_tin,
  to_timestamp(MIN(m.ts) / 1000.0)        AS bat_dau,
  to_timestamp(MAX(m.ts) / 1000.0)        AS cap_nhat,
  string_agg(
    '[' || CASE m.role
             WHEN 'user'  THEN 'Khách'
             WHEN 'bot'   THEN 'Bot'
             WHEN 'agent' THEN COALESCE(m.agent_name, 'NV')
             ELSE m.role END
    || '] ' || m.text,
    E'\n' ORDER BY m.ts, m.id
  )                                        AS noi_dung
FROM conversations c
LEFT JOIN messages m ON m.cid = c.cid
GROUP BY c.cid, c.mode, c.assigned_to
ORDER BY MAX(m.ts) DESC NULLS LAST;

CREATE OR REPLACE VIEW v_tin_nhan AS
SELECT
  m.cid                                   AS ma_khach,
  to_timestamp(m.ts / 1000.0)             AS thoi_gian,
  CASE m.role
    WHEN 'user'  THEN 'Khách'
    WHEN 'bot'   THEN 'Bot'
    WHEN 'agent' THEN COALESCE(m.agent_name, 'NV')
    ELSE m.role END                        AS nguoi_gui,
  m.text                                   AS noi_dung
FROM messages m
ORDER BY m.cid, m.ts, m.id;
`;

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined });
  await c.connect();
  await c.query(SQL);
  const a = (await c.query('SELECT COUNT(*)::int n FROM v_hoi_thoai')).rows[0].n;
  console.log('✓ Đã tạo view: v_hoi_thoai (' + a + ' hội thoại) và v_tin_nhan');
  await c.end();
  process.exit(0);
})().catch(e => { console.error('Lỗi:', e.message); process.exit(1); });
