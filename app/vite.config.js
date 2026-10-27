import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// Single-file build of web/src for claude.ai (JS + CSS inlined; data JSON published alongside as data/*.json).
// dedupe keeps one copy of React/HeroUI even though the sources live under ../web.
export default defineConfig({
  base: "./",
  plugins: [react(), viteSingleFile()],
  define: { "process.env.NEXT_PUBLIC_KAKAO_JS_KEY": "undefined" },
  resolve: { dedupe: ["react", "react-dom", "@heroui/react", "framer-motion", "recharts", "d3-selection", "d3-zoom", "d3-transition"] },
  server: { fs: { allow: [".."] } },
  publicDir: "../web/public",
  build: { copyPublicDir: false, chunkSizeWarningLimit: 6000 },
});

