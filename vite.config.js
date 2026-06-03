import { defineConfig } from "vite";

export default defineConfig({
  appType: "spa",
  server: {
    port: 5174,
    strictPort: false
  },
  preview: {
    port: 4174,
    strictPort: false
  }
});
