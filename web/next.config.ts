import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-host / on-premise FIRST: build ra .next/standalone để chạy bằng Node thường
  // hoặc đóng gói Docker mà không cần cài lại node_modules.
  output: "standalone",
};

export default nextConfig;
