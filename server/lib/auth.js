'use strict';
/* Băm mật khẩu (bcryptjs) + JWT cho đăng nhập nhân viên. */
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const EXPIRES = '12h';

function hash(pw) { return bcrypt.hashSync(String(pw), 10); }
function verifyPw(pw, h) { try { return bcrypt.compareSync(String(pw), h || ''); } catch (e) { return false; } }
function sign(agent) { return jwt.sign({ sub: agent.username, name: agent.name, role: agent.role || 'agent' }, SECRET, { expiresIn: EXPIRES }); }
function verifyToken(t) { try { return jwt.verify(t, SECRET); } catch (e) { return null; } }

module.exports = { hash, verifyPw, sign, verifyToken };
