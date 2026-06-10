'use strict';
var $ = function (id) { return document.getElementById(id); };
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function fmtDate(ts) { try { return ts ? new Date(ts).toLocaleDateString('vi-VN') : '—'; } catch (e) { return '—'; } }
function fmtDateTime(ts) { try { return ts ? new Date(ts).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : ''; } catch (e) { return ''; } }

var token = localStorage.getItem('ttvh_agent_jwt') || '';
var META = null, ME = null, CAN_EDIT = false, LIST = [], statusChart = null;
function H() { return { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }; }
async function api(url, opts) { var r = await fetch(url, opts || { headers: H() }); if (r.status === 401) { showLogin(); throw new Error('401'); } return r; }

var ROLE_LABEL = { admin: 'Admin/AI Leader', hr: 'HR', bod: 'BOD', branch_manager: 'Quản lý chi nhánh', dept_head: 'Trưởng bộ phận', mentor: 'Người hướng dẫn', '': 'Chưa phân quyền' };
var RECO = ['Đạt', 'Cần training thêm', 'Gia hạn thử việc', 'Không phù hợp'];
var STATUS_CLR = { onboarding: 'bg-sky-100 text-sky-700', thieu_ho_so: 'bg-amber-100 text-amber-700', da_training: 'bg-indigo-100 text-indigo-700', sap_danh_gia: 'bg-purple-100 text-purple-700', hoan_tat: 'bg-emerald-100 text-emerald-700', nghi_som: 'bg-rose-100 text-rose-700' };

/* ---------- auth ---------- */
function showLogin() { $('login').style.display = 'grid'; $('app').classList.add('hidden'); }
function showApp() { $('login').style.display = 'none'; $('app').classList.remove('hidden'); }
$('login-form').addEventListener('submit', async function (e) {
  e.preventDefault(); $('li-err').classList.add('hidden');
  try {
    var r = await fetch('/api/agent/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: $('li-user').value.trim(), password: $('li-pass').value }) });
    var j = await r.json();
    if (!r.ok) { $('li-err').textContent = j.error || 'Đăng nhập thất bại'; $('li-err').classList.remove('hidden'); return; }
    token = j.token; localStorage.setItem('ttvh_agent_jwt', token); boot();
  } catch (e) { $('li-err').textContent = 'Không kết nối được máy chủ'; $('li-err').classList.remove('hidden'); }
});
$('logout').addEventListener('click', function () { localStorage.removeItem('ttvh_agent_jwt'); token = ''; showLogin(); });

/* ---------- boot ---------- */
async function boot() {
  if (!token) return showLogin();
  try {
    var r = await fetch('/api/onboarding/meta', { headers: H() });
    if (r.status === 401) return showLogin();
    META = await r.json(); ME = META.me; CAN_EDIT = META.canEdit;
    showApp();
    $('me-info').innerHTML = esc(ME.name) + '<br><span class="text-cream/50">' + esc(ROLE_LABEL[ME.obRole] || ME.obRole) + (ME.branch ? ' · ' + esc(ME.branch) : '') + (ME.department ? ' · ' + esc(ME.department) : '') + '</span>';
    if (CAN_EDIT) { $('btn-new').classList.remove('hidden'); $('btn-import').classList.remove('hidden'); $('btn-sample').classList.remove('hidden'); }
    // fill position select
    $('f-position').innerHTML = META.positions.map(function (p) { return '<option value="' + p.key + '">' + esc(p.label) + '</option>'; }).join('');
    go('dashboard'); loadNotifs(); setInterval(loadNotifs, 60000);
  } catch (e) { showLogin(); }
}

/* ---------- nav ---------- */
var titles = { dashboard: 'Dashboard', list: 'Danh sách nhân viên onboarding', detail: 'Chi tiết nhân viên', report: 'Báo cáo AI' };
function go(name) {
  document.querySelectorAll('[data-panel]').forEach(function (s) { s.classList.toggle('hidden', s.getAttribute('data-panel') !== name); });
  document.querySelectorAll('.nav-btn').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-go') === name); });
  $('title').textContent = titles[name] || '';
  if (name === 'dashboard') loadDashboard();
  if (name === 'list') loadList();
}
document.querySelectorAll('.nav-btn').forEach(function (b) { b.addEventListener('click', function () { go(b.getAttribute('data-go')); }); });

/* ---------- dashboard ---------- */
async function loadDashboard() {
  try {
    var d = await (await api('/api/onboarding/stats/dashboard')).json();
    var cards = [
      ['NV mới trong tháng', d.newThisMonth, 'text-ink'],
      ['Đang onboarding', d.onboarding, 'text-sky-600'],
      ['Hoàn tất', d.completed, 'text-emerald-600'],
      ['Thiếu hồ sơ', d.missingDocs, 'text-amber-600'],
      ['Nghỉ trong 7 ngày đầu', d.leftFirst7, 'text-rose-600'],
      ['Tổng hồ sơ', d.total, 'text-ink']
    ];
    $('ob-stats').innerHTML = cards.map(function (c) { return '<div class="bg-paper rounded-2xl ring-1 ring-ink/10 p-4"><div class="text-2xl font-700 ' + c[2] + '">' + c[1] + '</div><div class="text-sm text-ink-soft">' + c[0] + '</div></div>'; }).join('');
    $('ob-slow').innerHTML = (d.slowBranches || []).length ? d.slowBranches.map(function (b) { return '<div class="flex justify-between py-1 border-b border-ink/5"><span>' + esc(b.branch) + '</span><span class="text-crimson font-600">' + b.slow + ' task quá hạn</span></div>'; }).join('') : '<span class="text-ink-soft">Không có chi nhánh nào trễ 👍</span>';
    $('ob-leave').innerHTML = (d.leavePos || []).length ? d.leavePos.map(function (p) { return '<div class="flex justify-between py-1 border-b border-ink/5"><span>' + esc(p.label) + '</span><span class="text-rose-600 font-600">' + p.rate + '% (' + p.left + '/' + p.total + ')</span></div>'; }).join('') : '<span class="text-ink-soft">Chưa có dữ liệu nghỉ sớm.</span>';
    // chart
    var labels = [], data = [], colors = [];
    var clr = { onboarding: '#3B82F6', thieu_ho_so: '#D97706', da_training: '#6366F1', sap_danh_gia: '#9333EA', hoan_tat: '#059669', nghi_som: '#E11D48' };
    Object.keys(META.statuses).forEach(function (k) { labels.push(META.statuses[k]); data.push((d.byStatus && d.byStatus[k]) || 0); colors.push(clr[k]); });
    if (statusChart) statusChart.destroy();
    statusChart = new Chart($('ch-status').getContext('2d'), { type: 'doughnut', data: { labels: labels, datasets: [{ data: data, backgroundColor: colors }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } } } });
  } catch (e) {}
}

