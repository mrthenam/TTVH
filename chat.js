/* ============================================================
   Thịnh Thế Vinh Hoa — Trợ lý chat (client, kết nối backend realtime)
   Giao tiếp với server qua WebSocket /ws.
   - (1) preset, (2) Gemini: xử lý phía máy chủ
   - (3) nhân viên tiếp nhận -> server gửi mode 'human', bot ngưng
   - (4) ngữ cảnh: server lưu theo customerId (gửi kèm cid)
   - (5) "Đang trả lời, xin chờ giây lát…": server gửi sự kiện typing
   ============================================================ */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var panel = $('chat-panel'), toggle = $('chat-toggle'), closeBtn = $('chat-close');
  var msgsEl = $('chat-messages'), typingEl = $('chat-typing'), typingText = $('chat-typing-text');
  var form = $('chat-form'), input = $('chat-input');
  var banner = $('chat-human-banner'), statusText = $('chat-status-text'), statusDot = $('chat-status-dot');
  var settingsBtn = $('chat-settings-btn'), settings = $('chat-settings');
  var connDot = $('chat-conn-dot'), connText = $('chat-conn-text');
  var badge = $('chat-badge');
  if (!panel || !toggle) return;

  /* identity (giữ để khách quay lại vẫn đúng ngữ cảnh) */
  function uid() { return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  var cid = localStorage.getItem('ttvh_cid') || (function () { var v = uid(); localStorage.setItem('ttvh_cid', v); return v; })();

  var isOpen = false, mode = 'auto', agentName = null, ws = null, connected = false, retry = 0, greeted = false;

  /* ---------- render ---------- */
  function esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function bubble(role, text) {
    var wrap = document.createElement('div');
    var isUser = role === 'user';
    wrap.className = 'flex ' + (isUser ? 'justify-end' : 'justify-start');
    var b = document.createElement('div');
    var base = 'max-w-[82%] px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words shadow-soft';
    if (isUser) b.className = base + ' bg-[#0068FF] text-white rounded-2xl rounded-br-md';
    else if (role === 'agent') {
      b.className = base + ' bg-white text-ink rounded-2xl rounded-bl-md ring-1 ring-amber/40';
      var tag = document.createElement('div'); tag.className = 'text-[11px] font-700 text-amber-deep mb-0.5'; tag.textContent = 'Nhân viên'; b.appendChild(tag);
    } else b.className = base + ' bg-white text-ink rounded-2xl rounded-bl-md ring-1 ring-ink/5';
    var span = document.createElement('span'); span.innerHTML = esc(text); b.appendChild(span);
    wrap.appendChild(b); return wrap;
  }
  function scrollBottom() { requestAnimationFrame(function () { msgsEl.scrollTop = msgsEl.scrollHeight; }); }
  function addBubble(role, text) { msgsEl.appendChild(bubble(role, text)); scrollBottom(); if (!isOpen && role !== 'user') showBadge(); }
  function renderHistory(list) { msgsEl.innerHTML = ''; (list || []).forEach(function (m) { msgsEl.appendChild(bubble(m.role, m.text)); }); scrollBottom(); }

  function applyMode() {
    var human = mode === 'human';
    var who = agentName ? (' ' + agentName) : '';
    banner.classList.toggle('hidden', !human);
    if (human) banner.textContent = 'Nhân viên' + who + ' đang trực tiếp hỗ trợ bạn — trợ lý tự động tạm dừng.';
    statusText.textContent = human ? ('Nhân viên' + who + ' đang hỗ trợ') : 'Tự động trả lời';
    statusDot.className = 'w-2 h-2 rounded-full ' + (human ? 'bg-amber' : 'bg-emerald-400');
  }

  function showTyping(on, who) {
    typingText.textContent = who === 'agent' ? 'Nhân viên đang soạn tin' : 'Đang trả lời, xin chờ giây lát';
    typingEl.style.display = on ? 'flex' : 'none';
    if (on) scrollBottom();
  }

  function setConn(state) {
    connected = state === 'on';
    if (!connDot) return;
    if (state === 'on') { connDot.className = 'w-2.5 h-2.5 rounded-full bg-emerald-500'; connText.textContent = 'Đã kết nối máy chủ'; }
    else if (state === 'connecting') { connDot.className = 'w-2.5 h-2.5 rounded-full bg-amber'; connText.textContent = 'Đang kết nối…'; }
    else { connDot.className = 'w-2.5 h-2.5 rounded-full bg-gray-400'; connText.textContent = 'Mất kết nối — đang thử lại…'; }
  }

  /* ---------- badge ---------- */
  function showBadge() { if (badge) badge.classList.remove('hidden'); }
  function clearBadge() { if (badge) badge.classList.add('hidden'); }

  /* ---------- websocket ---------- */
  function connect() {
    setConn('connecting');
    var proto = location.protocol === 'https:' ? 'wss' : 'ws';
    try { ws = new WebSocket(proto + '://' + location.host + '/ws'); }
    catch (e) { scheduleReconnect(); return; }

    ws.onopen = function () { retry = 0; setConn('on'); send({ type: 'hello', role: 'customer', cid: cid }); };
    ws.onmessage = function (ev) {
      var m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.type === 'welcome') {
        if (m.cid) { cid = m.cid; localStorage.setItem('ttvh_cid', cid); }
        mode = m.mode || 'auto'; agentName = m.agent || null; applyMode();
        if (m.history && m.history.length) { renderHistory(m.history); greeted = true; }
        else if (!greeted) { greeted = true; addBubble('bot', 'Xin chào! 👋 Mình là trợ lý của Thịnh Thế Vinh Hoa. Mình có thể giúp bạn về thương hiệu, tuyển dụng, đặt món hoặc liên hệ. Bạn cần hỗ trợ gì ạ?'); }
      } else if (m.type === 'message') {
        addBubble(m.message.role, m.message.text);
      } else if (m.type === 'mode') {
        mode = m.mode; agentName = m.agent || null; applyMode();
      } else if (m.type === 'typing') {
        showTyping(!!m.on, m.who);
      }
    };
    ws.onclose = function () { setConn('off'); scheduleReconnect(); };
    ws.onerror = function () { try { ws.close(); } catch (e) {} };
  }
  function scheduleReconnect() { retry = Math.min(retry + 1, 6); setTimeout(connect, 800 * retry); }
  function send(obj) { try { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); } catch (e) {} }

  /* ---------- open / close ---------- */
  function open() { isOpen = true; panel.classList.add('is-open'); toggle.setAttribute('aria-expanded', 'true'); toggle.classList.remove('chat-pulse'); clearBadge(); scrollBottom(); setTimeout(function () { input.focus(); }, 100); }
  function close() { isOpen = false; panel.classList.remove('is-open'); toggle.setAttribute('aria-expanded', 'false'); }
  toggle.addEventListener('click', function () { isOpen ? close() : open(); });
  closeBtn.addEventListener('click', close);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && isOpen) close(); });
  settingsBtn.addEventListener('click', function () { settings.classList.toggle('hidden'); });

  /* ---------- input ---------- */
  function autosize() { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 112) + 'px'; }
  input.addEventListener('input', autosize);
  input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); } });
  form.addEventListener('submit', function (e) { e.preventDefault(); doSend(); });

  function doSend() {
    var text = (input.value || '').trim();
    if (!text) return;
    input.value = ''; autosize();
    addBubble('user', text);                 // hiển thị ngay (lạc quan)
    if (!connected) { addBubble('bot', '(Đang mất kết nối máy chủ — vui lòng thử lại sau giây lát.)'); return; }
    send({ type: 'user_msg', text: text });
  }

  /* ---------- init ---------- */
  applyMode();
  connect();
})();
