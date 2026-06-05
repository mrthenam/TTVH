# Thịnh Thế Vinh Hoa — Chat backend (realtime)

Express + WebSocket (`ws`) + proxy **Gemini** + **đăng nhập nhân viên (JWT)** + lưu trữ **Postgres** (fallback JSON).
Phục vụ luôn website tĩnh (index.html, chat.js, agent.html, images…) ở thư mục cha.

## Tính năng (đúng 5 yêu cầu)
1. **Preset gần giống** — `lib/presets.js` (bỏ dấu, theo từ khoá).
2. **Gemini** — `lib/gemini.js`, khoá nằm trong `.env`, **không lộ ra client**.
3. **Nhân viên tiếp nhận** — server đặt `mode=human` + `assignedTo`, **bot ngưng**; “Trả về bot” để bật lại.
4. **Nhớ ngữ cảnh** — mỗi khách `customerId`; lưu Postgres (hoặc `data/store.json`); 12 lượt gần nhất gửi cho Gemini.
5. **“Đang trả lời, xin chờ giây lát…”** — sự kiện `typing`.

## Mới thêm
- **nodemon**: `npm run dev` tự nạp lại khi sửa code/.env.
- **Đăng nhập nhân viên thật**: tài khoản + mật khẩu băm (bcryptjs) → **JWT** (12h). Nhiều nhân viên đăng nhập/đồng thời; hiển thị ai đang phụ trách hội thoại.
- **Postgres**: bật bằng `DATABASE_URL`; tự tạo bảng (`agents`, `conversations`, `messages`).

## Chạy nhanh (JSON, không cần DB)
```bash
cd server
npm install
cp .env.example .env      # điền GEMINI_API_KEY; đổi JWT_SECRET
npm run dev               # hoặc: npm start
```
- Trang khách:    http://localhost:8787/
- Bảng nhân viên: http://localhost:8787/agent.html
- Tài khoản đầu tiên tạo tự động: **admin / admin123** (đổi ngay!).

## Dùng Postgres
```bash
docker compose up -d                       # chạy Postgres (cổng 5432)
# trong .env:
# DATABASE_URL=postgres://ttvh:ttvh@localhost:5432/ttvh
npm run dev                                # server tự tạo bảng khi khởi động
```

> ⚠️ **LƯU Ý — khi thay đổi DB phải khởi động lại server**
> Server chỉ đọc `.env` và kết nối DB **một lần lúc khởi động**. Vì vậy:
> - **Cần restart** khi: đổi `DATABASE_URL` / sửa `.env`, chuyển JSON ↔ Postgres, đổi tài khoản/mật khẩu Postgres, hoặc thêm/sửa bảng–cột (để `ensureSchema` chạy lại).
>   - `npm run dev` (nodemon): **tự restart** khi `.env`/code đổi.
>   - `npm start`: phải tự dừng (Ctrl+C) rồi chạy lại.
> - **KHÔNG cần restart** khi: thêm/sửa/xoá **dữ liệu** (dòng trong bảng), tạo **VIEW**, vì server đọc DB trực tiếp mỗi yêu cầu.
> - Nếu Postgres lỗi lúc khởi động, server **tự fallback về JSON** (xem log) — sửa DB xong nhớ **restart** để dùng lại Postgres.

## Quản lý nhân viên
```bash
node create-agent.js linh 'MatKhauManh#1' 'Nguyễn Linh'   # tạo/đổi mật khẩu
```
Đăng nhập tại `/agent.html` bằng tài khoản vừa tạo. Mỗi tin nhắn nhân viên gửi đi đều gắn tên người gửi.

## Kiểm thử
```bash
node smoketest.js   # cần server đang chạy; kiểm tra login + preset + typing + tiếp nhận + bot ngưng
```

## Kiến trúc
```
client chat.js  ─┐                         ┌─ lib/presets.js
agent.html      ─┼─ WebSocket /ws ── server.js ─┼─ lib/gemini.js ── Gemini API
(login REST)    ─┘   + POST /api/agent/login    ├─ lib/auth.js (bcrypt+JWT)
                                                 └─ lib/store.js ─┬─ lib/db-pg.js (Postgres)
                                                                  └─ lib/store-json.js (JSON)
```

## Lên production
- Dùng Postgres (đã có) + thêm Redis pub/sub nếu chạy nhiều instance.
- Sau nginx: TLS + `wss://`; rate-limit `user_msg`.
- `JWT_SECRET` mạnh; không commit `.env` (đã có `.gitignore`).
