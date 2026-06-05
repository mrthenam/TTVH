'use strict';
const BASE = 'http://127.0.0.1:8787';
const log = [], rec = (t, x) => log.push(t + ': ' + JSON.stringify(x));
const H = t => ({ 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + t });
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

(async () => {
  const lj = await (await fetch(BASE + '/api/agent/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'admin123' }) })).json();
  const t = lj.token; rec('login', !!t);

  // posts
  let r = await fetch(BASE + '/api/posts', { method: 'POST', headers: H(t), body: JSON.stringify({ title: 'Khai trương chi nhánh mới', body: 'MAYCHA mở chi nhánh mới, mời bạn ghé thử!', published: true }) });
  const post = await r.json(); rec('create_post', r.status === 200 && !!post.id);
  let pub = await (await fetch(BASE + '/api/posts')).json();
  rec('public_sees_post', (pub.posts || []).some(p => p.id === post.id));

  // upload + carousel
  r = await fetch(BASE + '/api/upload', { method: 'POST', headers: H(t), body: JSON.stringify({ dataUrl: PNG }) });
  const up = await r.json(); rec('upload', r.status === 200 && /^images\/uploads\//.test(up.url || ''));
  r = await fetch(BASE + '/api/carousel', { method: 'POST', headers: H(t), body: JSON.stringify({ src: up.url }) });
  const cs = await r.json(); rec('add_carousel', r.status === 200 && !!cs.id);
  let cl = await (await fetch(BASE + '/api/carousel')).json();
  rec('carousel_has_item', (cl.items || []).some(x => x.id === cs.id));
  rec('carousel_seeded_count>=4', (cl.items || []).length >= 5);

  // unauth cannot post
  r = await fetch(BASE + '/api/posts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'x' }) });
  rec('unauth_blocked_401', r.status === 401);

  // cleanup
  rec('del_post', (await fetch(BASE + '/api/posts/' + post.id, { method: 'DELETE', headers: H(t) })).status === 200);
  rec('del_carousel', (await fetch(BASE + '/api/carousel/' + cs.id, { method: 'DELETE', headers: H(t) })).status === 200);

  console.log(log.join('\n'));
  process.exit(0);
})().catch(e => { console.error('ERR', e); process.exit(1); });
