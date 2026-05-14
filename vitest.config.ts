import { defineConfig } from "vitest/config";
import path from "node:path";

const projectRoot = path.resolve(__dirname);

export default defineConfig({
  resolve: {
    alias: {
      "@": projectRoot,
    },
  },
  test: {
    globals: false,
    environment: "jsdom",
    setupFiles: ["./test/setup/sync.ts"],
    include: ["lib/**/*.test.ts", "components/**/*.test.{ts,tsx}"],
  },
});
