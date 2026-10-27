import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// One self-contained index.html (JS + CSS inlined); data JSON stays as separate files under data/.
export default defineConfig({
  base: "./",
  plugins: [react(), viteSingleFile()],
  build: { copyPublicDir: false, chunkSizeWarningLimit: 4000 },
});
