import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * K.ENGINE — Vite
 * - UI en :8080 en dev; build → dist/
 * - Proxy de la API solo en desarrollo (en Vercel no hay server.js)
 * - El worker de WebLLM se empaqueta como módulo (import.meta.url)
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 8080,
    strictPort: true,
    proxy: {
      "/health": { target: "http://127.0.0.1:5173", changeOrigin: true },
      "/models": { target: "http://127.0.0.1:5173", changeOrigin: true },
      "/chat": { target: "http://127.0.0.1:5173", changeOrigin: true },
      "/config": { target: "http://127.0.0.1:5173", changeOrigin: true },
      "/bridge": { target: "http://127.0.0.1:5173", changeOrigin: true },
    },
  },
  preview: {
    port: 4173,
    proxy: {
      "/health": { target: "http://127.0.0.1:5173", changeOrigin: true },
      "/models": { target: "http://127.0.0.1:5173", changeOrigin: true },
      "/chat": { target: "http://127.0.0.1:5173", changeOrigin: true },
      "/config": { target: "http://127.0.0.1:5173", changeOrigin: true },
      "/bridge": { target: "http://127.0.0.1:5173", changeOrigin: true },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    target: "es2022",
    // WebLLM + worker: no forzar un solo chunk que rompa el worker
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/@mlc-ai/web-llm")) return "webllm";
          if (id.includes("node_modules/react") || id.includes("node_modules/react-dom")) return "react";
        },
      },
    },
    chunkSizeWarningLimit: 2000,
  },
  worker: {
    format: "es",
  },
  optimizeDeps: {
    exclude: ["@mlc-ai/web-llm"],
  },
});
