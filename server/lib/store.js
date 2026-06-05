'use strict';
/* Chọn backend lưu trữ:
   - Có DATABASE_URL  -> Postgres (lib/db-pg.js)
   - Không            -> JSON     (lib/store-json.js)  [dùng cho dev]
   Cả hai cùng giao diện async. */
const usePg = !!(process.env.DATABASE_URL && process.env.DATABASE_URL.trim());
const impl = usePg ? require('./db-pg') : require('./store-json');
impl.usePg = usePg;
module.exports = impl;
