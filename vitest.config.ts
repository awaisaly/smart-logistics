import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@smartlogistics/shared-types": path.resolve(__dirname, "packages/shared-types/src/index.ts"),
      "@smartlogistics/shared-middleware": path.resolve(__dirname, "packages/shared-middleware/src/index.ts")
    }
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node"
  }
});
