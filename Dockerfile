# Thịnh Thế Vinh Hoa — website + chat backend (Express + ws + Postgres)
FROM node:18-alpine

WORKDIR /app

# Cài phụ thuộc trước (tận dụng cache Docker)
COPY server/package*.json ./server/
RUN cd server && npm install --omit=dev

# Chép toàn bộ website (index.html, agent.html, images/, server/, ...)
COPY . .

ENV NODE_ENV=production
# PORT do nền tảng (Railway/Render) tự cấp; mặc định 8787 khi chạy local
EXPOSE 8787

# Lưu ý: để giữ ảnh upload qua các lần deploy, dùng "Railway Volumes"
# (Settings → Add Volume → mount path: /app/images/uploads).
# KHÔNG dùng lệnh VOLUME ở đây vì Railway không hỗ trợ.

CMD ["node", "server/server.js"]
