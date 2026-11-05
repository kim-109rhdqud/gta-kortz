import { defineConfig } from "vite";

// GitHub Pages 배포 시 저장소 이름이 경로에 들어가므로 BASE_PATH 로 넘긴다.
// 로컬 개발/프리뷰에서는 "/" 를 쓴다.
export default defineConfig({
  base: process.env.BASE_PATH || "/",
  build: {
    target: "es2020",
    sourcemap: false
  }
});
