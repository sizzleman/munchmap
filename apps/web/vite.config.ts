import { defineConfig } from "vite";

// Static build → apps/web/dist. `base: "./"` so it works on GitHub Pages subpaths, Cloudflare Pages, or any folder.
// Shares the repo-level public/ folder (data.json is generated there by `npm run build:data`).
export default defineConfig({
  base: "./",
  publicDir: "../../public",
  build: { outDir: "dist", emptyOutDir: true, target: "es2022" },
});
