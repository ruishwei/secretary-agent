import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    alias: {
      "@shared": "/src/shared",
      "@main": "/src/main",
    },
  },
  build: {
    rollupOptions: {
      external: [
        "electron",
        "better-sqlite3",
        "electron-store",
      ],
    },
    minify: false,
    sourcemap: true,
  },
});