/* ---------- list ---------- */
async function loadList() {
  try { var j = await (await api('/api/onboarding')).json(); LIST = j.items || []; renderList(); } catch (e) {}
}
function renderList() {
  var q = ($('ob-search').value || '').toLowerCase();
  var rows = LIST.filter(function (r) { return !q || ((r.fullName + ' ' + r.positionLabel + ' ' + (r.branch || '')).toLowerCase().indexOf(q) > -1); });
  $('ob-empty').classList.toggle('hidden', rows.length > 0);
  $('ob-tbody').innerHTML = rows.map(function (r) {
    return '<tr class="border-t border-ink/5 hover:bg-cream cursor-pointer" data-id="' + r.id + '">'
      + '<td class="p-3 font-600">' + esc(r.fullName) + '</td>'
      + '<td class="p-3">' + esc(r.positionLabel) + '</td>'
      + '<td class="p-3">' + esc(r.branch || '—') + '</td>'
      + '<td class="p-3">' + fmtDate(r.startDate) + '</td>'
      + '<td class="p-3"><div class="flex items-center gap-2"><div class="w-20 h-2 rounded-full bg-ink/10 overflow-hidden"><div class="h-full bg-crimson" style="width:' + r.progress.pct + '%"></div></div><span class="text-xs text-ink-soft">' + r.progress.done + '/' + r.progress.total + '</span></div></td>'
      + '<td class="p-3"><span class="badge ' + (STATUS_CLR[r.status] || 'bg-ink/10') + '">' + esc(r.statusLabel) + '</span></td></tr>';
  }).join('');
  document.querySelectorAll('#ob-tbody [data-id]').forEach(function (tr) { tr.onclick = function () { openDetail(tr.getAttribute('data-id')); }; });
}
$('ob-search').addEventListener('input', renderList);

