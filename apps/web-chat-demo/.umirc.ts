import { defineConfig } from "umi";

export default defineConfig({
  routes: [
    { path: "/", component: "index" },
    { path: "/docs", component: "docs" },
    { path: "/chat", component: "chat" },
    { path: "/chat-sdk", component: "chat-sdk" },
    { path: "/chat-agent", component: "chat-agent" },
  ],
  // 本地开发代理：将 /api 请求转发到 langchain-ts-demo（6001 端口），支持 SSE 流式转发
  proxy: {
    "/api": {
      target: "http://localhost:6001",
      changeOrigin: true,
    },
  },
  npmClient: 'pnpm',
  esbuildMinifyIIFE: true,
  // utoopack: {},
});
