import { defineConfig } from "umi";

export default defineConfig({
  routes: [
    { path: "/", component: "index" },
    { path: "/docs", component: "docs" },
    { path: "/chat", component: "chat" },
    { path: "/chat-sdk", component: "chat-sdk" },
  ],
  npmClient: 'pnpm',
  // utoopack: {},
});
