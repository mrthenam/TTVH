/* ============================================================
   Trợ lý Vinh Hoa — giao diện chat công khai
   Kết nối backend realtime qua WebSocket /ws (giữ nguyên giao thức cũ).
   Nguyên tắc hiển thị: khách không thấy bất kỳ chi tiết kỹ thuật nào
   (engine, API, khoá, bảng nhân viên…).
   ============================================================ */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  var panel = $('chat-panel'),
    toggle = $('chat-toggle'),
    closeBtn = $('chat-close'),
    msgsEl = $('chat-messages'),
    quickEl = $('chat-quick'),
    typingEl = $('chat-typing'),
    typingText = $('chat-typing-text'),
    form = $('chat-form'),
    input = $('chat-input'),
    sendBtn = $('chat-send'),
    banner = $('chat-banner'),
    statusEl = $('chat-status'),
    handoffBtn = $('chat-handoff'),
    badge = $('chat-badge');

  if (!panel || !toggle) return;

  var GREETING = 'Xin chào! Tôi có thể giúp bạn tìm hiểu về Thịnh Thế Vinh Hoa.';

  var QUICK_ACTIONS = [
    { label: 'Các thương hiệu', text: 'Thịnh Thế Vinh Hoa có những thương hiệu nào?' },
    { label: 'Cơ hội nghề nghiệp', text: 'Công ty đang tuyển dụng vị trí nào?' },
    { label: 'Hợp tác kinh doanh', text: 'Tôi muốn tìm hiểu về hợp tác kinh doanh.' },
    { label: 'Thông tin liên hệ', text: 'Cho tôi xin thông tin liên hệ của công ty.' }
  ];

  /* ---------- danh tính khách (giữ ngữ cảnh khi quay lại) ---------- */
  function uid() { return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  var cid = localStorage.getItem('ttvh_cid') || (function () {
    var v = uid();
    try { localStorage.setItem('ttvh_cid', v); } catch (e) {}
    return v;
  })();

  var isOpen = false,
    mode = 'auto',
    agentName = null,
    ws = null,
    connected = false,
    retry = 0,
    greeted = false;

  /* ---------- render ---------- */
  function bubble(role, text) {
    var b = document.createElement('div');
    var kind = role === 'user' ? 'user' : (role === 'agent' ? 'agent' : 'bot');
    b.className = 'chat__msg chat__msg--' + kind;

    if (kind === 'agent') {
      var who = document.createElement('span');
      who.className = 'chat__msg-who';
      who.textContent = agentName ? ('Chuyên viên ' + agentName) : 'Chuyên viên';
      b.appendChild(who);
    }
    b.appendChild(document.createTextNode(text || ''));
    return b;
  }

  function scrollBottom() {
    requestAnimationFrame(function () { msgsEl.scrollTop = msgsEl.scrollHeight; });
  }

  function addBubble(role, text) {
    msgsEl.appendChild(bubble(role, text));
    scrollBottom();
    if (!isOpen && role !== 'user') showBadge();
  }

  function renderHistory(list) {
    msgsEl.textContent = '';
    (list || []).forEach(function (m) { msgsEl.appendChild(bubble(m.role, m.text)); });
    scrollBottom();
  }

  /* ---------- gợi ý nhanh ---------- */
  function renderQuick() {
    if (!quickEl) return;
    quickEl.textContent = '';
    QUICK_ACTIONS.forEach(function (q) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = q.label;
      b.addEventListener('click', function () { submit(q.text); });
      quickEl.appendChild(b);
    });
    quickEl.hidden = false;
  }
  function hideQuick() { if (quickEl) quickEl.hidden = true; }

  /* ---------- trạng thái hội thoại ---------- */
  function applyMode() {
    var human = mode === 'human';
    var who = agentName ? (' ' + agentName) : '';

    if (banner) {
      banner.hidden = !human;
      if (human) banner.textContent = 'Chuyên viên' + who + ' đang hỗ trợ bạn trực tiếp.';
    }
    if (statusEl) {
      statusEl.textContent = human ? ('Chuyên viên' + who + ' đang hỗ trợ') : 'Đang trực tuyến';
    }
    if (handoffBtn) handoffBtn.hidden = human;
  }

  function showTyping(on, who) {
    if (!typingEl) return;
    typingText.textContent = who === 'agent' ? 'Chuyên viên đang soạn tin' : 'Đang trả lời';
    typingEl.hidden = !on;
    if (on) scrollBottom();
  }

  function showBadge() { if (badge) badge.hidden = false; }
  function clearBadge() { if (badge) badge.hidden = true; }

  /* ---------- kết nối ---------- */
  function connect() {
    var proto = location.protocol === 'https:' ? 'wss' : 'ws';
    try { ws = new WebSocket(proto + '://' + location.host + '/ws'); }
    catch (e) { scheduleReconnect(); return; }

    ws.onopen = function () {
      retry = 0;
      connected = true;
      send({ type: 'hello', role: 'customer', cid: cid });
    };

    ws.onmessage = function (ev) {
      var m;
      try { m = JSON.parse(ev.data); } catch (e) { return; }

      if (m.type === 'welcome') {
        if (m.cid) {
          cid = m.cid;
          try { localStorage.setItem('ttvh_cid', cid); } catch (e) {}
        }
        mode = m.mode || 'auto';
        agentName = m.agent || null;
        applyMode();

        if (m.history && m.history.length) {
          renderHistory(m.history);
          greeted = true;
          hideQuick();
        } else if (!greeted) {
          greeted = true;
          addBubble('bot', GREETING);
          renderQuick();
        }
      } else if (m.type === 'message') {
        addBubble(m.message.role, m.message.text);
      } else if (m.type === 'mode') {
        mode = m.mode;
        agentName = m.agent || null;
        applyMode();
      } else if (m.type === 'typing') {
        showTyping(!!m.on, m.who);
      }
    };

    ws.onclose = function () { connected = false; scheduleReconnect(); };
    ws.onerror = function () { try { ws.close(); } catch (e) {} };
  }

  function scheduleReconnect() {
    retry = Math.min(retry + 1, 6);
    setTimeout(connect, 800 * retry);
  }

  function send(obj) {
    try { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); } catch (e) {}
  }

  /* ---------- mở / đóng ---------- */
  function open() {
    isOpen = true;
    panel.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    clearBadge();
    scrollBottom();
    setTimeout(function () { input.focus(); }, 60);
  }
  function close() {
    isOpen = false;
    panel.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
    toggle.focus();
  }

  toggle.addEventListener('click', function () { isOpen ? close() : open(); });
  if (closeBtn) closeBtn.addEventListener('click', close);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && isOpen) close();
  });

  /* ---------- ô nhập ---------- */
  function autosize() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 96) + 'px';
  }
  input.addEventListener('input', autosize);
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(input.value); }
  });
  form.addEventListener('submit', function (e) { e.preventDefault(); submit(input.value); });

  function submit(raw) {
    var text = (raw || '').trim();
    if (!text) return;

    input.value = '';
    autosize();
    hideQuick();
    addBubble('user', text);

    if (!connected) {
      addBubble('bot', 'Kết nối đang gián đoạn. Bạn vui lòng thử lại sau giây lát, hoặc gọi 028 7108 0719 để được hỗ trợ ngay.');
      return;
    }
    send({ type: 'user_msg', text: text });
  }

  /* ---------- chuyển sang hỗ trợ trực tiếp ---------- */
  if (handoffBtn) {
    handoffBtn.addEventListener('click', function () {
      submit('Tôi muốn gặp nhân viên để được hỗ trợ trực tiếp.');
    });
  }

  /* ---------- khởi động ---------- */
  applyMode();
  connect();
})();
