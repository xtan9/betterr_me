import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/ralph-system/**/*.system.test.ts"],
    testTimeout: 30_000,
  },
});