/* ---------- detail ---------- */
async function openDetail(id) {
  go('detail');
  var el = document.querySelector('[data-panel="detail"]');
  el.innerHTML = '<p class="text-ink-soft">Đang tải…</p>';
  try {
    var r = await (await api('/api/onboarding/' + id)).json();
    el.innerHTML = renderDetail(r);
    wireDetail(r);
  } catch (e) { el.innerHTML = '<p class="text-crimson">Lỗi tải hồ sơ.</p>'; }
}
function infoRow(k, v) { return '<div><div class="text-xs text-ink-soft">' + k + '</div><div class="font-600">' + esc(v || '—') + '</div></div>'; }
function renderDetail(r) {
  var now = Date.now();
  var groups = META.groups;
  var ckHtml = Object.keys(groups).map(function (g) {
    var items = (r.checklist || []).filter(function (c) { return c.group === g; });
    if (!items.length) return '';
    return '<div class="mb-3"><div class="text-sm font-600 text-crimson-deep mb-1">' + esc(groups[g]) + '</div>'
      + items.map(function (c) {
        var overdue = !c.done && c.deadline < now;
        return '<label class="flex items-start gap-2 py-1.5 border-b border-ink/5 cursor-pointer">'
          + '<input type="checkbox" data-ck="' + c.id + '" ' + (c.done ? 'checked' : '') + ' class="mt-1" />'
          + '<span class="flex-1"><span class="' + (c.done ? 'line-through text-ink-soft' : '') + '">' + esc(c.title) + '</span>'
          + '<span class="block text-xs ' + (overdue ? 'text-crimson font-600' : 'text-ink-soft') + '">Phụ trách: ' + esc(c.owner) + ' · hạn ' + fmtDate(c.deadline) + (overdue ? ' (quá hạn)' : '') + (c.done && c.doneBy ? ' · ✓ ' + esc(c.doneBy) : '') + '</span></span></label>';
      }).join('') + '</div>';
  }).join('');

  var evHtml = (r.evaluations || []).map(function (e) {
    if (e.status === 'done') {
      return '<div class="rounded-xl ring-1 ring-ink/10 p-3 mb-2"><div class="flex items-center gap-2"><b>' + esc(e.label) + '</b><span class="badge bg-emerald-100 text-emerald-700 ml-auto">Đã đánh giá</span></div>'
        + '<div class="text-sm mt-1">Thái độ ' + (e.attitude ?? '-') + ' · Kỹ năng ' + (e.skill ?? '-') + ' · Kỷ luật ' + (e.discipline ?? '-') + ' · Học việc ' + (e.learning ?? '-') + '</div>'
        + (e.comment ? '<div class="text-sm text-ink-soft mt-1">“' + esc(e.comment) + '”</div>' : '')
        + (e.recommendation ? '<div class="text-sm mt-1">Đề xuất: <b>' + esc(e.recommendation) + '</b></div>' : '')
        + (e.aiSummary ? '<div class="text-sm mt-2 p-2 rounded bg-sand"><b>🤖 AI tóm tắt:</b> ' + esc(e.aiSummary) + '</div>' : '')
        + '<div class="text-xs text-ink-soft mt-1">' + esc(e.evaluatedBy || '') + ' · ' + fmtDateTime(e.evaluatedAt) + '</div></div>';
    }
    var canEval = ME.obRole !== 'bod';
    return '<div class="rounded-xl ring-1 ring-ink/10 p-3 mb-2" data-evbox="' + e.id + '"><div class="flex items-center gap-2"><b>' + esc(e.label) + '</b>'
      + '<span class="text-xs text-ink-soft">hạn ' + fmtDate(e.dueDate) + '</span><span class="badge bg-amber-100 text-amber-700 ml-auto">Chưa đánh giá</span></div>'
      + (canEval ? ('<div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">'
        + ['attitude:Thái độ', 'skill:Kỹ năng', 'discipline:Kỷ luật', 'learning:Học việc'].map(function (x) { var k = x.split(':'); return '<label class="text-xs">' + k[1] + ' (0-10)<input type="number" min="0" max="10" data-ev="' + e.id + '" data-f="' + k[0] + '" class="inp mt-0.5" /></label>'; }).join('')
        + '</div><textarea data-ev="' + e.id + '" data-f="comment" rows="2" class="inp mt-2" placeholder="Nhận xét…"></textarea>'
        + '<div class="flex gap-2 mt-2"><select data-ev="' + e.id + '" data-f="recommendation" class="inp"><option value="">— Đề xuất —</option>' + RECO.map(function (x) { return '<option>' + x + '</option>'; }).join('') + '</select>'
        + '<button data-evsubmit="' + e.id + '" class="rounded-full bg-crimson text-cream px-4 py-2 text-sm font-600 whitespace-nowrap hover:bg-crimson-deep">Lưu + AI</button></div>') : '<div class="text-xs text-ink-soft mt-1">Bạn không có quyền đánh giá.</div>')
      + '</div>';
  }).join('');

  var actions = '';
  if (CAN_EDIT) {
    actions = '<div class="flex flex-wrap gap-2 mt-3">'
      + '<button id="d-edit" class="rounded-full bg-ink/10 px-3 py-1.5 text-sm font-600">Sửa thông tin</button>'
      + '<button id="d-complete" class="rounded-full bg-emerald-600 text-white px-3 py-1.5 text-sm font-600">Đánh dấu Hoàn tất</button>'
      + '<button id="d-left" class="rounded-full bg-rose-600 text-white px-3 py-1.5 text-sm font-600">Đánh dấu Nghỉ sớm</button>'
      + '<button id="d-del" class="rounded-full bg-crimson/10 text-crimson px-3 py-1.5 text-sm font-600 ml-auto">Xoá hồ sơ</button></div>';
  }
  var portal = location.origin + r.portalUrl;
  return '<button onclick="go(\'list\')" class="text-sm text-ink-soft hover:text-crimson mb-3">← Danh sách</button>'
    + '<div class="grid lg:grid-cols-[1fr_360px] gap-5 items-start">'
    + '<div class="bg-paper rounded-2xl ring-1 ring-ink/10 p-5">'
    + '<div class="flex items-center gap-2"><h3 class="font-display text-xl font-700">' + esc(r.fullName) + '</h3><span class="badge ' + (STATUS_CLR[r.status] || 'bg-ink/10') + '">' + esc(r.statusLabel) + '</span></div>'
    + '<div class="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3">'
    + infoRow('Vị trí', r.positionLabel) + infoRow('Phòng ban', r.department) + infoRow('Chi nhánh', r.branch)
    + infoRow('Ngày bắt đầu', fmtDate(r.startDate)) + infoRow('Ca làm', r.shift) + infoRow('Loại HĐ', r.contractType)
    + infoRow('Quản lý', r.managerName) + infoRow('Người hướng dẫn', r.mentorName) + infoRow('SĐT', r.phone)
    + infoRow('Email', r.email) + infoRow('Địa điểm', r.workplace) + infoRow('NV xác nhận đọc', r.employeeConfirmedAt ? fmtDateTime(r.employeeConfirmedAt) : 'Chưa') + '</div>'
    + (r.note ? '<div class="text-sm text-ink-soft mt-2">Ghi chú: ' + esc(r.note) + '</div>' : '')
    + actions
    + '<div class="mt-5"><div class="font-600 mb-2">📝 Đánh giá thử việc</div>' + evHtml + '</div>'
    + '</div>'
    + '<div class="space-y-4">'
    + '<div class="bg-paper rounded-2xl ring-1 ring-ink/10 p-4"><div class="font-600 mb-1">Checklist onboarding</div><div class="text-xs text-ink-soft mb-2">Tiến độ ' + r.progress.done + '/' + r.progress.total + ' (' + r.progress.pct + '%)</div>' + ckHtml + '</div>'
    + '<div class="bg-paper rounded-2xl ring-1 ring-ink/10 p-4"><div class="font-600 mb-1">🔗 Link trang nhân viên mới</div><input class="inp text-xs" readonly value="' + esc(portal) + '" onclick="this.select()" /><button onclick="navigator.clipboard.writeText(\'' + esc(portal) + '\');this.textContent=\'✓ Đã sao chép\'" class="mt-2 text-sm rounded-full bg-ink/10 px-3 py-1.5 font-600">Sao chép link</button></div>'
    + '</div></div>';
}
function wireDetail(r) {
  document.querySelectorAll('[data-ck]').forEach(function (cb) {
    cb.onchange = async function () {
      try { var res = await (await api('/api/onboarding/' + r.id + '/checklist/' + cb.getAttribute('data-ck'), { method: 'PATCH', headers: H(), body: JSON.stringify({ done: cb.checked }) })).json(); } catch (e) {}
    };
  });
  document.querySelectorAll('[data-evsubmit]').forEach(function (btn) {
    btn.onclick = async function () {
      var id = btn.getAttribute('data-evsubmit'); var body = {};
      document.querySelectorAll('[data-ev="' + id + '"]').forEach(function (inp) { body[inp.getAttribute('data-f')] = inp.value; });
      btn.textContent = 'Đang lưu…'; btn.disabled = true;
      try { await (await api('/api/onboarding/' + r.id + '/eval/' + id, { method: 'POST', headers: H(), body: JSON.stringify(body) })).json(); openDetail(r.id); }
      catch (e) { btn.textContent = 'Lỗi'; btn.disabled = false; }
    };
  });
  if (CAN_EDIT) {
    $('d-edit').onclick = function () { openForm(r); };
    $('d-complete').onclick = function () { setStatus(r.id, 'hoan_tat'); };
    $('d-left').onclick = function () { if (confirm('Đánh dấu nhân viên này nghỉ việc sớm?')) setStatus(r.id, 'nghi_som'); };
    $('d-del').onclick = async function () { if (!confirm('Xoá hồ sơ onboarding này?')) return; await api('/api/onboarding/' + r.id, { method: 'DELETE', headers: H() }); go('list'); };
  }
}
async function setStatus(id, s) { await api('/api/onboarding/' + id + '/status', { method: 'POST', headers: H(), body: JSON.stringify({ status: s }) }); openDetail(id); }

