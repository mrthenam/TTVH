'use strict';
/* Bộ câu trả lời có sẵn + so khớp "gần giống" (bỏ dấu, theo từ khoá). */

const PRESETS = [
  { kw: ['xin chao', 'hello', 'hi', 'chao', 'alo', 'co ai khong'],
    a: 'Xin chào! 👋 Mình là trợ lý của Thịnh Thế Vinh Hoa. Mình có thể giúp bạn về thương hiệu, tuyển dụng, đặt món hay liên hệ ạ?' },
  { kw: ['thuong hieu', 'brand', 'co nhung gi', 'he sinh thai', 'cong ty co'],
    a: 'Thịnh Thế Vinh Hoa hiện có 4 thương hiệu: 🧋 MAYCHA (trà sữa), 🍵 Hồng Trà Sữa Tam Hảo, 🍗 Gà Giòn Sốt Ba Cô Gái, và 🧋 Trà Hú. Bạn muốn tìm hiểu thương hiệu nào ạ?' },
  { kw: ['tuyen dung', 'viec lam', 'ung tuyen', 'nop cv', 'vi tri', 'tuyen nhan vien', 'job', 'tim viec'],
    a: 'Tụi mình đang tuyển:\n• HR — Talent Acquisition Executive (Hà Nội)\n• Marketing — Social Media & TikTok Content, Senior Marcom, Trade Online & Partnership, Trade Offline.\nNộp CV về: hr@maycha.com.vn nhé!' },
  { kw: ['dia chi', 'o dau', 'chi nhanh', 'cua hang o', 'location'],
    a: 'Trụ sở của tụi mình ở TP. Hồ Chí Minh. Bạn để lại khu vực bạn quan tâm, tụi mình sẽ gửi chi nhánh gần nhất nha!' },
  { kw: ['gio mo cua', 'may gio', 'gio lam viec', 'open', 'gio hoat dong'],
    a: 'Các cửa hàng thường mở từ sáng đến tối (giờ cụ thể tùy chi nhánh). Bạn cho mình biết chi nhánh để mình báo giờ chính xác nhé!' },
  { kw: ['menu', 'thuc don', 'mon gi', 'do uong', 'co mon'],
    a: 'Mỗi thương hiệu có menu riêng — trà sữa MAYCHA & Tam Hảo, gà giòn Ba Cô Gái, trà Trà Hú. Bạn muốn xem menu thương hiệu nào ạ?' },
  { kw: ['gia', 'bao nhieu tien', 'bao nhieu', 'gia ca', 'price'],
    a: 'Giá tùy món và thương hiệu ạ. Bạn cho mình biết món/thương hiệu cụ thể, mình báo giá chính xác hơn nhé!' },
  { kw: ['dat mon', 'dat hang', 'mua', 'order', 'giao hang', 'ship', 'giao tan noi'],
    a: 'Bạn có thể đặt qua Zalo của tụi mình hoặc các app giao đồ ăn. Nhắn Zalo để được chốt đơn nhanh nhất nha! 🛵' },
  { kw: ['zalo', 'lien he', 'hotline', 'so dien thoai', 'sdt', 'contact', 'email'],
    a: 'Bạn có thể liên hệ tụi mình qua Zalo hoặc email hr@maycha.com.vn. Tụi mình luôn sẵn sàng hỗ trợ! 🌸' },
  { kw: ['cam on', 'thanks', 'thank you', 'cam on nhe', 'ok cam on'],
    a: 'Dạ không có gì ạ! Chúc bạn một ngày thật vui 🌸 Cần gì thêm cứ nhắn tụi mình nhé!' },
  { kw: ['gap nhan vien', 'gap nguoi that', 'gap tu van vien', 'noi chuyen voi nguoi', 'nhan vien'],
    a: 'Dạ được ạ! Mình sẽ chuyển cho nhân viên hỗ trợ bạn ngay. Bạn vui lòng chờ trong giây lát nhé 🙏' }
];

function norm(s) {
  return (s || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function match(text) {
  const n = norm(text);
  if (!n) return null;
  const tokens = n.split(' ');
  let best = null, bestScore = 0;
  for (const p of PRESETS) {
    let score = 0;
    for (const k of p.kw) {
      const nk = norm(k);
      if (nk.indexOf(' ') > -1) { if (n.indexOf(nk) > -1) score += 3; }
      else if (nk.length >= 4) { if (n.indexOf(nk) > -1) score += 2; }
      else { if (tokens.indexOf(nk) > -1) score += 1; }
    }
    if (score > bestScore) { bestScore = score; best = p; }
  }
  return bestScore >= 2 ? best.a : null;
}

module.exports = { match, norm };
