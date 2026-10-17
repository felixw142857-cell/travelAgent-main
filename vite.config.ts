import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react()],
    resolve: { alias: { "@": resolve(__dirname, "./src") } },
    server: {
      proxy: {
        "/api": {
          target: env.BACKEND_URL || "http://127.0.0.1:8001",
          changeOrigin: true,
          proxyTimeout: 300_000,
          timeout: 310_000,
        },
      },
    },
  };
});