/* ---------- form ---------- */
function openForm(r) {
  $('modal').classList.remove('hidden'); $('modal').classList.add('flex');
  $('modal-title').textContent = r ? 'Sửa thông tin nhân viên' : 'Tạo nhân viên mới'; $('f-msg').textContent = '';
  $('f-id').value = r ? r.id : '';
  var f = ['fullName', 'phone', 'email', 'position', 'department', 'branch', 'managerName', 'managerUser', 'mentorName', 'mentorUser', 'contractType', 'shift', 'workplace', 'note'];
  f.forEach(function (k) { var el = $('f-' + k); if (el) el.value = r ? (r[k] || '') : ''; });
  $('f-startDate').value = r && r.startDate ? new Date(r.startDate).toISOString().slice(0, 10) : '';
}
function closeForm() { $('modal').classList.add('hidden'); $('modal').classList.remove('flex'); }
$('modal-close').onclick = closeForm; $('modal-cancel').onclick = closeForm;
$('btn-new').onclick = function () { openForm(null); };
$('ob-form').addEventListener('submit', async function (e) {
  e.preventDefault();
  var id = $('f-id').value; var body = {};
  ['fullName', 'phone', 'email', 'position', 'department', 'branch', 'managerName', 'managerUser', 'mentorName', 'mentorUser', 'contractType', 'shift', 'workplace', 'note'].forEach(function (k) { body[k] = $('f-' + k).value; });
  body.startDate = $('f-startDate').value || undefined;
  $('f-msg').textContent = 'Đang lưu…'; $('f-msg').className = 'text-sm self-center text-ink-soft';
  try {
    var url = id ? '/api/onboarding/' + id : '/api/onboarding';
    var r = await api(url, { method: id ? 'PUT' : 'POST', headers: H(), body: JSON.stringify(body) });
    var j = await r.json(); if (!r.ok) throw new Error(j.error || 'Lỗi');
    closeForm(); go('list');
    if (!id) setTimeout(function () { openDetail(j.id); }, 200);
  } catch (e) { $('f-msg').textContent = '✗ ' + e.message; $('f-msg').className = 'text-sm self-center text-crimson'; }
});

