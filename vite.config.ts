import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: { target: 'esnext' },
  resolve: {
    alias: {
      src: path.resolve(__dirname, "src"),
    },
  },
});