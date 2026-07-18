#!/usr/bin/env node
// Khởi động dự án bằng MỘT lệnh: `npm run setup`.
//
// Sinh `.env.local` với bí mật ngẫu nhiên nếu chưa có. Chạy lại nhiều lần an toàn:
// đã có tệp thì KHÔNG ghi đè, vì ghi đè sẽ xoá mất cấu hình LLM người dùng đã sửa.

import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(webRoot, ".env.local");
const examplePath = join(webRoot, ".env.example");

const secret = () => randomBytes(16).toString("hex");

if (existsSync(envPath)) {
  console.log("✓ .env.local đã có — giữ nguyên, không ghi đè.");
  console.log("  Muốn sinh lại bí mật thì xoá tệp rồi chạy lại `npm run setup`.");
  process.exit(0);
}

if (!existsSync(examplePath)) {
  console.error("✗ Không tìm thấy .env.example — kho bị thiếu tệp.");
  process.exit(1);
}

// Điền bí mật vào đúng hai khoá đang để trống trong .env.example.
const filled = readFileSync(examplePath, "utf8")
  .replace(/^DEMO_ACCESS_CODE=\s*$/m, `DEMO_ACCESS_CODE=${secret()}`)
  .replace(/^DEMO_ADMIN_SECRET=\s*$/m, `DEMO_ADMIN_SECRET=${secret()}`);

writeFileSync(envPath, filled, { mode: 0o600 });

console.log("✓ Đã tạo .env.local với mã truy cập và mã quản trị ngẫu nhiên.");
console.log("  Xem mã truy cập:  grep DEMO_ACCESS_CODE .env.local");
console.log("  Chạy ứng dụng:    npm run dev");