/* ---------- import / export ---------- */
$('btn-export').onclick = async function () {
  var msg = $('io-msg'); msg.textContent = 'Đang xuất Excel…'; msg.className = 'text-sm mb-3 text-ink-soft';
  try {
    var r = await fetch('/api/onboarding/export/xlsx', { headers: { 'Authorization': 'Bearer ' + token } });
    if (!r.ok) throw new Error('Lỗi export');
    var blob = await r.blob(); var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'onboarding-export.xlsx'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
    msg.textContent = '✓ Đã tải file export'; msg.className = 'text-sm mb-3 text-emerald-600';
  } catch (e) { msg.textContent = '✗ ' + e.message; msg.className = 'text-sm mb-3 text-crimson'; }
};
$('import-file').addEventListener('change', function () {
  var f = this.files && this.files[0]; if (!f) return; var input = this; var msg = $('io-msg');
  msg.textContent = 'Đang nhập "' + f.name + '"…'; msg.className = 'text-sm mb-3 text-ink-soft';
  var rd = new FileReader();
  rd.onload = async function () {
    try {
      var r = await fetch('/api/onboarding/import', { method: 'POST', headers: H(), body: JSON.stringify({ dataUrl: rd.result }) });
      var j = await r.json(); if (!r.ok) throw new Error(j.error || 'Lỗi import');
      msg.textContent = '✓ Đã import ' + j.created + ' nhân viên' + (j.errors && j.errors.length ? (' · ' + j.errors.length + ' dòng lỗi: ' + j.errors.slice(0, 3).join('; ')) : '');
      msg.className = 'text-sm mb-3 ' + (j.created ? 'text-emerald-600' : 'text-amber-600'); input.value = ''; loadList();
    } catch (e) { msg.textContent = '✗ ' + e.message; msg.className = 'text-sm mb-3 text-crimson'; }
  };
  rd.readAsDataURL(f);
});

