import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 템플릿 HTML이 서버리스 번들에 포함되도록
  outputFileTracingIncludes: {
    "/api/generate": ["./src/templates/**/*.html"],
  },
};

export default nextConfig;
