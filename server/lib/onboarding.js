'use strict';
/* Logic onboarding nhân viên mới: template checklist theo vị trí, mốc đánh giá,
   trạng thái, phân quyền (RBAC). Không phụ thuộc DB — thuần hàm. */

const DAY = 86400000;

/* ---------- Vị trí ---------- */
const POSITIONS = [
  { key: 'pha_che', label: 'Pha chế' },
  { key: 'thu_ngan', label: 'Thu ngân' },
  { key: 'bep', label: 'Bếp' },
  { key: 'quan_ly_ca', label: 'Quản lý ca' },
  { key: 'marketing', label: 'Marketing' },
  { key: 'ke_toan', label: 'Kế toán' }
];
const POS_LABEL = {}; POSITIONS.forEach(p => POS_LABEL[p.key] = p.label);

/* nhóm checklist */
const GROUPS = {
  hoso: 'Hồ sơ cần nộp',
  dongphuc: 'Đồng phục / vật dụng',
  taikhoan: 'Tài khoản cần cấp',
  tailieu: 'Tài liệu cần đọc',
  training: 'Training cần hoàn thành'
};

/* item: [group, title, owner, deadlineOffsetDays] (deadline tính từ ngày bắt đầu) */
const COMMON = [
  ['hoso', 'CMND/CCCD (bản sao)', 'HR', 0],
  ['hoso', 'Sơ yếu lý lịch', 'HR', 0],
  ['hoso', 'Giấy khám sức khỏe', 'HR', 3],
  ['hoso', 'Hợp đồng lao động đã ký', 'HR', 1],
  ['hoso', '02 ảnh 3x4', 'HR', 0],
  ['dongphuc', 'Cấp áo đồng phục', 'Quản lý chi nhánh', 0],
  ['dongphuc', 'Cấp bảng tên', 'Quản lý chi nhánh', 1],
  ['taikhoan', 'Tài khoản chấm công', 'HR', 0],
  ['taikhoan', 'Thêm vào nhóm Zalo/nội bộ', 'Người hướng dẫn', 0],
  ['tailieu', 'Đọc Nội quy công ty', 'Người hướng dẫn', 1],
  ['tailieu', 'Đọc Văn hóa & quy tắc ứng xử', 'Người hướng dẫn', 2],
  ['training', 'Đào tạo hội nhập (orientation)', 'HR', 1]
];
const BY_POSITION = {
  pha_che: [
    ['training', 'Training pha chế theo công thức', 'Người hướng dẫn', 5],
    ['training', 'An toàn vệ sinh thực phẩm (ATVSTP)', 'Người hướng dẫn', 3],
    ['training', 'Vận hành máy móc/thiết bị quầy', 'Người hướng dẫn', 4]
  ],
  thu_ngan: [
    ['taikhoan', 'Tài khoản phần mềm bán hàng (POS)', 'Quản lý chi nhánh', 0],
    ['training', 'Training quy trình thu ngân & POS', 'Người hướng dẫn', 3],
    ['training', 'Quy trình thanh toán & kết ca tiền', 'Quản lý ca', 5]
  ],
  bep: [
    ['training', 'Training quy trình bếp', 'Người hướng dẫn', 4],
    ['training', 'An toàn vệ sinh thực phẩm (ATVSTP)', 'Người hướng dẫn', 3],
    ['training', 'Vận hành thiết bị bếp', 'Người hướng dẫn', 5]
  ],
  quan_ly_ca: [
    ['taikhoan', 'Tài khoản quản lý cửa hàng', 'Quản lý chi nhánh', 0],
    ['training', 'Training quản lý ca & phân ca', 'Quản lý chi nhánh', 7],
    ['training', 'Quy trình mở/đóng ca & báo cáo doanh thu', 'Quản lý chi nhánh', 10]
  ],
  marketing: [
    ['taikhoan', 'Tài khoản công cụ marketing (Canva, FB, ...)', 'Trưởng bộ phận', 1],
    ['tailieu', 'Đọc Brand guideline', 'Trưởng bộ phận', 3],
    ['training', 'Training quy trình sản xuất nội dung', 'Trưởng bộ phận', 7]
  ],
  ke_toan: [
    ['taikhoan', 'Tài khoản phần mềm kế toán', 'Trưởng bộ phận', 1],
    ['tailieu', 'Quy trình chứng từ & lưu trữ', 'Trưởng bộ phận', 3],
    ['training', 'Training nghiệp vụ kế toán nội bộ', 'Trưởng bộ phận', 7]
  ]
};

let _seq = 0;
function uid(p) { _seq++; return (p || 'x') + Date.now().toString(36) + (_seq).toString(36) + Math.random().toString(36).slice(2, 5); }

function buildChecklist(positionKey, startDate) {
  const start = startDate || Date.now();
  const rows = COMMON.concat(BY_POSITION[positionKey] || []);
  return rows.map(([group, title, owner, off]) => ({
    id: uid('ck'), group, title, owner,
    deadline: start + off * DAY,
    done: false, doneAt: null, doneBy: null
  }));
}