/* ---------- notifications ---------- */
async function loadNotifs() {
  try {
    var j = await (await api('/api/notifications')).json(); var items = j.items || [];
    var unread = items.filter(function (n) { return !n.read; }).length;
    var dot = $('bell-dot'); if (unread) { dot.textContent = unread > 99 ? '99+' : unread; dot.classList.remove('hidden'); } else dot.classList.add('hidden');
    $('notif-panel').innerHTML = items.length ? items.map(function (n) {
      return '<div data-nr="' + n.id + '" class="p-2.5 rounded-xl hover:bg-cream cursor-pointer ' + (n.read ? 'opacity-60' : '') + '">'
        + '<div class="text-sm font-600">' + esc(n.title) + '</div>'
        + '<div class="text-xs text-ink-soft whitespace-pre-line">' + esc((n.body || '').slice(0, 240)) + '</div>'
        + '<div class="text-[10px] text-ink-soft mt-0.5">' + fmtDateTime(n.createdAt) + '</div></div>';
    }).join('') : '<div class="p-4 text-sm text-ink-soft text-center">Chưa có thông báo.</div>';
    document.querySelectorAll('#notif-panel [data-nr]').forEach(function (el) {
      el.onclick = async function () { var id = el.getAttribute('data-nr'); await api('/api/notifications/' + id + '/read', { method: 'POST', headers: H() }); var n = items.find(function (x) { return x.id === id; }); if (n && n.onboardingId) { $('notif-panel').classList.add('hidden'); openDetail(n.onboardingId); } loadNotifs(); };
    });
  } catch (e) {}
}
$('bell').onclick = function () { $('notif-panel').classList.toggle('hidden'); };
document.addEventListener('click', function (e) { if (!$('bell').contains(e.target) && !$('notif-panel').contains(e.target)) $('notif-panel').classList.add('hidden'); });

/* ---------- report ---------- */
$('btn-report').onclick = async function () {
  var out = $('report-out'); out.classList.remove('hidden'); out.textContent = '🤖 Đang tổng hợp báo cáo…';
  try { var j = await (await api('/api/onboarding/report', { method: 'POST', headers: H() })).json(); out.textContent = j.report || 'Không có dữ liệu.'; }
  catch (e) { out.textContent = 'Lỗi tạo báo cáo.'; }
};

boot();
