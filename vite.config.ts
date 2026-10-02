import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  define: {
    global: "globalThis",
  },
  server: {
    host: "127.0.0.1",
    port: 3000,
    proxy: {
      "/oauth2": "http://localhost:8080",
      "/auth": "http://localhost:8080",
      "/member": "http://localhost:8080",
      "/chat-rooms": "http://localhost:8080",
      "/ws-stomp": {
        target: "http://localhost:8080",
        ws: true,
      },
    },
  },
});
