'use strict';
/* Proxy gọi Gemini phía máy chủ — khoá API nằm trong process.env, không lộ ra client. */

const SYSTEM_PROMPT =
  'Bạn là trợ lý ảo thân thiện của công ty Thịnh Thế Vinh Hoa (ngành F&B, trụ sở TP. Hồ Chí Minh). ' +
  'Công ty sở hữu 4 thương hiệu: MAYCHA (trà sữa), Hồng Trà Sữa Tâm Hảo, Gà Giòn Sốt Ba Cô Gái (gà rán), và TràHú. ' +
  'Đang tuyển dụng: HR (Talent Acquisition Executive — Hà Nội) và Marketing (Social Media & TikTok Content Executive, Senior Marcom Executive, Trade Online & Partnership Executive, Trade Offline Marketing Executive). Email nộp CV: nhonnhh@maycha.com.vn. ' +
  'Hãy trả lời NGẮN GỌN (2-4 câu), bằng tiếng Việt, giọng thân thiện, xưng "mình"/"tụi mình", có thể dùng emoji vừa phải. ' +
  'TUYỆT ĐỐI không bịa thông tin giá, địa chỉ, số điện thoại cụ thể nếu không chắc — thay vào đó mời khách để lại liên hệ hoặc nhắn Zalo. ' +
  'Nếu câu hỏi ngoài phạm vi công ty, trả lời lịch sự và hướng khách về sản phẩm/dịch vụ.';

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

function hasKey() { return !!process.env.GEMINI_API_KEY; }

async function ask(messages) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null; // báo hiệu chưa cấu hình

  const contents = messages.slice(-12)
    .filter(m => m.role === 'user' || m.role === 'bot' || m.role === 'agent')
    .map(m => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.text }] }));

  const body = {
    system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: contents,
    generationConfig: { temperature: 0.6, maxOutputTokens: 500 }
  };

  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
    encodeURIComponent(MODEL) + ':generateContent?key=' + encodeURIComponent(key);

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).error.message; } catch (e) {}
    throw new Error('Gemini HTTP ' + res.status + (detail ? ': ' + detail : ''));
  }
  const j = await res.json();
  const parts = j && j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts;
  const text = parts ? parts.map(p => p.text || '').join('').trim() : '';
  return text || 'Mình chưa rõ ý bạn lắm, bạn nói thêm một chút giúp mình nhé!';
}

module.exports = { ask, hasKey, SYSTEM_PROMPT, MODEL };