/* mốc đánh giá thử việc */
const MILESTONES = [
  { key: '3d', label: 'Đánh giá 3 ngày', offset: 3 },
  { key: '7d', label: 'Đánh giá 7 ngày', offset: 7 },
  { key: '14d', label: 'Đánh giá 14 ngày', offset: 14 },
  { key: '30d', label: 'Đánh giá 30 ngày', offset: 30 },
  { key: 'final', label: 'Đánh giá kết thúc thử việc', offset: 58 }
];
function buildEvaluations(startDate) {
  const start = startDate || Date.now();
  return MILESTONES.map(m => ({
    id: uid('ev'), milestone: m.key, label: m.label,
    dueDate: start + m.offset * DAY,
    status: 'pending', // pending | done
    attitude: null, skill: null, discipline: null, learning: null,
    comment: '', aiSummary: '', recommendation: '', evaluatedBy: null, evaluatedAt: null
  }));
}

/* ---------- Trạng thái ---------- */
const STATUS = {
  onboarding: 'Đang onboarding',
  thieu_ho_so: 'Thiếu hồ sơ',
  da_training: 'Đã training',
  sap_danh_gia: 'Sắp đánh giá thử việc',
  hoan_tat: 'Hoàn tất onboarding',
  nghi_som: 'Nghỉ việc sớm'
};

/* tự suy ra trạng thái gợi ý (nếu không bị HR khoá thủ công như hoan_tat/nghi_som) */
function deriveStatus(rec) {
  if (rec.status === 'hoan_tat' || rec.status === 'nghi_som') return rec.status;
  const ck = rec.checklist || [];
  const hoso = ck.filter(c => c.group === 'hoso');
  const training = ck.filter(c => c.group === 'training');
  const now = Date.now();
  if (hoso.some(c => !c.done)) return 'thieu_ho_so';
  const evals = rec.evaluations || [];
  if (evals.some(e => e.status === 'pending' && e.dueDate - now < 2 * DAY && e.dueDate - now > -7 * DAY)) return 'sap_danh_gia';
  if (training.length && training.every(c => c.done)) return 'da_training';
  return 'onboarding';
}

function checklistProgress(rec) {
  const ck = rec.checklist || [];
  const done = ck.filter(c => c.done).length;
  return { done, total: ck.length, pct: ck.length ? Math.round(done * 100 / ck.length) : 0 };
}

/* ---------- RBAC ---------- */
// obRole: admin | hr | bod | branch_manager | dept_head | mentor
function canSeeAll(user) { return user && ['admin', 'hr', 'bod'].indexOf(user.obRole) > -1; }
function canEdit(user) { return user && ['admin', 'hr'].indexOf(user.obRole) > -1; }
function canSeeRecord(user, rec) {
  if (!user) return false;
  if (canSeeAll(user)) return true;
  if (user.obRole === 'branch_manager') return rec.branch && rec.branch === user.branch;
  if (user.obRole === 'dept_head') return rec.department && rec.department === user.department;
  if (user.obRole === 'mentor') return rec.mentorUser === user.username || rec.managerUser === user.username;
  return false;
}

/* ---------- import/export ---------- */
// [field, nhãn cột] — đúng thứ tự cột trong file Excel
const IMPORT_COLUMNS = [
  ['fullName', 'Họ tên'],
  ['phone', 'Số điện thoại'],
  ['email', 'Email'],
  ['position', 'Vị trí'],
  ['department', 'Phòng ban'],
  ['branch', 'Chi nhánh'],
  ['startDate', 'Ngày bắt đầu (YYYY-MM-DD)'],
  ['managerName', 'Quản lý trực tiếp'],
  ['managerUser', 'Tài khoản quản lý'],
  ['mentorName', 'Người hướng dẫn'],
  ['mentorUser', 'Tài khoản người hướng dẫn'],
  ['contractType', 'Loại hợp đồng'],
  ['shift', 'Ca làm'],
  ['workplace', 'Địa điểm làm việc'],
  ['note', 'Ghi chú']
];
function _norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, ' ').trim(); }
// nhận cả key ("pha_che") lẫn nhãn tiếng Việt ("Pha chế")
function positionKeyFromText(text) {
  const n = _norm(text);
  if (!n) return '';
  for (const p of POSITIONS) { if (_norm(p.key) === n || _norm(p.label) === n) return p.key; }
  for (const p of POSITIONS) { if (n.indexOf(_norm(p.label)) > -1 || n.indexOf(_norm(p.key)) > -1) return p.key; }
  return '';
}

module.exports = {
  DAY, POSITIONS, POS_LABEL, GROUPS, MILESTONES, STATUS, IMPORT_COLUMNS,
  uid, buildChecklist, buildEvaluations, deriveStatus, checklistProgress,
  canSeeAll, canEdit, canSeeRecord, positionKeyFromText
};
