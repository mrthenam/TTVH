# 🚀 Đưa website Thịnh Thế Vinh Hoa lên Internet (Railway)

Website này gồm: **trang chủ + dashboard quản trị + chatbot realtime (WebSocket) + Postgres**.
Cách nhanh gọn nhất: deploy bằng **Railway** từ GitHub. Khoảng 10–15 phút.

Kết quả: bạn có link công khai dạng `https://ten-cua-ban.up.railway.app` để gửi cho mọi người.

---

## Bước 1 — Đẩy code lên GitHub

Mở terminal trong thư mục `thinh-the-vinh-hoa`:

```bash
git init
git add .
git commit -m "Website Thịnh Thế Vinh Hoa"
git branch -M main
```

Tạo repo mới trên https://github.com/new (đặt **Private** nếu muốn riêng tư), rồi:

```bash
git remote add origin https://github.com/<tên-bạn>/thinh-the-vinh-hoa.git
git push -u origin main
```

> ✅ File `.gitignore` đã chặn `.env` và `node_modules` — bí mật KHÔNG bị đẩy lên.

---

## Bước 2 — Tạo project trên Railway

1. Vào https://railway.app → đăng nhập bằng GitHub.
2. **New Project** → **Deploy from GitHub repo** → chọn repo vừa tạo.
3. Railway tự phát hiện `Dockerfile` và bắt đầu build.

---

## Bước 3 — Thêm cơ sở dữ liệu Postgres

1. Trong project, bấm **New** → **Database** → **Add PostgreSQL**.
2. Railway tự tạo biến `DATABASE_URL`. App sẽ tự tạo bảng + seed dữ liệu khi khởi động lần đầu.

---

## Bước 4 — Nhập biến môi trường

Mở service website → tab **Variables** → thêm:

| Biến | Giá trị |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` *(tham chiếu service Postgres)* |
| `GEMINI_API_KEY` | Khóa Gemini của bạn (https://aistudio.google.com/apikey) |
| `JWT_SECRET` | Chuỗi ngẫu nhiên dài (xem cách tạo bên dưới) |
| `AGENT_DEFAULT_USER` | `admin` |
| `AGENT_DEFAULT_PASS` | Mật khẩu admin mạnh do bạn đặt |

> ⚠️ **KHÔNG** đặt `PORT` — Railway tự cấp, app tự đọc.
> Nếu kết nối Postgres báo lỗi SSL, thêm `PGSSL=true`.

Tạo `JWT_SECRET` ngẫu nhiên (chạy 1 trong 2):
```bash
openssl rand -hex 32
# hoặc
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Bước 5 — Giữ ảnh upload không bị mất (Volume)

Ảnh tải lên trong dashboard được lưu vào thư mục. Mỗi lần deploy lại, thư mục bị reset → **mất ảnh**. Khắc phục:

1. Mở service website → tab **Settings** (hoặc **Volumes**) → **Add Volume**.
2. **Mount path**: `/app/images/uploads`
3. Lưu lại.

> Từ giờ ảnh upload nằm trên volume, không mất khi deploy lại.

---

## Bước 6 — Mở link công khai

1. Service website → **Settings** → **Networking** → **Generate Domain**.
2. Bạn nhận được `https://...up.railway.app`. Mở thử:
   - Trang chủ: `https://...up.railway.app/`
   - Dashboard: `https://...up.railway.app/agent.html`

---

## Bước 7 — Bảo mật sau khi lên (BẮT BUỘC)

1. Đăng nhập dashboard bằng `admin` + mật khẩu vừa đặt → **đổi mật khẩu** trong mục Tài khoản.
2. Đảm bảo `JWT_SECRET` là chuỗi ngẫu nhiên (không dùng mặc định).
3. **Xoay vòng (rotate) khóa Gemini** nếu khóa cũ từng bị lộ — tạo khóa mới, cập nhật biến `GEMINI_API_KEY`.

---

## Cập nhật website sau này

Chỉ cần đẩy code mới, Railway tự build lại:
```bash
git add .
git commit -m "Cập nhật ..."
git push
```

---

## (Tùy chọn) Gắn tên miền riêng

Service website → **Settings → Networking → Custom Domain** → nhập domain của bạn
→ Railway cho 1 bản ghi **CNAME**, vào nhà cung cấp tên miền trỏ về đó → tự có HTTPS.

---

## Chạy thử bằng Docker tại máy (không bắt buộc)

```bash
docker build -t ttvh .
docker run -p 8787:8787 --env-file server/.env ttvh
# mở http://localhost:8787
```

---

### Ghi chú nền tảng khác
- **Render**: tương tự — New Web Service (Docker) + Add PostgreSQL. Free tier sẽ "ngủ" sau 15 phút không dùng và Postgres free hết hạn sau 90 ngày.
- **VPS**: cài Node + Postgres + chạy `pm2 start server/server.js`, đặt Nginx reverse proxy (nhớ bật WebSocket: `proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade";`).
