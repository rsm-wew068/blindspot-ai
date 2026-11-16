import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
const sameOriginCredentials = () => ({
  name: "same-origin-credentials",
  transformIndexHtml(html) {
    return html.replace(/ crossorigin/g, "");
  },
});

export default defineConfig({
  plugins: [react(), sameOriginCredentials()],
  build: {
    modulePreload: false,
  },
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8766",
        changeOrigin: true,
        configure(proxy) {
          proxy.on("proxyReq", (req) => req.removeHeader("origin"));
        },
      },
    },
  },
});
